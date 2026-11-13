/** Local-only validation of delivered artifacts and all 24 source month caches. */
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const publicData=JSON.parse(await readFile('public/data/midstop.json','utf8'));
const merged=new Map<string,number[]>();
const months=(await readdir('data/midstop-months')).filter(n=>/^\d{4}-\d{2}-01.json$/.test(n)).sort();
assert.equal(months.length,24);
for(const name of months)for(const row of JSON.parse(await readFile(`data/midstop-months/${name}`,'utf8'))) {
 const key=JSON.stringify(row.slice(0,5)); const counts=merged.get(key)??[0,0];
 counts[0]+=row[5];counts[1]+=row[6];merged.set(key,counts);
}
assert.equal(merged.size,publicData.rows.length);
for(const row of publicData.rows) assert.deepEqual(merged.get(JSON.stringify(row.slice(0,5))),row.slice(5));
const s=JSON.parse(await readFile('public/data/lab/occupancy/summary.json','utf8'));
assert.equal(s.local.boardings,1800910);assert.equal(s.local.alightings,1800910);
assert.equal(s.local.invalidRows,0);
assert.equal(s.retainedTaps+Object.values(s.exclusions).reduce<number>((n,x)=>n+Number(x),0),s.window.records);
for(const result of s.scenarios) {
 assert.equal(result.transferred+result.retained,result.observedTrips);
 assert.equal(result.passengerSecondsBefore,result.passengerSecondsAfter);
 assert.ok(result.afterPeak<=result.beforePeak);
 assert.ok(result.reliefPeaks.every((n:number)=>n<=result.capacity));
 assert.equal(result.reliefPeaks.length,result.extraVehicles);
}
console.log(JSON.stringify({status:'pass',months:months.length,matchedAggregateRows:merged.size,
 boardings:s.local.boardings,alightings:s.local.alightings,scenarioConservationChecks:s.scenarios.length}));
