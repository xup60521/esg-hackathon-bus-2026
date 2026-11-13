/** Exploratory matched-tap intervals. These are not verified service trips or total demand. */
export type Tap = { board: number; alight: number; origin: number; destination: number };
export type Candidate = { taps: Tap[]; start: number; end: number };
const valid = (t: Tap) => Number.isFinite(t.board) && Number.isFinite(t.alight)
 && t.alight > t.board && Number.isInteger(t.origin) && Number.isInteger(t.destination)
 && t.origin !== t.destination;

/** Half-open [board, alight): alighting precedes boarding at equal timestamps. */
export function peak(taps: Tap[]): number {
 const changes = new Map<number, number>();
 for (const t of taps) {
  if (!valid(t)) throw new Error('Invalid tap interval');
  changes.set(t.board, (changes.get(t.board) ?? 0) + 1);
  changes.set(t.alight, (changes.get(t.alight) ?? 0) - 1);
 }
 let count = 0, maximum = 0;
 for (const [, delta] of [...changes].sort((a,b)=>a[0]-b[0])) {count += delta; maximum = Math.max(count, maximum);}
 return maximum;
}

/** Call separately for each vehicle, subroute and inferred direction, across midnight. */
export function candidates(taps: Tap[], gapSeconds = 0): Candidate[] {
 if (!Number.isFinite(gapSeconds) || gapSeconds < 0) throw new Error('Invalid gap');
 const groups: Candidate[] = [];
 for (const t of [...taps].sort((a,b)=>a.board-b.board || a.alight-b.alight)) {
  if (!valid(t)) throw new Error('Invalid tap interval');
  const last = groups.at(-1);
  if (!last || t.board > last.end + gapSeconds) groups.push({ taps:[t],start:t.board,end:t.alight });
  else {last.taps.push(t); last.end=Math.max(last.end,t.alight);}
 }
 return groups;
}

/** Adjacent strict-time event groups should progress along one direction.
 * Same-time events are unordered. Violations are diagnostics, never auto-corrections. */
export function stationInversions(taps: Tap[]): number {
 if (!taps.length) return 0;
 const sign = Math.sign(taps[0].destination-taps[0].origin);
 const events = new Map<number, number[]>();
 for (const t of taps) {
  for (const [time, stop] of [[t.board,t.origin],[t.alight,t.destination]]) {
   const list=events.get(time) ?? []; list.push(sign*stop); events.set(time,list);
  }
 }
 let previousMax=-Infinity, inversions=0;
 for (const [,stops] of [...events].sort((a,b)=>a[0]-b[0])) {
  if (Math.min(...stops)<previousMax) inversions++;
  previousMax=Math.max(...stops);
 }
 return inversions;
}

/** Hypothetical parallel relief vehicles, same OD and times. No new demand, no queue model.
 * Greedy first-fit is bounded and deterministic; it does not promise an optimum. */
export function simulate(taps: Tap[], capacity: number, extraVehicles: number,
 eligible: (tap: Tap)=>boolean = ()=>true) {
 if (!Number.isInteger(capacity) || capacity<1 || !Number.isInteger(extraVehicles)
  || extraVehicles<0 || extraVehicles>4) throw new Error('Capacity/extraVehicles outside bounds');
 for (const t of taps) if (!valid(t)) throw new Error('Invalid tap interval');
 const relief: Tap[][]=Array.from({length:extraVehicles},()=>[]);

 // Longer intervals first: fixed tie ordering makes reruns reproducible.
 const sorted=[...taps].sort((a,b)=>(b.alight-b.board)-(a.alight-a.board)
  || a.board-b.board || a.origin-b.origin || a.destination-b.destination);
 const retained=[...sorted];
 for (const t of sorted) {
  if (peak(retained)<=capacity) break;
  const bus=eligible(t) ? relief.find(list=>peak([...list,t])<=capacity) : undefined;
  if (bus) {bus.push(t); retained.splice(retained.indexOf(t),1);}
 }
 const before=peak(taps), after=peak(retained);
 return { capacity,extraVehicles,observedTrips:taps.length,transferred:relief.reduce((n,x)=>n+x.length,0),
  retained:retained.length,beforePeak:before,afterPeak:after,
  beforeExcess:Math.max(0,before-capacity),afterExcess:Math.max(0,after-capacity),
  beforePeakRatio:before/capacity,afterPeakRatio:after/capacity,
  reliefPeaks:relief.map(peak),
  passengerSecondsBefore:taps.reduce((n,t)=>n+t.alight-t.board,0),
  passengerSecondsAfter:[retained,...relief].flat().reduce((n,t)=>n+t.alight-t.board,0) };
}
