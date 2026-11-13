import type { Source } from "#/components/lab/shared";

/**
 * Official links go to the exact documents named in docs/lab/esg/sources.zh-TW.md. "查閱" is the
 * research round of that record (the artifacts were generated 2026-11-03); nothing here claims a
 * file was downloaded when the record says the direct open returned 403.
 */
const ACCESSED = "2026-11-03";

export const SOURCES: Source[] = [
	{
		label: "能源署 113 年度（2024）電力排碳係數 — 本頁唯一的官方係數",
		url: "https://www.moeaea.gov.tw/ecw/populace/content/wHandMenuFile.ashx?file_id=16728",
		accessed: ACCESSED,
		evidence:
			"0.474 kg CO2e/kWh，購用公用售電業電力所承擔的間接燃料燃燒排放，非生命週期。固定使用 2024 年值，不是最新年度，也不代表充電契約適用性。官方搜尋索引可讀到數值與單位，直接開啟原檔回覆 403，不能聲稱已下載原檔。",
	},
	{
		label: "商業發展署 2025 年電力係數官方正文",
		url: "https://serv.gcis.nat.gov.tw/biznetzero/Opendata/Index?id=da4d8c97c34e4b32b49c38b8cc61f8a9",
		accessed: ACCESSED,
		evidence:
			"2026-06-02 官網頁列 0.467 kg CO2e/kWh（產業盤查 0.466、住宅 0.471），已核對正文，證明 0.474 不是最新。本頁未採用：歷史能源資料與申報規則未確認前，不默認替換年度。",
	},
	{
		label: "能源署 112 年度（2023）電力排碳係數",
		url: "https://www.moeaea.gov.tw/ecw/populace/content/wHandMenuFile.ashx?file_id=16499&menu_id=26391",
		accessed: ACCESSED,
		evidence:
			"0.494 kg CO2e/kWh（2023）。僅用來說明年度間會變動，不作預設。同樣只能由官方搜尋索引讀到，直接開啟回覆 403。",
	},
	{
		label: "環境部 2024-02-05 溫室氣體排放係數公告（精確 PDF）",
		url: "https://ghgregistry.moenv.gov.tw/upload/Tools/AI/113%E5%B9%B42%E6%9C%885%E6%97%A5%E5%85%AC%E5%91%8A%E6%BA%AB%E5%AE%A4%E6%B0%A3%E9%AB%94%E6%8E%92%E6%94%BE%E4%BF%82%E6%95%B8.pdf",
		accessed: ACCESSED,
		evidence:
			"PDF 第 7 頁（內文頁 5）移動燃燒表：CO2 74,100、CH4 3.9、N2O 3.9 kg/TJ（柴油）。這是燃燒階段各氣體的質量係數，不是每公升 CO2e，還需要熱值與 GWP，因此本頁的柴油 2.6974 kg CO2e/L 仍是假設，不是官方係數。",
	},
	{
		label: "環境部溫室氣體排放係數下載入口（公告日期與版本對照）",
		url: "https://ghgregistry.moenv.gov.tw/epa_ghg/Downloads/FileDownloads.aspx",
		accessed: ACCESSED,
		evidence: "用來對照公告日期與版本；公告不是原先聲稱的「2024 年 6.4 版」。",
	},
	{
		label: "GHG Protocol Scope 3 Detailed FAQ（官方 PDF）",
		url: "https://ghgprotocol.org/sites/default/files/standards_supporting/Scope%203%20Detailed%20FAQ.pdf",
		accessed: ACCESSED,
		evidence:
			"第 19 頁：避免排放須與 Scope 1/2/3 分別報告，不列入或扣減 Scope 3，也不抵扣 Scope 1/2。本頁因此把情境差額獨立呈現；且燃油與運具因子邊界未確認，更不能當作已證明的氣候效益。",
	},
	{
		label:
			"本機：授權資料庫 trips 聚合與 OSRM 路網距離（scripts/lab/esg/run-analysis.ts）",
		accessed: ACCESSED,
		evidence:
			"成功刷卡旅次聚合（不含卡號與個別旅次）；距離為 OSRM 一般 driving 兩點近似，快取正向並直接用於反向，未約束支線途經點。沒有外部網址可供第三方重算。",
	},
	{
		label:
			"本機：docs/lab/esg/{report, sources, integration, verification}.zh-TW.md",
		accessed: ACCESSED,
		evidence:
			"逐項查證、v2 整合契約與驗證紀錄。驗證紀錄記載 12 個測試、72 次斷言與產物驗證通過，但那是修正實作的自驗，不是獨立 review。",
	},
];

export const LIMITATIONS: string[] = [
	"所有排放數字都是獨立假設的展示計算，不是實際 Scope 1/2/3 盤查、淨零或減碳成果，也不是任何方案的最優或公平改善結論。",
	"柴油 CO2e 係數、小客車/機車/其他公運強度、48/24/16/12 分流、3.2 km/L、0.95 kWh/km、1.08 空駛倍率皆未用資料校準；只有電力 0.474（2024 年）標為官方，且不是最新年度。",
	"輸入車公里是獨立假設，與有紀錄日、班次或實際里程沒有推導關係；沒有實際能源、營運里程、拒載或候車資料，因此月度排放全部為無，不把全期假設分攤回月份。",
	"情境差額與基線 ÷ 展示營運只是兩組假設相減/相除，獨立於 Scope 1/2/3，不得計入 Scope 3、不得抵扣任何盤查；因子邊界未確認，也不是已證實減量。",
	"觀測量只有成功刷卡的旅次聚合（不是需求、候車或拒載），期間與有紀錄日數見上方觀測數字；「有紀錄日」不是營運日。",
	"全期人公里是以 OSRM 路網距離乘旅次的近似，不是實際搭乘距離：正反向共用距離、未約束各支線途經點（跨線 OD、暨大、九族等繞行未驗證）。同站 OD 以 0 km 計入屬於假設，不代表沒有行駛。",
	"缺距離以無呈現、不補 0；若有任何旅次缺距離，全期人公里與情境比較都不產生，只報已知部分。分母為 0 的強度與倍率顯示無。",
	"服務結構只依固定指定端點集合（臺中、高鐵臺中站、台中航空站、日月潭、水社、向山行政中心）分組，不是各支線中間站分類，也不是公平性認證；埔里對 6670H 是端點、此處列為集合外只代表集合定義。不能由 OD 推定通學、就業或觀光目的。",
	"本頁沒有政策求解，不稱最優；電動化 0/50/100% 只是三個展示點。全電巴仍有購電排放，不是零排放。",
	"資料與邏輯已由實作者查核，但仍待最終獨立 review；本頁尚未經獨立 review 背書。",
];
