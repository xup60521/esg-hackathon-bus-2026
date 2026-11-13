# 6670 旅遊快照模擬實作交接

本模組只計算指定班表快照、景點正文摘要及演算法假設下的往返條件。`isValid: true` 不代表旅行有效、景點確實營業、班車現行或保證登車。沒有查詢或外傳旅次、secrets，沒有新增 UI。

## 資料與取證邊界

景點縮為三筆。以下官方頁面的正文由主代理實讀並提供摘要，本次依摘要轉錄，沒有重新連線取證，也沒有保存景點 HTML。`OFFICIAL_VERIFIED` 僅表示該欄位有這份正文摘要支持，不表示整筆資料、未來日期或官方網站即時狀態已驗證。來源網址本身不構成驗證。

| 景點與來源 | 正文摘要 | 模擬採用與限制 |
|---|---|---|
| [向山](https://www.sunmoonlake.gov.tw/attractions/Attractions?A=20&Id=78) | 每日 09:00–17:00，天災、修繕例外 | 末入、收費條件及金額未知；`closedDays: []` 只是沒有額外週休阻擋的假設，不能解讀為全年無休 |
| [紙教堂](https://www.sunmoonlake.gov.tw/attractions/Attractions?A=20&Id=4) | 週五至週二 09:30–17:00，末入 16:30；週三四公休但國定假日、寒暑假、預約團例外；除夕休；週六夜景依公告；收費入園詳官網 | 週三四依一般公休條件拒絕模擬，同時輸出例外警告；未導入國定假日、寒暑假、除夕與團體預約日曆。統一 17:00 截止不含夜景。收費入園有摘要支持，金額未知 |
| [九族](https://www.sunmoonlake.gov.tw/attractions/Attractions?A=20&Id=13) | 平日 09:30–17:00、假日 09:30–17:30 | `closeTime: '17:00'` 為統一保守假設，未將景點平假日與 6670 週五至週日班表定義等同；`lastEntryTime: null`、`lastEntryStatus: 'UNKNOWN'`；收費條件及金額未知 |

刪除埔里酒廠、日月老茶場、水社景點與酒廠示範情境，保留班表原始站點。刪除所有未核實票價數字、纜車端點與路徑平緩宣稱。座標與距離改為 `null` / `UNKNOWN`。步行分鐘、停靠點映射、建議及最短停留時間列為演算法情境假設。最短停留時間僅為資料提示，並非引擎強制門檻。

[景點 JSON](../../../public/data/lab/tourism/attractions.json) 的 `provenance` 提供 `verifiedFields`、`assumedFields`、`unknownFields`、`evidenceBasis`、`sourceScheduleNote`、`exactSourceUrl` 與 `retrievedDate`。`ticketStatus` 指收費資訊整體，現為 `UNKNOWN`；紙教堂的 `ticketRequired: true` 可獨立有正文支持。末入未知不代表沒有末入限制。

## 給 Claude 的整合契約

從 [index.ts](../../../src/features/lab/tourism/index.ts) 匯入 `verifyTripReachability(request, timetable, attractions)`、`generateSampleScenarios` 與 [types.ts](../../../src/features/lab/tourism/types.ts) 型別，資料分別載入 `timetable.json` 及 `attractions.json.attractions`。目前沒有 route 或 UI 整合。

- 每個結果均有 `status: 'conditional_snapshot_simulation'`，包含拒絕結果。`isValid` 只表示此次輸入在快照及假設條件下能否完成往返，不能單獨呈現為旅行可行保證。
- `warnings`、`disclaimer` 必須伴隨結果傳遞，包含快照有效範圍未知、未來日期不保證現行、步行與 dwell 假設、臨時休園及未知末入。紙教堂另含特殊休假與夜景條件；沒有自動認定例外日期的功能。
- `timetableStatus: 'OFFICIAL_SCHEDULED'` 是既有班表來源欄位，僅表示使用官方排定快照，不能解讀為當日服務已確認。`metadata.validityRange: 'UNKNOWN'` 明示未知。
- 引擎讀取傳入資料的班表與景點 `retrievedDate`，不再匯出硬編碼的 `SNAPSHOT_RETRIEVED_DATE`。請求不得早於任何傳入快照日期；快照日期無效即拒絕。
- runtime `dayTypeOverride` 只接受 `weekday`、`holiday` 或省略。6670 班表依正文備註週一至週四為平日、週五至週日為假日，不另推定國定假日。覆寫來源為 `MANUAL_OVERRIDE`。
- 非法開閉時間、反向開閉區間、非法末入、負數或非整數步行、不合法 dwell 或旅客輪廓會拒絕；未核實末入仍允許條件式計算並警告。
- `outbound`、`dwell`、`inbound`、`lastBusRisk` 可能為 `null`。拒絕時看 `invalidReason`；不要用 `lastBusDepartureTime: '00:00'` 的既有無匹配 sentinel 代表實際午夜班車，應先檢查 `riskLevel: 'INVALID'`。
- `inferredSubroute` / `subrouteClassification: 'inferred'` 是停靠模式推論，非官方車次代碼。`SAFE` 只表示快照班次有緩衝。無回程僅限 6670 快照，其他公車與服務未查證。

[五組示範結果](../../../public/data/lab/tourism/sample-scenarios.json) 涵蓋向山往返、紙教堂親子步行假設、週三一般公休條件、停留跨閉館拒絕，以及向山快照無符合回程。除夕等未知例外即使算出 `isValid: true` 仍必須確認營業，狀態始終為條件式模擬。

## 可重現資料與驗證

[原始班表 HTML](../../../public/data/lab/tourism/raw_timetable_snapshot.html) 與[班表 JSON](../../../public/data/lab/tourism/timetable.json) 記錄檢索日 2026-11-04。HTML SHA256 為 `43266287f17a4d227d5c316a695d27dab6615ed6b95fe50ffb3fddd7c5a5f1b2`，四張使用表的班次數依序為 27、27、29、28。產製器檢查至少四表、逐列 34 欄及時間格式；這不構成時刻表現行性的證明。

[extractor](../../../scripts/lab/tourism/extract_official_data.py) 只讀既存 HTML，缺檔即失敗，不會抓取新網頁卻沿用舊日期。三景點資料由腳本中有限轉錄的摘要產出，與班表 HTML 來源分開。更新來源快照時必須同步更新取證日期與證據，不能只改日期延長有效性。

已實際執行，全部通過：

```bash
python3 scripts/lab/tourism/extract_official_data.py
bun run scripts/lab/tourism/export_sample_scenarios.ts
bun test src/features/lab/tourism/engine.test.ts src/features/lab/tourism/provenance.test.ts
./node_modules/.bin/tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --resolveJsonModule --allowSyntheticDefaultImports --strict --skipLibCheck --types bun src/features/lab/tourism/index.ts src/features/lab/tourism/engine.test.ts src/features/lab/tourism/provenance.test.ts scripts/lab/tourism/export_sample_scenarios.ts
```

局部測試 28 項通過、213 項斷言，局部 tsc 成功。既有開門前等待測試改用明示的合成開門假設，避免依賴被移除的酒廠來源。新增 [provenance.test.ts](../../../src/features/lab/tourism/provenance.test.ts) 覆蓋三來源範圍、票價刪除、九族末入與閉館假設、紙教堂例外、HTML 雜湊、條件式狀態與警告、資料日期讀取、runtime override、非法景點時間及步行、6670 回程文案。

未跑整站測試或修改並行的 behavior/esgUI。歷史刷卡摘要未重新產製，2024–2025 刷卡資料不能驗證 2026 營運、末班、準點、滿載或未登車人數。

## 獨立補審後修正

去回程均查當日日型的兩方向班表，依實際起訖與時間先後選最早班；末班也依返回目的站篩選。快照無匹配回程時不再顯示00:00占位或宣稱末班已過。新增日月潭往紙教堂及民興公園無匹配回程測試，重產五個示例。
