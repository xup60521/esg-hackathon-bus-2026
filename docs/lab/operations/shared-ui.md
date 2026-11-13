# /lab 共用 UI 約定

位置：`src/components/lab/shared/`（`#/components/lab/shared`）。範本頁：`src/components/lab/operations/views/OptimizationView.tsx`。

## 頁面結構

- `/lab` layout（`src/routes/lab.tsx`）提供 `LabShell`：主題（與地圖、`/analysis` 共用 localStorage `bus6670-theme`）、導覽、頁尾聲明。子頁**只輸出內容**，不要自己加外框或 `data-theme`。
- 內容順序：eyebrow（小字、accent 色）→ `h1` → 一段說明 → `KindBadge` 列 → `FreshnessBanner` → 多個 `Section`（`mt-4`）→ `SourceList`、`LimitationList`、`Provenance`。
- 獨立頁用 `src/routes/lab.<slug>.tsx`；原型可改放 `src/components/lab/operations/views/<Name>View.tsx`，即自動成為 `/lab?view=<name>`（小寫、去掉 View）。

## 元件

| 元件 | 用途 |
| --- | --- |
| `KindBadge kind` | 資料種類：`history` 歷史刷卡、`scenario` 情境假設、`forecast` 回測預測、`live-unavailable` 即時資料未接、`unverified` 未驗證、`official` 官方文件。每份資料只能標一種正確的種類。 |
| `StatusPill status` | 進度：`ready` 已提交、`partial` 部分提交、`blocked` 資料受阻、`pending` 尚未提交。 |
| `SeverityTag severity` | 建議等級：`info` 提示、`watch` 關注、`review` 需人工評估（圖示＋文字，不單靠顏色）。 |
| `Chip tone` | 自訂重點註記，`tone` 為 CSS 變數名，如 `--k-unverified`。 |
| `FreshnessBanner dataThrough` | 顯示資料截止與距今（日期只到「日」時標「至少」）；一律標「歷史資料，非即時」，除非呼叫端明確宣告即時來源與容許延遲（`realtimeMaxAgeMs`）且時間戳精確、帶時區、非未來。本案沒有即時來源，從不宣告。時間無法判讀或晚於現在時另行標示。 |
| `Section` / `Stat` / `Field` / `Segmented` | 面板、數字卡、欄位標籤、單選按鈕組。 |
| `SourceList` / `LimitationList` / `Provenance` | 來源（附查閱日與用途）、限制、資料出處與重現命令。 |
| `assessFreshness(dataThrough, now, options?)` | 純函式，供非 React 邏輯使用（有測試）。`level` 只描述時間（recent／aging／stale／unknown／future／invalid）；`usableForRealtime` 與時間新鮮度分開，預設永遠為 false。日期嚴格檢查真實日曆、視為台北時區的一整天，不假設當天 23:59 有資料；時間戳必須帶時區。 |

## 顏色

只使用 CSS 變數，淺色與深色都要能讀：中性（`--fg --fg2 --muted --line --chip --accent --grid --axis --tip-bg`）、資料（`--boarding --alighting --middle`，來自 `src/lib/palette.ts`）、標籤（`--k-*`、`--sev-*`、`--st-*`，定義於 `tokens.ts`）。意義不得只靠顏色。

## 圖表

手寫 SVG（如 `MidstopCharts.tsx`）：`role="img"` 加 `aria-label`，數值要能不靠 hover 讀到（表格或標註）。

## 文案守則

- 刷卡只是已成功搭乘者，不稱為需求、候車或拒載。
- 情境輸出不稱成效；`optimal` 只稱「有限候選內最優」。
- 預測不稱準確率；歷史示範不得呈現為現行預測。
- 缺資料以「無」呈現，不補零；未驗證的就寫未驗證。
