import type { DataKind } from "#/components/lab/shared/tokens";

/**
 * The ten research directions from the A-007 feasibility study. `slug` is the folder name used
 * under docs/lab, scripts/lab, public/data/lab and src/features/lab; aliases cover folders that
 * were created under another name. Feasibility text paraphrases
 * .agentflow/artifacts/A-007/feasibility.zh-TW.md (2026-11-03) — it is an engineering judgement,
 * not a measured score.
 */
export type Direction = {
	n: number;
	slug: string;
	aliases?: string[];
	title: string;
	question: string;
	feasibility: string;
	/** what the data in this direction is allowed to be called */
	kinds: DataKind[];
	/** set only when the direction is known to lack required data */
	blocked?: string;
	/**
	 * Delivered once, then withheld by the integrator because review found problems; the hub shows
	 * this note instead of the report excerpt or a prototype link until a corrected delivery lands.
	 */
	hold?: string;
};

export const DIRECTIONS: Direction[] = [
	{
		n: 1,
		slug: "forecast",
		title: "旅運需求預測",
		question: "明天各方向的上車人次大概多少？比簡單基準好嗎？",
		feasibility: "歷史搭乘量預測可先做；完整需求（含未上車）需補資料。",
		kinds: ["history", "forecast"],
	},
	{
		n: 2,
		slug: "optimization",
		aliases: ["dispatch", "scheduling"],
		title: "車輛與班次配置",
		question: "維持班表、尖峰加班、中間站起駛，各方案差在哪？",
		feasibility:
			"可做受限制的情境模擬；缺班表、容量與車輛資料，不能直接產出可執行班表。",
		kinds: ["scenario"],
	},
	{
		n: 3,
		slug: "peaks",
		aliases: ["peak", "peak-offpeak"],
		title: "尖峰與離峰運量",
		question: "什麼時候、哪個方向最集中？假日差多少？",
		feasibility: "現有資料即可做，最容易產出可信結果。",
		kinds: ["history"],
	},
	{
		n: 4,
		slug: "behavior",
		title: "旅客搭乘行為",
		question: "旅客主要從哪裡上、到哪裡下？",
		feasibility: "單次旅次分析可行；卡號已移除，個人長期行為不可行。",
		kinds: ["history"],
	},
	{
		n: 5,
		slug: "occupancy",
		aliases: ["load-factor", "loadfactor"],
		title: "車輛載客率",
		question: "能不能從票證重建車內人數？提升策略有什麼證據？",
		feasibility: "策略可提；逐班載客率與改善幅度需班表、容量與歸班證據。",
		kinds: ["history", "unverified"],
	},
	{
		n: 6,
		slug: "operations",
		title: "即時營運決策（歷史回放）",
		question: "若當時有這個畫面，營運人員每個小時會看到什麼、被建議做什麼？",
		feasibility: "歷史決策原型可做；真正的即時決策取決於 GPS 與近期票證串流。",
		kinds: ["history", "forecast", "live-unavailable"],
	},
	{
		n: 7,
		slug: "assistant",
		aliases: ["service", "customer-service", "chatbot"],
		title: "旅遊資訊服務",
		question: "停靠站、票價、末班車、轉乘，能不能有來源地回答？",
		feasibility: "限定查詢範圍可做；需可靠且有更新時間的官方資訊來源。",
		kinds: ["official", "history"],
	},
	{
		n: 8,
		slug: "visualization",
		aliases: ["viz", "ticket-viz"],
		title: "票證資料視覺化",
		question: "支線、方向、時段怎麼切，才能回答營運問題並核對數字？",
		feasibility: "已有基礎；須連到具體營運問題與可核對明細。",
		kinds: ["history"],
	},
	{
		n: 9,
		slug: "tourism",
		aliases: ["attractions", "trip"],
		title: "景點與公共運輸整合",
		question: "沿線景點的去回程趕得上車嗎？末班車緩衝夠不夠？",
		feasibility: "限定沿線少量景點可做；需最新班表、步行路網與景點營業資訊。",
		kinds: ["official", "scenario"],
	},
	{
		n: 10,
		slug: "esg",
		aliases: ["carbon", "low-carbon", "emissions"],
		title: "ESG 與低碳方案",
		question: "班表情境的車公里、排放與中間站服務，各會怎麼變？",
		feasibility: "可做透明的情境估算；尚無條件宣稱實際減碳。",
		kinds: ["scenario", "official"],
	},
];

export const OPERATIONS_SLUG = "operations";
