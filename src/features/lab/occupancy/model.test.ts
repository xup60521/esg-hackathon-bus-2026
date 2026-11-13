import {describe, expect, test} from 'bun:test';
import {candidates, peak, simulate, stationInversions, type Tap} from './model';
const t=(board:number,alight:number,origin=1,destination=4):Tap=>({board,alight,origin,destination});
describe('matched-tap diagnostic',()=>{
 test('turnover is not cumulative boardings or an hourly total',()=>{
  expect(peak([t(0,10),t(10,20),t(20,30)])).toBe(1);
  expect(peak([t(0,30),t(10,20),t(10,15)])).toBe(3);
 });
 test('ties, midnight and input permutation',()=>{
  const data=[t(86399,86410),t(86400,86420),t(86410,86430)];
  expect(peak(data)).toBe(2); expect(peak([...data].reverse())).toBe(2);
  expect(candidates(data)).toHaveLength(1);
 });
 test('empty gaps change candidates but never measured overlap',()=>{
  const data=[t(0,10),t(11,20),t(30,40)];
  expect(candidates(data,0)).toHaveLength(3); expect(candidates(data,10)).toHaveLength(1);
  expect(peak(data)).toBe(1);
 });
 test('station regression is diagnosed; equal-time events unordered',()=>{
  expect(stationInversions([t(0,20,1,4),t(10,30,2,5)])).toBe(0);
  expect(stationInversions([t(0,20,2,4),t(10,30,1,5)])).toBe(1);
 });
 test('invalid data and parameters are rejected',()=>{
  expect(()=>peak([t(4,4)])).toThrow(); expect(()=>peak([t(5,4)])).toThrow();
  expect(()=>candidates([],NaN)).toThrow(); expect(()=>simulate([],0,1)).toThrow();
  expect(()=>simulate([],40,5)).toThrow();
 });
 test('bounded relief conserves trips and passenger time',()=>{
  const data=[...Array.from({length:6},()=>t(0,20)),...Array.from({length:4},()=>t(5,15,2,4))];
  const result=simulate(data,4,1,x=>x.origin===2);
  expect(result.transferred).toBe(4); expect(result.afterPeak).toBe(6);
  expect(result.reliefPeaks).toEqual([4]); expect(result.beforeExcess).toBe(6);
  expect(result.retained+result.transferred).toBe(data.length);
  expect(result.passengerSecondsBefore).toBe(result.passengerSecondsAfter);
  expect(simulate(data,4,0).afterPeak).toBe(10);
 });
 test('relief stops once original is within the capacity parameter',()=>{
  expect(simulate([t(0,20),t(0,20)],2,2).transferred).toBe(0);
  const r=simulate(Array.from({length:6},()=>t(0,20)),4,2);
  expect(r.transferred).toBe(2); expect(r.afterPeak).toBe(4);
 });
 test('exhaustive small intervals: relief never exceeds bound or increases original peak',()=>{
  for(let mask=0;mask<128;mask++) {
   const data=Array.from({length:7},(_,i)=>t(i%3,i%3+1+i%2)).filter((_,i)=>mask&(1<<i));
   for(const capacity of [1,2,3]) for(const extra of [0,1,2]) {
    const r=simulate(data,capacity,extra);
    expect(r.reliefPeaks.every(n=>n<=capacity)).toBe(true);
    expect(r.afterPeak).toBeLessThanOrEqual(r.beforePeak);
    expect(r.transferred+r.retained).toBe(data.length);
    expect(r.passengerSecondsBefore).toBe(r.passengerSecondsAfter);
   }
  }
 });
});
