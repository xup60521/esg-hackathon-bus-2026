/** Read-only database audit. Never logs credentials, vehicle IDs or passenger rows. */
import { createClient } from '@libsql/client';
import { writeFile } from 'node:fs/promises';
if (!process.env.DATABASE_URL) { console.log('DATABASE_URL unavailable'); process.exit(2); }
const db = createClient({url:process.env.DATABASE_URL, authToken:process.env.DATABASE_TOKEN});
const sql = `SELECT count(*) records, count(DISTINCT vehicle) vehicle_values,
 sum(CASE WHEN trim(coalesce(vehicle,''))='' THEN 1 ELSE 0 END) missing_vehicle,
 sum(CASE WHEN lower(trim(vehicle)) IN ('null','none','unknown','0','-','n/a') THEN 1 ELSE 0 END) sentinel_vehicle,
 sum(CASE WHEN board_date != date(board_ts,'unixepoch','+8 hours') THEN 1 ELSE 0 END) board_date_mismatch,
 sum(CASE WHEN trim(coalesce(alight_stop,''))='' THEN 1 ELSE 0 END) missing_alight_stop,
 sum(CASE WHEN alight_ts IS NULL THEN 1 ELSE 0 END) missing_alight_ts,
 sum(CASE WHEN alight_ts<board_ts THEN 1 ELSE 0 END) reversed_time,
 sum(CASE WHEN alight_ts=board_ts THEN 1 ELSE 0 END) zero_duration,
 sum(CASE WHEN alight_ts-board_ts>21600 THEN 1 ELSE 0 END) over_six_hours,
 min(board_date) first_date,max(board_date) last_date,
 count(DISTINCT board_date) active_dates,
 sum(CASE WHEN board_ts%60!=0 THEN 1 ELSE 0 END) second_precision_rows
 FROM trips`;
try {
 const r=await db.execute(sql);
 const output={queriedAt:new Date().toISOString(),sql,summary:r.rows[0]};
 await writeFile('docs/lab/occupancy/database-audit.json', JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify(output));
} catch { console.error('Read-only database audit failed; credentials and remote error details suppressed.');process.exitCode=1; }
finally {db.close();}
