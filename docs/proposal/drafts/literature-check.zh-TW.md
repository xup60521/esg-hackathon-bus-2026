# 被截斷需求文獻核對

查核至 2026-11-12。Ma 已讀 arXiv 全文；Tan 與其他文獻的可取得程度各見下文。未在摘要提及不等於作者沒有使用。現場預先指定檢驗在本案仍是待凍結提案，不是已完成註冊或驗證。

## 已開啟摘要

### Ma et al.，Pittsburgh

Tianfang Ma 等，2022，[arXiv 全文 PDF](https://arxiv.org/pdf/2208.06372)，v2。2018 年匹茲堡 98 路、6,102 站的紅外線乘客計數與 GPS 包含到離站時間、上下車、離站載客及座位數；容量約為座位數 140%。到站已滿且無人上車視為疑似截斷，從訓練資料剔除。按月比較 Poisson、負二項、零膨脹 Poisson 與階層模型，特徵含實際和預定班距、時間及該車前三站上車數。

模擬比較剔除截斷資料前後偏差；61D 路線以 80% 訓練、其餘驗證，Poisson 跨月跨站 RMSE 1.44，模型間差異未必顯著。前十繁忙路線估計全年約 1% 乘客留站，尖峰最高約 8%，這是模型估計而非現場真值。全文說真實資料缺乏留站真值，無法估計偵測偽陽性與偽陰性，沒有報告現場調查規模或模型與現場一致度。滿車無人等會誤報，司機判斷與下車會造成漏報；模型及容量假設不一定適用他處。

全文使用前一班與本班的實際班距，及本車前三站上車量；未見以「前一班高載後下一班上車增加」作為訊號，也未見反方向負對照。這不代表該訊號首創。全文明確指出零上車不代表零需求。

### Zhu et al.，2017

Yiwen Zhu、Haris N. Koutsopoulos、Nigel H. M. Wilson，*A probabilistic Passenger-to-Train Assignment Model based on automated data*，Transportation Research Part B 104，522–542，https://ideas.repec.org/a/eee/transb/v104y2017icp522-542.html 。摘要寫「probability distribution of the number of trains」乘客因容量限制無法搭乘。AFC 與 AVL 支援機率式乘客列車指派；以合成資料與實際系統調查比較。這是軌道而非公車，已包含留站推估及調查比較。摘要未說反方向負對照；本案僅能主張台灣城際應用及尚待驗證的設計組合。

### Miller et al.，2018

Eli Miller、Gabriel E. Sánchez-Martínez、Neema Nassir，*Estimation of Passengers Left Behind by Trains in High-Frequency Transit Service Operating Near Capacity*，Transportation Research Record 2672(8)，497–504（[出版商頁](https://journals.sagepub.com/doi/10.1177/0361198118794291)核實），https://journals.sagepub.com/doi/abs/10.1177/0361198118794291 。摘要稱以「manual counts of passengers left behind」校準雙層迴歸；資料為 AFC、AVL 與芝加哥藍線人工計數。既有研究已結合自動資料與現場資料，不能把現場驗證本身稱為新意。與本案不同之處在軌道、模型與本案的反方向對照；僅摘要不足以判斷完整設計。

### Tan & Ramli 全文核對（2026-11-12 更新：已讀全文）

使用者提供 *Transportation* 51:1279–1298 的 PDF，已讀完正文、驗證、結論、限制與附錄（參考文獻未逐篇核對）。要點：

- **方法（p.1283–1285）：** 以出站公車剩餘座位比例 SCR 低於門檻（調查校準 0.24；地鐵轉乘法 0.30–0.35；案例採 0.3）定義「潛在未上車事件」；假設 (1) 被拒乘者等下一班，(2) 連續兩班乘客到達率近似相等；用該班與下一班的上車數 b 與班距 t，推估未上車人數為截斷二項分布（多班為多項分布）。
- **驗證（p.1286–1291）：** 模擬（RMSE 約等於二項標準差）；新加坡 2018-02 至 03 共 23 天、45 條路線、68 站的地面調查（96 筆非零，占 0.6%）；預測對調查 RMSE 5.10；閾值 0.3 時精確率約 0.4、召回率約 0.6（讀自圖 4a，非表列數字）。
- **對照（Fig 5a，p.1290–1291）：** 用無未上車事件的同站、同時段（±15 分）班次，比較連續兩班到達率差 |Δr|，檢驗假設 (2)。**未見**反方向、他路線或安慰劑結果的負對照。
- **用途（p.1280、Fig 7 p.1294）：** 作者明述目的是辨識過度擁擠與未上車的站與時段，並以站時熱圖呈現；因此「選時」用途也已見於該文。
- **限制（作者自述，p.1295）：** 假設無替代班次；期望值模型難以對單次事件驗證；假設 (2) 不一定適用其他城市，建議以地面調查檢查。
- **T1（模型輸入或檢驗變數含前車載客或後續班次上車）：重疊。T2（反方向／他路線／安慰劑負對照）：未見。** 依 PLAN §10 規則，本案縮為「僅 T1 重疊」：不主張訊號或推估方法新；差異限於台灣城際國道座位制場域與擬事前凍結的獨立現場檢驗；歷史反方向對照結果為正，不能當負對照，不列為差異。

### Chen et al.，2023（補充）

Xin Chen、Yu Jiang、Jesper Bláfoss Ingvardson、Xia Luo、Otto Anker Nielsen，*I can board, but I’d rather wait*，Transportation Research Part A 174，https://ideas.repec.org/a/eee/transa/v174y2023ics0965856423001672.html 。摘要指出乘客可能「actively choose not to board」，即便仍有站位；使用成都地鐵刷卡、時刻表及 logit 選擇模型。它處理主動等待而非直接估計公車留站，但提醒本案現場須區分容量不足與自願等車。摘要未提本案負對照或現場設計，不能據此聲稱設計首創。

### Yap 與 Cats，2021（補充）

Menno Yap、Oded Cats，*Taking the path less travelled: Valuation of denied boarding in crowded public transport systems*，Transportation Research Part A 147，1–13，https://ideas.repec.org/a/eee/transa/v147y2021icp1-13.html 。摘要以「passenger and vehicle movement data」估計顯示偏好路徑選擇模型，衡量拒載帶來的額外等待價值。它關注等待成本而非本案的歷史高載後車訊號；可作影響類型脈絡，不能校準本線人數。摘要未提本案對照與現場檢驗。

## 尚未核實的候選

- 首爾 TRID 2781311： https://trid.trb.org/View/2781311 兩次開啟逾時。未讀摘要，不能核實書目、方法或待客／棄等敘述，也不能用搜尋摘要冒充引文。
- Zhu 等 *Inferring left behind passengers in congested metro systems from automated data*：期刊頁開啟回傳 403；不以搜尋結果充當已讀摘要。2017 Part B 上述論文則已獨立核實。arXiv:2301.03808 實際為 Mo 等人的路徑選擇研究，不應當作該 Zhu 論文的連結。
- 額外直接涉及 pass-up 或被截斷公車需求的摘要尚未找到第二篇可成功開啟者；Chen 與 Yap 為相關行為與拒載研究，並非同等直接的推估先例。

## 可誠實主張

本案的新意不在訊號本身，也不在刷卡推估未上車或現場驗證本身（Tan 全文已證實 T1 重疊）；可陳述的差異限於台灣城際國道座位制場域與擬事前凍結的獨立現場檢驗（G 仍是草案）；歷史反方向對照結果為正，不能當負對照，也不證明選時有效，不列為差異。這是具體設計差異，不是已證明的學術首創，相對 Tan 方法的增量仍未證明；沒有可靠預測力時應撤回實用主張。

向作者索取預印本與館際互借：尚未請求（狀態更新日 2026-11-12）。
