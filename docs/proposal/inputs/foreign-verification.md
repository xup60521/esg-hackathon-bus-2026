# 6670 外國客運研究獨立驗證

驗證日期：2026-11-11。審查對象：foreign-research.md。結論：數值重算通過；「43 席容量」仍是待驗證假說；外國案例大部分有根據，但法規適用範圍、資料可見度與部分引文需修正。未修改 repo、未提交 commit。旅次資料僅在本機處理，沒有送到網路或外部服務。公開來源使用 web open/search 與 Python urllib 讀取，兩種取用方式可能得到不同結果。

讀過 agentflow 的 project-rules.md，依子代理指示未啟動工作流程；未發現 .agentflow/rules.md。沒有讀取或沿用作者 scratchpad 內的分析程式。

## 判定方式

來源級別採 SUPPORTED、PARTLY、NOT SUPPORTED、UNREACHABLE。UNREACHABLE 代表本次無法取得足夠正文，不等同內容錯誤。只有搜尋索引摘要可讀時，會明列限制。

章節判定採 CONFIRMED、CONFIRMED-WITH-CAVEAT、WRONG。部分章節的原理成立，仍可能因單一錯誤引文而需要修訂。以下 F1–F13 的本地衍生數字，除了新「車滿天花板」與混支線比例外，均不在本次重算範圍，不能視為已驗證。

## A. 逐項來源核對

### F1 車滿過站不停

**CONFIRMED-WITH-CAVEAT。**

- Winnipeg：SUPPORTED。https://info.winnipegtransit.com/open-data/pass-ups 。web timeout，但 urllib 成功取得官方正文。司機按鈕觸發車載電腦記錄滿載 pass-up，以及輪椅使用者因全車太滿或兩個輪椅位置均被占用而無法上車，資料每日更新。按鈕位置可能與實際被略過站位不同。這不是精確被拒載人數，也不是輪椅拒載原因的完整全集。
- LA Metro：SUPPORTED，範圍需限縮。https://datamade-metro-pdf-merger.s3.amazonaws.com/2025-0642.pdf 。urllib 成功下載，pdftotext 讀取。2025-08-22 顧問報告的 benchmarking 是六家美加業者，只有一家被識別為主動追蹤。不能寫成「全世界只有一家」。報告亦指出一般 pass-up 程序不足，司機在特定情境有不同裁量；輪椅相關程序反而較明確，不能概括成所有程序都只靠司機判斷。
- Calgary：SUPPORTED，但只有新聞證據。https://amp.cbc.ca/news/canada/calgary/calgary-full-buses-leaving-riders-behind-1.7408981 。取得 CBC 正文，報導透過資訊公開取得資料，稱 2022 年開始前未保存此資料；也引述工會認為有漏報。應寫「CBC 根據資訊公開資料報導」，不是當作已閱讀機關原始檔。
- Pittsburgh：SUPPORTED。https://arxiv.org/abs/2208.06372 。作者摘要明說資料只記錄成功上車者，沒有滿車被留下的人，並用篩除疑似截斷樣本與 Poisson 模型估 excess demand。屬研究模型，不是觀測到被留下人數。
- TransLink：SUPPORTED。https://buzzer.translink.ca/2026/06/service-increases-led-to-fewer-pass-ups-last-year/ 。2026-06-24 的官方 Buzzer 文章明列 2024 年 11.2%、2025 年 5.5%，衡量發生 overcrowding 的 bus trips 比例，不是「被拒載旅客比例」或「過站事件次數」。Buzzer 雖稱 blog，這裡是機關自己的發布管道，不能與匿名旅遊心得等量齊觀。

修正文：外國市區公車可用司機事件通報與 APC 補足票證看不到的拒載。TransLink 公布的是發生擁擠的班次占比。6670 票證只能提供疑似容量限制的代理訊號。

### F2 國道不得站立

**CONFIRMED-WITH-CAVEAT。**

- 日本不得站立：SUPPORTED。改用業者一手說明 https://www.jrbustohoku.co.jp/express/info/8/ ，明確寫高速巴士不得立席，滿席時可使用補助席或等下一班。補助席本身也是座位，不能將「主座數」直接當絕對上限。
- 全車對號及先到先上：PARTLY。近鐵的指南 https://www.kintetsu-bus.co.jp/upload/pdf/upPdf/20250304180726_highway_english.pdf 明列全席預約；JNTO https://www.japan.travel/en/plan/getting-around/buses/ 與 https://partners-pamph.jnto.go.jp/simg/pamph/2635.pdf 說明有預約與非預約班次。可支持兩種制度存在，不能憑這些來源量化「大多數」占比。原引用 https://s.kosokubus.com/column/en/?detail309 重導後顯示準備中，NOT SUPPORTED，不能當現存完整指南。
- 2008 年安全帶：SUPPORTED。https://www.chuo-bus.co.jp/airport.en/manner 明列 2008-06-01 起高速公路行車須繫帶。
- 「發車前約 20 分鐘仍可預約」：NOT SUPPORTED。原附兩個網址沒有提供可核對的特定路線、系統與訂位截止時間。JNTO 要求確認各業者期限，並舉 30 分鐘購票期限例子，不能換成全日本 20 分鐘規則。「預約＋現場」可當設計選項，應列具名業者制度，不能當已驗證的通案。
- 台灣第 9 條：SUPPORTED。原 https://laws.gov.taipei/Law/File/0000063394 下載是 ODT 附件，本次未從中抽得可讀法條，改核 https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=K0040019 ，第 9 條第 1 項第 7 款禁止大型客車站立乘客。適用高速公路與快速公路行駛中，不是對所有一般道路公車的全面禁站令。
- 6670 不賣站票：PARTLY。https://uptogo.com.tw/?p=1726809 的文章確實如此寫，但屬一般旅遊文章。https://www.dcard.tw/f/travel/p/228143012 是「客運有廁所嗎」討論，已讀取可見正文與回覆，沒有支持滿車、站票或高鐵排隊的證據，NOT SUPPORTED。應用法規、官方路線行駛國道及官方客滿公告支持，不依賴此論壇。

修正文：行駛國道區間不得站立，運能受核定可用座位限制；座位數、補助席、無障礙配置與預約保留座都需逐車逐班確認。

### F3 中途站被起站滿載排擠

**CONFIRMED-WITH-CAVEAT。**

https://fermanaghherald.com/2022/06/bus-eireann-apologises-for-dublin-cancellations ：SUPPORTED 為新聞引述。直接讀取遭 403/429，但最後以針對該網址的搜尋成功取得完整報導內容，2022-06-21，記載 Route 30 取消、乘客在 Dublin Airport 遇滿車未被載走，並有業者承認機場客滿、建議預訂保證座位的具名回應。這是媒體引述的一手訪問，不是旅客論壇或機關完整營運統計。

「分段座位配額、中途站區間加班、線上保留中途站座位」未在原來源逐一找到，NOT SUPPORTED 為既有國外措施；可保留為作者建議。

6670 有更好的官方證據：https://www.ntbus.com.tw/hsr6.html 。web 及 urllib 多次開啟失敗或憑證名稱不符，但官方網頁的搜尋索引可讀，明寫埔里往高鐵尖峰常客滿、中間站難搭；部分已有預約旅客，沿途可能因座位額滿無法停靠，且部分向山班次留 10 席供日月潭預約客。這直接支持「問題相關」，但不是 2024–2025 資料期間逐日拒載的證明。

修正文：官方已承認 6670 尖峰客滿影響中間站。高鐵站 1,215 次是「最後一筆增加負載的上車事件所在站」，不代表起站排擠、方向、被拒載或下游有候車需求已被觀測。

### F4 延誤、取消、轉乘權益

**CONFIRMED-WITH-CAVEAT。**

- 歐盟法規：PARTLY，門檻數字正確但省略關鍵適用範圍。核對 https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32011R0181 ，首次可讀、後續遇反機器人；另以 urllib 成功讀取 https://www.legislation.gov.uk/eur/2011/181/article/2/data.html 、/article/19/data.html 、/article/21/data.html 、/article/23/data.html 。UK 網站是含英國修法註記的版本，不宜當現行 EU 全文唯一來源；本報告僅用其相同門檻與條件交叉核對，不採其修法後英鎊金額。
- 更正：完整延誤權益原則上適用 scheduled service distance 至少 250 公里的定期服務，而非乘客個人一定搭 250 公里。第 19 條是預期取消、超賣或從 terminal 延誤發車超過 120 分鐘，提供繼續運送／改道或退款選擇；bus stop 另有第 19(4) 條。不是到站晚 120 分鐘就一律現金賠償。業者未提供第 19(1) 選擇時另有票價 50% 補償。
- 第 21 條：排定旅程超過 3 小時，從 terminal 取消或延誤發車超過 90 分鐘時，提供與等候相稱的餐飲，前提是現場可供應或合理可取得；必要時提供有上限的住宿。不能寫成任何路邊站、所有短線、任何 90 分鐘到站延誤均自動有同樣權益。第 23 條亦有例外。
- 德國交通部原摘要 https://www.bmv.de/SharedDocs/EN/Articles/StV/Roadtraffic/rights-passengers-travelling-bus-and-coach.html ：UNREACHABLE，urllib IncompleteRead、web timeout，已由法條補足。
- FlixBus：PARTLY。https://support.flixbus.com/global/en/delays-and-cancellations 成功讀取，確有未滿 2 小時無補償或退款的客服說明；https://global.flixbus.com/passenger-rights 與 https://global.flixbus.com/terms-and-conditions-of-carriage 列較完整條件。不可將客服摘要擴張成「90–120 分鐘絕無餐飲協助」或排除國內法損害請求。「引起抱怨」沒有具名樣本或統計，不予確認。
- PostBus：SUPPORTED。https://www2.postauto.ch/en/help-and-contact/customer-service/timetable 明列與火車對時，但緊湊時刻限制等候延誤連線；https://www.postauto.ch/en/timetable-central-alps-passes 有指定 Grimsel Pass 轉乘保證。僅能說有具體班次／路線保證，不能當全網無條件火車誤點等待。

修正文：歐盟制度可作設計參考，不能直接推定 6670 的法定退款責任；刷卡區間時間是旅行時間代理，沒有時刻表就不能判定 delay，更無法證實誤接高鐵。

### F5 司機短缺與取消

**CONFIRMED-WITH-CAVEAT。**

- IRU：SUPPORTED，但原清單漏列 IRU 直接來源。https://www.iru.org/resources/iru-library/europe-facing-chronic-shortage-bus-and-coach-drivers ，發布 2023-10-05，歐洲 bus and coach 未填補職缺 105,000、約 10%。是產業組織估計，不是各國官方人口普查。
- UK 12.4%：SUPPORTED。https://www.cpt-uk.org/news/cpt-calls-for-government-action-to-make-it-easier-to-hire-bus-and-coach-drivers/ ，2025-10-20 公告，coach 缺口 12.4%，bus 為 3.4%。不能和 IRU 2023 年資料寫成同一次同年調查。CPT 2023 另一公告是 12.5%，不是此數字來源。
- Bus Éireann 2022 取消：SUPPORTED 為特定事件。前述 Herald 最後透過搜尋取得全文，業者稱員工缺勤、短時間難覓承包商，並提到 driver availability 及承包商招募困難。這能支持當時調度問題，不能把臨時缺勤全等同長期結構性駕駛荒。
- 台灣雙層巴士：https://udn.com/news/story/7266/9137737 可讀，為新聞報導政策研議，PARTLY。應保留「媒體報導擬」，不能當已施行規則，更不能證明 6670 已採用。

修正文：國外駕駛缺額是有日期與範圍的產業估計；6670 的無資料日不能獨立識別停駛或駕駛荒。

### F6 疲勞與工時

**CONFIRMED-WITH-CAVEAT。**

原引用 https://www.etf-europe.org/sector/road-transport/driving-and-rest-time 可達，但只是專題入口，不能精確定位 671/66%。新增一手來源 https://www.etf-europe.org/wp-content/uploads/2022/06/ETF-Emergency-Motion-Bus-and-Coach-Driving-and-Rest-Time.pdf 及 https://www.etf-europe.org/wp-content/uploads/2021/05/Driver-Fatigue-in-European-Road-Transport-Report.pdf ：SUPPORTED 數字，PARTLY 年份。調查在 2020 年 5–7 月實施，2021 年發布；2,861 名貨車、公車與客車駕駛為全體，671 名 bus/coach 為子樣本，66% 表示經常疲勞駕駛。不是 671 名全歐司機的代表性隨機樣本。

休息規則放寬爭議有 ETF 2022 動議，SUPPORTED 為當時工會立場；應標年代，不能以提案爭議描述 2026 現行法狀態。6670 票證沒有駕駛 ID 或工時，不能辨識疲勞。

### F7 無障礙搭乘

**CONFIRMED-WITH-CAVEAT。**

- EU：PARTLY，免費協助正確但有範圍與條件。第 13、14 條 https://www.legislation.gov.uk/eur/2011/181/article/13/data.html 及 https://www.legislation.gov.uk/eur/2011/181/article/14/data.html 。指定 terminals 與車上協助有 Annex I 範圍，原則上 36 小時前通知、依指定時間到場；未提前通知也須盡合理努力。仍須連同第 2 條距離門檻與第 10 條安全／車站設計例外理解，不能承諾所有站點所有車均有升降設備。
- ADA：SUPPORTED，但用詞應改。https://www.fmcsa.dot.gov/regulations/americans-disabilities-act-reporting-and-other-requirements-over-road-bus-companies 可由 web 取得，urllib 403。頁面列小型固定路線業者的替代合規安排，以及需求反應服務的 48 小時 advance notice。不是所有定期客運都可要求身障旅客先預約 48 小時；也不是 48 小時內可直接拒載的一般豁免。
- Winnipeg 輪椅 pass-up：SUPPORTED，如 F1。

修正文：優待票不能代表輪椅使用者，更不能推估其拒載率。南投客運官方 https://ntbus.com.tw/well.html 的索引說明特定無障礙班次、預約與可停靠站，較適合對接實際改善；本次直接頁面 timeout，僅索引可核。

### F8 候車環境

**CONFIRMED-WITH-CAVEAT。**

https://www.kunc.org/2024-01-22/bus-stations-around-the-country-are-closing-leaving-waiting-riders-without-shelter 取得 NPR 訪問逐字稿，SUPPORTED 站體出售、路邊候車及轉乘困難。DePaul 的 Joseph Schwieterman 說明轉乘服務受損，低收入旅客的說法由 American Bus Association 的 Peter Pantuso 提出。

https://www.planetizen.com/news/2025/02/134304-intercity-bus-ridership-grows-despite-service-cuts 可讀，為轉述 Chaddick 報告，支持關站拖累偏鄉／次級路線復甦。未在這兩篇讀到「Chaddick 指出加重身障與低收入旅客負擔」的完整對應證據，該歸因 PARTLY，身障專屬結論 NOT SUPPORTED。若要保留，需補上報告原文頁碼。

高鐵 5 號出口排隊不能引 Dcard 廁所文。修正文：國外關站使部分乘客失去室內等候及轉乘設施；6670 的環境品質仍需現場稽核。

### F9 擁擠資訊

**CONFIRMED-WITH-CAVEAT。**

- GTFS-RT occupancy_status：SUPPORTED。https://gtfs.org/documentation/realtime/reference/#enum-occupancystatus 為規格原文；也核對 https://support.google.com/transitpartners/answer/10106342?hl=en 。它是分級狀態，不是精確剩餘座位欄位；FULL 和 NOT_ACCEPTING_PASSENGERS 亦非同義。
- CapMetro：SUPPORTED 為 2022 發布。https://www.masstransitmag.com/technology/passenger-info/mobile-applications/press-release/21264389/bytemark-inc-bytemark-makes-it-easy-to-share-bus-occupancy-info-with-capmetro-riders 是 Bytemark 廠商新聞稿，說 App 出現 crowded vehicle 提示，不能證明已降低擁擠，也不能當 2026 功能仍完全相同。現行官方 https://www.capmetro.org/ride/plan/transit-app 另提 crowdsource 擁擠回報，與舊公告來源不同。
- MBTA：SUPPORTED。https://github.com/mbta/gtfs-documentation/blob/master/reference/gtfs-realtime.md 明列實驗 occupancy_percentage、occupancy_status，僅部分路線／車輛有資料，值包含 MANY_SEATS_AVAILABLE、FEW_SEATS_AVAILABLE、FULL。

原稿「做法＝每班剩餘座位」超出這些例子。原稿「資料可見度＝可見」也過強，應改「可回推有完整上下車時間的票證旅次重疊數，作負載代理」。現金、套票、未記錄乘客、孩童、晚刷、車輛識別、班次切分、封包延遲及預約保留座都會影響剩餘可售座位。不能只串接刷卡就保證精確實時座位。

### F10 旅遊尖峰

**CONFIRMED-WITH-CAVEAT。**

https://sltrib.com/news/environment/2020/06/27/zion-shuttle-returning 可下載，新聞支持疫情期間預約制。https://www.nationalparkstraveler.org/node/26972 本次 503/timeout，UNREACHABLE。

補一手 https://parkplanning.nps.gov/projectHome.cfm?ProjectID=101393 與 https://www.nps.gov/orgs/1548/upload/NPS-Inventory_2020-508_FINAL.pdf ，SUPPORTED 2020 年臨時限量定時票。另核對 NPS 2021-05-27 官方新聞 https://www.nps.gov/zion/learn/news/zion-national-park-shuttle-ticket-update.htm ，明載 2021-05-28 停止票制，恢復先到先上。原因包含疫情社交距離指引改變，不能說預約制度失敗所以取消。

「地方反對」PARTLY。https://www.govinfo.gov/content/pkg/CHRG-117shrg45249/html/CHRG-117shrg45249.htm 有 Senator Mike Lee 表達反對並聲稱社區也反對，但這是具名政治發言，不能當具代表性的民意調查。疫情接駁票、一般入園預約及 Angels Landing 登山許可應分開。

修正文：Zion 疫情接駁預約曾採行後取消；可作尖峰管理案例，效益與接受度仍須評估。

### F11 偏鄉路線財務

**CONFIRMED-WITH-CAVEAT。**

- Expressway：SUPPORTED，但「數條路線撤銷」需精確。https://www.travelextra.ie/bus-eireann-withdraws-three-expressway-services/ web 成功讀取，2026-03-28 公告將自 5 月 24 日撤 Route 4、Route 52，以及 Route 40 的 Rosslare/Wexford–Waterford 段，不是 Route 40 全線。原文說三項服務累積虧損、長期乘客下降；它是媒體轉述。
- 一手交叉核 https://www.nationaltransport.ie/wp-content/uploads/2026/04/Expressway_Route_52_-_Determination_Report-March-2026.pdf ，確認 Route 52 原定撤銷日與 NTA 評估公共服務義務。本次未追查各路最後是否有替代商業／PSO 服務接手，不能推斷整個走廊從此無車。
- UK DRT：SUPPORTED。https://www.uwe.ac.uk/news/demand-responsive-transport ，2026-01-23 研究團隊發布，18 個英格蘭試辦的地方政府認為改善可及性；仍面臨補貼與成本問題。「成功」是此處的認知與社會價值判準，不是全數損益兩平。
- 美國補助：SUPPORTED 原理，但原稿未列專門來源。補 https://www.transit.dot.gov/rural-formula-grants-5311 及 https://www.dot.state.mn.us/transit/intercity-bus-grant.html 。州可用 5311(f) 支援 intercity bus、透過競爭補助路線，不能概括為所有州都採相同委外方式。

修正文：有商業服務因財務退出，以及公共補助／DRT 的替代工具；低上車量本身不能判定 6670 湖區站點應撤，需同時看下車、路段需求、成本與公共服務義務。

### F12 潛在需求與放棄搭乘

**CONFIRMED-WITH-CAVEAT。**

首爾研究：SUPPORTED。https://trid.trb.org/View/2781311 web 首次可讀書目，之後 timeout；出版者 https://www.sciencedirect.com/science/article/pii/S1077291X26000299 可讀搜尋索引長摘要與段落，直接 open 403。題名 City-scale unmet bus demand modeling with passenger reneging behavior，2026，doi:10.1016/j.jpubtr.2026.100175。明列用 smart-card 估 latent unmet demand、依等候時間建模 reneging，忽略行為會系統性錯估。這是模型估計，不是用刷卡辨識每位放棄旅客。資料僅首爾都會 2022-06-07 至 10 四個平日，不能直接搬參數到 6670。

「MIT 課程指出……」：NOT SUPPORTED，原稿未列課程、講義頁碼或網址，本次搜尋未定位此特定引文。原理已有 Pittsburgh／首爾研究足夠支持，刪掉無出處的 MIT 歸因。

修正文：未上車者無直接票證事件，可依假設建立模型估計，但需要容量、候車與放棄行為等外部校準，不能把模型結果當真值。

### F13 申訴與退款

**WRONG，以現有來源不能成立其普遍性主張。**

「FlixBus／Megabus 常見抱怨集中於延誤、客服與退款」：NOT SUPPORTED。原清單沒有 Megabus 申訴樣本、具代表性的分類統計或監理調查；FlixBus 客服政策不是客訴分布證據。論壇／評論可證明有人抱怨，不能證明整體最常見問題。

修正文：延誤與退款是可研究的服務問題；尚未驗證兩家業者的客訴分布。同站刷卡與付費也不能自行等同錯扣款、退款需求或申訴，需原始交易與事件紀錄。

## B. 車滿天花板獨立重算

### 數據與定義

**數字 CONFIRMED；「近滿座」命名與容量解釋 CONFIRMED-WITH-CAVEAT。**

SQLite 以 `python3 -I`、`sqlite3.connect('file:…/trips.db?mode=ro', uri=True)` 唯讀開啟。共 1,800,910 筆；同站、缺下車時間與區間長度不在 180–14,400 秒者剔除後有 1,786,330 筆。依 vehicle 與 board_date 分組，unix seconds 已是時間軸，沒有加 8 小時後再比較事件；只在檢驗本地日期時使用 UTC+8。有效紀錄 board_date 與 UTC+8 上車日期不符者為 0。

每筆上車 +1、下車 -1，按 timestamp 排序。同秒先下後上，再用 id 穩定排序。在正向增量後第一次出現負向增量時，記下當時累積重疊數與最後上車站。這是票證重疊區間峰值，沒有把 43 寫入演算法。時間戳涵蓋全部 60 種秒值，不是資料全部四捨五入到整分鐘。用同秒事件淨額重算完全相同，排除了本資料中的同秒排序敏感性。

### 原數字逐一重現

| 局部峰值人數 | 重算次數 | 原稿 | 判定 |
|---:|---:|---:|---|
|40|1,643|1,643|CONFIRMED|
|41|1,510|1,510|CONFIRMED|
|42|1,130|1,130|CONFIRMED|
|43|776|776|CONFIRMED|
|44|161|161|CONFIRMED|
|45|85|85|CONFIRMED|

43→44 減少 `(776-161)/776 = 79.2526%`。41–43 合計 3,416，涵蓋 654 個上車日期。

| 最後一筆增加負載的上車站 | 41–43 峰值次數 |
|---|---:|
|高鐵臺中站|1,215|
|埔里站|1,072|
|暨南大學校內|258|
|日月潭|253|
|崎下|198|
|魚池|129|
|九族文化村|105|
|臺中|42|
|暨南大學|39|
|桃米坑|34|
|大雁|33|
|牛耳石雕公園|24|
|日月老茶廠|12|
|向山行政中心|1|
|水社|1|

依 `calendar.json` 的 `days[date].rest`：上班日 1,950；休息日 1,466，全部日期都有分類。這是事件數，不是各組滿車率；未用兩組營運班次數作分母。

### 替代事件定義與敏感度

| 定義 |40|41|42|43|44|45|43→44 減少|
|---|---:|---:|---:|---:|---:|---:|---:|
|原定義，最長 4 小時|1,643|1,510|1,130|776|161|85|79.25%|
|同秒先合併淨增量|1,643|1,510|1,130|776|161|85|79.25%|
|每車日只留最高峰|970|999|820|591|135|74|77.16%|
|每段負載回到 0 才切開，段內只留最高峰|1,382|1,271|989|666|139|75|79.13%|
|最長 2 小時|1,040|947|718|476|57|33|88.03%|
|最長 3 小時|1,641|1,504|1,126|774|160|85|79.33%|
|最長 6 小時|1,643|1,510|1,131|775|162|85|79.10%|
|排除所有混支線車日|323|306|215|127|18|7|85.83%|

最長 5 小時重算也維持 43=776、44=161。每車日最高峰的 41–43 事件降至 2,410、646 日期；排除混支線後是 648、352 日期。因此「3,416 次近滿」不能直接轉成 3,416 班、車日或獨立暴露事件。2 小時上限會刪除合法長途／壅塞旅程，不能因斷崖更深就選它當較好方法。

全資料共有 22,879 個 vehicle-day，其中 13,640 個混支線，比例 59.618%，四捨五入一位小數是 **59.6%，原稿 59.7% 未在此分母重現**。若作者採另一分母需補定義；這個小差異不影響主要結論。跨支線同時有有效旅次的事件很少，獨立切 vehicle-day-subroute 後 40–45 直方圖完全相同，見下表。混支線「同一天有多條」不等同「同一時刻資料錯合」。

| 支線，分開掃描 |40|41|42|43|44|45|43→44 減少|
|---|---:|---:|---:|---:|---:|---:|---:|
|6670A|400|373|266|214|76|47|64.49%|
|6670B|148|165|150|115|20|6|82.61%|
|6670D|713|626|445|259|46|21|82.24%|
|6670F|230|208|192|163|17|10|89.57%|
|6670H|152|138|77|25|2|1|92.00%|
|6670E|0|0|0|0|0|0|樣本不支持此區間判讀|

所有有足夠高負載資料的支線方向相同，但幅度不同；H 的 25→2 很小，不宜單獨下強推論。觀測到 119 個 vehicle 識別值，77 個至少有一次 41–43 峰值，48 個至少有一次 >43 峰值；不是只集中在一個異常識別碼。最大重疊數為 70，顯示尚有需要稽核的尾部，不能未檢查就把所有 ≥44 記錄刪為雜訊。

### 約 43 席是否合理

**CONFIRMED-WITH-CAVEAT，只能說合理，不能說核定容量已證實。**

已搜尋 `南投客運 6670 43 座`、`日月潭線 43 座`、`南投客運 RK8 43`、`6670 45座` 與座位數等組合。沒有找到可將本資料 vehicle 一一連到 2024–2025 核定可售席數的官方車隊名冊。

有具體車型線索：https://zh.wikiversity.org/wiki/南投客運 。已開啟，頁面列 HINO RK2ARXA-PJF 馨盛六期一般型乘客座位 43 席、大復康 37 席；另列 RK8JRVA-KJF 一般型 42 席、大復康 38 席。這是社群編輯資料，只能列為未經官方核實的車型線索；不能用它完成容量驗證。底盤型號也不唯一決定車體內裝座位數。需注意乘客座位與含駕駛總座位的差別。

南投客運官方 https://www.ntbus.com.tw/tour-sml.html 及 https://ntbus.com.tw/news.html 搜尋內容另列 2026 年部分九人座班次；https://ntbus.com.tw/well.html 有無障礙車資訊。這證明目前不能假設全線所有班次同一容量，卻不能反推 2024–2025 已有同樣小車配置。

### 斷崖是否可能是方法假象

數值斷崖不是單純由「一班多個局部峰值」、4 小時任意上限、同秒事件排序或混支線分組造成。它在多個定義仍存在，且程式未設 43 上限，這使容量限制假說比單看原直方圖更可信。

但因果仍未識別。刷卡覆蓋率、非票證旅客、現金／套票、延遲上下車刷卡、車機與實體車對應、多種車型混合、保留座配額或原始資料產製流程，都可能改變票證峰值。即使真車有 43 席，也不能保證票證第 43 人就對應最後一個可售座位。37／38／42／43 等容量混合也可能產生複合形狀。

同站與 <180 秒篩選亦會漏掉真實在車旅客，結果不是完整人口；「負載回零」只是有效票證區間回零，不是實際車輛抵達端點。每日分組會切斷跨日旅程，新班次 ID 與方向仍未取得。各種敏感度試驗共用同一份上游資料，無法排除上游清洗或車機編碼造成的共同偏差。

**應替換原稿的結論：**

> 有效票證旅次重疊數的局部峰值在 43→44 人處減少 79.25%，且在不同事件定義、時長上限與支線切分下仍可見下降。這與約 43 席車輛的容量限制相容，但尚未取得逐車座位、票證覆蓋率與班次驗證，故 41–43 應稱高負載代理事件，不能直接稱滿座、拒載班次或拒載人數。≥44 亦不可全部預先歸類雜訊。

## 建議作者優先修正

1. 保留重現成功的數字，把「近滿座」改成「41–43 筆有效票證重疊的高負載峰值」，59.7% 改 59.6% 或補上另一分母。
2. 用官方 6670 客滿公告替代 Dcard 廁所討論；將外國分段配額等未查證方案標成作者建議。
3. EU 加上 250 公里、terminal、發車延誤及 PRM 通知條件；退款／改運、餐飲與額外補償分清楚。
4. ETF 年份與 UK 12.4% 日期補正；F8 精確拆分受訪者歸因，F13 刪除無統計支持的「常見集中」說法。
5. 下一個必要驗證是 2024–2025 車牌／車機／核定座位對照，以及真實班次、售票與拒載紀錄；此時不應花力氣微調 43 的門檻來製造容量真值。


## 附錄一：原 Sources 清單逐網址取用與判定

所有原始網址均實際嘗試開啟。SUPPORTED 只針對相關敘述，不代表整個網站皆可信；細節以各節為準。

|序號|原網址|來源判定|實際取用與限制|
|---:|---|---|---|
|1|https://info.winnipegtransit.com/open-data/pass-ups|SUPPORTED|urllib 正文可讀，web timeout；按鈕資料不含拒載人數|
|2|https://buzzer.translink.ca/2026/06/service-increases-led-to-fewer-pass-ups-last-year/|SUPPORTED|機關官方文章；擁擠班次比例|
|3|https://datamade-metro-pdf-merger.s3.amazonaws.com/2025-0642.pdf|SUPPORTED|PDF 下載並轉文字；六家比較樣本|
|4|https://amp.cbc.ca/news/canada/calgary/calgary-full-buses-leaving-riders-behind-1.7408981|SUPPORTED|CBC 資訊公開報導，非直接機關資料|
|5|https://arxiv.org/abs/2208.06372|SUPPORTED|作者論文摘要可讀|
|6|https://www.legislation.gov.uk/eur/2011/181/contents/data.html|PARTLY|目錄可讀；另開法條，UK 修法版本需注意|
|7|https://www.bmv.de/SharedDocs/EN/Articles/StV/Roadtraffic/rights-passengers-travelling-bus-and-coach.html|UNREACHABLE|多次失敗；由法規本身替代|
|8|https://support.flixbus.com/global/en/delays-and-cancellations|PARTLY|客服有未滿 2 小時說法，需合併法律條件|
|9|https://www2.postauto.ch/en/help-and-contact/customer-service/timetable|SUPPORTED|對時與有限等待範圍確認|
|10|https://www.postauto.ch/en/timetable-central-alps-passes|SUPPORTED|指定山口轉乘保證確認|
|11|https://s.kosokubus.com/column/en/?detail309|NOT SUPPORTED|重導為準備中，未提供原主張內容|
|12|https://www.chuo-bus.co.jp/airport.en/manner|SUPPORTED|業者支持 2008-06-01 安全帶規定|
|13|https://laws.gov.taipei/Law/File/0000063394|UNREACHABLE|ODT 附件可下載但未抽得本文；另以全國法規核實|
|14|https://uptogo.com.tw/?p=1726809|PARTLY|文章有不賣站票說法，屬非官方旅遊文|
|15|https://www.dcard.tw/f/travel/p/228143012|NOT SUPPORTED|讀到廁所討論，未支持排隊／站票|
|16|https://udn.com/news/story/7266/9137737|PARTLY|可讀新聞，僅政策研議非施行證據|
|17|https://fermanaghherald.com/2022/06/bus-eireann-apologises-for-dublin-cancellations|SUPPORTED|直連封鎖，最後搜尋取得完整報導與業者回應|
|18|https://www.travelextra.ie/bus-eireann-withdraws-three-expressway-services/|SUPPORTED|web 可讀，三項服務含部分路段|
|19|https://www.cpt-uk.org/news/cpt-calls-for-government-action-to-make-it-easier-to-hire-bus-and-coach-drivers/|SUPPORTED|2025-10-20；12.4% 為 coach|
|20|https://www.etf-europe.org/sector/road-transport/driving-and-rest-time|PARTLY|入口頁，精確數字補 ETF 報告|
|21|https://www.fmcsa.dot.gov/regulations/americans-disabilities-act-reporting-and-other-requirements-over-road-bus-companies|SUPPORTED|web 可讀；適用業者類型不可省略|
|22|https://www.kunc.org/2024-01-22/bus-stations-around-the-country-are-closing-leaving-waiting-riders-without-shelter|PARTLY|NPR 逐字稿支持關站，未支持完整身障歸因|
|23|https://www.planetizen.com/news/2025/02/134304-intercity-bus-ridership-grows-despite-service-cuts|PARTLY|轉述 Chaddick，不是研究原文|
|24|https://www.masstransitmag.com/technology/passenger-info/mobile-applications/press-release/21264389/bytemark-inc-bytemark-makes-it-easy-to-share-bus-occupancy-info-with-capmetro-riders|SUPPORTED|2022 廠商新聞稿，非現在功能保證|
|25|https://github.com/mbta/gtfs-documentation/blob/master/reference/gtfs-realtime.md|SUPPORTED|官方 GitHub；僅部分路線車輛|
|26|https://sltrib.com/news/environment/2020/06/27/zion-shuttle-returning|SUPPORTED|疫情新聞，另用 NPS 補一手|
|27|https://www.nationalparkstraveler.org/node/26972|UNREACHABLE|503／timeout，改用 NPS 與聽證紀錄|
|28|https://www.uwe.ac.uk/news/demand-responsive-transport|SUPPORTED|研究團隊一手發布，成功含地方認知|
|29|https://trid.trb.org/View/2781311|SUPPORTED|書目可讀，後續 timeout；出版者索引補摘要|

## 附錄二：實際執行的本機驗證程式

下列程式皆為本次自行撰寫。執行命令為 `python3 -I /tmp/foreign-verifier/check.py` 及 `python3 -I /tmp/foreign-verifier/extra.py`。唯讀資料庫；寫出本機彙整檔，不傳網路。

### 主程式

```python
import sqlite3,json,collections,pathlib
P='/tmp/claude-1000/-home-zup-code-esg-hackathon-bus-2026/e3280782-e84b-4051-8849-189e12c5a845/scratchpad/'
c=sqlite3.connect('file:'+P+'trips.db?mode=ro',uri=True)
rows=c.execute('select vehicle,board_date,board_ts,alight_ts,board_stop,alight_stop,subroute,id from trips').fetchall()
cal=json.load(open('/home/zup/code/esg-hackathon-bus-2026/public/data/lab/visualization/calendar.json'))['days']
groups=collections.defaultdict(list)
for v,d,b,a,s,e,r,i in rows:groups[v,d].append((b,a,s,e,r,i))
mixed={k for k,g in groups.items() if len({r[4] for r in g})>1}
print('rows',len(rows),'vehicle_days',len(groups),'mixed',len(mixed),len(mixed)/len(groups))
def calc(cap=14400,mode='individual',split=False,onlypure=False,daily=False):
 hist=collections.Counter(); stops=collections.Counter(); rests=collections.Counter(); dates=set(); per=collections.defaultdict(collections.Counter); n=0; maxval=0
 for k,g in groups.items():
  if onlypure and k in mixed:continue
  gs=collections.defaultdict(list)
  for b,a,s,e,r,i in g:
   if a is not None and s!=e and 180<=a-b<=cap:
    gs[r if split else 'all'].extend([(b,1,s,r,i),(a,-1,e,r,i)])
  for route,ev in gs.items():
   ev.sort(key=lambda x:(x[0],x[1],x[4]))
   peaks=[]; occ=0; prev=0; last=None
   if mode=='aggregate':
    by=collections.defaultdict(list)
    for x in ev:by[x[0]].append(x)
    events=[]
    for t,xx in sorted(by.items()):
     delta=sum(x[1] for x in xx)
     if delta:events.append((t,delta,xx[-1][2],xx[-1][3],0))
   else:events=ev
   for t,delta,s,r,i in events:
    if delta<0 and prev>0:peaks.append((occ,last))
    occ+=delta;prev=delta
    if delta>0:last=(s,r)
   if daily and peaks:peaks=[max(peaks,key=lambda p:p[0])]
   for val,loc in peaks:
    hist[val]+=1;per[route][val]+=1;maxval=max(maxval,val)
    if 41<=val<=43:
     n+=1;dates.add(k[1]);stops[loc[0]]+=1;rests[str(cal.get(k[1],{}).get('rest','MISSING'))]+=1
 return dict(hist={x:hist[x] for x in range(35,51)},near=n,dates=len(dates),stops=stops,rest=rests,max=maxval,subroutes={r:{x:h[x] for x in range(40,46)} for r,h in per.items()})
out={}
for name,kw in [('baseline',{}),('aggregate',{'mode':'aggregate'}),('daily',{'daily':True}),('2h',{'cap':7200}),('3h',{'cap':10800}),('6h',{'cap':21600}),('pure',{'onlypure':True}),('subroute',{'split':True})]:
 out[name]=calc(**kw);print(name,json.dumps(out[name],ensure_ascii=False))
pathlib.Path('/tmp/foreign-verifier/results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
```

### 額外獨立事件與品質檢查

```python
exec(open('/tmp/foreign-verifier/check.py').read().split('out={}')[0])
h=collections.Counter(); vh=collections.defaultdict(collections.Counter); durations=collections.Counter();seconds=collections.Counter();valid=0;cross=0;datebad=0;overlapmixed=0
from datetime import datetime,timezone,timedelta
for k,g in groups.items():
 ev=[]
 for b,a,s,e,r,i in g:
  if a is not None and s!=e and 180<=a-b<=14400:
   valid+=1;seconds[b%60]+=1
   if datetime.fromtimestamp(b,timezone(timedelta(hours=8))).date().isoformat()!=k[1]:datebad+=1
   ev.extend([(b,1,r),(a,-1,r)])
 ev.sort(key=lambda x:(x[0],x[1]));occ=0;peak=0;active=collections.Counter();prev=0
 for t,delta,r in ev:
  if delta<0 and prev>0:vh[k[0]][occ]+=1
  if delta>0:active[r]+=1
  else:active[r]-=1
  occ+=delta;peak=max(peak,occ)
  if len([v for v in active.values() if v>0])>1:overlapmixed+=1
  if occ==0 and peak:h[peak]+=1;peak=0
  prev=delta
print('VALID',valid,'DATE_BAD',datebad,'mixed route concurrent events',overlapmixed,'unique vehicles',len(vh),'second values',len(seconds))
print('connected zero separated maxima',{x:h[x] for x in range(40,46)})
print('vehicles with near peak',sum(any(v[x] for x in range(41,44)) for v in vh.values()),'with >43',sum(any(n>43 and z for n,z in v.items()) for v in vh.values()))
print('top vehicle near counts',sorted([sum(v[x] for x in range(41,44)) for v in vh.values()],reverse=True)[:10])
print('5h',calc(cap=18000)['hist'])
```

### 額外程式實際輸出

```text
rows 1800910 vehicle_days 22879 mixed 13640 0.596179902967787
VALID 1786330 DATE_BAD 0 mixed route concurrent events 64 unique vehicles 119 second values 60
connected zero separated maxima {40: 1382, 41: 1271, 42: 989, 43: 666, 44: 139, 45: 75}
vehicles with near peak 77 with >43 48
top vehicle near counts [287, 261, 245, 225, 214, 203, 171, 169, 156, 137]
5h {35: 2832, 36: 2568, 37: 2092, 38: 1649, 39: 1655, 40: 1644, 41: 1510, 42: 1130, 43: 776, 44: 161, 45: 85, 46: 72, 47: 46, 48: 29, 49: 36, 50: 33}
```
