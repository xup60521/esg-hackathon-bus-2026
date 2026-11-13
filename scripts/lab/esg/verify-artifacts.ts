import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { evaluateAllPresets, finiteResult } from '../../../src/features/lab/esg';
const read = async (name: string) => JSON.parse(await readFile(`public/data/lab/esg/${name}.json`, 'utf8'));
const [summary, monthly, odData, scenarioData] = await Promise.all(['summary','monthly','od-carbon','scenarios'].map(read));
for (const file of [summary, monthly, odData, scenarioData]) { assert.equal(file.schemaVersion, 2); finiteResult(file); }
const sum = (rows: any[], key: string) => rows.reduce((n,r)=>n+r[key],0);
const close = (a: number,b: number) => assert.ok(Math.abs(a-b) <= Math.max(1,Math.abs(a))*1e-10, `${a} != ${b}`);
assert.equal(sum(monthly.months,'totalTrips'), summary.dataset.totalTrips);
assert.equal(sum(odData.od,'tripCount'), summary.dataset.totalTrips);
close(sum(monthly.months,'knownDistancePkm'), summary.dataset.knownDistancePkm);
close(odData.od.reduce((n: number,r: any)=>n+r.tripCount*(r.distanceKm??0),0),summary.dataset.knownDistancePkm);
assert.equal(summary.dataset.operatingDays,null);
assert.equal(summary.coverage.matchedNetworkTrips+summary.coverage.sameStopTrips+summary.coverage.unknownDistanceTrips,summary.dataset.totalTrips);
assert.equal(sum(summary.coverage.missingDistances,'tripCount'),summary.coverage.unknownDistanceTrips);
assert.ok(monthly.months.every((m: any)=>m.operationalKgCo2e===null && m.scenarioDifferenceKgCo2e===null));
const recomputed = evaluateAllPresets(odData.od, scenarioData.inputVehicleKm);
for (let i = 0; i < recomputed.length; i++) {
 for (const [key, value] of Object.entries(recomputed[i].operational)) {
  const saved = scenarioData.scenarios[i].operational[key];
  if (value === null) assert.equal(saved, null);
  else close(value, saved);
 }
}
for (let i=0;i<recomputed.length;i++) {
 if (recomputed[i].comparison) close(recomputed[i].comparison!.scenarioDifferenceKgCo2e,scenarioData.scenarios[i].comparison.scenarioDifferenceKgCo2e);
 assert.equal(recomputed[i].structure.totalTrips,summary.dataset.totalTrips);
}
assert.ok(scenarioData.scenarios[2].operational.purchasedElectricityKgCo2e > 0);
for (const [key,factor] of Object.entries(summary.parameters.factors) as [string,any][]) assert.equal(factor.status,key==='electricityKgCo2ePerKwh'?'official':'assumption');
console.log(`PASS: 4 schema-v2 artifacts; ${summary.dataset.totalTrips} trips; ${monthly.months.length} monthly totals; ${odData.od.length} OD/subroute groups; 3 independently recomputed scenarios; no monthly invented emissions`);
