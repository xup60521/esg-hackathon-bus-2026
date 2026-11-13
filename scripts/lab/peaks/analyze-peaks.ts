#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildCalendar, buildProfile } from '../../../src/features/lab/peaks/analysis';
import { classifyStopRole } from '../../../src/features/lab/peaks/classifier';
import { ANALYSIS_HOURS, calculateDirectionalAsymmetry, observedMean, safeRatio } from '../../../src/features/lab/peaks/metrics';
import type { Artifact, Direction, DayGroup, GovernmentCalendar, HourlyOutput, PeakSummary, SourcePayload, StationPeakProfile } from '../../../src/features/lab/peaks/types';
import { reconcileMonths } from './reconcile';

const payload: SourcePayload = JSON.parse(await readFile('public/data/midstop.json','utf8'));
assert.deepEqual(payload.columns, ['date','subroute','direction','stop','hour','boardings','alightings']);
const calendarText = await readFile('public/data/lab/visualization/calendar.json','utf8');
const calendar: GovernmentCalendar = JSON.parse(calendarText);
assert.equal(Object.keys(calendar.days).length,731);
const { rows, stops } = payload;
const directions: Direction[] = ['outbound','inbound','unknown'];
const stopNames = new Set(stops.map(s=>s.name));
for (const r of rows) {
  assert.equal(r.length,7); assert(calendar.days[r[0]]); assert(directions.includes(r[2])); assert(stopNames.has(r[3]));
  assert(Number.isInteger(r[4]) && r[4]>=0 && r[4]<24);
  assert([r[5],r[6]].every(v=>Number.isSafeInteger(v)&&v>=0));
}
const reconciliation = await reconcileMonths(rows);
console.log('24-month exact key reconciliation:', reconciliation);
const audit = buildCalendar(rows, calendar);
const group = (d: DayGroup) => audit.filter(day=>d==='all'||day.dayType===d);
const hourly: HourlyOutput = { analysisHours: ANALYSIS_HOURS, dimensions: {} as HourlyOutput['dimensions'], subroutes: {}, months: {} };
for (const dir of [...directions,'all'] as const) {
  hourly.dimensions[dir] = {} as HourlyOutput['dimensions']['all'];
  for (const d of ['all','government_workday','government_restday'] as const) {
    const days = group(d), dates = new Set(days.map(day=>day.date));
    hourly.dimensions[dir][d] = buildProfile(rows.filter(r=>(dir==='all'||r[2]===dir)&&dates.has(r[0])),days);
  }
}
for (const sub of [...new Set(rows.map(r=>r[1]))].sort()) {
  const subset = rows.filter(r=>r[1]===sub);
  hourly.subroutes[sub] = { ...buildProfile(subset,audit), directions: Object.fromEntries(directions.map(d=>[d,buildProfile(subset.filter(r=>r[2]===d),audit)])) as HourlyOutput['subroutes'][string]['directions'] };
}
for (const month of [...new Set(audit.map(d=>d.date.slice(0,7)))]) hourly.months[month] = buildProfile(rows.filter(r=>r[0].startsWith(month)),audit.filter(d=>d.date.startsWith(month)));
const stations: StationPeakProfile[] = stops.map(s=> {
  const subset = rows.filter(r=>r[3]===s.name);
  const profiles = Object.fromEntries(directions.map(d=>[d,buildProfile(subset.filter(r=>r[2]===d),audit)])) as StationPeakProfile['directions'];
  const asymmetry = calculateDirectionalAsymmetry(profiles.outbound.totalBoardings, profiles.inbound.totalBoardings);
  return { ...buildProfile(subset,audit), stop:s.name, order:s.order, role:classifyStopRole(s.name), roleBasis:'analyst_candidate_not_route_position', directions:profiles, dominantDirection:asymmetry.dominantDirection, directionalAsymmetryRatio:asymmetry.ratio };
});
const all = hourly.dimensions.all.all;
assert.equal(all.totalBoardings,1800910); assert.equal(all.totalAlightings,1800910);
const samples = {
  workday: group('government_workday'), restday: group('government_restday'),
  friday: audit.filter(d=>d.dayOfWeek===4), monThu: audit.filter(d=>d.dayOfWeek<=3),
};
const comparisonSamples = Object.fromEntries(Object.entries(samples).map(([name,days])=> {
  const values=days.flatMap(d=>d.boardings===null?[]:[d.boardings]);
  return [name,{observedDays:values.length,totalBoardings:values.reduce((s,v)=>s+v,0),mean:observedMean(values)}];
}));
const {days: _days,...calendarMetadata} = calendar;
const summary: PeakSummary = {
  generatedAt:new Date().toISOString(), calendar:calendarMetadata, analysisHours:ANALYSIS_HOURS,
  dataSpan:{startDate:audit[0].date,endDate:audit.at(-1)!.date,totalCalendarDays:audit.length,observedDays:all.observedDays,missingDays:audit.length-all.observedDays},
  totalBoardings:all.totalBoardings,totalAlightings:all.totalAlightings,
  directionBreakdown:Object.fromEntries(directions.map(d=> {const p=hourly.dimensions[d].all; return [d,{boardings:p.totalBoardings,alightings:p.totalAlightings,share:safeRatio(p.totalBoardings,all.totalBoardings)}];})) as PeakSummary['directionBreakdown'],
  overallMetrics:{all:all.peakMetrics,restVsWorkdayObservedMeanRatio:safeRatio(comparisonSamples.restday.mean,comparisonSamples.workday.mean),fridayVsMonThuObservedMeanRatio:safeRatio(comparisonSamples.friday.mean,comparisonSamples.monThu.mean)},
  comparisonSamples,
  dataQuality:{totalRows:rows.length,missingDates:audit.filter(d=>d.status==='missing_unknown').map(d=>d.date),missingCause:'unknown',reconciliation},
};
await mkdir('public/data/lab/peaks',{recursive:true});
for (const [name,data] of Object.entries({'summary':summary,'calendar-audit':audit,'hourly-peaks':hourly,'station-peaks':stations})) {
  const artifact: Artifact<unknown> = {schemaVersion:2,data};
  await writeFile(`public/data/lab/peaks/${name}.json`,JSON.stringify(artifact,null,2)+'\n');
}
console.log('Calendar input SHA256:',createHash('sha256').update(calendarText).digest('hex'));
console.log(JSON.stringify({dataSpan:summary.dataSpan,metrics:summary.overallMetrics,samples:comparisonSamples,missingDates:summary.dataQuality.missingDates},null,2));
console.log('Wrote four schema v2 artifacts. Missing causes remain unknown.');
