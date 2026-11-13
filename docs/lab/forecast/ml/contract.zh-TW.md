# ML JSON 整合契約 v1

路徑及 TypeScript 型別在 `src/features/lab/forecast/ml/data.ts`，此檔只有資料契約，沒有 UI。讀取端應檢查 `schemaVersion === 1`、`group === 'total'`、`status === 'historical_backtest_not_current_forecast'`。TypeScript 型別不會在執行時驗證外部 JSON。

- `/data/lab/forecast/ml/summary.json` 是摘要、逐月評估、2024 候選分數、資料雜湊、套件版本與各次訓練稽核。
- `/data/lab/forecast/ml/results.json` 是驗證、測試逐日預測，`summaryPath` 指向上述摘要。驗證列含四個 ML 候選，測試列只含 2024 選出的 ML，以及四個統計基準。未選候選的測試值不存在，不可當成零。
- `selectedModel` 僅代表四個 ML 候選間的 2024 選擇。它不表示 ML 勝過統計基準；`baselineSelectedModel` 保留既有統計基準選擇。
- 每列 `date` 為 Asia/Taipei 日曆日期，`actual` 為上車人次，`predictions` 為未四捨五入且非負的點估計。`null` 表示缺實際值或缺必要歷史，不能補零。
- `trainingCutoffExclusive` 是該列 ML 模型訓練標籤的排除上界，亦即當月 1 日。當日特徵仍可讀前一天已揭露的實際值。統計基準沒有訓練模型。
- `commonSupport` 為該日實際與全部列出的預測都可用。主要 `metrics` 限定相同共同日期；`availability.*.individualSupportMetrics` 日期可不同，不能直接排名。
- `wape` 是非負比例且可能超過 1；`peakUnderforecastShare` 與 `observedDayCoverage` 在 0 到 1。讀取端若顯示百分比才乘以 100。WAPE 不是準確率。零分母與無樣本的指標為 null。
- `bias` 是預測減實際，負值表示整體低估。`peakN` 是共同評估日中達到固定 2024 P90 門檻的日數。尖峰低估占比只算 max(實際減預測, 0) 的合計除以尖峰實際合計。
- `observedDayCoverage` 是有實際紀錄日中可以出預測的比例；不是預測區間涵蓋率。`protocol.intervals === null` 明確表示沒有區間。
- `trainingAudits` 記錄每個模型每月訓練資料的第一、最後目標日、筆數、訓練 MAE、樹數及特徵重要度。訓練 MAE 不能代替保留測試；特徵重要度也不是因果解釋。

所有輸出只包含每日總量，沒有卡號或站點小樣本。不得將此歷史實驗顯示成今日預測、完整需求、拒載、候車時間或應加班次數。需要原有分組時仍讀既有統計基準契約，本實驗沒有改其 schema。
