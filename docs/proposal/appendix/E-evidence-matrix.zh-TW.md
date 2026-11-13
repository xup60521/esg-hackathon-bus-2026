# 附錄 E｜功能與先例證據矩陣

查證日期 2026-11-11。強度僅指所述功能的證據，不能推論成效或適用 6670。原頁未直接核對的索引可能過時；詳見[先例重新查證](../drafts/precedent-check.zh-TW.md)。

| 元件與來源 | 頁面日期 | 查證狀態與強度 | 本案檢驗及撤回條件 |
|---|---|---|---|
| [TfL 不完整旅程退款](https://tfl.gov.uk/how-to-pay/refunds/apply-for-incomplete-journey-refund) | 未載 | 官方先例：符合條件可退最高票價，多數自動處理；公車通常僅上車刷卡，制度不可直接移植 | Q0 須由票證方核實差額、退款管道及適用規範 |
| [溫尼伯司機過站按鍵](https://info.winnipegtransit.com/en/open-data/pass-ups/) | 未載 | 直接核對，強：司機記錄滿車及輪椅乘客無法上車，位置可能不精確 | 與獨立觀察比較召回和誤報；依 G 的 H1 三態規則判定 |
| [和欣空位查詢](https://www.ebus.com.tw/OrderTickets)；[日本 Sokko-bus](https://news-archive.val.co.jp/topics/2021/091701.html) | 未載；2021-09-17 | 直接核對，強：分別提供空位查詢及乘車狀況管理；未證實 6670 站牌三級顯示 | 核對三級顯示與錯報、漏報；不準確則撤回可靠提示主張 |
| [南投客運保留十席](https://www.ntbus.com.tw/tour-sml.html?fid=9898) | 2023-12-11 | 僅搜尋索引及轉載，弱：未直接核對原頁；路線編號、每班適用與現況待業者確認 | 量目標站及上游事件；有傷害依護欄減配或暫停 |
| [韓國 MiRi](https://www.molit.go.kr/mta/USR/WPGE0201/m_37203/DTL.jsp)；[韓國 2024 官方資料](https://molit.go.kr/2024plan_traffic/news/bodo_2.pdf) | 未載；2024 | MiRi 原頁僅索引；2024 文件直接支持預約及中途站發車。混合制、未上車不扣款均為待確認設計 | 向業者及主管機關核實票務與公平規則，未確認前不稱既有制度 |
| [交通部 2012 DRT](https://www.motc.gov.tw/uploaddowndoc?file=news%2F201206071643430.pdf&flag=doc)；[觀光署幸福巴士](https://www.tad.gov.tw/m1.aspx?sNo=0043750)；[公路局名間幸福巴士](https://www.thb.gov.tw/News.aspx?_CSN=4199&n=10738&sms=13903) | 2012-06-07；更新 2026-01-22；表列 2026-04-08 | 官方資料，強；2012 是舊資料，2026 為其他地方彈性預約服務，均不證明 6670 已獲加班許可 | 以實際需求、車司、空駛及碳檢驗；未獲許可不派車 |
| [TDX](https://tdx.transportdata.tw/data-service/basic)；[GTFS-RT](https://gtfs.org/documentation/realtime/reference/) | 未載 | 直接核對，強：動態資料與可選擁擠欄位；不證明本線有載客資料 | 以獨立逐班核對上游規則，無增益撤回預警優勢主張 |
| [南投客運 FAQ](https://www.ntbus.com.tw/callus.html)；[無障礙車](https://ntbus.com.tw/well.html) | 未載；時刻表自 2022-10-11 | 僅搜尋索引，弱：FAQ 稱網路預約、無人工電話預約；無障礙服務來電預約不可推及一般訂位 | 電話及櫃台由業者確認並測試可用率，未提供不得稱已具備 |
| [NCTX 候車預告](https://apps.nctx.co.uk/stopthebus) | 未載 | 直接核對，強：App 無障礙候車預告，非電話訂位或座位保證 | 比較各管道可用率，未實測不宣稱改善 |
| [公路局過站申訴](https://www.thb.gov.tw/News_Content_table.aspx?n=87&s=47218)；[客運定型化契約](https://www.motc.gov.tw/ch/app/data/view?id=2664&module=contract&serno=202002140002)；[高速公路及快速公路交通管制規則](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=K0040019) | 2014-12-29；未載；2026-01-02 修正 | 已核對：過站不停可申訴，契約列服務電話與申訴管道；規則第 9 條第 1 項第 7 款限制大型客車在高速及快速公路載站立乘客 | 不推論滿載不停必然違規或有額滿通報義務；適用車型與路段由主管機關確認 |
| 被截斷需求與[溢出簽章](../drafts/spillover-experiment-v3.zh-TW.md) | 2026-11-11 | 歷史觀察，負對照亦為正；Tan & Ramli (2024) 已以公車智慧卡推估未上車者並以地面調查驗證（2026-11-12 已讀全文）：其事件判定用出站剩餘座位比例，計數模型輸入為連續班次上車數與班距（T1 重疊，其選站選時用途亦見於該文），未見反方向／他路線／安慰劑負對照（T2 未見）；本案不宣稱首創，不主張訊號或推估方法為新 | 合成驗證 v3 顯示本次兩個估計量不能固定換算留站人數，簽章限於挑選觀察時段；G0 在持續可見且可確認同一人時追蹤，其餘記為未知；現場檢驗設計尚待凍結（未註冊），擬檢驗兩層：(a) 司機按鍵對上游載客規則 R 的事件辨識比較，報精確率及召回；(b) 簽章分數與現場站日留站事件率的 Spearman 相關（確認性）及分層比較、相對 R 增量（探索）。反方向對照已有歷史結果，現場僅在事前清單已有反方向且資料足夠時探索。依 G 三態規則，H1／H2 判「不支持」才撤回相應主張；「證據不足」不撤回但不宣稱有效 |

各先例不代表本案已導入或已證明成效。
