# ESG 修正版 UI（`/lab?view=esg`）

實作 `src/components/lab/operations/views/EsgView.tsx` 與 `views/esg/`，沿用 `docs/lab/operations/shared-ui.md` 的結構與元件（Section、Stat、KindBadge、Chip、SourceList、LimitationList、Provenance、FreshnessBanner）與 CSS 變數。資料與邏輯來自 `docs/lab/esg/` 的 v2 修正版與 `src/features/lab/esg`，本輪未修改這些。這是實作者交付，資料與邏輯已查核，但仍待最終獨立 review，頁面上也如此標示。

## 檔案

| 檔案 | 內容 |
| --- | --- |
| `views/EsgView.tsx` | 頁面骨架與各區塊；`views.tsx` 的 glob 自動發現為 `view=esg` |
| `views/esg/model.ts` | 四份 JSON 的嚴格解析與交叉檢查、計算工具的輸入解析、結果計算 |
| `views/esg/Calculator.tsx` | 情境計算工具 |
| `views/esg/Charts.tsx` | 手寫 SVG：月度堆疊柱、排放堆疊橫條、占比條 |
| `views/esg/content.ts` | 來源（精確 URL）與限制文案 |

`src/features/lab/operations/directions.ts` 僅移除 esg 的 `hold`；behavior、tourism 的 hold 保留。已用 `bun scripts/lab/operations/build-index.ts` 重建 `public/data/lab/operations/directions.json`（esg 為已提交、無 hold；behavior、tourism 仍有 hold）。

## 資料載入與嚴格性

讀 `public/data/lab/esg/{summary,monthly,scenarios,od-carbon}.json`。每份必須 `schemaVersion === 2`，欄位型別不符即整頁顯示錯誤，不以預設值代替。額外檢查：

- 旅次、已知人公里與月度、OD 聚合互相對得上（旅次精確相等，人公里相對 1e-9）。
- 分組旅次加總等於總旅次；`totalPassengerKm` 是否為 null 必須與缺距離旅次一致。
- `operatingDays` 必須為 null；官方係數必須有 `sourceUrl`。
- 以 `evaluateScenario` 重算三個預設情境，與 `scenarios.json` 不一致就報錯。

缺距離與月度排放維持 null，頁面顯示「無」，不補 0。

## 頁面內容順序

1. 標頭、種類標籤、「本頁不是什麼」聲明（不是 Scope 盤查、淨零、最優、公平改善；差額獨立於 Scope 1/2/3，不歸 Scope 3、不抵扣盤查）。
2. FreshnessBanner（歷史資料，非即時）。
3. 觀測：旅次、有紀錄日（非營運日）、路網近似人公里、缺距離、OSRM 涵蓋、同站 0 km 假設。
4. 月度：旅次或人公里的堆疊柱；月度排放全部為無，並說明原因；24 個月數字表。
5. 服務結構：固定指定端點集合的占比與表格，明示不是中間站分類或公平性。
6. 距離方法：OSRM／同站假設的分組與旅次最多的 10 組 OD。
7. 情境計算工具。
8. 預先計算的三個展示點（來自 `scenarios.json`）。
9. 係數逐項標註（官方／假設、年度、邊界、官方來源連結）。
10. 來源、限制、資料出處與重現命令。

## 情境計算工具

輸入：車公里、電動化率（%）、柴油油耗、電耗、空駛倍率、四個分流（%，合計須剛好 100%）；進階可改五個排放係數。電動化率提供 0／50／100% 快速鍵與「重設為預設值」。

- 輸入以文字欄位接收，再以嚴格正規式解析：空白、百分號、逗號、單位、`NaN`、`Infinity` 都被拒絕；範圍依 `src/features/lab/esg` 的契約（油耗 > 0、空駛倍率 ≥ 1、比例 0..100%、其餘 ≥ 0）。
- 分流合計不等於 100%（容許 1e-7 個百分點）時顯示錯誤，不自動正規化。
- 計算由 `evaluateScenario` 與 `calculateOperationalEmissions` 完成；`RangeError`／`TypeError`（如溢位）被捕捉並顯示為輸入錯誤。任何錯誤時不顯示結果，也不沿用上次的值，更不轉成 0。
- 零車公里的每車公里強度、零分母的每人公里強度與基線倍率顯示「無」。
- 改動購電係數後，標示不再是官方 2024 年值。
- 結果：調整後車公里、柴油 L、用電 kWh、柴油燃燒與購電 kg CO2e、合計、強度；其他輸入不變下電動化 0／50／100% 的堆疊比較；情境基線、情境差額（可為負）、倍數、基線組成。差額文字稱「情境差額」，不稱減量或避免排放。

## 視覺決定（由 Claude 決定）

沿用 shared 的面板、按鈕與標籤風格與既有 CSS 變數，不新增顏色。月度柱：雙端在集合用 `--k-history`、集合外用 `--muted`，未知站（目前為 0）用 `--sev-review`。排放橫條：柴油燃燒用 `--accent` 實心，購電用 `--k-forecast` 斜線填充，意義另由圖例文字與每條右側數值標示，不只靠顏色。每個 SVG 皆有 `role="img"` 與含數值的 `aria-label`，月度另有可展開的完整表格。

## 來源

只有電力 2024 年 0.474 標為官方，連到能源署 113 年度文件的精確 URL。其他係數標為假設。來源清單另列：能源署 112 年度、商業發展署 2025 年電力係數頁（0.467，證明 0.474 非最新、未採用）、環境部 2024-02-05 公告精確 PDF（柴油為 kg/TJ 各氣體係數，非每公升 CO2e）、環境部下載入口、GHG Protocol Scope 3 FAQ，以及兩份本機來源。查閱日採 `docs/lab/esg/sources.zh-TW.md` 該輪紀錄的 2026-11-03（產物產製日，非逐項精確的查閱時刻）。能源署 112／113 年 PDF 直接開啟回覆 403，只由官方搜尋索引讀到數值，頁面也如此註明，不聲稱已下載原檔。

## 驗證（實際執行）

| 項目 | 結果 |
| --- | --- |
| `biome check` 本次新增檔案 | 無診斷 |
| 專案 `tsc --noEmit` | 本次檔案無錯誤；既有 `src/features/lab/behavior/*` 有與本變更無關的未使用宣告診斷，未處理 |
| `bun test src/features/lab/esg` | 12 pass、0 fail、72 expect calls |
| `bun scripts/lab/esg/verify-artifacts.ts` | 通過（4 份 schema v2、1,800,910 旅次、24 月、492 組 OD） |
| `bun run build` | 成功；`src/routeTree.gen.ts` 校驗碼前後相同 |
| 瀏覽器（vite dev，T3 內建預覽瀏覽器，1280×800） | `/lab?view=esg` 四份 JSON 載入、無錯誤面板；淺色與深色各檢視；`/lab` 中心頁 esg 卡片為「已提交」並連到 `?view=esg`、不再顯示修正中 |
| 計算工具互動 | 實際輸入驗證：`50%` 被拒；零車公里（強度與倍數顯示無）；分流合計 102% 被拒；車公里 1e308 且空駛倍率 10 時溢位被拒；預設 50% 結果與 `scenarios.json` 的 698,348 與 +7,759,282 相符 |

## 未做與限制

- 未做：行動版寬度檢視、鍵盤／螢幕閱讀器實測、載入失敗畫面與交叉檢查不一致畫面的實際觸發（只依程式路徑撰寫，未人為破壞資料驗證）、自動化 UI 測試（專案沒有元件測試設施，未新增依賴）。
- 圖表軸標只標 0 與最大值；細節靠表格與 aria-label。
- 沒有商業或營運成效主張，也沒有任何排放最佳化。頁面一切數字沿用 `docs/lab/esg/` 的假設與限制，那些限制在頁面「限制」一節逐條列出。
- 不含 commit、push、deploy；未改主紀錄、其他 view、依賴、routeTree、首頁。
