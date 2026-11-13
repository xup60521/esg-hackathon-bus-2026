# 方向 4 旅客搭乘行為 UI 交付（`/lab?view=behavior`）

本文件記錄 A-008 方向 4 UI 的實作範圍、與資料契約的對齊方式、實際驗收結果與未做的事。資料契約見 [整合契約 v2](../behavior/integration.zh-TW.md) 與 [報告](../behavior/report.zh-TW.md)，共用 UI 約定見 [shared-ui.md](shared-ui.md)。

## 交接背景

既有 View 與 10 個元件／helper／測試由 Antigravity Sonnet 撰寫，其 API／額度中止，沒有正常交接。免費 DeepSeek 備援已被使用者取消（interrupted、activeRunId null）。本輪由 Claude Sonnet 5.5 接手：先逐檔檢視現有程式，未發現備援留下額外變更，保留原設計沒有重寫，只做一項小修（見「本輪修改」）並完成驗收。

## 檔案

- `src/components/lab/operations/views/BehaviorView.tsx`：頁面（標題、品質總覽、四個探索面向、來源／限制／出處）。
- `views/behavior/model.ts`：載入與驗證（schema v2、逐欄結構、數值對帳、三檔同快照）。
- `views/behavior/useBehaviorData.ts`：載入狀態與重試。
- `views/behavior/explore.ts`：篩選、排序、彙總、格式化（純函式）。
- `views/behavior/OdExplorer.tsx`、`RulesPanel.tsx`、`TicketPanel.tsx`、`TimePanel.tsx`、`HourBars.tsx`、`common.tsx`。
- `views/behavior/behavior.test.tsx`：23 項測試。

沒有動 hold／index／shared／其他 View／計算腳本／依賴／lockfile／routeTree／首頁／主紀錄；沒有 commit、push、deploy。

## 與契約的對齊

- 只載入 `schemaVersion === 2`；`method` 必為 `ordered_manual_rules`。結構錯誤、版本錯誤、HTTP 錯誤、JSON 解析錯誤都顯示逐檔訊息與「重新載入」，不顯示任何部分數字，也不以舊資料代替。
- OD 列表來自 `allOdPairs` 全部（206 組）；`topOdPairs`、群內代表 OD、時段檔前 10 都明確標為非完整，且不用來對帳全體。
- 載入時重算：OD 旅次合計＝`validOdTripsCount`、每個 OD 的小時／週末平日／AM·PM·其餘／五票種／支線合計＝旅次、票種與小時與總覽守恆、群成員與群彙總一致、時長總秒數與樣本數與 `qualityEvidence` 一致、同站 OD 歸屬；資料檔自帶 `reconciliation` 有未通過項也拒絕顯示。
- 平均時長以 `duration.ts` 的 `meanDurationMinutes`（精確整數秒、半入進位）驗證；`avgDurationMin` 為 null 顯示「無」，不補 0，排序時未知值永遠排最後；彙總平均以總秒數／有效樣本加權，沒有樣本時為「無」。
- 票種五組互斥並保留 `other`；每個分母明確標示（該 OD 自身、符合條件旅次合計、規則組旅次、全部旅次）。
- 規則組依文件順序（同站→校名／學生票→臺中至日月潭／九族→臺中至埔里→時長與筆數門檻→其餘）顯示；legacy `archetype`／`clusterId` 僅作識別，畫面只用 `label`、規則文字，不當作用途。
- 同站 OD 與「短於 3 分」分開呈現並說明重疊（同站 6,281 筆、其中 4,158 筆同時短於 3 分），不相加。
- 文案：刷卡不稱需求；週六日不稱假日；AM／PM 是預先指定窗口；票種名稱不是人口或目的；沒有卡號所以不能追蹤個人回訪、回程或轉乘；對帳只證明此快照內一致。

## 本輪修改

- `HourBars.tsx`：24 小時數值表的表頭補上 `scope="col"`（無障礙，無行為改變）。

## 實際驗收（2026-11-04）

自動檢查（均在本機執行）：

| 命令 | 結果 |
| --- | --- |
| `bun test src/components/lab/operations/views/behavior` | 23 pass、0 fail、303 expect() |
| `bunx tsc --noEmit`（全站） | exit 0 |
| `bunx biome check --write` 後再 `biome check`（BehaviorView.tsx＋views/behavior，11 檔） | 格式化 1 檔（HourBars.tsx 換行），之後無問題 |
| 修改後重跑 tests 與全站 `tsc --noEmit` | 23 pass／303 expect；tsc exit 0 |

瀏覽器操作（T3 共享預覽，開啟既有 dev server `localhost:3000`，未停止、未重啟）：

- 載入：`/lab?view=behavior` 顯示 1,800,910 旅次、206 組 OD、725 有紀錄日、同站 6,281、有效樣本 1,788,442、15 項對帳全數通過，與報告數字一致。
- 篩選：站名「桃米坑」→ 30／206 組 OD、10,980 旅次、有效樣本 10,901；「只看同站」＋站名 → 1 組、4 旅次；「清除篩選」回到 206／206。
- null 平均：桃米坑→桃米坑（有效樣本 0）顯示「無」與「（0）」，彙總卡顯示「無／沒有有效樣本，不補 0」，展開明細說明未知不是 0；依平均時長排序時，206 列顯示全部後該列排在最後。
- 其他面向：規則組六組平均時長 62.1／99.8／47.5／27.0／80.7／31.4 分（依 clusterId，與報告一致）；票種交叉表合計 1,037,394／270,468／404,440／77,903／10,705；時段選 PM 窗口得 468,833 筆、26.0%。
- 錯誤與重試：以頁面內暫時替換 `fetch`，分別回傳 schemaVersion 1、HTTP 500、壞 JSON，頁面顯示三行逐檔訊息與「重新載入」；還原 `fetch` 後以鍵盤 Enter 重試，成功載入，未殘留錯誤訊息。
- 窄屏：寬 375px 下四個面向都沒有頁面層級橫向溢出（寬表格在自己的捲動容器內）；截圖確認卡片與表單單欄排列可讀。
- 鍵盤：OD 名稱按鈕（`aria-expanded`）、排序表頭按鈕、「重新載入」按鈕皆可聚焦並以 Enter 操作；表頭有 `aria-sort`。

## 限制與未做

- 瀏覽器驗收是單次人工操作，未建立自動化 E2E；只在淺色主題與兩種寬度（桌面 1280、窄屏 375）檢視，**沒有逐一檢視深色模式**，也沒有測 Tab 鍵逐項順序與螢幕閱讀器。
- 驗收時主要以 DOM 文字與數值對照資料檔，視覺只看了窄屏的一張截圖；沒有逐像素設計審查。
- 時段檔只有前 10 OD，時段面板的 OD 表因此不是完整列表（頁面已標示）。
- 沒有重產資料、沒有新增依賴，資料與計算腳本維持前一輪結果。
- 對帳與頁面數字只代表當次快照內的聚合一致，不證明上游完整，也不是外部營運驗收；刷卡原因、票種資格、搭乘目的仍為 unknown。
- 全站 `tsc` 通過不代表整個專案的其他未提交變更都已審查；本輪只負責上述檔案。

## 最後獨立審查後修正

獨立審查回報 1 P2、1 P3，原審查為唯讀，23 tests／303 assertions 通過。

- P2 代表 OD 缺欄或錯誤仍進入 ready：已在 summary 結構檢查要求代表陣列與顯示欄位，再與完整 allOdPairs 的成員群別、旅次、nullable 平均對帳，重複與缺列亦拒絕。異常走 loadBehavior error，不進 RulesPanel。新增真實載入路徑回歸案例。
- P3 日數卡範圍不明：依審查精確語意改為「全體有紀錄日數」，註明不隨規則組篩選。未變更版面、樣式或計算。

主代理修後：25 UI tests、315 assertions；局部 Biome、全站 tsc、全站289 tests／8123 assertions、build 通過。沒有再次獨立審查或瀏覽器驗證，不把原作者驗收套用到新修正。
