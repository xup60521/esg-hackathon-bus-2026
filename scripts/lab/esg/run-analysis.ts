/** Read-only aggregate query. Never send trip records to external research services. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { config } from 'dotenv';
import { DEFAULT_EMISSION_FACTORS, DEFAULT_COUNTERFACTUAL_SPLIT, DEFAULT_VEHICLE_PARAMETERS, SPECIFIED_ENDPOINTS, evaluateAllPresets, summarizeServiceStructure, resolveDistance, nonnegative, finiteResult } from '../../../src/features/lab/esg';
import type { TripODRecord, RoutePairs } from '../../../src/features/lab/esg';
config({ quiet: true });
async function main() {
 if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required; no empty-data fallback');
 const routes: RoutePairs = JSON.parse(await readFile('public/geo/routes.json', 'utf8'));
 const inputVehicleKm = process.env.ESG_SCENARIO_VKM === undefined ? 1_000_000 : Number(process.env.ESG_SCENARIO_VKM);
 nonnegative('ESG_SCENARIO_VKM', inputVehicleKm);
 const db = createClient({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_TOKEN });
 let rows: { boardStop: string; alightStop: string; subroute: string; month: string; tripCount: number }[];
 let dateSummary: { firstRecordedDate: string; lastRecordedDate: string; recordedDates: number };
 try {
  const result = await db.execute(`SELECT board_stop, alight_stop, subroute, substr(board_date,1,7) AS month, count(*) AS cnt FROM trips GROUP BY board_stop, alight_stop, subroute, substr(board_date,1,7) ORDER BY month, board_stop, alight_stop, subroute`);
  rows = result.rows.map(r => ({ boardStop: String(r.board_stop), alightStop: String(r.alight_stop), subroute: String(r.subroute), month: String(r.month), tripCount: Number(r.cnt) }));
  const dates = (await db.execute('SELECT min(board_date) AS first, max(board_date) AS last, count(DISTINCT board_date) AS days FROM trips')).rows[0];
  dateSummary = { firstRecordedDate: String(dates.first), lastRecordedDate: String(dates.last), recordedDates: Number(dates.days) };
 } finally { db.close(); }
 if (!rows.length) throw new Error('No aggregate trips; refusing to publish empty analysis');
 const records = rows.map(r => ({ ...r, ...resolveDistance(r.boardStop, r.alightStop, routes) }));
 const structure = summarizeServiceStructure(records);
 const months = [...new Set(rows.map(r => r.month))].sort().map(month => ({ month, ...summarizeServiceStructure(records.filter(r => r.month === month)), operationalKgCo2e: null, scenarioDifferenceKgCo2e: null, reason: '無月度車公里或能源資料，不分攤全期展示假設' }));
 const odMap = new Map<string, TripODRecord & { method: string }>();
 for (const r of records) {
  const key = JSON.stringify([r.boardStop, r.alightStop, r.subroute]);
  const existing = odMap.get(key);
  if (existing) existing.tripCount += r.tripCount;
  else odMap.set(key, { boardStop: r.boardStop, alightStop: r.alightStop, subroute: r.subroute, tripCount: r.tripCount, distanceKm: r.distanceKm, method: r.method });
 }
 const od = [...odMap.values()].sort((a,b) => b.tripCount-a.tripCount);
 const missingDistances = od.filter(r => r.distanceKm === null);
 const sameStopTrips = records.filter(r => r.method === 'same-stop-zero-assumption').reduce((n,r) => n+r.tripCount,0);
 const coverage = { cacheDirectedPairs: Object.keys(routes.pairs).length, observedOdSubrouteGroups: od.length,
 observedDirectedPairs: new Set(od.map(r => `${r.boardStop}|${r.alightStop}`)).size,
 matchedNetworkTrips: structure.coveredTrips-sameStopTrips, sameStopTrips,
 unknownDistanceTrips: structure.unknownDistanceTrips, unknownOdSubrouteGroups: missingDistances.length,
 distanceCoverageRatio: structure.totalTrips > 0 ? structure.coveredTrips/structure.totalTrips : null,
 missingDistances,
 caveat: 'OSRM driving 兩站路網近似；cache 正反向共用距離。未按支線途經點約束，跨線 OD/暨大/九族等分支路徑未驗證。相同站零距離也是假設，不代表無行駛。',
 };
 const scenarios = evaluateAllPresets(records, inputVehicleKm);
 const summary = { schemaVersion: 2, generatedAt: new Date().toISOString(),
 dataset: { source: '本地授權資料庫 trips 成功刷卡 OD 聚合', ...dateSummary, ...structure, distanceLabel: '路網近似人公里；缺距離時 totalPassengerKm 為 null，knownDistancePkm 僅為已知部分', operatingDays: null },
 coverage, specifiedEndpointSet: SPECIFIED_ENDPOINTS,
 classificationCaveat: '固定指定端點集合描述，非各支線中間站或公平性；埔里是 6670H 端點；跨支線聚合不能推定旅次用途。unknownStop 不歸中間站。',
 parameters: { factors: DEFAULT_EMISSION_FACTORS, vehicle: DEFAULT_VEHICLE_PARAMETERS, modalSplit: DEFAULT_COUNTERFACTUAL_SPLIT, status: '除已標 official 電力係數外，均為未校準可調假設；48/24/16/12 無問卷證據' },
 demonstration: { inputVehicleKm, source: process.env.ESG_SCENARIO_VKM === undefined ? '獨立假設 1,000,000 車公里，與紀錄日或班次無推導關係' : '使用者 ESG_SCENARIO_VKM 輸入，未查證營運實績', scenarios },
 limitations: ['不是歷史營運盤查或第三方查證', '避免排放為獨立比較情境，不列 Scope 3，不抵 Scope 1/2', '燃油與運具強度邊界未核實，情境差額非一致生命週期減量證據', '刷卡不能推全部需求、拒載、候車或公平改善', '全電巴仍有購電排放；未求解政策最優'],
 };
 await mkdir('public/data/lab/esg', { recursive: true });
 for (const [name, value] of Object.entries({ summary, monthly: { schemaVersion: 2, months }, 'od-carbon': { schemaVersion: 2, description: '全部 OD 支線聚合與路網近似距離；不稱走廊避免排放', od }, scenarios: { schemaVersion: 2, status: 'illustrative-only', inputVehicleKm, scenarios } })) {
  await writeFile(`public/data/lab/esg/${name}.json`, `${JSON.stringify(finiteResult(value), null, 2)}\n`);
 }
 const report = `# ESG 修正版研究紀錄\n\n版本 2，產製時間 ${summary.generatedAt}。本輪重新查詢成功刷卡聚合，不將示範模型寫成營運實績。\n\n旅次合計 ${structure.totalTrips}，有刷卡紀錄日 ${dateSummary.recordedDates}，不是營運日。期間 ${dateSummary.firstRecordedDate} 至 ${dateSummary.lastRecordedDate}，共 ${months.length} 個月。\n\n路網近似已知人公里 ${structure.knownDistancePkm}，全體人公里 ${structure.totalPassengerKm ?? 'unknown'}。OSRM 配對涵蓋 ${coverage.matchedNetworkTrips} 旅次；同站零距離假設 ${sameStopTrips} 旅次；距離缺失 ${coverage.unknownDistanceTrips} 旅次、${missingDistances.length} 個 OD 支線群組。完整缺對清單見 summary.json coverage.missingDistances。正反向共用路徑，未核實各支線繞行，不稱實際搭乘距離。\n\n固定指定端點集合為 ${SPECIFIED_ENDPOINTS.join('、')}。雙端均在集合 ${structure.groups.bothSpecifiedEndpoints} 旅次，至少一端在集合外 ${structure.groups.outsideSpecifiedEndpointSet} 旅次，未知站 ${structure.groups.unknownStop} 旅次。這不是各支線中間站分類，埔里對 6670H 是端點。不能從 OD 推定通學、就業或觀光目的，也不能推拒載與公平改善。\n\n車公里 ${inputVehicleKm} 只是獨立展示輸入。已刪除 725×110×64.5 的歷史推估及每月固定除 24 的排放。所有月度排放為 null，待能源與車公里實績補齊。3.2 km/L、0.95 kWh/km、1.08 空駛倍率、48/24/16/12 分流與燃油/運具強度都沒有資料校準。係數與完整算式見 sources.zh-TW.md 與 integration.zh-TW.md。\n\n情境輸出為 kg CO2e 展示計算。燃油 CO2e 與運具強度未核實邊界，故差額不是已證實減量。全電巴有購電排放。移除 EACAI、中途站避免排放、5% 排擠及降低 87.7% 宣稱。無政策最佳化求解，不能稱最優。比較排放獨立於 Scope 1/2/3，不抵扣盤查。\n\n來源逐項查證、整合遷移與驗證紀錄分見同目錄文件。\n`;
 await writeFile('docs/lab/esg/report.zh-TW.md', report);
 console.log(JSON.stringify({ trips: structure.totalTrips, recordedDates: dateSummary.recordedDates, months: months.length, knownDistancePkm: structure.knownDistancePkm, coverage, generatedFiles: 4 }, null, 2));
}
main().catch(() => { console.error('ESG analysis failed; no credentials or database error details logged. Check local configuration and validation.'); process.exitCode = 1; });
