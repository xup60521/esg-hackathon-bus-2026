/** Read-only export; bun scripts/analysis/export-midstop.ts */
import { createClient } from '@libsql/client';
import { writeFile, mkdir, readFile, rename } from 'node:fs/promises';
const db = createClient({url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_TOKEN});
const stops: {name:string;order:number}[] = JSON.parse(await readFile('public/geo/stops.json','utf8'));
const literal = (s:string) => "'"+s.replaceAll("'","''")+"'";
const position = (column:string) => `CASE ${column} ${stops.map(s=>`WHEN ${literal(s.name)} THEN ${s.order}`).join(' ')} ELSE NULL END`;
// Classify each OD using canonical geographic order, not source fare-stage seq.
// Unknown/equal stops remain unknown; do not manufacture a direction.
const sql = `WITH classified AS (
 SELECT subroute,board_ts,alight_ts,board_stop,alight_stop,
 CASE WHEN ${position('board_stop')} < ${position('alight_stop')} THEN 'outbound'
 WHEN ${position('board_stop')} > ${position('alight_stop')} THEN 'inbound' ELSE 'unknown' END direction
 FROM trips WHERE board_date >= ? AND board_date < ?
), events AS (
 SELECT subroute,direction,board_stop stop,board_ts ts,1 b,0 a FROM classified
 UNION ALL
 SELECT subroute,direction,alight_stop stop,alight_ts ts,0 b,1 a FROM classified WHERE alight_ts IS NOT NULL AND alight_stop IS NOT NULL
)
SELECT date(ts,'unixepoch','+8 hours') date,subroute,direction,stop,
 CAST(strftime('%H',ts,'unixepoch','+8 hours') AS INTEGER) hour,
 sum(b) boardings,sum(a) alightings FROM events GROUP BY 1,2,3,4,5 ORDER BY 1,2,3,4,5`;
try {
 // Monthly chunks use trips_board_date_idx and cache successful reads for resuming.
 await mkdir('data/midstop-months', {recursive:true});
 const months=Array.from({length:24},(_,i)=>`${2024+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}-01`);
 const combined=new Map<string, (string|number)[]>();
 for (let i=0;i<months.length;i++) {
  const start=months[i]; const end=months[i+1] ?? '2026-01-01';
  const path=`data/midstop-months/${start}.json`;
  let chunk: (string|number)[][];
  try { chunk=JSON.parse(await readFile(path,'utf8')); }
  catch (error) {
   if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
   const result=await db.execute({sql,args:[start,end]});
   chunk=result.rows.map(r=>[String(r.date),String(r.subroute),String(r.direction),String(r.stop),Number(r.hour),Number(r.boardings),Number(r.alightings)]);
   await writeFile(path,JSON.stringify(chunk));
  }
  for(const row of chunk) {
   const key=JSON.stringify(row.slice(0,5)); const existing=combined.get(key);
   if(existing) { existing[5]=Number(existing[5])+Number(row[5]); existing[6]=Number(existing[6])+Number(row[6]); }
   else combined.set(key,row);
  }
  console.log(`${start}: ${chunk.length} grouped rows`);
 }
 const rows=[...combined.values()].sort((a,b)=>JSON.stringify(a.slice(0,5)).localeCompare(JSON.stringify(b.slice(0,5))));
 const boardings=rows.reduce((n,r)=>n+Number(r[5]),0);
 const alightings=rows.reduce((n,r)=>n+Number(r[6]),0);
 const expected=Number((await db.execute('SELECT sum(trips) n FROM daily_subroute')).rows[0].n);
 if(boardings!==expected || alightings!==expected) throw new Error(`Export totals mismatch: ${boardings}/${alightings}, expected ${expected}`);
 const data={generatedAt:new Date().toISOString(),columns:['date','subroute','direction','stop','hour','boardings','alightings'],stops,rows,
 notes:['歷史刷卡旅次，非完整客流；不含未上車者。','上車與下車按各自實際時間分桶，時區 Asia/Taipei。','方向依已知站點地理順序推定；同站及未知起訖站不推定方向。','無紀錄日期不代表零需求或停駛。','6670H 僅到埔里，應分開分析；A–F 也不應直接視為同一班次。']};
 await mkdir('public/data',{recursive:true});
 await writeFile('public/data/midstop.json.tmp',JSON.stringify(data));
 await rename('public/data/midstop.json.tmp','public/data/midstop.json');
 await writeFile('docs/midstop-query.sql',sql+';\n');
 console.log(JSON.stringify({rows:rows.length,bytes:JSON.stringify(data).length,dates:[rows[0]?.[0],rows.at(-1)?.[0]],unknownEvents:rows.filter(r=>r[2]==='unknown').reduce((n,r)=>n+Number(r[5])+Number(r[6]),0)}));
} finally {db.close();}
