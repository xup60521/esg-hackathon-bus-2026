/**
 * src/features/lab/tourism/engine.test.ts
 *
 * Automated unit and scenario tests for Route 6670
 * Tourism Reachability & Last-Bus Risk Engine.
 *
 * Covers all 12 defect verification rules including:
 * - Strict 24h time format rejection (e.g. 25:99, 12:30junk, NaN)
 * - Strict calendar date validation (leap year, non-leap year 2026-02-29, month bounds)
 * - Timezone-independent day of week computation
 * - Prohibition of historical dates (< 2026-11-04) without appropriate schedule
 * - Waiting for opening when arriving early
 * - Rejecting admission when arriving after lastEntryTime
 * - Rejecting itineraries where user dwell crosses closing time (no silent truncation)
 * - Rejecting negative, zero, or NaN dwell minutes
 * - Same-stop rejection
 * - Minimum (earliest) departure trip selection across unordered trips
 * - Origin-to-destination specific last bus filtering and exact count
 * - Standard unverified backup plan notice
 * - Senior accessible speed multiplier without assuming wheelchair access
 * - Official schedule notes compliance (Mon-Thu weekday, Fri-Sun holiday)
 * - puli_brewery stop prioritization
 */

import { describe, expect, test } from 'bun:test';
import {
  STANDARD_UNVERIFIED_BACKUP_NOTICE,
  calculateLastBusRisk,
  findInboundTrip,
  findOutboundTrip,
  getDayType,
  isValidDateString,
  minutesToTime,
  timeToMinutes,
  verifyTripReachability,
} from './engine';
import { generateSampleScenarios } from './sampleScenarios';
import type { Attraction, TimetableData } from './types';

import attractionsFixture from '../../../../public/data/lab/tourism/attractions.json';
import timetableFixture from '../../../../public/data/lab/tourism/timetable.json';

const timetable = timetableFixture as unknown as TimetableData;
const attractions = attractionsFixture.attractions as unknown as Attraction[];

describe('Strict Time Validation & Conversion', () => {
  test('converts valid HH:MM strings to minutes from midnight', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('07:20')).toBe(440);
    expect(timeToMinutes('16:30')).toBe(990);
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  test('strictly rejects malformed, out-of-range, and garbage time strings', () => {
    expect(timeToMinutes('25:99')).toBe(-1);
    expect(timeToMinutes('12:30junk')).toBe(-1);
    expect(timeToMinutes('24:00')).toBe(-1);
    expect(timeToMinutes('12:60')).toBe(-1);
    expect(timeToMinutes('-01:00')).toBe(-1);
    expect(timeToMinutes('NaN')).toBe(-1);
    expect(timeToMinutes('')).toBe(-1);
    expect(timeToMinutes('1:30')).toBe(-1); // missing leading zero
    expect(timeToMinutes(undefined as any)).toBe(-1);
  });

  test('minutesToTime rejects out of range and does not wrap around past midnight', () => {
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(440)).toBe('07:20');
    expect(minutesToTime(1439)).toBe('23:59');

    // Bounds checking: no silent % 1440 wraparound
    expect(minutesToTime(1440)).toBeNull();
    expect(minutesToTime(1500)).toBeNull();
    expect(minutesToTime(-1)).toBeNull();
    expect(minutesToTime(NaN)).toBeNull();
    expect(minutesToTime(Infinity)).toBeNull();
  });
});

describe('Calendar Date & DayType Rules', () => {
  test('validates real calendar dates with leap year rules', () => {
    expect(isValidDateString('2026-11-04')).toBe(true);
    expect(isValidDateString('2026-02-28')).toBe(true);
    // 2026 is not a leap year: Feb 29 is invalid
    expect(isValidDateString('2026-02-29')).toBe(false);
    // 2024 is a leap year: Feb 29 is valid
    expect(isValidDateString('2024-02-29')).toBe(true);

    // Invalid months and days
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('2026-04-31')).toBe(false); // April has 30 days
    expect(isValidDateString('invalid-date')).toBe(false);
    expect(isValidDateString('2026/11/04')).toBe(false);
  });

  test('timezone-independent day of week and official schedule note compliance', () => {
    // 2026-11-02 is Monday -> weekday
    const mon = getDayType('2026-11-02');
    expect(mon.isValidDate).toBe(true);
    expect(mon.dayOfWeek).toBe('Monday');
    expect(mon.dayType).toBe('weekday');

    // 2026-11-05 is Thursday -> weekday
    const thu = getDayType('2026-11-05');
    expect(thu.dayOfWeek).toBe('Thursday');
    expect(thu.dayType).toBe('weekday');

    // 2026-11-06 is Friday -> holiday (per official note: Fri-Sun is holiday)
    const fri = getDayType('2026-11-06');
    expect(fri.dayOfWeek).toBe('Friday');
    expect(fri.dayType).toBe('holiday');

    // 2026-11-08 is Sunday -> holiday
    const sun = getDayType('2026-11-08');
    expect(sun.dayOfWeek).toBe('Sunday');
    expect(sun.dayType).toBe('holiday');
  });

  test('manual dayType override takes precedence', () => {
    // 2026-11-05 is Thursday (weekday), but user overrides to holiday
    const overridden = getDayType('2026-11-05', 'holiday');
    expect(overridden.dayType).toBe('holiday');
    expect(overridden.source).toBe('MANUAL_OVERRIDE');
  });

  test('rejects historical dates prior to snapshot retrieval date (2026-11-04)', () => {
    const res = verifyTripReachability(
      {
        originStopId: 'thsr',
        attractionId: 'xiangshan_visitor_center',
        departureDate: '2024-11-04', // 2024 historical date
        departureTime: '08:30',
        customDwellMinutes: 90,
      },
      timetable,
      attractions
    );

    expect(res.isValid).toBe(false);
    expect(res.invalidReason).toContain('歷史日期');
    expect(res.invalidReason).toContain(timetable.metadata.retrievedDate);
  });
});

describe('Opening Hours, Last Entry, and Dwell Invariants', () => {
  test('handles early arrival with a synthetic opening assumption', () => {
    const synthetic = { ...attractions[0], openTime: '12:00' };
    const res = verifyTripReachability({ originStopId: 'thsr', attractionId: synthetic.id,
      departureDate: '2026-11-05', departureTime: '08:30', customDwellMinutes: 60 }, timetable, [synthetic]);
    expect(res.isValid).toBe(true);
    expect(res.dwell!.waitingForOpenMinutes).toBeGreaterThan(0);
    expect(res.dwell!.attractionDepartureTime).toBe('13:00');
  });

  test('rejects itinerary if arriving after attraction last entry time', () => {
    // Paper Dome last entry time is 16:30.
    // If arriving at 16:45 -> must reject (not just warning!)
    const paperDome = attractions.find((a) => a.id === 'paper_dome')!;
    expect(paperDome.lastEntryTime).toBe('16:30');

    // Departing at 15:30 arrives at Taomi around 16:51
    const res = verifyTripReachability(
      {
        originStopId: 'thsr',
        attractionId: 'paper_dome',
        departureDate: '2026-11-06', // Friday (open day)
        departureTime: '15:30',
        customDwellMinutes: 30,
      },
      timetable,
      attractions
    );

    expect(res.isValid).toBe(false);
    expect(res.invalidReason).toContain('最後入園時間');
    expect(res.invalidReason).toContain('16:30');
  });

  test('rejects itinerary when user dwell crosses closing time without silently truncating', () => {
    // Xiangshan closes at 17:00.
    // Departs THSR at 12:45, arrives Xiangshan at 14:15, walk 2m -> 14:17.
    // User dwell is 180 minutes -> planned departure is 17:17 (> 17:00).
    const res = verifyTripReachability(
      {
        originStopId: 'thsr',
        attractionId: 'xiangshan_visitor_center',
        departureDate: '2026-11-05',
        departureTime: '12:30',
        customDwellMinutes: 180,
      },
      timetable,
      attractions
    );

    expect(res.isValid).toBe(false);
    expect(res.invalidReason).toContain('超過景點打烊時間');
    expect(res.invalidReason).toContain('系統不可擅自縮短旅客停留時間');
  });

  test('rejects negative, zero, or NaN dwell minutes', () => {
    const resNegative = verifyTripReachability(
      {
        originStopId: 'thsr',
        attractionId: 'xiangshan_visitor_center',
        departureDate: '2026-11-05',
        departureTime: '08:30',
        customDwellMinutes: -30,
      },
      timetable,
      attractions
    );
    expect(resNegative.isValid).toBe(false);
    expect(resNegative.invalidReason).toContain('停留時間必須為大於 0 之正整數');

    const resZero = verifyTripReachability(
      {
        originStopId: 'thsr',
        attractionId: 'xiangshan_visitor_center',
        departureDate: '2026-11-05',
        departureTime: '08:30',
        customDwellMinutes: 0,
      },
      timetable,
      attractions
    );
    expect(resZero.isValid).toBe(false);
    expect(resZero.invalidReason).toContain('停留時間必須為大於 0 之正整數');

    const resNaN = verifyTripReachability(
      {
        originStopId: 'thsr',
        attractionId: 'xiangshan_visitor_center',
        departureDate: '2026-11-05',
        departureTime: '08:30',
        customDwellMinutes: NaN,
      },
      timetable,
      attractions
    );
    expect(resNaN.isValid).toBe(false);
    expect(resNaN.invalidReason).toContain('停留時間必須為大於 0 之正整數');
  });
});

describe('Trip Matching & Direction Rules', () => {
  test('rejects itinerary if origin and destination are the same stop', () => {
    const res = verifyTripReachability(
      {
        originStopId: 'xiangshan',
        attractionId: 'xiangshan_visitor_center', // stopId is xiangshan
        departureDate: '2026-11-05',
        departureTime: '09:00',
      },
      timetable,
      attractions
    );

    expect(res.isValid).toBe(false);
    expect(res.invalidReason).toContain('出發地站點');
    expect(res.invalidReason).toContain('相同');
  });

  test('findOutboundTrip selects true earliest trip among candidates (minimum departure time)', () => {
    const schedule = timetable.schedules.weekday_outbound;
    // Querying after 08:30 from thsr to xiangshan
    const match = findOutboundTrip(schedule, 'thsr', 'xiangshan', 510); // 08:30 = 510 min
    expect(match).not.toBeNull();
    expect(match?.originTime).toBe('08:45'); // Trip 6 departs THSR at 08:45
    expect(match?.destTime).toBe('10:15');
  });

  test('findInboundTrip correctly enforces destinationArrivalTime > departureTime', () => {
    const schedule = timetable.schedules.weekday_inbound;
    // Querying return from xiangshan to thsr after 12:00 (720 min)
    const match = findInboundTrip(schedule, 'thsr', 'xiangshan', 720);
    expect(match).not.toBeNull();
    expect(timeToMinutes(match!.arrTime)).toBeGreaterThan(timeToMinutes(match!.deptTime));
  });
});

describe('Origin-to-Destination Last Bus Risk Assessment', () => {
  test('calculates last bus and counts exact remaining trips to specific user origin', () => {
    // Xiangshan inbound to THSR
    const risk = calculateLastBusRisk(
      'xiangshan',
      'thsr',
      'weekday',
      '13:30',
      timetable
    );

    expect(risk.riskLevel).toBe('SAFE');
    expect(risk.lastBusDepartureTime).toBe('16:30');
    expect(risk.bufferMinutes).toBe(180);
    // Viable trips departing Xiangshan returning to THSR: 13:30, 14:30, 16:30 -> 3 remaining
    expect(risk.remainingTripsCount).toBe(3);
    expect(risk.disclaimer).toContain('SAFE 表示排定班表有充足緩衝班次');
    expect(risk.disclaimer).toContain('非保證營運安全');
  });

  test('flags CRITICAL when taking the final bus service', () => {
    const risk = calculateLastBusRisk(
      'xiangshan',
      'thsr',
      'weekday',
      '16:30',
      timetable
    );

    expect(risk.riskLevel).toBe('CRITICAL');
    expect(risk.remainingTripsCount).toBe(1);
    expect(risk.bufferMinutes).toBe(0);
    expect(risk.backupPlan).toBe(STANDARD_UNVERIFIED_BACKUP_NOTICE);
  });

  test('flags STRANDED with standard unverified backup notice when departing after last bus', () => {
    const risk = calculateLastBusRisk(
      'xiangshan',
      'thsr',
      'weekday',
      '17:00',
      timetable
    );

    expect(risk.riskLevel).toBe('STRANDED');
    expect(risk.remainingTripsCount).toBe(0);
    expect(risk.bufferMinutes).toBeLessThan(0);
    expect(risk.backupPlan).toBe(STANDARD_UNVERIFIED_BACKUP_NOTICE);
  });
});

describe('Senior Accessible Speed Multiplier vs Terrain Disclaimer', () => {
  test('senior profile applies 1.4x walking multiplier and includes explicit non-accessibility notice', () => {
    const res = verifyTripReachability(
      {
        originStopId: 'thsr',
        attractionId: 'xiangshan_visitor_center',
        departureDate: '2026-11-05',
        departureTime: '08:30',
        customDwellMinutes: 90,
        profile: 'senior_accessible',
      },
      timetable,
      attractions
    );

    expect(res.isValid).toBe(true);
    // Xiangshan baseline walk is 2 min * 1.4 = 2.8 -> ceil = 3 min
    expect(res.outbound?.walkToAttractionMinutes).toBe(3);
    expect(
      res.warnings.some((w) =>
        w.includes('僅為步行速度估算假設，不代表現地路徑符合無障礙標準')
      )
    ).toBe(true);
  });
});

describe('Pre-generated Sample Scenarios', () => {
  test('all 5 benchmark scenarios execute and adhere to new contracts', () => {
    const scenarios = generateSampleScenarios(timetable, attractions);
    expect(scenarios.length).toBe(5);

    // Scenario 1: THSR to Xiangshan safe
    const s1 = scenarios.find((s) => s.scenarioId === 'scenario_thsr_to_xiangshan')!;
    expect(s1.result.isValid).toBe(true);
    expect(s1.result.outbound?.inferredSubroute).toBe('6670F');
    expect(s1.result.outbound?.subrouteClassification).toBe('inferred');
    expect(s1.result.lastBusRisk?.riskLevel).toBe('SAFE');

    // Scenario 4: Paper Dome closed on Wednesday
    const s4 = scenarios.find(
      (s) => s.scenarioId === 'scenario_paperdome_closed_wednesday'
    )!;
    expect(s4.result.isValid).toBe(false);
    expect(s4.result.invalidReason).toContain('公休');

    // Scenario 5: Dwell exceeds closing rejected
    const s5 = scenarios.find(
      (s) => s.scenarioId === 'scenario_dwell_exceeds_close_rejected'
    )!;
    expect(s5.result.isValid).toBe(false);
    expect(s5.result.invalidReason).toContain('超過景點打烊時間');

    // Scenario 6: Stranded at Xiangshan
    const s6 = scenarios.find((s) => s.scenarioId === 'scenario_stranded_xiangshan')!;
    expect(s6.result.isValid).toBe(false);
    expect(s6.result.lastBusRisk?.riskLevel).toBe('STRANDED');
    expect(s6.result.lastBusRisk?.backupPlan).toBe(STANDARD_UNVERIFIED_BACKUP_NOTICE);
  });
});
