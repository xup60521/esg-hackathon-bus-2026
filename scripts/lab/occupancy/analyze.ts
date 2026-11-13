/** bun scripts/lab/occupancy/analyze.ts. Reads local aggregates and one bounded DB month.
 * No raw records or vehicle identifiers are persisted. Credentials use existing environment.
 */
import {createClient} from '@libsql/client';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {candidates,peak,simulate,stationInversions,type Tap} from '../../../src/features/lab/occupancy/model';
const sourcePath='public/data/midstop.json';
const input=await readFile(sourcePath,'utf8'); const data=JSON.parse(input);
const positions=new Map<string,number>(data.stops.map((s:{name:string;order:number})=>[s.name,s.order]));
let boardings=0,alightings=0,unknownBoardings=0,invalidRows=0;
const dates=new Set<string>(); const routeCounts:Record<string,number>={};
for(const r of data.rows) {
 if(r.length!==7 || !Number.isInteger(r[4]) || r[4]<0 || r[4]>23
  || !Number.isInteger(r[5]) || r[5]<0 || !Number.isInteger(r[6]) || r[6]<0) invalidRows++;
 boardings+=r[5]; alightings+=r[6]; if(r[2]==='unknown')unknownBoardings+=r[5];
 dates.add(r[0]);routeCounts[r[1]]=(routeCounts[r[1]]??0)+r[5];
}
const local={path:sourcePath,sha256:createHash('sha256').update(input).digest('hex'),
 generatedAt:data.generatedAt,columns:data.columns,rows:data.rows.length,boardings,alightings,
 unknownBoardings,activeDates:dates.size,invalidRows,routeBoardings:routeCounts,
 reconstructable:false,reason:'小時彙總缺 vehicle、配對上下車時間、trip_id、容量，無法識別逐班或同步載客。'};
await writeFile('docs/lab/occupancy/local-audit.json',JSON.stringify(local,null,2)+'\n');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL unavailable; local audit completed');
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_TOKEN});
const from='2025-01-01',to='2025-02-01';
const sql=`SELECT vehicle,subroute,board_ts,alight_ts,board_stop,alight_stop FROM trips WHERE board_date>=? AND board_date<? ORDER BY vehicle,board_ts`;
type Item=Tap & {key:string};
try {
 const result=await db.execute({sql,args:[from,to]});
 const groups=new Map<string,{route:string;direction:string;taps:Tap[]}>();
 const vehicles=new Map<string,Item[]>();
 let invalidTime=0,unknownStops=0,sameStop=0,missingVehicle=0;
 for(const row of result.rows) {
  const origin=positions.get(String(row.board_stop)),destination=positions.get(String(row.alight_stop));
  if(row.alight_ts===null || Number(row.alight_ts)<=Number(row.board_ts) || Number(row.alight_ts)-Number(row.board_ts)>21600){invalidTime++;continue;}
  if(origin===undefined || destination===undefined){unknownStops++;continue;}
  if(origin===destination){sameStop++;continue;}
  if(!String(row.vehicle??'').trim()){missingVehicle++;continue;}
  const direction=origin<destination?'outbound':'inbound';
  const key=JSON.stringify([row.vehicle,row.subroute,direction]);
  const tap:Tap={board:Number(row.board_ts),alight:Number(row.alight_ts),origin,destination};
  const group=groups.get(key)??{route:String(row.subroute),direction,taps:[]};group.taps.push(tap);groups.set(key,group);
  const list=vehicles.get(String(row.vehicle))??[];list.push({...tap,key});vehicles.set(String(row.vehicle),list);
 }
 // Flag candidates containing any interval that overlaps a different direction/subroute
 // on the same vehicle value. Same-direction/route vehicle-ID reuse remains undetectable.
 const conflicting=new Set<Tap>(); let conflictingPairs=0;
 const conflictSignatures=new Set<string>();
 for(const items of vehicles.values()) {
  let active:Item[]=[];
  for(const item of items.sort((a,b)=>a.board-b.board)) {
   active=active.filter(a=>a.alight>item.board);
   for(const other of active) if(other.key!==item.key) {
    conflictingPairs++;
    conflictSignatures.add(JSON.stringify([item.key,item.board,item.alight,item.origin,item.destination]));
    conflictSignatures.add(JSON.stringify([other.key,other.board,other.alight,other.origin,other.destination]));
   }
   active.push(item);
  }
 }
 for(const [key,group] of groups) for(const t of group.taps)
  if(conflictSignatures.has(JSON.stringify([key,t.board,t.alight,t.origin,t.destination]))) conflicting.add(t);
 const sensitivity=[];
 let chosen:{route:string;direction:string;candidate:ReturnType<typeof candidates>[number]}|undefined;
 for(const gapMinutes of [0,10,20,30]) {
  let count=0,regressions=0,long=0,conflicts=0,singletons=0,eligibleCount=0,eligibleTaps=0;
  const peaks:number[]=[];
  for(const group of groups.values()) for(const candidate of candidates(group.taps,gapMinutes*60)) {
   count++; const p=peak(candidate.taps);peaks.push(p);
   const inversion=stationInversions(candidate.taps)>0;
   const tooLong=candidate.end-candidate.start>14400;
   const conflict=candidate.taps.some(t=>conflicting.has(t));
   if(inversion)regressions++;if(tooLong)long++;if(conflict)conflicts++;
   if(candidate.taps.length===1)singletons++;
   if(!inversion&&!tooLong&&!conflict) {eligibleCount++;eligibleTaps+=candidate.taps.length;
    if(gapMinutes===0 && candidate.taps.length>=20 && (!chosen || p>peak(chosen.candidate.taps)))
     chosen={route:group.route,direction:group.direction,candidate};
   }
  }
  peaks.sort((a,b)=>a-b);
  const quantile=(q:number)=>peaks[Math.floor((peaks.length-1)*q)]??null;
  sensitivity.push({gapMinutes,candidates:count,stationRegressionCandidates:regressions,
   overFourHourCandidates:long,crossGroupConflictCandidates:conflicts,singletons,
   diagnosticEligibleCandidates:eligibleCount,diagnosticEligibleTaps:eligibleTaps,
   observedPeakP50:quantile(.5),observedPeakP95:quantile(.95),observedPeakMax:peaks.at(-1)??null});
 }
 const scenarios=[];
 if(chosen)for(const capacity of [30,40,50])for(const extra of [0,1,2])for(const policy of ['all-origins','middle-only']) {
  // Middle means internal to the observed candidate envelope, not a certified route terminus.
  const envelope=chosen.candidate.taps.flatMap(t=>[t.origin,t.destination]);
  const low=Math.min(...envelope),high=Math.max(...envelope);
  scenarios.push({policy,...simulate(chosen.candidate.taps,capacity,extra,
   t=>policy==='all-origins'||(t.origin>low&&t.origin<high))});
 }
 const output={schemaVersion:1,kind:'historical-diagnostic-and-hypothetical-relief',generatedAt:new Date().toISOString(),
  local,window:{from,to,filter:'board_date inclusive/exclusive, Asia/Taipei',sql,records:result.rows.length},
  exclusions:{invalidOrOverSixHourTime:invalidTime,unknownStops,sameStop,missingVehicle},
  retainedTaps:[...groups.values()].reduce((n,g)=>n+g.taps.length,0),
  vehicleValues:vehicles.size,vehicleRouteDirectionGroups:groups.size,
  conflictingCrossGroupIntervalPairs:conflictingPairs,conflictingTaps:conflicting.size,
  sensitivity,
  selectedCandidate:chosen?{route:chosen.route,direction:chosen.direction,
   date:new Date((chosen.candidate.start+28800)*1000).toISOString().slice(0,10),
   matchedTaps:chosen.candidate.taps.length,durationMinutes:(chosen.candidate.end-chosen.candidate.start)/60,
   peakMatchedIntervals:peak(chosen.candidate.taps),stationInversions:stationInversions(chosen.candidate.taps),
   selection:'gap=0，無站序逆行、無跨群重疊、跨度不超過4小時、至少20筆，選同步票證峰值最高候選；非驗證班次。'}:null,
  capacityStatus:'unknown; 30/40/50 are user-changeable scenario parameters, not fleet facts',
  scenarios,notes:['不含非票證乘客、未上車者、排隊或取消搭乘者。','候選群組未經歷史班表或GPS驗證，不是實際班次數。',
  '情境僅把原有旅次分配到假設同時同路段的平行車；無新增旅次，不估拒載或候車。',
  '超過參數容量表示配對票證峰值與假設容量不相容，不能判定違規超載。',
  '同時刻先下後上，零秒間隔不保證原始刷卡精度；同站換車、停站與非票證人數未知。']};
 await writeFile('public/data/lab/occupancy/summary.json',JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify({local,window:output.window,exclusions:output.exclusions,retainedTaps:output.retainedTaps,
  conflictingTaps:output.conflictingTaps,sensitivity,selectedCandidate:output.selectedCandidate,scenarios:scenarios.length},null,2));
} catch(error) {console.error('Occupancy audit failed; remote error details suppressed.');process.exitCode=1;}
finally {db.close();}
