# 狀態

專案: esg-hackathon-bus-2026

筆記本: .agentflow/esg-hackathon-bus-2026.devlog.md，根目錄筆記本

工作目錄: /home/zup/code/esg-hackathon-bus-2026

分支: main

目前工作: A-006 已完成旅運需求預測可行性與方法說明。

已驗證: 現有匯出包含 2024–2025 年約 180 萬次刷卡旅次；尚未訓練預測模型。

下一步: 等待後續指示。

封存紀錄: 無。

---

# → Ask / A-001

+ initialize agentflow
open a threeway: read the thread [Thread: 國際創新客運解決方案; ref=thread_739d2e23-e051-416b-bfcc-ce5022bac59e] and discuss the potential solution.
model: gpt-6.1-sol on low, claude-opus-5-5 on medium, and gemini-3.8-flash on high. Use their official harness (codex, claude code, antigravity cli) via T3 Code orchestrator.

[Discussion evidence and recovery](.tmp/A-001.md).

# → Reply / A-001

* _2026-11-03 17:16:42 +0800_

1. initialize agentflow

   Initialized Agentflow configuration, notebook, shared scaffolds and project startup instructions. Existing agf shell binding points to another checkout and was preserved. Shell binding modernization needs an explicit upgrade request.

2. open a threeway: read the thread and discuss the potential solution.

   Completed blind drafting, reciprocal critique, Codex synthesis and exact-text acceptance through Codex GPT-6.1-sol low, Claude Code Opus 5.5 medium and Antigravity Gemini 3.8 Flash high. No material dissent remains.

   [Agreed recommendation, exact S1](artifacts/A-001/solution-discussion.md). Use historical aggregates to nominate a stop and period, then compare service alternatives under explicit scenarios. Actual denied-passenger counts require additional evidence. No code, queries or operational changes were performed.

## System invariant changes

Created an empty registry scaffold. No accepted IDs or guarantees.

## Questions (batched, each with a suggested default)

- None. The recommendation records future choices; no implementation is scheduled.

---

# → Ask / A-002

+ rewrite the file in zh-tw

# → Reply / A-002

* _2026-11-03 17:19:21 +0800_

1. rewrite the file in zh-tw

   已將[方案討論文件](artifacts/A-001/solution-discussion.md)改寫為繁體中文，保留建議、證據限制及共識紀錄，並註明三方接受的是英文原文。

## 問題

- 無。

---

# → Ask / A-003

+ 對，我的確要關注中間站的問題
但刷卡資料只能看出來成功搭上車的資料，在網路上搜尋，有沒有重建搭乘模型的辦法？

# → Reply / A-003

* _2026-11-03 17:31:42 +0800_

1. 在網路上搜尋，有沒有重建搭乘模型的辦法？

   [研究結果與適用性分析](artifacts/A-003/boarding-model-research.zh-TW.md)。有公車未能上車推估、放棄候車建模及逐班載客重建研究；可用模型間接推估，但現有逐小時資料不足。全文與資料適用性仍有未驗證部分。

## 問題

- 無。本次完成文獻查找與說明，未啟動實作。

---

# → Ask / A-004

+ 或者說，可以比較頭尾站的上車時間 vs. 中間站，如果中間站比較晚而且晚很多，便能夠量化來呈現

# → Reply / A-004

* _2026-11-03 17:38:28 +0800_

1. 比較頭尾站與中間站的上車時間，量化中間站較晚的現象。

   [指標與限制](artifacts/A-004/boarding-time-shift.zh-TW.md)。可量化上車時段相對位移，但須固定方向與服務，調整上游位移及行車時間。結果不等於候車時間或未能上車人數。示例為假設數字，未執行實測。

## 問題

- 無。

---

# → Ask / A-005

+ 之後開啟 inline reply
實際跑數據來看看

# → Reply / A-005

* _2026-11-03 17:42:36 +0800_

1. 之後開啟 inline reply

   已開啟，之後直接在對話中呈現結果。

2. 實際跑數據來看看

   已分析 2024–2025 年既有小時級資料。6670D 回程埔里、魚池未見持續相對延後；6670F 暨南大學校內的小幅延後對時段敏感。沒有證明不存在拒載，也未估算候車分鐘或未上車人數。[完整方法與結果](artifacts/A-005/report.zh-TW.md)。

## 問題

- 無。

---

# → Ask / A-006

+ 這些數據可以做旅運需求預測模型嗎？怎麼做？

# → 回覆 / A-006

* _2026-11-03 20:47:14 +0800_

1. 這些數據可以做旅運需求預測模型嗎？怎麼做？

   可以。**這批資料適合先做「未來每天、各站與時段的刷卡搭乘量預測」**；若要預測中間站所有想搭車的人，包括客滿未上車者，目前資料還不足。

   我檢查了實際匯出資料：涵蓋 2024–2025 年、約 180 萬次刷卡旅次，有日期、支線、推定方向、站點、每小時上下車人次。兩年間有 6 個日期完全沒有紀錄，原因要再確認，不能直接當成零需求。以下是建議方法，尚未訓練模型，也沒有準確率結果。

   1. **先選一個可驗證的目標。** 建議先預測「明天各支線、方向的總上車人次」，確認有效後，再細分成「明天各站、每小時上車人次」。這能回答埔里、魚池等中間站何時可能出現較多搭乘量。第一版先做提前一天預測，之後再測提前七天。

   2. **整理成固定時間的訓練表。** 每列是「日期 × 支線 × 方向 × 站點 × 小時」，目標值是上車人次。統一站名、檢查異常時間，並處理未知方向；目前有 6,281 次上車無法判定方向。缺紀錄要區分停駛、漏資料與確實無人搭乘。即使當天支線有紀錄，也不能認定每個站、每個小時都有服務。

   3. **用過去搭乘量與日曆建立特徵。** 加入星期、月份、國定假日、連假第幾天，以及同站同方向過去一週、兩週、四週相同時段的搭乘量。後續可補天氣、活動和班次數。所有特徵都必須是預測當下已知的資訊，例如預測明天只能用當時取得的天氣預報，不能偷用明天的實際雨量。

   4. **先做簡單基準，再試 LightGBM。** 基準可以是「上週同一天同時段」，或「過去四週同星期、同時段平均」。再用一個 LightGBM 模型共同學習各站與支線的規律，避免替每個稀疏時段各訓練一個模型。人次屬於計數資料，可先試 Poisson 目標函數；LightGBM 官方提供這項設定。[官方文件](https://lightgbm.readthedocs.io/en/v4.6.0/Parameters.html)

   5. **按時間回測，確認真的比基準好。** 例如用 2024 年訓練、2025 年上半年調整，保留 2025 年下半年做最後測試；調整階段再逐月往前推進驗證。不能隨機打散日期。檢查平均每站每小時差幾人、整體誤差，以及假日、尖峰與中間站是否特別容易低估。這種依時間往前推進的驗證方式，可避免把未來資訊帶入訓練。[方法說明](https://otexts.com/fpp3/toolbox.html#time-series-cross-validation)

   6. **輸出預測範圍，才方便做營運判斷。** 除了預測人次，也提供經回測校準的預測區間，交代可能波動。要進一步建議加班車，還需要班次時刻、實際到站、車輛容量與到達中間站前的載客量；同一小時的上車人數，不能直接換算成某一班車的客滿程度。

   對你關心的中間站問題，最需要注意的是：**若歷史上因客滿而少載到人，模型可能把偏低的刷卡量學成正常需求。** 即使預測刷卡人次很準，也不能據此宣稱估出了未上車人數。要估完整需求，需要補候車人數、未能上車紀錄或抽樣調查，再建立乘客到站與候車模型。

   我建議第一版就做「提前一天的搭乘量預測＋中間站誤差檢查」。先用 2025 年的歷史回測證明比上週同期更準，再討論調度應用。現有資料只到 2025 年底，若要用於現在的營運，還需要補上近期資料。

## 問題

- 無。本次為方法說明，未啟動模型實作。

---

# → Ask / A-007
