# 外國長途客運的問題與解法：對照 6670（已由 gpt-6.1-sol 驗證並修正，詳見 foreign-verification.md）

研究日期 2026-11-11。每項列：國外問題 → 國外做法 → 6670 是否相關 → 刷卡資料看不看得到 → 需要什麼資料。
「資料可見度」：可見＝刷卡資料直接可量；間接＝只有代理指標；不可見＝刷卡資料完全看不到。

## 新資料線索：刷卡資料中的「車滿天花板」
- 方法：同 vehicle、同 board_date，以 [board_ts, alight_ts]（排除同站、<180 秒、>4 小時）掃描；每次在車人數上升後轉為下降時記一次「局部峰值」。
- 局部峰值人數分布：40 人 1,643 次、41 人 1,510、42 人 1,130、43 人 776、**44 人驟降為 161**、45 人 85。43→44 少了約 79%。
- 解讀（推論）：若車上只有約 43 個座位且國道不得站立，這個斷崖符合「座位滿就無法再上車」的截斷形狀；≥44 可能是跨班晚刷或車輛錯合的雜訊。座位數未取得官方資料。
- 41–43 人的局部峰值 3,416 次，分布在 654 個日期；達到時的上車站：高鐵臺中站 1,215、埔里站 1,072、暨南大學校內 258、日月潭 253；上班日 1,950、休息日 1,466。
- 限制：同一班次可能產生多個局部峰值；vehicle 未驗證為單一實體車；59.6% 車日混跑多支線〔驗證後修正〕。41–43 應稱「高負載代理事件」，不是滿座或拒載班次；斷崖在每車日單峰、2/3/6 小時上限、各支線分開計算下仍存在。這只能指出高負載的時段與站點，不能算出被拒載人數。

## F1 車滿過站不停／乘客被留下（pass-up, left behind）
- 國外：溫尼伯 Winnipeg Transit 由司機按車上按鈕記錄滿載過站與輪椅無法上車，並公開為開放資料；洛杉磯 Metro 稽核指出同類機構中只有一家主動追蹤 pass-up，程序多靠司機判斷；卡加利 2022 年前沒有紀錄；匹茲堡研究指出上車紀錄是被截斷的資料，不含被留下的人。
- 做法：司機 pass-up 按鈕＋自動乘客計數（APC）＋公開資料；以「過站次數」當服務 KPI（溫哥華 TransLink 公布擁擠班次比例 2024 年 11.2%、2025 年 5.5%）。
- 6670：高相關。南投客運官網（ntbus.com.tw/hsr6.html）說明埔里往高鐵尖峰常客滿、中間站難搭，沿途可能因座位額滿無法停靠。〔驗證後修正：改用官方來源〕
- 資料可見度：不可見（只有上面的「天花板」間接訊號）。需要：司機端 pass-up 紀錄、站點排隊人數、APC。

## F2 國道禁止站立 → 座位上限即運能上限
- 國外：日本高速巴士多為全車對號、不得站立，乘客須繫安全帶（2008 年起高速公路上須繫安全帶）；部分路線採先到先上。
- 台灣：《高速公路及快速公路交通管制規則》第 9 條列大型客車站立乘客為禁止行為。
- 做法：〔刪除：「發車前 20 分鐘可訂位」查無通案依據〕混合「預約座＋現場座」。
- 6670：高相關。
- 資料可見度：間接。需要：各車座位數、預約／售票紀錄。

## F3 中途站被起站滿載排擠
- 國外：愛爾蘭 Bus Éireann 30 號線，乘客在都柏林機場因車已滿而沒被載走，業者建議線上訂位。
- 做法：分段座位配額、中途站加開區間車、線上預約保留中途站座位。
- 6670：高相關。高鐵站滿座後，下游崎下、埔里等站可能上不了車（41–43 人峰值有 1,215 次在高鐵站達成）。
- 資料可見度：間接。需要：各站候車人數、班次 ID。

## F4 延誤、取消與轉乘權益
- 國外：歐盟第 181/2011 號規則：適用路線距離 ≥250 公里的定期服務；自站體取消、超賣或延誤發車超過 120 分鐘，須提供退款或改運；行程超過 3 小時的長途定期班次，延誤出發超過 90 分鐘須提供餐飲等協助。瑞士 PostBus 時刻表與火車對開，部分路線保證接駁，但也說明因時刻緊湊，等候延誤列車的空間有限。FlixBus 延誤未滿 2 小時沒有補償，引起抱怨。
- 做法：法定乘客權利、轉乘保證、延誤自動通知。
- 6670：中高。假日回程旅行時間長尾（日月潭→高鐵 休息日午後 p90 124 分），與高鐵銜接相關。
- 資料可見度：間接（刷卡區間代理旅行時間）。需要：AVL 實際到離站、高鐵班次與誤車申訴。

## F5 司機短缺導致臨時取消
- 國外：IRU 2023 年估歐洲客運駕駛缺 105,000 人（約 10%）；英國客運（coach）駕駛缺口 12.4%；Bus Éireann 2022 年因司機調度臨時取消班次。台灣媒體報導交通部擬開放雙層巴士上國道以因應駕駛荒。
- 6670：中。
- 資料可見度：不可見（只有 6 個整日無資料，原因未知）。需要：派車與停駛紀錄。

## F6 駕駛疲勞與工時
- 國外：ETF 2020 年調查（2021 發布）中 671 名客運司機子樣本，66% 常在開車時感到疲倦；歐盟就遊覽車休息時間放寬提案爭議。
- 6670：中（山路＋國道）。資料可見度：不可見。需要：排班與工時紀錄。

## F7 無障礙搭乘
- 國外：歐盟 181/2011 要求指定站點與車上免費協助身障者；美國 ADA 對部分客運允許 48 小時前預約無障礙車輛；溫尼伯 pass-up 資料也記錄輪椅無法上車。
- 6670：中高。愛心／博愛／陪伴票 52,895 筆，35.8% 在埔里↔高鐵。
- 資料可見度：不可見（看不到輪椅乘客是否被拒、等多久）。需要：無障礙車輛排班、預約與拒載紀錄。

## F8 候車環境與站點設施
- 國外：美國 Greyhound 站體出售關閉，乘客改在路邊無遮蔽處候車；Chaddick 報告指出關站拖累偏鄉路線復甦（身障負擔之歸因未獲證實）。
- 6670：中。高鐵站 5 號出口排隊（網路經驗）。資料可見度：不可見。需要：站點稽核、候車時間。

## F9 擁擠資訊不透明
- 國外：GTFS-Realtime 有 occupancy_status 欄位；奧斯汀 CapMetro App 顯示「擁擠車輛」，MBTA 也發布實驗性 occupancy 欄位。
- 做法：即時公布每班剩餘座位。6670 的上車刷卡本身是即時訊號，可推算在車人數。
- 6670：高。資料可見度：可見（歷史刷卡可回推；即時需串接票證系統）。

## F10 旅遊尖峰管理
- 國外：美國錫安國家公園 2020 年接駁車改採預約，之後取消；分時入園提案遭地方反對。
- 6670：中。連假周邊日量最高 4,244（中位數 2,397）。資料可見度：可見（量）／不可見（被擋下的需求）。

## F11 偏鄉路線財務與縮班
- 國外：Bus Éireann 2026 年 5 月因虧損撤銷數條 Expressway 路線；英國 Rural Mobility Fund 的需求反應式運輸（DRT）試辦被地方認為成功，但財務永續是問題；美國部分州用聯邦補助委託業者連結偏鄉。
- 6670：中（湖區低量站：水社 659、向山 16,286 上車）。資料可見度：可見（量）。

## F12 潛在需求與放棄搭乘
- 國外：首爾研究用票證資料估計未滿足的公車需求，把乘客放棄等候（reneging）模型化，指出忽略這個行為會系統性錯估服務缺口〔刪除：MIT 歸因查無出處〕。
- 6670：高（同 F1 的根本限制）。資料可見度：不可見。需要：問卷、排隊計數、App 查詢紀錄。

## F13 申訴與退款
- 國外：〔驗證判定 WRONG：無統計支持「常見抱怨集中」；僅能說延誤與退款是可研究的服務問題〕
- 6670：中（同站刷卡 6,281 筆付 NT$122,617，原因未查證）。資料可見度：間接。需要：原始交易、申訴紀錄。

## 來源
- Winnipeg Transit pass-ups 開放資料：https://info.winnipegtransit.com/open-data/pass-ups
- TransLink 2025 擁擠班次：https://buzzer.translink.ca/2026/06/service-increases-led-to-fewer-pass-ups-last-year/
- LA Metro pass-up 稽核：https://datamade-metro-pdf-merger.s3.amazonaws.com/2025-0642.pdf
- Calgary：https://amp.cbc.ca/news/canada/calgary/calgary-full-buses-leaving-riders-behind-1.7408981
- Pittsburgh excess demand：https://arxiv.org/abs/2208.06372
- EU 181/2011：https://www.legislation.gov.uk/eur/2011/181/contents/data.html ；德國交通部摘要 https://www.bmv.de/SharedDocs/EN/Articles/StV/Roadtraffic/rights-passengers-travelling-bus-and-coach.html
- FlixBus 延誤規則：https://support.flixbus.com/global/en/delays-and-cancellations
- PostBus 時刻表：https://www2.postauto.ch/en/help-and-contact/customer-service/timetable ；https://www.postauto.ch/en/timetable-central-alps-passes
- 日本高速巴士：https://s.kosokubus.com/column/en/?detail309 ；https://www.chuo-bus.co.jp/airport.en/manner
- 高速公路及快速公路交通管制規則：https://laws.gov.taipei/Law/File/0000063394
- 6670 不賣站票（網路文章）：https://uptogo.com.tw/?p=1726809 ；南投客運官方：https://www.ntbus.com.tw/hsr6.html
- 雙層巴士因應駕駛荒：https://udn.com/news/story/7266/9137737
- Bus Éireann 都柏林機場滿載：https://fermanaghherald.com/2022/06/bus-eireann-apologises-for-dublin-cancellations ；路線撤銷：https://www.travelextra.ie/bus-eireann-withdraws-three-expressway-services/
- 司機短缺與疲勞：https://www.cpt-uk.org/news/cpt-calls-for-government-action-to-make-it-easier-to-hire-bus-and-coach-drivers/ ；https://www.etf-europe.org/sector/road-transport/driving-and-rest-time
- ADA OTRB：https://www.fmcsa.dot.gov/regulations/americans-disabilities-act-reporting-and-other-requirements-over-road-bus-companies
- Greyhound 站體關閉：https://www.kunc.org/2024-01-22/bus-stations-around-the-country-are-closing-leaving-waiting-riders-without-shelter ；https://www.planetizen.com/news/2025/02/134304-intercity-bus-ridership-grows-despite-service-cuts
- GTFS-RT occupancy：https://www.masstransitmag.com/technology/passenger-info/mobile-applications/press-release/21264389/bytemark-inc-bytemark-makes-it-easy-to-share-bus-occupancy-info-with-capmetro-riders ；https://github.com/mbta/gtfs-documentation/blob/master/reference/gtfs-realtime.md
- Zion 接駁：https://sltrib.com/news/environment/2020/06/27/zion-shuttle-returning ；https://www.nationalparkstraveler.org/node/26972
- 英國 DRT：https://www.uwe.ac.uk/news/demand-responsive-transport
- 首爾 unmet demand：https://trid.trb.org/View/2781311
