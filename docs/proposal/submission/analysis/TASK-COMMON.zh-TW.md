# 分析任務共同背景（所有委派先讀）

專案 /home/zup/code/esg-hackathon-bus-2026。這是「2026 永續智慧創新黑客松」命題「智慧營運決策」（出題企業：南投客運，臺灣好行 6670 日月潭線）的提案。評審參考權重：完整性30、可行性20、創新性20、影響力30；使用者的目標是四項分數都高於 8.5，所以需要「已實際跑出結果、可重現、誠實標示限制」的分析。評審多半是南投客運營運／調度人員，重視實用性與不得罪人（不指控超載或過站）。

**重要工作規則：** 使用者已明確授權你自行做合理的設計決定，**不要因為問題困難而停下來問使用者**；遇到歧義就依「設計決定」小節處理並寫進 README；若某部分確實做不到，誠實寫出原因與已完成的替代，但必須把能做的全部做完並交付檔案。只寫入你被指派的資料夾；不 commit、不對外聯繫、不改 repo 既有程式與文件。

## 官方事實
一般大型客車約 41 席、通用無障礙大型客車約 37 席，站位各約 8–9 位；6670D、6670H 有事先排定與機動加班（機動加班主要因應每日早晨尖峰與連續假期），票證班次可能多於公告時刻表；每日約 06:20 埔里站→日月潭有調度班；車碼（vehicle 欄＝車牌，共 122 個）與車型的對照尚未取得，所以同時用 41 席與 37 席兩種情境，不得假設單一車的席數。

## 資料與環境
- SQLite（唯讀 mode=ro）：/tmp/claude-1000/-home-zup-code-esg-hackathon-bus-2026/52074730-66f8-496b-af45-2f740ae8b487/scratchpad/trips.db，表 trips(id, issuer, ticket_type, subroute, vehicle, board_ts, board_date, board_stop, board_seq, alight_ts, alight_stop, alight_seq, fare_paid, fare_full, fare_discounted, discount)，1,800,910 筆，2024-01-01 至 2025-12-31，子路線 6670A/B/D/E/F/H；上下車皆刷、時間到秒、無卡號。board_seq／alight_seq 是站序（數字越大越往日月潭方向的站序以 public/geo/stops.json 的 seq 為準；請自行核對方向定義並寫入 README）。
- 已重建到站列 public/data/lab/seats/arrivals-YYYY-MM.json（columns: day, stop, minute, subroute, direction, load, boarded）與 summary.json（stops、subroutes、directions 索引）；重建規則見 scripts/lab/seats/build.ts 與 src/features/lab/seats/model.ts（同車同日上下車重疊推算車上人數；同站連續上車間隔≤10 分鐘合併為一次到站，以第一筆上車時間代表到站；排除同站上下車與乘車時間不在 180 秒至 4 小時內者）。注意：到站列沒有車碼，需要車碼時請回 trips.db 以同一規則重建。
- 休息日旗標 public/data/lab/visualization/calendar.json（days[YYYY-MM-DD].rest，含 note）。站序與座標 public/geo/stops.json。
- 既有分析可參考：docs/proposal/submission/analysis_official_seats.py、docs/proposal/drafts/experiments/forecast/run_v4.py（上游鏈結作法）、docs/proposal/PLAN.zh-TW.md §4、docs/proposal/appendix/F-technical-details.zh-TW.md、docs/proposal/drafts/carbon-occupancy.zh-TW.md、drafts/impact-v3.zh-TW.md。
- Python（numpy、pandas、scikit-learn、scipy、lightgbm、matplotlib）：/tmp/claude-1000/-home-zup-code-esg-hackathon-bus-2026/52074730-66f8-496b-af45-2f740ae8b487/scratchpad/ds-venv/bin/python。系統 python3 無這些套件。

## 口徑與限制（務必遵守並揭露）
只能看到「有人刷卡上車」的到站與成功上車的旅次；被留下的人、現金、漏刷、無人上車的過站都看不到，所以任何「減少留站」效益只能是情境（明列假設與敏感度）；比例分母用「上車前車上已有乘客（load>0）」的到站；「座位不多」代理＝上車前載客 ≥ 席數−5（41 席≥36，37 席≥32），「推估座位已滿」＝≥ 席數；12 個中途站＝埔里站、崎下、魚池、暨南大學校內、九族文化村、日月老茶廠、大雁、桃米坑、向山行政中心、暨南大學、牛耳石雕公園、水社；重建載客偶超過官方容量（≥50 人共 33 次）屬重建誤差，不得據此指控超載；所有切分依時間切（訓練 2024-01 至 2025-03、選擇 2025-04 至 06、留出 2025-07 至 12），嚴禁洩漏；統計附區間（以日為單位 bootstrap）或標準誤；不得事後挑選指標。結果標示【事實】【推論】【假設】；繁體中文（臺灣用語）；不得捏造來源、成本或係數（成本與碳係數只能用 repo 已記載且標來源的值，或明確標為「假設範圍」並做敏感度）。

## 設計決定（已替你決定，直接採用）
1. **班次（run）定義：** 對每個 (vehicle, board_date)，把所有刷卡上車事件依 board_ts 排序；以乘客的行進方向（alight_seq 與 board_seq 的大小關係）判定方向；同一方向的連續事件，若相鄰兩次「對應站序遞進」且時間間隔 ≤ 90 分鐘，歸入同一 run；方向反轉或間隔 > 90 分鐘則開新 run。run 內任一時刻的車上人數＝該時刻搭乘中的旅次數（上車 ≤ t < 下車）。請在 README 報告 run 數量、每 run 平均停靠數、與到站列加總的吻合度。
2. **「離站時刻」代理：** 資料沒有實際離站時間。以「該站最後一次刷卡上車時刻」作為該站離站時刻的代理；上游離站載客＝該時刻車上人數（含剛上車者）。提前量＝下游到站（第一筆刷卡上車時刻）− 上游離站代理時刻；明說這是近似，並報告提前量分布。
3. **預測時點與可用資訊：** 預警在「某 run 的某個已觀察上游站離站代理時刻」發出，只能用該時刻以前已發生的刷卡；**目標是同一 run 中更下游、站序較後的中途站**。下游站是否被觀察到（有人刷卡上車）本身是選樣：只能評估「下游確實有人上車」的到站，並報告覆蓋率；也報告以「站序下一站（不論是否有人上車）」為目標的版本，若下一站無人上車則標為不可評估而非負例。方向由該 run 已發生的刷卡序列判定，不得用下游乘客的刷卡資訊。
3b. 若上述仍有洩漏疑慮，請寫出你採取的防洩漏檢查（例如：特徵時間戳一律 < 預測時刻）。
4. **熱點窗口：** 以（子路線、方向、小時、日類〔休息日／上班日；連假另列〕）為單位；「集中度曲線」＝依全期（訓練期）頻率排序的前 k 個窗口，涵蓋留出期多少比例的座位不多到站。
5. **成本與碳：** 路線長度用 stops.json 座標估算（說明方法）；成本每班 0.5–1.5 萬元（repo 既有假設範圍，標為假設）；排放係數只用 repo 記載值（drafts/carbon-occupancy、impact-v3，註明來源）。

## 交付通則
腳本以命令列參數接收 trips.db 路徑（唯讀）；輸出檔以獨佔方式新建不覆寫（若資料夾已有同名檔，請建立新的子資料夾 v2）；README.zh-TW.md 要有：做了什麼、方法與設計決定、關鍵數字表（含區間）、限制、如何重跑；dashboard_data.json 小於 1.5 MB（欄位在 README 說明）。長時間計算請在背景執行並輪詢，不要中途放棄。完成後最後一則訊息請列：產出檔路徑、關鍵結論（≤10 行含數字）、最大的限制與你如何量化它。
