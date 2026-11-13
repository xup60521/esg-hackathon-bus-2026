/**
 * 站點對照：官網時刻表站名、歷史刷卡資料站名與口語別名。
 * 官網站名取自時刻表頁（2026-11-04 擷取）；歷史站名取自 public/data/midstop.json。
 * 「埔里」「暨南大學」等泛稱可對應多站，回答時須揭露。
 */

export type StopDef = {
	/** 顯示名稱 */
	label: string;
	/** 官網時刻表站名（可多個，依優先序） */
	tt: string[];
	/** 歷史刷卡資料站名 */
	hist: string[];
	/** 額外口語別名（正規化後比對）；tt 站名會自動加入 */
	aliases: string[];
	/** 別名涵蓋多站時的說明 */
	ambiguity?: string;
};

export const norm = (s: string) =>
	s.normalize("NFKC").toLowerCase().replace(/臺/g, "台").replace(/\s+/g, "");

export const STOPS: StopDef[] = [
	{
		label: "台中航空站",
		tt: ["台中航空站"],
		hist: ["台中航空站"],
		aliases: ["台中機場", "台中國際機場", "清泉崗", "機場"],
	},
	{
		label: "臺中干城站",
		tt: ["臺中干城站"],
		hist: ["臺中"],
		aliases: ["干城", "台中干城", "台中客運站", "台中"],
		ambiguity:
			"「台中」以起點臺中干城站計；高鐵臺中站、臺中車站(民族路口)是不同停靠站。",
	},
	{
		label: "臺中車站(民族路口)",
		tt: ["臺中車站(民族路口)"],
		hist: [],
		aliases: ["台中火車站", "台中車站", "台鐵台中"],
	},
	{
		label: "民興公園(執行分署)",
		tt: ["民興公園(執行分署)"],
		hist: [],
		aliases: ["民興公園", "執行分署"],
	},
	{
		label: "捷運大慶站",
		tt: ["捷運大慶站"],
		hist: [],
		aliases: ["大慶站", "大慶"],
	},
	{
		label: "高鐵臺中站",
		tt: ["高鐵臺中站"],
		hist: ["高鐵臺中站"],
		aliases: ["高鐵", "高鐵站", "高鐵台中", "烏日高鐵"],
	},
	{ label: "埔里遊客中心", tt: ["埔里遊客中心"], hist: [], aliases: [] },
	{
		label: "牛耳石雕公園",
		tt: ["牛耳石雕公園"],
		hist: ["牛耳石雕公園"],
		aliases: ["牛耳"],
	},
	{ label: "崎下", tt: ["崎下"], hist: ["崎下"], aliases: [] },
	{ label: "大成國小", tt: ["大成國小"], hist: [], aliases: [] },
	{ label: "榮民醫院", tt: ["榮民醫院"], hist: [], aliases: ["榮民診所"] },
	{ label: "埔里酒廠", tt: ["埔里酒廠"], hist: [], aliases: ["酒廠"] },
	{ label: "仁愛公園", tt: ["仁愛公園"], hist: [], aliases: [] },
	{
		label: "中台禪寺",
		tt: ["中台禪寺"],
		hist: [],
		aliases: ["中台世界博物館"],
	},
	{
		label: "福興溫泉遊客中心",
		tt: ["福興溫泉遊客中心"],
		hist: [],
		aliases: ["福興溫泉"],
	},
	{ label: "地理中心碑", tt: ["地理中心碑"], hist: [], aliases: [] },
	{
		label: "埔里站",
		tt: ["埔里站"],
		hist: ["埔里站"],
		aliases: ["埔里轉運站", "埔里"],
		ambiguity: "「埔里」在此以埔里站（轉運站）計；埔里遊客中心是另一個停靠站。",
	},
	{
		label: "暨南大學",
		tt: ["暨南大學(校內)", "暨南大學(校外)"],
		hist: ["暨南大學校內", "暨南大學"],
		aliases: ["暨大", "暨南"],
		ambiguity:
			"暨南大學分校內、校外兩個停靠站，各班不一定都停；此處取該班有停靠的站。",
	},
	{
		label: "桃米坑(紙教堂)",
		tt: ["桃米坑(紙教堂)"],
		hist: ["桃米坑"],
		aliases: ["紙教堂", "桃米"],
	},
	{
		label: "大雁(澀水社區)",
		tt: ["大雁(澀水社區)"],
		hist: ["大雁"],
		aliases: ["澀水"],
	},
	{ label: "新城國小", tt: ["新城國小"], hist: [], aliases: [] },
	{ label: "三育神學院", tt: ["三育神學院"], hist: [], aliases: [] },
	{ label: "經典驛棧", tt: ["經典驛棧"], hist: [], aliases: [] },
	{ label: "晶園渡假村", tt: ["晶園渡假村"], hist: [], aliases: [] },
	{
		label: "九族文化村(部分班次停靠)",
		tt: ["九族文化村(部分班次停靠)"],
		hist: ["九族文化村"],
		aliases: ["九族"],
	},
	{ label: "魚池", tt: ["魚池"], hist: ["魚池"], aliases: [] },
	{
		label: "日月老茶場",
		tt: ["日月老茶場"],
		hist: ["日月老茶廠"],
		aliases: ["日月老茶廠", "老茶廠", "老茶場"],
	},
	{
		label: "日月潭",
		tt: ["日月潭"],
		hist: ["日月潭"],
		aliases: ["日月潭站", "日月潭遊客中心"],
	},
	{
		label: "水社",
		tt: ["水社"],
		hist: ["水社"],
		aliases: ["水社碼頭", "水社遊客中心"],
	},
	{
		label: "向山行政中心(部分班次停靠)",
		tt: ["向山行政中心(部分班次停靠)"],
		hist: ["向山行政中心"],
		aliases: ["向山", "向山遊客中心", "向山行政中心"],
	},
];

const withoutParen = (s: string) => s.replace(/[(（].*?[)）]/g, "");

export type StopMention = { stop: StopDef; index: number; alias: string };

const ALIAS_TABLE: { alias: string; stop: StopDef }[] = STOPS.flatMap(
	(stop) => {
		const names = [
			...stop.tt,
			stop.label,
			...stop.aliases,
			...stop.tt.map(withoutParen),
			withoutParen(stop.label),
		]
			.map(norm)
			.filter(Boolean);
		return [...new Set(names)].map((alias) => ({ alias, stop }));
	},
).sort((a, b) => b.alias.length - a.alias.length); // 長名優先，避免「埔里」吃掉「埔里遊客中心」

/** 依出現位置回傳站點提及（每段文字只被一個站名佔用）。 */
export function findStops(query: string): StopMention[] {
	// 路線名不是站名：先遮蔽，避免「日月潭線」被當成日月潭站
	const q = norm(query).replace(
		/日月潭環湖線|日月潭機場線|日月潭線|埔里線|機場線/g,
		(m) => "_".repeat(m.length),
	);
	const taken = new Array(q.length).fill(false) as boolean[];
	const hits: StopMention[] = [];
	for (const { alias, stop } of ALIAS_TABLE) {
		let from = 0;
		for (;;) {
			const i = q.indexOf(alias, from);
			if (i < 0) break;
			from = i + alias.length;
			if (taken.slice(i, i + alias.length).some(Boolean)) continue;
			taken.fill(true, i, i + alias.length);
			hits.push({ stop, index: i, alias });
		}
	}
	return hits.sort((a, b) => a.index - b.index);
}
