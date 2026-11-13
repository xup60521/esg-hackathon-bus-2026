#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { classifyDate, classifyStopRole } from '../../../src/features/lab/peaks/classifier';
import { calculateDirectionalAsymmetry, calculatePeakMetrics, observedMean, safeRatio } from '../../../src/features/lab/peaks/metrics';
import type { Artifact, CalendarAuditDay, GovernmentCalendar, HourlyOutput, HourlyProfile, PeakSummary, SourcePayload, SourceRow, StationPeakProfile } from '../../../src/features/lab/peaks/types';
import { reconcileMonths } from './reconcile';

async function load<T>(name:string):Promise<T> {
  const artifact:Artifact<T> = JSON.parse(await readFile(`public/data/lab/peaks/${name}.json`,'utf8'));
  assert.equal(artifact.schemaVersion,2); return artifact.data;
}
const source:SourcePayload = JSON.parse(await readFile('public/data/midstop.json','utf8'));
const calendar:GovernmentCalendar = JSON.parse(await readFile('public/data/lab/visualization/calendar.json','utf8'));
const [summary,audit,hourly,stations] = await Promise.all([load<PeakSummary>('summary'),load<CalendarAuditDay[]>('calendar-audit'),load<HourlyOutput>('hourly-peaks'),load<StationPeakProfile[]>('station-peaks')]);
assert.deepEqual(summary.dataQuality.reconciliation,await reconcileMonths(source.rows));
assert.equal(audit.length,731);
assert.deepEqual(audit.map(d=>d.date),Object.keys(calendar.days).sort());
for (const day of audit) {
  const rows=source.rows.filter(r=>r[0]===day.date);
  const info=classifyDate(day.date,calendar);
  for (const key of ['dayType','governmentRest','dayOfWeek','calendarNote'] as const) assert.equal(day[key],info[key]);
  assert.equal(day.recordCount,rows.length);
  assert.equal(day.status,rows.length?'observed':'missing_unknown');
  assert.equal(day.boardings,rows.length?rows.reduce((s,r)=>s+r[5],0):null);
  assert.equal(day.alightings,rows.length?rows.reduce((s,r)=>s+r[6],0):null);
}
assert.equal(audit.find(d=>d.date==='2025-05-02')!.dayType,'government_workday');
const missing=audit.filter(d=>d.status==='missing_unknown');
assert.equal(missing.length,6);
assert.deepEqual(summary.dataQuality.missingDates,missing.map(d=>d.date));
assert.equal(summary.dataQuality.missingCause,'unknown');
assert.equal(summary.dataQuality.totalRows,source.rows.length);
assert.deepEqual(summary.dataSpan,{startDate:'2024-01-01',endDate:'2025-12-31',totalCalendarDays:731,observedDays:725,missingDays:6});
const {days:_days,...metadata}=calendar;
assert.deepEqual(summary.calendar,metadata);
let profilesChecked=0;
function checkProfile(p:HourlyProfile,rows:SourceRow[],days:CalendarAuditDay[]) {
  const b=Array<number>(24).fill(0), a=Array<number>(24).fill(0);
  for (const r of rows) {b[r[4]]+=r[5];a[r[4]]+=r[6];}
  assert.deepEqual(p.hourlyBoardings,b); assert.deepEqual(p.hourlyAlightings,a);
  assert.equal(p.totalBoardings,b.reduce((s,v)=>s+v,0));
  assert.equal(p.totalAlightings,a.reduce((s,v)=>s+v,0));
  const n=new Set(rows.map(r=>r[0])).size;
  assert.equal(p.observedDays,n); assert.equal(p.calendarDays,days.length);
  assert.equal(p.networkObservedDays,days.filter(d=>d.status==='observed').length);
  assert.equal(p.missingGroupDays,days.length-n);
  assert.equal(p.sampleStatus,!n?'no_records':n<days.length?'incomplete_coverage':'observed_network_days');
  assert.deepEqual(p.avgObservedDayHourlyBoardings,b.map(v=>n?v/n:null));
  assert.deepEqual(p.avgObservedDayHourlyAlightings,a.map(v=>n?v/n:null));
  assert.deepEqual(p.peakMetrics,calculatePeakMetrics(b));
  assert.equal(p.peakMetrics.includedVolume+p.peakMetrics.excludedVolume,p.totalBoardings);
  const m=p.peakMetrics;
  if (!p.totalBoardings) { assert.equal(m.peakHour,null); assert.equal(m.peakToBaseRatio,null); }
  else { assert(m.cr3!<=m.cr4! && m.cr4!<=1); assert(m.gini!>=0&&m.gini!<=1); }
  profilesChecked++;
}
for (const dir of ['all','outbound','inbound','unknown'] as const) for(const dayType of ['all','government_workday','government_restday'] as const) {
  const days=audit.filter(d=>dayType==='all'||d.dayType===dayType), dates=new Set(days.map(d=>d.date));
  checkProfile(hourly.dimensions[dir][dayType],source.rows.filter(r=>(dir==='all'||r[2]===dir)&&dates.has(r[0])),days);
}
assert.deepEqual(hourly.analysisHours,Array.from({length:24},(_,h)=>h));
assert.deepEqual(summary.analysisHours,hourly.analysisHours);
assert.deepEqual(Object.keys(hourly.subroutes).sort(),[...new Set(source.rows.map(r=>r[1]))].sort());
for (const [sub,p] of Object.entries(hourly.subroutes)) {
  const rows=source.rows.filter(r=>r[1]===sub); checkProfile(p,rows,audit);
  for(const dir of ['outbound','inbound','unknown'] as const) checkProfile(p.directions[dir],rows.filter(r=>r[2]===dir),audit);
}
assert.equal(Object.keys(hourly.months).length,24);
for (const [month,p] of Object.entries(hourly.months)) checkProfile(p,source.rows.filter(r=>r[0].startsWith(month)),audit.filter(d=>d.date.startsWith(month)));
assert.deepEqual(stations.map(s=>[s.stop,s.order]),source.stops.map(s=>[s.name,s.order]));
for (const p of stations) {
  const rows=source.rows.filter(r=>r[3]===p.stop); checkProfile(p,rows,audit);
  assert.equal(p.role,classifyStopRole(p.stop)); assert.equal(p.roleBasis,'analyst_candidate_not_route_position');
  for(const dir of ['outbound','inbound','unknown'] as const) checkProfile(p.directions[dir],rows.filter(r=>r[2]===dir),audit);
  const asym=calculateDirectionalAsymmetry(p.directions.outbound.totalBoardings,p.directions.inbound.totalBoardings);
  assert.equal(p.dominantDirection,asym.dominantDirection); assert.equal(p.directionalAsymmetryRatio,asym.ratio);
}
for (const metric of ['totalBoardings','totalAlightings'] as const) {
  assert.equal(summary[metric],1800910);
  for(const values of [stations,Object.values(hourly.months),Object.values(hourly.subroutes),['outbound','inbound','unknown'].map(d=>hourly.dimensions[d as 'outbound'].all)]) assert.equal(values.reduce((s,p)=>s+p[metric],0),summary[metric]);
}
for (const dir of ['outbound','inbound','unknown'] as const) {
  const p=hourly.dimensions[dir].all;
  assert.deepEqual(summary.directionBreakdown[dir],{boardings:p.totalBoardings,alightings:p.totalAlightings,share:safeRatio(p.totalBoardings,summary.totalBoardings)});
}
const conditions={workday:(d:CalendarAuditDay)=>d.dayType==='government_workday',restday:(d:CalendarAuditDay)=>d.dayType==='government_restday',friday:(d:CalendarAuditDay)=>d.dayOfWeek===4,monThu:(d:CalendarAuditDay)=>d.dayOfWeek<=3};
for (const [key,predicate] of Object.entries(conditions)) {
  const values=audit.filter(predicate).flatMap(d=>d.boardings===null?[]:[d.boardings]);
  assert.deepEqual(summary.comparisonSamples[key],{observedDays:values.length,totalBoardings:values.reduce((s,v)=>s+v,0),mean:observedMean(values)});
}
assert.deepEqual(summary.overallMetrics.all,hourly.dimensions.all.all.peakMetrics);
assert.equal(summary.overallMetrics.restVsWorkdayObservedMeanRatio,safeRatio(summary.comparisonSamples.restday.mean!,summary.comparisonSamples.workday.mean!));
assert.equal(summary.overallMetrics.fridayVsMonThuObservedMeanRatio,safeRatio(summary.comparisonSamples.friday.mean!,summary.comparisonSamples.monThu.mean!));
console.log(`PASS: 24 months / ${source.rows.length} exact keys; ${profilesChecked} profiles checked against source rows, calendar/nullable samples/averages/metrics; four artifacts conserve 1,800,910 boardings and alightings.`);
console.log('This proves aggregate consistency only. Missing causes, schedule and source completeness remain unknown.');
