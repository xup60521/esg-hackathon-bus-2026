# 6670 時段分布修正版與整合契約

本版只描述已觀測的聚合上下車量。舊版將六個缺日歸因颱風停駛、宣稱沒有系統缺漏，以及退房、閉園、學生返鄉等原因的敘述均撤回。沒有業者停駛或班表證據，缺日原因保持 unknown。這次是實作修正，沒有替其他方向或整體研究作 review 背書。

## 資料與日曆

輸入為 `public/data/midstop.json`，並逐鍵核對 `data/midstop-months/2024-01-01.json` 至 `2025-12-01.json`。鍵是日期、支線、方向、站名、小時；上下車量分別比對，拒絕重複鍵、缺鍵、多鍵與值不同。共 24 月、292,562 鍵完全相符。這只證明本地兩份聚合資料一致，不證明原始旅次完整，也不能排除共同上游漏資料。

日類型直接讀取既有 `public/data/lab/visualization/calendar.json`，沒有修改 visualization。檔案 provider 為行政院人事行政總處，retrievedAt 為 `2026-11-03T16:53:50.857Z`，涵蓋 731 日。`rest=true` 是政府機關休息日，包含週休、國定假日與補假；`rest=false` 是工作日，包含補班日。全套統計統一用這兩類，政府日曆只是分析代理，不能當成公車班表規則，也不能推及所有勞工休假。

來源索引為[政府資料開放平臺日曆資料集](https://data.gov.tw/dataset/14718)。本次沿用已下載與查證的日曆，沒有重新下載官方 CSV。兩筆官方 DGPA CSV 的完整下載 URL、年份、日數與下列 SHA-256 均原樣保存在 `summary.data.calendar.sources`：

- 2024，113年中華民國政府行政機關辦公日曆表，366 日，`365de663017f123a9f8100fec47706bdbae67ed7810a995659fa4743d89bbee8`。
- 2025，114年中華民國政府行政機關辦公日曆表，1141020更新，365 日，`b4bd40d4d1f4ffc20cb724a07bf3b7c5c1b32a9100e55dcf216f329af3513ca6`。

本次實際讀取 calendar.json 的 SHA-256 為 `68619003b7a678bd1bf436d24a4c58a489ae440fb3191f75f88928cdda12561f`。2025-05-02 為政府工作日，已取消舊表的彈性放假標記；2024-05-01 在這份政府日曆也為工作日。

## 缺日、分母與樣本

731 個日曆日中有 725 日存在聚合列。六個缺日為 2024-07-24、2024-07-25、2024-10-02、2024-10-03、2024-10-31、2025-07-07，`boardings` 與 `alightings` 均為 null，`status=missing_unknown`。沒有列不能當成實際零需求或停駛。

`observedDays` 是該分組至少有一列的日期數，`networkObservedDays` 是該日期範圍內全網有列的日數，`calendarDays` 是該範圍日曆日數，`missingGroupDays=calendarDays-observedDays`。`sampleStatus` 明示無樣本或覆蓋不完整，並不判斷是否應營運。零列分組的數量總和為 0，表示「觀測列之和為零」，不能當作實際運量為零。

`avgObservedDayHourly*` 的分母是該組 observedDays，僅為有紀錄日的條件平均。缺方向或缺支線的日期不進分母，不補零。無樣本時整個平均陣列為 null。已有分組列之日期，其稀疏小時桶按觀測聚合規則加總；沒有逐小時完整性證據，這仍不是完整服務日均量。

全網 unknown 方向保留 6,281 上車人次，不能分攤到去回程。站點方向不對稱比僅以 outbound+inbound 為分母，排除 unknown，無已知方向量時為 null；因此必須同時讀取 unknown 分組。

6670E 只有 427 個有紀錄日，去程 424 日、回程 423 日、未知方向 56 日。其餘缺列日的營運狀態未知，不能以 731 或 725 日當作該支線已知的服務日分母，也不能直接把不同觀測覆蓋的條件均量當成同一樣本比較。

## 重算結果

分析窗口為 00:00 至 23:59 的 24 個小時桶，不宣稱官方營業時間。所有指標使用同一窗口。預設窗口涵蓋全部 1,800,910 上車人次，排除量為 0。05:00 桶有 17,747 人次，已納入。自訂窗口會回傳 `includedVolume` 與 `excludedVolume`，兩者之和必須等於完整觀測量。

| 指標 | 修正版數值 |
| --- | ---: |
| 上車總和 / 下車總和 | 各 1,800,910 |
| 去程 / 回程 / 未知方向上車量 | 922,660 / 871,969 / 6,281 |
| 全體最大上車小時桶 | 09:00，154,986 |
| 去程 / 回程最大上車小時桶 | 08:00 / 15:00 |
| 全體每小時桶基準量 | 75,037.9167 |
| 尖峰與基準比 | 2.065436 |
| CR3 / CR4 | 0.254020 / 0.335927 |
| Gini | 0.457528 |

基準量是全期間總量除以 24 個桶，不是每日每班量。AM 定義為窗口內 00:00 至 11:59，PM 為 12:00 至 23:59。並列峰值選最早小時；沒有正量的全體、AM 或 PM 子窗口，峰值小時均為 null。零分母的比例與 Gini 均為 null。

| 日期分組 | 有紀錄日數 | 上車總和 | 有紀錄日日均 |
| --- | ---: | ---: | ---: |
| 政府工作日 | 492 | 1,142,595 | 2,322.3476 |
| 政府休息日 | 233 | 658,315 | 2,825.3863 |
| 所有週五，含政府休息日 | 104 | 302,766 | 2,911.2115 |
| 所有週一至週四，含政府休息日 | 413 | 915,569 | 2,216.8741 |

政府休息日與工作日的有紀錄日均比為 1.216608；週五與週一至四的有紀錄日均比為 1.313206。這是描述性比較，沒有控制季節與假日，不提供週五變化或旅次目的的因果解釋。

站角色是分析者候選分類，`roleBasis=analyst_candidate_not_route_position`。埔里站只列交通樞紐候選，沒有對所有支線宣稱中間站或端點。只有明示的站名對應交通樞紐、大學或機場候選，其餘含未知站均為 unknown。這不是官方站點功能或班表認證。

## Schema v2 整合與遷移

四份 JSON 一律包成 `{ "schemaVersion": 2, "data": ... }`，型別定義在 `src/features/lab/peaks/types.ts`。這是破壞性修正，不保留錯誤舊 schema。載入後先檢查 schemaVersion，再讀 data；不得把 null 轉成 0。

| 檔案 | data 內容與主要存取方式 |
| --- | --- |
| summary.json | `PeakSummary`；總量、日曆來源、比較樣本、缺日與逐鍵核對結果 |
| calendar-audit.json | `CalendarAuditDay[]`；缺日數量為 null，獨立保留政府日類型 |
| hourly-peaks.json | `HourlyOutput`；`dimensions[direction][dayGroup]`、`subroutes[subroute].directions[direction]`、`months[YYYY-MM]` |
| station-peaks.json | `StationPeakProfile[]`；站點與 `directions[direction]` 均有 HourlyProfile |

方向鍵仍有 outbound、inbound、unknown；全體方向另有 all。日類型鍵由 weekday/weekend_holiday 換成 government_workday/government_restday，另有 all。刪除所有 typhoon_suspension、missing_suspension 與停駛日期欄位。舊 isHoliday 改為 governmentRest，舊 holidayName 改為 calendarNote。

`operatingHours` 改為 `analysisHours`；`avgDailyHourly*` 改為 `avgObservedDayHourly*`；站點舊 outboundPeak/inboundPeak 改讀 `directions.outbound.peakMetrics` 與 `directions.inbound.peakMetrics`，overallPeak 改讀 peakMetrics。舊方向總量改讀各 directions 分組。舊 weekdayVsWeekendRatio 改為 `overallMetrics.restVsWorkdayObservedMeanRatio`，舊 fridaySpikeRatio 改為 `fridayVsMonThuObservedMeanRatio`，各自樣本見 comparisonSamples。支線總量改讀 hourly-peaks 的 subroutes，不再複製到 summary。

消費端需處理 nullable 峰值、比例與均量，並同時展示或解讀覆蓋日數。此任務不修改介面、不替整合端作視覺決策；尚未驗證既有消費端是否完成遷移。

## 實際驗證與限制

以下命令在本 checkout 真實執行：

```sh
bun test src/features/lab/peaks
bun scripts/lab/peaks/analyze-peaks.ts
bun scripts/lab/peaks/verify-peaks.ts
bunx tsc --ignoreConfig --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --types bun --resolveJsonModule --allowSyntheticDefaultImports --skipLibCheck src/features/lab/peaks/*.ts scripts/lab/peaks/*.ts
```

測試 18 pass、0 fail，涵蓋官方日曆的 2025-05-02、缺日與觀測零值差異、零分母、缺支線方向、未知方向守恆、24 小時窗口與排除量、無量峰值、非法窗口及已知數學向量。產製成功；驗證重新核對 24 月的 292,562 鍵，並對 124 個分組逐小時比對來源、平均、覆蓋、指標與總量。四份產物上下車量各守恆至 1,800,910。局部 strict tsc exit 0。

本地聚合一致不能證明沒有系統缺漏。沒有業者班表、停駛紀錄、容量、候車或未上車資料，無法證明營運時段、拒載、滿載、潛在需求與旅次目的。本次沒有傳送原始旅次或 secrets，沒有新增外部查詢、依賴或 UI，也沒有 commit、push 或 deploy。沒有跑全專案 tsc 或全站建置；此處證據限於 peaks 的計算與產物。
