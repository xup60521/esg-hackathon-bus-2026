/** Read aggregate local data only. Run from repository root: bun scripts/lab/optimization/build.ts */
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { solve, verifySolution, type Scenario, type Trip } from '../../../src/features/lab/optimization/solver';

type Row = [string, string, string, string, number, number, number];
const bytes = await readFile('public/data/midstop.json');
const data: { generatedAt: string; columns: string[]; rows: Row[] } = JSON.parse(bytes.toString());
if (JSON.stringify(data.columns) !== JSON.stringify(['date', 'subroute', 'direction', 'stop', 'hour', 'boardings', 'alightings'])) throw new Error('Source schema changed');
const groups = new Map<string, { date: string; subroute: string; hour: number; boardings: number }>();
let boardings = 0, alightings = 0, unknownBoardings = 0;
const dates = new Set<string>();
for (const [date, subroute, direction, stop, hour, b, a] of data.rows) {
  if (![hour, b, a].every(n => Number.isSafeInteger(n) && n >= 0) || hour > 23) throw new Error('Invalid aggregate row');
  boardings += b; alightings += a; dates.add(date);
  if (direction === 'unknown') unknownBoardings += b;
  if (stop !== '埔里站' || direction !== 'inbound' || subroute === '6670H') continue;
  const key = `${date}/${subroute}/${hour}`;
  const g = groups.get(key) ?? { date, subroute, hour, boardings: 0 };
  g.boardings += b; groups.set(key, g);
}
// Reconcile public export with all monthly aggregate chunks, including boundary duplicates.
const monthly = new Map<string, [number, number]>();
const monthlyFiles = (await readdir('data/midstop-months')).filter(f => /^20\d{2}-\d{2}-01\.json$/.test(f)).sort();
for (const file of monthlyFiles) {
  const rows: Row[] = JSON.parse(await readFile(`data/midstop-months/${file}`, 'utf8'));
  for (const row of rows) {
    const key = JSON.stringify(row.slice(0, 5));
    const previous = monthly.get(key) ?? [0, 0];
    monthly.set(key, [previous[0] + row[5], previous[1] + row[6]]);
  }
}
if (monthlyFiles.length !== 24 || monthly.size !== data.rows.length) throw new Error('Monthly reconciliation row count mismatch');
const publicKeys = new Set<string>();
for (const row of data.rows) {
  const key = JSON.stringify(row.slice(0, 5));
  if (publicKeys.has(key)) throw new Error('Duplicate public aggregate key');
  publicKeys.add(key);
  const sums = monthly.get(key);
  if (!sums || sums[0] !== row[5] || sums[1] !== row[6]) throw new Error('Monthly reconciliation value mismatch');
}
const missingDates: string[] = [];
for (let d = new Date('2024-01-01T00:00:00Z'); d < new Date('2026-01-01T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
  const date = d.toISOString().slice(0, 10);
  if (!dates.has(date)) missingDates.push(date);
}

// Deterministic retrospective stress case, not a forecast or representative day.
const peak = [...groups.values()].sort((a, b) => b.boardings - a.boardings || a.date.localeCompare(b.date) || a.subroute.localeCompare(b.subroute) || a.hour - b.hour)[0];
if (!peak) throw new Error('No eligible observation');
const minute = peak.hour * 60;
const trip = (id: string, kind: Trip['kind'], offset: number): Trip => ({
  id, kind,
  startMinute: minute - (kind === 'midstop-extra' ? 30 : 90) + offset,
  endMinute: minute + (kind === 'midstop-extra' ? 120 : 180) + offset,
  capacity: 40,
  reservations: [{ targetId: 'puli-inbound-hour', seats: kind === 'midstop-extra' ? 40 : 20, serviceMinute: minute + offset }],
  cost: kind === 'baseline' ? 0 : kind === 'midstop-extra' ? 180 : 360,
});
const baseline = [trip('baseline-1', 'baseline', 0)];
const mid = Array.from({ length: 4 }, (_, i) => trip(`midstop-${i + 1}`, 'midstop-extra', 5 * (i + 1)));
const full = Array.from({ length: 6 }, (_, i) => trip(`full-${i + 1}`, 'full-extra', 5 * (i + 1)));
const resources = Array.from({ length: 7 }, (_, i) => ({ id: `pair-${i + 1}`, availableFrom: minute - 120, availableUntil: minute + 240, maxWorkMinutes: 300 }));
const assumptions = [
  '歷史最高小時刷卡量僅作事後容量壓力測試，不是未來完整需求或代表日。',
  '所有情境乘客假設於該小時整點已在埔里站，最晚整點加59分鐘可獲保留座位；真實到站與候車未知。',
  '假設基準1班，全程加班可保留20席，中間站起駛可保留40席；每車容量40。其餘席位不評估。',
  '全程車占用270分鐘，中間站車150分鐘，含共同車庫定位、行駛、返庫與恢復，非實測時間。',
  '每個資源是1車加1名合格司機，單一可用時段且占用工作上限300分鐘；不是法定工時認證。',
  '加班成本為假設比較單位，全程360、中間站180，非業者報價或新臺幣。',
  '候選全程6班、中間站4班，服務時刻為整點後每5分鐘；保留原基準班，不允許刪班。',
  '僅涵蓋單支線單方向埔里站；不以時段上車量重建全線載客率，不估排隊、拒載或候車分鐘。',
];
const base: Scenario = {
  id: 'mixed-feasible', assumptions,
  targets: [{ id: 'puli-inbound-hour', observedBoardings: peak.boardings, assumedPassengers: peak.boardings, minimumServices: 1, readyMinute: minute, deadlineMinute: minute + 59 }],
  baseline, candidates: [...mid, ...full], resources: resources.slice(0, 4), extraBudget: 540, maxExtraTrips: 6, requireFullCoverage: true,
};
const scenarios: Scenario[] = [
  { ...base, id: 'baseline-capacity-gap', candidates: [], requireFullCoverage: false },
  { ...base, id: 'full-extra-feasible', candidates: full, resources, extraBudget: 2160 },
  base,
  { ...base, id: 'fleet-infeasible', resources: resources.slice(0, 3) },
  { ...base, id: 'budget-infeasible', extraBudget: 539 },
  { ...base, id: 'shift-infeasible', resources: resources.slice(0, 4).map(r => ({ ...r, availableUntil: minute + 60 })) },
  { ...base, id: 'midstop-seats30-infeasible', candidates: [...mid.map(t => ({ ...t, reservations: t.reservations.map(r => ({ ...r, seats: 30 })) })), ...full] },
  { ...base, id: 'midstop-seats30-expanded-feasible', resources: resources.slice(0, 5), extraBudget: 720, candidates: [...mid.map(t => ({ ...t, reservations: t.reservations.map(r => ({ ...r, seats: 30 })) })), ...full] },

];
const results = scenarios.map(scenario => {
  const solution = solve(scenario);
  const certificateErrors = solution.status === 'optimal' ? verifySolution(scenario, solution) : null;
  if (certificateErrors?.length) throw new Error(`Certificate failed: ${certificateErrors.join(', ')}`);
  return { scenario, solution, certificateErrors };
});
const inventory = {
  source: 'public/data/midstop.json', sha256: createHash('sha256').update(bytes).digest('hex'), generatedAt: data.generatedAt,
  sourceChecks: { monthlyFiles: monthlyFiles.length, matchedAggregateKeys: monthly.size, duplicatePublicKeys: 0, missingDates },
  rows: data.rows.length, observedDates: dates.size, firstDate: [...dates].sort()[0], lastDate: [...dates].sort().at(-1), boardings, alightings, unknownBoardings,
  selectedObservation: { ...peak, stop: '埔里站', direction: 'inbound', selection: 'maximum hourly boardings excluding 6670H; earliest date breaks ties' },
};
const output = { schemaVersion: 1, researchDate: '2026-11-04', disclaimer: '假設情境求解，非營運班表；刷卡不等同完整需求。', inventory, results };
await writeFile('public/data/lab/optimization/scenarios.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ inventory, results: results.map(r => ({ id: r.scenario.id, status: r.solution.status, selected: r.solution.selectedTripIds, evaluation: r.solution.evaluation, searchedSubsets: r.solution.searchedSubsets, rejected: r.solution.rejected, certificateErrors: r.certificateErrors })) }, null, 2));
