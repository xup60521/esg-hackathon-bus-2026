# 係數與邊界查證紀錄

本輪只查主管機關及 GHG Protocol 官方資料。來源「存在」不代表足以支持某個合成係數。下表分開列出能讀到的公告與模型是否採用，不宣稱通過 GHG Protocol 查證。

| 項目 | 查證結果、年份與單位 | 模型處置與邊界 |
| --- | --- | --- |
| 柴油 2.6974 | 未核實此 kg CO2e/L 合成值。環境部 2024-02-05 公告附表一之移動燃燒列 CO2 74,100 kg/TJ、CH4 3.9 kg/TJ、N2O 3.9 kg/TJ | 降為 assumption，year/sourceUrl 為 null。公告是燃燒階段 TTW 的各氣體質量係數，不是每公升 CO2e；尚須低位熱值與適用 GWP，不把 2.606 CO2/L 當完整 CO2e |
| 汽油 2.36 | 未核實此 kg CO2e/L 合成值。同公告移動燃燒 CO2 69,300 kg/TJ；CH4/N2O 按車輛技術分類 | 降為 assumption，year/sourceUrl 為 null，模型目前未直接使用。不能用單一汽油 CO2 值代表所有車種 CO2e |
| 電力 0.494 | 能源署 112 年度，即 2023 年，kg CO2e/kWh | 公用售電購電所承擔燃料燃燒間接排放，不是全生命週期；不稱最新，不作預設 |
| 電力 0.474 | 能源署 113 年度，即 2024 年，kg CO2e/kWh | 預設固定年度示範值，status official，但不代表 2024–2025 歷史盤查或充電契約適用性已確認。並非 TTW 或 WTW；它是購電間接燃料燃燒邊界 |
| 2025 年電力新資料 | 商業發展署 2026-06-02 官網頁列 0.467 kg CO2e/kWh，產業盤查 0.466，住宅 0.471 | 已核對正文；證明 2023 年非最新。展示仍固定 2024 年，不默認以新年度替換歷史能源資料。後續先確認契約類型與申報規則 |
| 小客車 0.145 | 無逐項可重算且邊界一致的官方證據，kg CO2e/pkm | assumption，年份與來源 null，boundary scenario-unknown；刪除「11.5 km/L、1.48 人可導得官方 0.145」的錯誤說法 |
| 機車 0.055 | 未核實 kg CO2e/pkm 及承載率、車種、年份 | assumption，非官方、非實測 |
| 其他公共運輸 0.038 | 未核實跨鐵路/高鐵加權、活動量及系統邊界 | assumption，不能冒稱鐵路報告平均或 WTW |
| 分流 48/24/16/12 | 未找到支持此比例的觀光署問卷原文 | 全部是可調情境，未估計旅客實際反應，不稱問卷校準 |
| 柴油油耗 3.2、電耗 0.95、空駛倍率 1.08 | 未核實本車隊，單位依序 km/L、kWh/km、無量綱 | 全部是可調展示假設，不稱營運實測 |

環境部公告全文已讀取，PDF 第 7 頁，即內文頁 5 的移動燃燒表，並核對 CO2 與 CH4/N2O 分列。公告不是原版聲稱的「2024 年 6.4 版」。本輪不逕行補猜每公升熱值及 GWP 組合。

- [環境部 2024-02-05 溫室氣體排放係數公告，精確 PDF](https://ghgregistry.moenv.gov.tw/upload/Tools/AI/113%E5%B9%B42%E6%9C%885%E6%97%A5%E5%85%AC%E5%91%8A%E6%BA%AB%E5%AE%A4%E6%B0%A3%E9%AB%94%E6%8E%92%E6%94%BE%E4%BF%82%E6%95%B8.pdf)
- [環境部下載入口，公告日期與版本對照](https://ghgregistry.moenv.gov.tw/epa_ghg/Downloads/FileDownloads.aspx)
- [能源署 112 年度電力排碳係數](https://www.moeaea.gov.tw/ecw/populace/content/wHandMenuFile.ashx?file_id=16499&menu_id=26391)
- [能源署 113 年度電力排碳係數](https://www.moeaea.gov.tw/ecw/populace/content/wHandMenuFile.ashx?file_id=16728)
- [商業發展署 2025 年電力係數官方正文](https://serv.gcis.nat.gov.tw/biznetzero/Opendata/Index?id=da4d8c97c34e4b32b49c38b8cc61f8a9)

取用限制：112/113 年能源署 PDF 的官方搜尋索引可讀取數值、單位及適用範圍，但本輪直接 open 皆回覆 403，不能聲稱已下載原檔。2025 年商業發展署 HTML 正文可直接讀取。未查得的因子保持 assumption，不用一般官網首頁冒充逐項依據。

避免排放僅是獨立情境比較。GHG Protocol 2022 年 Scope 3 FAQ 第 19 頁要求與 Scope 1/2/3 分別報告；不得列入或扣減 Scope 3，亦不得抵扣 Scope 1/2。本模型燃油與運具因子邊界未確認，因此更不能把示範差額當已證明的氣候效益。[官方 FAQ PDF](https://ghgprotocol.org/sites/default/files/standards_supporting/Scope%203%20Detailed%20FAQ.pdf)
