# 方向4整合契約 v2

此交接供 Claude 整合，未實作 UI、路由或視覺。舊版 behavior 應停止使用，須以 `schemaVersion === 2` 檢查後載入。

來源為 [summary](../../../public/data/lab/behavior/od-behavior-summary.json)、[群彙總](../../../public/data/lab/behavior/od-clusters.json)、[時段彙總](../../../public/data/lab/behavior/temporal-behavior.json)。型別與純函式由 [index.ts](../../../src/features/lab/behavior/index.ts) 匯出。

- `method = ordered_manual_rules`，是人工依序規則分類，沒有訓練、ML 聚類或形心最佳化。`clusters` 是歷史欄位名。
- `allOdPairs` 才是完整 OD；`topOdPairs` 僅前30，`topOdHourly` 僅前10。不得以 top 陣列對帳全體。
- breaking：OD、群與群內代表 OD 的 `avgDurationMin` 為 `number | null`。無有效樣本顯示未知，不補0。OD 與群新增 `durationSampleCount`、`durationSumSec`，總秒數為精確加總，平均只在最後四捨五入至一位小數。
- OD 新增 `otherTrips`、`otherRatio`。五票種互斥且合計全旅次；不可再將餘數全部視為一般票。`generalTrips` 已依統一規則更正。
- `activeDatesCount` 是有紀錄日數，不代表營運日或連續日。`weekend*` 僅週六日，不能顯示為政府日曆假日。
- `durationAnomalies` 是 legacy 欄位名，表示分析排除窗口。`under3Min` 僅 `0 < 秒數 < 180`，不含零或負值；短途可能真實，不能稱誤刷。`sameStopOdCount` 是另一條件，交集見 `qualityEvidence.same_stop_under3`，不可相加當互斥總數。
- `qualityEvidence` 是同次唯讀查詢之整數證據；`reconciliation` 是對帳結果。證明的是此次快照的聚合一致性，不證明上游完整或刷卡原因。

`archetype` 和 `clusterId` 保留 legacy 識別碼，語義以 `label` 與規則為準。依序分類為同站、校名站點或學生票占比至少25%、臺中端至日月潭／九族、臺中端至埔里、有效平均時長不逾50分鐘且至少1000筆、其餘 OD。每個 OD 僅命中一組。週末與 AM/PM 比率沒有用來決定群別。

| legacy enum | 顯示語義 |
| --- | --- |
| abnormal_tap | 同站 OD 待查，原因未知 |
| campus_student | 暨南大學名稱站／崎下端點或學生票占比組 |
| tourism_intercity | 臺中／高鐵臺中至日月潭／九族端點走廊 |
| regional_commute | 臺中／高鐵臺中至埔里端點走廊 |
| local_shuttle | 平均時長與筆數門檻組 |
| intermediate_minor | 其餘 OD |

不得從群名、票種或單程時序推論通勤、觀光、返鄉、採買、就醫或人口年齡；無卡號不能串接回程與轉乘。週五／週日雙峰、滿載或誤刷原因均無本次資料證據，標 unknown 或省略。

資料來源、日期與清洗界線見 [報告](report.zh-TW.md)。重產與驗證命令如下，Bun 自動讀現有 dotenv，不需輸出環境值。

```sh
bun scripts/lab/behavior/build-behavior-data.ts
bun test src/features/lab/behavior/behavior.test.ts
bunx tsc -p scripts/lab/behavior/tsconfig.json
bunx tsc --noEmit
```
