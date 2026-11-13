# 旅遊 UI 交接：`/lab?view=tourism`

[TourismView.tsx](../../../src/components/lab/operations/views/TourismView.tsx) 由 `views.tsx` 的 glob 自動成為 `/lab?view=tourism`，沒有改 routeTree、`directions.ts`、hold、index、shared 或首頁。本頁只做「條件式快照模擬」的呈現與輸入，不新增資料、不改引擎。

## 做了什麼

- 輸入：出發站、出發日期、最早出發時間、景點（三選一）、停留分鐘（留空＝景點建議值）、步行速度假設（一般／親子／長者）、選填 `dayTypeOverride`（依日期／平日班表／假日班表）。
- 計算：在瀏覽器內呼叫 `verifyTripReachability(request, timetable, attractions)`，不查詢、不外傳。
- 結果：`status` 原樣顯示；成立與否用「快照與假設下，此往返條件成立／不成立」措辭；被拒絕時先顯示 `invalidReason`；行程時間表（含比例時間條，條只是輔助，完整資訊在文字清單）；末班車風險；`warnings` 去重後完整列出；`disclaimer` 與 `lastBusDisclaimer` 全文。
- 景點資料：依表單選的景點，逐欄標示「有正文摘要支持／演算法假設／未知」，附來源網址、查閱日、`evidenceBasis`、`sourceScheduleNote` 與該景點的未建模例外。
- 範例：載入 `sample-scenarios.json` 的五組輸入，填入表單並重新執行；同時以目前資料重算，比對預存結果（成立與否、拒絕原因、日型、班次、風險等級與緩衝）是否一致。
- 沿用共用元件：`KindBadge`、`FreshnessBanner`（班表與景點快照，不宣稱即時）、`Section`、`Segmented`、`SourceList`、`LimitationList`、`Provenance`。顏色只用 CSS 變數；風險、依據都同時有文字與圖示。

## 檔案

| 檔案 | 內容 |
| --- | --- |
| `views/TourismView.tsx` | 頁面骨架、載入／失敗狀態、來源／限制／出處 |
| `views/tourism/model.ts` | 資料守衛、`loadJson`、表單解析、reducer、標籤與結果輔助函式 |
| `views/tourism/useTourismData.ts` | 並行載入三個 JSON |
| `views/tourism/InputPanel.tsx` | 表單與範例 |
| `views/tourism/ResultPanel.tsx` | 結果、行程、時間條、末班車風險 |
| `views/tourism/AttractionPanel.tsx` | 逐欄來源／假設／未知 |
| `views/tourism/model.test.tsx` | 測試 |

## 載入與不合法輸入

- `timetable.json`、`attractions.json` 是必要資料：任一失敗（HTTP 錯誤、非 JSON、結構不符、網路錯誤）就顯示失敗原因與「重新載入」，不以其他資料代替、不猜測結果。結構守衛包含 `validityRange === "UNKNOWN"`、日期為真實日曆日、四張班表與每筆停靠時間。
- `sample-scenarios.json` 是選用：失敗只顯示提示，計算器照常可用。
- 只擋「連請求都組不出來」的輸入：日期空白或不是真實日曆日、時間空白或非 24 小時制、停留不是整數、站或景點不在資料內；錯誤以 `role="alert"` 標在欄位旁並設 `aria-invalid`。
- 其餘規則交給引擎，結果一律仍是 `conditional_snapshot_simulation`：早於快照日、景點一般公休、停留跨過閉館、停留為 0 或負數、同站、無後續去程班次、無回程。
- 表單在執行後被修改，結果區會標「表單已修改，以下為上一次執行的結果」。

## 文案與資料界線

- `isValid` 只代表快照與假設下條件成立；畫面明寫「不是旅行有效或當日運行的保證」，沒有任何地方把結果稱為旅行有效、通過或已驗證（出現「已驗證」處都是否定句）。
- `SAFE` 顯示為「快照內有緩衝」，並寫明不是安全保證，也不保證準點或有座位。
- `INVALID` 的末班 `00:00` 與緩衝 `-999` 是引擎的無匹配 sentinel，一律顯示為「無」，不會顯示成午夜或數字；`STRANDED` 的負緩衝顯示為「晚於末班 N 分鐘」。
- `inferredSubroute` 每次出現都附「依停靠模式推論，非官方車次代碼」。`tripNumber` 稱為「快照班次序號」。
- 末班車區塊只稱 6670 快照；找不到回程時只轉述引擎的「其他服務未查證，請向營運方確認」，不提供票價、替代班車或步行路徑。引擎的 `backupPlan` 欄位在畫面上稱「快照內提示」。
- 來源逐項呈現，不把整筆資料稱為官方驗證。「有正文摘要支持」只指該欄有主代理轉錄的摘要；來源網址本身不構成驗證。
- 九族 17:00 閉館是統一保守假設且最後入園未知；紙教堂的國定假日、寒暑假、預約團、除夕與週六夜景例外沒有建模；向山的天災、修繕例外沒有建模；快照有效期未知，任意未來日期都不保證當日運行。這些都列在「未知與未建模」與各景點面板。
- 不顯示任何票價；`ticketInfo` 欄位只顯示「未核實，不顯示金額；請向景點確認」，`ticketRequired` 只顯示是否收費。

## 驗證

- `bun test src/components/lab/operations/views/tourism src/features/lab/tourism`：57 項通過、405 個斷言（引擎原有 28 項／213 個斷言，本頁新增 29 項／192 個斷言）。
- `biome check`（僅本頁七個檔案）通過；整個專案的 `tsc --noEmit -p tsconfig.json` 對本頁檔案沒有錯誤（輸出中的其他錯誤來自 `src/features/lab/behavior/`，不屬於本頁）。
- 測試涵蓋：資料守衛接受真資料並拒絕損壞結構；`loadJson` 的 HTTP 錯誤、非 JSON、結構不符、網路錯誤；表單解析；reducer 互動（送出、編輯後標過期、無效輸入保留前次結果、六種被拒絕輸入、日型覆寫、載入五組範例並與預存結果一致）；時間條連續性；sentinel 不外露；逐欄來源分組；任何景點面板都不出現價格；結果、錯誤欄位、範例清單的伺服端渲染內容。
- 互動測試是 reducer 與 `react-dom/server` 靜態渲染，專案沒有 DOM 測試套件，所以沒有模擬瀏覽器點擊。

## 沒做

- **沒有做瀏覽器檢查**：沒有開啟頁面，沒有確認版面、淺色／深色主題、窄螢幕或鍵盤操作實際表現，也沒有跑 `vite build`。這些需要有人實際開 `/lab?view=tourism` 確認。
- 沒有重新產生任何資料、沒有改 `routeTree.gen.ts`、依賴或 lockfile，沒有 commit／push／deploy。
- 沒有使用 `ridership_insights.json`。
