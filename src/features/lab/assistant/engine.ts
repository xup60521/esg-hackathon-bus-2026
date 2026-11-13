/**
 * 6670 有限範圍問答引擎（純檢索／規則，未接任何生成模型）。
 *
 * 規則順序（先擋再答）：
 *   1. 即時／座位／預測 → 拒答（沒有該資料）
 *   2. 超出範圍（天氣、退票、其他路線、景點營業等）→ 拒答
 *   3. 票價（含起訖站組合檢查，避免把 A→B 的價格套到 C→D）
 *   4. 班表（官網表定時刻，由資料查詢回傳）
 *   5. 歷史搭乘統計（刷卡，非即時）
 *   6. 知識庫關鍵字檢索；分數過低 → 拒答
 * 每個回答都帶資料依據類別、來源與擷取日，並附 trace 供稽核。
 */
import { profile, topHours, weekdayAverages } from "./history";
import { KB, SOURCES } from "./knowledge";
import { findStops, norm, type StopMention } from "./stops";
import { dayTypeOfWeekday, type Hit, queryTrips, toMin } from "./timetable";
import type {
	Answer,
	Basis,
	Context,
	DayType,
	Direction,
	KbEntry,
	Source,
} from "./types";

const sources = (ids: string[]): Source[] => ids.map((i) => SOURCES[i]);
const WD_NAME = ["日", "一", "二", "三", "四", "五", "六"];
const DAY_LABEL: Record<DayType, string> = {
	weekday: "平日（周一~四）",
	holiday: "假日（周五~日）",
};
const DIR_LABEL: Record<Direction, string> = {
	outbound: "去程（往日月潭方向）",
	inbound: "回程（往台中方向）",
};
const MAX_ROWS = 3;
/** ISO 時間 → Asia/Taipei 日期（YYYY-MM-DD） */
export const taipeiDate = (iso: string) =>
	new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 10);

function refusal(
	headline: string,
	lines: string[],
	trace: string,
	extra: Partial<Answer> = {},
): Answer {
	return {
		kind: "refusal",
		headline,
		lines,
		basis: [],
		sources: [],
		trace,
		...extra,
	};
}

/* ───────────────────────── 1. 即時／預測／座位 ───────────────────────── */

const NOW_WORDS = /即時|實時|現在|目前|此刻|剛剛|等一下|馬上|剛才/;
const NOW_TOPIC = /位|座|客滿|滿|擠|人多|誤點|晚點|到站|在哪|塞|剩|排隊|動態/;
const REALTIME_DIRECT =
	/還有.{0,4}(位|座)|有沒有.{0,3}(位|座)|有.{0,3}(空位|位子|座位)|剩.{0,3}(位|座)|空位|(下一班|下班車|下一台).{0,8}(幾分|多久|到站|何時到|什麼時候到|位|座)|誤點|晚點|車子在哪|公車在哪|車在哪|到站時間|還要等多久|要等多久|即時/;
const FORECAST =
	/會不會(客滿|很多人|很擠|太擠|滿)|預測|預估|明天.*(客滿|人多|擠)|(明天|週末|周末|假日).*(滿|擠).*嗎/;

function checkRealtime(q: string): Answer | null {
	// 「ibon 票有沒有保留座位」是購票規定，不是詢問目前座位
	if (/保留|預約|訂位/.test(q) && !NOW_WORDS.test(q)) return null;
	if (!(REALTIME_DIRECT.test(q) || (NOW_WORDS.test(q) && NOW_TOPIC.test(q))))
		return null;
	return refusal(
		"無法回答：本原型沒有即時資料",
		[
			"我沒有接 GPS、到站預估、座位或客滿狀態，所以不能告訴你現在或某一班「有沒有位子」「還要等多久」「有沒有誤點」，也不會用歷史資料去猜。",
			"可以改看：官網「公車動態」（見來源）；要確認座位或預約，請洽南投客運 049-2984031 或臺中干城站櫃台 04-2225-6418。",
			"我能回答的是：官網表定時刻（例如「高鐵臺中站 9 點後到日月潭」）、官方票價與規定，以及 2024–2025 的歷史搭乘統計。",
		],
		"rule:realtime",
		{
			sources: sources(["live", "operator"]),
			followUps: [
				"高鐵臺中站 9 點後到日月潭有哪些班次？",
				"日月潭站的末班車幾點？",
			],
		},
	);
}

function checkForecast(q: string): Answer | null {
	if (!FORECAST.test(q)) return null;
	return refusal(
		"無法回答：本原型不做客滿或人潮預測",
		[
			"預測某天某班會不會客滿，需要座位容量、預約與近期資料，本原型沒有，也沒有驗證過任何預測模型。",
			"可以參考的只有歷史統計：某站在 2024–2025 年哪個時段、星期上車刷卡較多（例如「埔里站週末幾點上車人比較多」）。那是過去的成功刷卡量，不是未來預測，也不等於客滿。",
		],
		"rule:forecast",
		{ followUps: ["埔里站週末幾點上車人比較多？"] },
	);
}

/* ───────────────────────── 2. 範圍外 ───────────────────────── */

const OUT_OF_SCOPE: { re: RegExp; headline: string; line: string }[] = [
	{
		re: /天氣|下雨|颱風|豪雨|停駛|停班|封路|路況|道路中斷|公告停/,
		headline: "無法回答：沒有天氣、停駛或路況資料",
		line: "本原型沒有停駛公告或路況資料。是否停駛、改道請看台灣好行官網或南投客運（049-2984031）最新公告。",
	},
	{
		re: /退票|改票|退款|改期|取消訂位|改時間|改班/,
		headline: "無法回答：未收錄退票與改票規定",
		line: "我沒有找到經確認的退票、改票規定，不能憑印象回答。請洽南投客運 049-2984031 或購票櫃台。",
	},
	{
		re: /住宿|飯店|民宿|餐廳|美食推薦|門票|開放時間|營業時間|纜車|租車|行程規劃|規劃行程|多遠|距離|幾公里|走路|步行/,
		headline: "無法回答：超出本原型範圍",
		line: "本原型只回答 6670 的路線、停靠站、票價規定、表定時刻與歷史搭乘統計。景點營業時間、門票、住宿、步行路線等需向景點或官方資訊確認。",
	},
	{
		re: /清境|阿里山|環湖|6669|6801|6739|溪頭|埔里到(南投|草屯|霧社)|高鐵(訂位|票價|時刻)|台鐵(票價|時刻|訂位)/,
		headline: "無法回答：只涵蓋 6670 日月潭線",
		line: "本原型只涵蓋台灣好行 6670（日月潭線，含 A–F、H）。其他路線請到台灣好行官網該路線頁查詢。",
	},
];

function checkOutOfScope(q: string): Answer | null {
	if (
		/6670|日月潭線/.test(q) &&
		!/清境|阿里山|環湖|6669|6801|6739|溪頭/.test(q)
	) {
		// 提到 6670 本身時，只擋「天氣／退票」這類本來就沒資料的主題
		const m = OUT_OF_SCOPE.slice(0, 2).find((r) => r.re.test(q));
		return m ? refusal(m.headline, [m.line], "rule:out-of-scope") : null;
	}
	const m = OUT_OF_SCOPE.find((r) => r.re.test(q));
	return m ? refusal(m.headline, [m.line], "rule:out-of-scope") : null;
}

/* ───────────────────────── 3. 票價 ───────────────────────── */

const FARE_WORDS = /票價|多少錢|車資|價格|幾元|多少元|收費|費用|幾塊|要錢/;
const entry = (id: string) => KB.find((e) => e.id === id) as KbEntry;

function fromEntry(e: KbEntry, trace: string, extraCaution?: string): Answer {
	return {
		kind: "answer",
		headline: e.title,
		lines: e.lines,
		basis: [e.basis],
		sources: sources(e.sources),
		caution: [e.caution, extraCaution].filter(Boolean).join(" "),
		followUps: e.followUps,
		trace,
	};
}

function fareAnswer(q: string, stops: StopMention[]): Answer | null {
	if (!FARE_WORDS.test(q)) return null;
	const labels = new Set(stops.map((s) => s.stop.label));
	const has = (l: string) => labels.has(l);
	const lake = has("日月潭");
	const startsTaichung = has("臺中干城站");
	if (stops.length >= 2) {
		if (has("高鐵臺中站") && lake)
			return fromEntry(entry("fare-thsr"), "rule:fare/pair:thsr-lake");
		if (startsTaichung && lake)
			return fromEntry(entry("fare-base"), "rule:fare/pair:taichung-lake");
		if ((startsTaichung || has("高鐵臺中站")) && has("埔里站") && !lake)
			return fromEntry(entry("fare-puli"), "rule:fare/pair:taichung-puli");
		if (has("台中航空站") && lake)
			return fromEntry(entry("fare-airport"), "rule:fare/pair:airport-lake");
		return {
			kind: "refusal",
			headline: "無法回答：這個起訖站的票價沒有轉錄",
			lines: [
				"官網票價表依「上車站、下車站、路線、現金或 IC 卡」分列，是圖片。本原型只轉錄了少數幾個起訖組合（台中⇄日月潭、高鐵臺中站⇄日月潭、台中⇄埔里 6670H、機場⇄日月潭），沒有你問的這一組。",
				"請直接看官網「票價與時刻表」頁的票價表（見來源），或洽南投客運。我不會用距離去估算票價。",
			],
			basis: [],
			sources: sources(["fareImages", "timetable"]),
			trace: "rule:fare/pair:not-transcribed",
		};
	}
	return null; // 單站或無站點：交給知識庫檢索
}

/* ───────────────────────── 4. 班表 ───────────────────────── */

const CN: Record<string, number> = {
	零: 0,
	一: 1,
	二: 2,
	兩: 2,
	三: 3,
	四: 4,
	五: 5,
	六: 6,
	七: 7,
	八: 8,
	九: 9,
};
function cnNum(s: string): number | null {
	if (/^\d+$/.test(s)) return Number(s);
	if (s === "十") return 10;
	if (s.startsWith("十")) return 10 + (CN[s[1]] ?? Number.NaN);
	if (s.endsWith("十")) return (CN[s[0]] ?? Number.NaN) * 10;
	if (s.length === 3 && s[1] === "十")
		return (CN[s[0]] ?? Number.NaN) * 10 + (CN[s[2]] ?? Number.NaN);
	return s.length === 1 && s in CN ? CN[s] : null;
}

export type Clock = {
	hhmm: string;
	relation: "after" | "before";
	guessedPeriod: boolean;
};
const CLOCK_RE =
	/(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|晚間|夜間)?(\d+|[零一二兩三四五六七八九十]+)(?:點|時|:|：)(半|\d+)?(分)?\s*(之後|以後|之前|以前|前|後)?/;

export function parseClock(q: string): Clock | null {
	const m = norm(q).match(CLOCK_RE);
	if (!m) return null;
	let h = cnNum(m[2]);
	if (h === null || Number.isNaN(h) || h >= 24) return null;
	const min = m[3] === "半" ? 30 : m[3] ? Number(m[3]) : 0;
	if (min > 59) return null;
	const period = m[1];
	// Midnight phrasing needs an explicit date; never silently interpret it as noon.
	if (h === 12 && period && /晚上|晚間|夜間/.test(period)) return null;
	if (period && /下午|傍晚|晚上|晚間|夜間/.test(period) && h < 12) h += 12;
	if (period === "中午" && h < 11) h += 12;
	if (period === "凌晨" && h === 12) h = 0;
	const rel = m[5] && /前/.test(m[5]) ? "before" : "after";
	return {
		hhmm: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
		relation: rel,
		guessedPeriod: !period && h >= 1 && h <= 5,
	};
}

const SPECIAL_DAY =
	/國定假日|連假|春節|過年|除夕|端午|中秋|清明|元旦|國慶|228|和平紀念|寒假|暑假|寒暑假|補假|颱風假/;

function checkSpecialDay(q: string): Answer | null {
	if (!SPECIAL_DAY.test(q) || !/班|車|行駛|開|停|時刻|加開|營運|運行/.test(q))
		return null;
	return refusal(
		"無法回答：官網沒有說明特殊日期的班表",
		[
			"官網時刻表只分「平日（周一~周四）」與「假日（周五~周日）」兩種，沒有說明國定假日、連假、春節或寒暑假要用哪一種、有沒有加開或停駛。我不推測。",
			"請改問某個星期幾（會用官網的平日／假日表），或向南投客運確認特殊日期的班次。",
		],
		"rule:special-day",
		{ sources: sources(["timetable", "operator"]) },
	);
}

type DayInfo =
	| { kind: "day"; day: DayType; weekday?: number; note?: string }
	| { kind: "none" }
	| { kind: "needs-now"; word: string };

export function parseDay(q: string, ctx: Context): DayInfo {
	const t = norm(q);
	const rel = t.match(
		/今天|今日|今晚|明天|明日|後天|大後天|現在|下一班|下班車/,
	);
	if (rel) {
		if (!ctx.now) return { kind: "needs-now", word: rel[0] };
		const add = /明/.test(rel[0])
			? 1
			: /大後天/.test(rel[0])
				? 3
				: /後天/.test(rel[0])
					? 2
					: 0;
		const wd = (ctx.now.weekday + add) % 7;
		const label = /今|明|後/.test(rel[0])
			? `「${rel[0]}」為周${WD_NAME[wd]}`
			: `目前為周${WD_NAME[wd]} ${ctx.now.hhmm}`;
		return {
			kind: "day",
			day: dayTypeOfWeekday(wd),
			weekday: wd,
			note: `以你的裝置時間推算：${label}（未檢查是否為國定假日）`,
		};
	}
	const w = t.match(/(?:週|周|星期|禮拜)([一二三四五六日天])/);
	if (w) {
		const wd = "日一二三四五六".indexOf(w[1] === "天" ? "日" : w[1]);
		return { kind: "day", day: dayTypeOfWeekday(wd), weekday: wd };
	}
	if (/週末|周末|假日|例假日/.test(t))
		return {
			kind: "day",
			day: "holiday",
			note: "「週末／假日」依官網定義以周五~周日的假日時刻表計",
		};
	if (/平日/.test(t))
		return {
			kind: "day",
			day: "weekday",
			note: "「平日」依官網定義為周一~周四；周五起用假日時刻表",
		};
	return { kind: "none" };
}

type Role = "origin" | "dest" | "unknown";
function roleOf(q: string, m: StopMention): Role {
	const before = norm(q).slice(Math.max(0, m.index - 3), m.index);
	if (/(從|由|自|在)$/.test(before)) return "origin";
	if (/(到|往|去|至|抵達|前往|回)$/.test(before)) return "dest";
	return "unknown";
}

export function pickEndpoints(q: string, mentions: StopMention[]) {
	const distinct = mentions.filter(
		(m, i) => mentions.findIndex((x) => x.stop === m.stop) === i,
	);
	if (distinct.length === 0) return { kind: "none" as const };
	if (distinct.length === 1) {
		return roleOf(q, distinct[0]) === "dest"
			? { kind: "dest-only" as const, dest: distinct[0].stop }
			: { kind: "ok" as const, origin: distinct[0].stop };
	}
	const [a, b] = distinct;
	const ra = roleOf(q, a);
	const rb = roleOf(q, b);
	if (ra === "dest" || rb === "origin")
		return { kind: "ok" as const, origin: b.stop, dest: a.stop };
	return { kind: "ok" as const, origin: a.stop, dest: b.stop };
}

const TIME_WORDS =
	/幾點|時刻|班次|班表|發車|出發|開車|首班|末班|最早|最晚|最後一班|最後一台|第一班|下一班|下班車|時間表|有車|有沒有車|有幾班|間隔|班距|之後|以後|抵達|到達|幾分鐘|要多久|多久到|車程|行車時間/;
const LAST_WORDS = /末班|最後一班|最後一台|最晚|收班/;
const FIRST_WORDS = /首班|第一班|最早/;
const DURATION_WORDS = /要多久|多久到|多久|車程|行車時間|幾分鐘|多長/;

function hitRow(h: Hit, dayCol: boolean, dirCol: boolean): string[] {
	return [
		...(dayCol ? [DAY_LABEL[h.day]] : []),
		...(dirCol ? [h.direction === "outbound" ? "去程" : "回程"] : []),
		h.no,
		h.dep,
		h.to ? (h.arr as string) : `→ ${h.terminal}`,
	];
}

function timetableAnswer(
	q: string,
	ctx: Context,
	mentions: StopMention[],
): Answer | null {
	const clock = parseClock(q);
	const wantsLast = LAST_WORDS.test(q);
	const wantsFirst = FIRST_WORDS.test(q);
	const dayInfo = parseDay(q, ctx);
	const isNext = /下一班|下班車/.test(q);
	const hasIntent =
		TIME_WORDS.test(q) || clock !== null || dayInfo.kind !== "none";
	if (!hasIntent) return null;
	// 只提到「平日／假日」卻沒有站、時間、班次字眼（例如問班表怎麼分）→ 交給知識庫
	if (mentions.length === 0 && !TIME_WORDS.test(q) && clock === null)
		return null;

	const base: Pick<Answer, "basis" | "sources" | "trace"> = {
		basis: ["timetable"],
		sources: sources(["timetable"]),
		trace: "rule:timetable",
	};

	if (dayInfo.kind === "needs-now" && !clock)
		return {
			kind: "clarify",
			headline: "需要你補充星期或時間",
			lines: [
				`你提到「${dayInfo.word}」，但這裡取不到你的裝置時間。請直接說星期幾與時間，例如「週六 9 點後高鐵臺中站到日月潭」。`,
			],
			...base,
			trace: "rule:timetable/needs-now",
		};

	if (mentions.length === 0) {
		if (/6670[a-h]|[a-h]線/i.test(q)) return null; // 子路線的班次數官網另有說明，交給知識庫
		if (/有幾班|幾班/.test(q)) {
			const rows = ctx.timetable.tables.map((t) => [
				DAY_LABEL[t.day],
				t.direction === "outbound" ? "去程" : "回程",
				String(t.trips.length),
			]);
			return {
				kind: "answer",
				headline: "官網時刻表列出的班次數",
				lines: [
					"以下是官網時刻表各表的列數（含延駛台中航空站等不同停靠型態的班次，不是同一種班車）。",
				],
				table: { head: ["日型", "方向", "班次列數"], rows },
				caution: "每一列是官網表上的一個班次，不一定每班都停每一站。",
				...base,
				trace: "rule:timetable/counts",
			};
		}
		return {
			kind: "clarify",
			headline: "請指定上車站",
			lines: [
				"要查表定時刻，需要知道從哪一站上車（必要時加上要到哪一站）。例如「高鐵臺中站 9 點後到埔里站」「日月潭的末班車」。",
			],
			...base,
			followUps: [
				"高鐵臺中站 9 點後到日月潭有哪些班次？",
				"日月潭站的末班車幾點？",
				"週六埔里站去台中的班次",
			],
			trace: "rule:timetable/no-stop",
		};
	}

	const ep = pickEndpoints(q, mentions);
	if (ep.kind === "dest-only")
		return {
			kind: "clarify",
			headline: "請告訴我從哪一站上車",
			lines: [
				`你只說了要到「${ep.dest.label}」。請補上上車站，例如「高鐵臺中站到${ep.dest.label}」。`,
			],
			...base,
			trace: "rule:timetable/dest-only",
		};
	if (ep.kind !== "ok") return null;
	const { origin, dest } = ep;
	let direction: Direction | undefined;
	if (!dest) {
		if (/回程|返程|回台中|往台中/.test(q)) direction = "inbound";
		else if (/去程|往程|往日月潭|去日月潭/.test(q)) direction = "outbound";
	}

	let time = clock;
	if (isNext && !clock) {
		if (!ctx.now)
			return {
				kind: "clarify",
				headline: "需要你的目前時間",
				lines: [
					"「下一班」要從現在的時間算起，但這裡取不到你的裝置時間。請直接說時間，例如「9 點半後」。",
				],
				...base,
				trace: "rule:timetable/needs-now",
			};
		time = { hhmm: ctx.now.hhmm, relation: "after", guessedPeriod: false };
	}

	const days: DayType[] =
		dayInfo.kind === "day" ? [dayInfo.day] : ["weekday", "holiday"];
	const dayCol = days.length > 1;
	const notes: string[] = [];
	const durations: number[] = [];
	const picks: Hit[] = [];
	const dirs = new Set<Direction>();
	let anyHit = false;

	for (const day of days) {
		const all = queryTrips(ctx.timetable, { day, origin, dest, direction });
		if (all.length) anyHit = true;
		for (const dir of ["outbound", "inbound"] as Direction[]) {
			const grp = all.filter((h) => h.direction === dir);
			if (!grp.length) continue;
			dirs.add(dir);
			for (const h of grp)
				if (h.arr) durations.push(toMin(h.arr) - toMin(h.dep));
			let pick: Hit[];
			if (wantsLast && !time) pick = grp.slice(-1);
			else if (wantsFirst && !time) pick = grp.slice(0, 1);
			else if (time?.relation === "before")
				pick = grp
					.filter((h) => toMin(h.arr ?? h.dep) <= toMin(time.hhmm))
					.slice(-MAX_ROWS);
			else if (time)
				pick = grp
					.filter((h) => toMin(h.dep) >= toMin(time.hhmm))
					.slice(0, MAX_ROWS);
			else pick = grp.length > 1 ? [grp[0], grp[grp.length - 1]] : grp; // 無時間：首末班
			picks.push(...pick);
			if (!pick.length)
				notes.push(
					`${DAY_LABEL[day]}${dest ? "" : DIR_LABEL[dir]}：${time?.relation === "before" ? "該時間前" : "該時間後"}沒有表定班次。`,
				);
		}
	}
	for (const day of days)
		if (
			!picks.some((h) => h.day === day) &&
			!notes.some((n) => n.startsWith(DAY_LABEL[day]))
		)
			notes.push(`${DAY_LABEL[day]}：官網這張表上沒有符合的班次。`);
	const showDir = dirs.size > 1;
	const finalRows = picks.map((h) => hitRow(h, dayCol, showDir));

	const lines: string[] = [];
	const route = dest
		? `${origin.label} → ${dest.label}`
		: `${origin.label} 出發`;
	if (!anyHit) {
		return {
			kind: "refusal",
			headline: "官網時刻表查無符合的班次",
			lines: [
				dest
					? `在官網表定時刻中，沒有班次同時停靠「${origin.label}」與「${dest.label}」且方向相符（可能該站不在同一條路線上，或你問的是反方向）。`
					: `在官網表定時刻中，沒有班次從「${origin.label}」出發往後續站點。`,
				"我不會自行推測轉乘或替代班次。請看官網時刻表頁（見來源）。",
			],
			...base,
			trace: "rule:timetable/no-trip",
		};
	}

	if (wantsLast && !time) lines.push(`${route}：表定「末班」如下。`);
	else if (wantsFirst && !time) lines.push(`${route}：表定「首班」如下。`);
	else if (time)
		lines.push(
			`${route}：${time.relation === "before" ? (dest ? `${time.hhmm} 前抵達` : `${time.hhmm} 前出發`) : `${time.hhmm} 之後出發`}的表定班次（每類最多列 ${MAX_ROWS} 班）。`,
		);
	else
		lines.push(
			`${route}：表定首班與末班如下；加上時間可查某時段（例如「9 點後」）。`,
		);

	if (dest && DURATION_WORDS.test(q) && durations.length) {
		const lo = Math.min(...durations);
		const hi = Math.max(...durations);
		lines.push(
			`此區間各班（含未列出者）的表定行車時間約 ${lo === hi ? lo : `${lo}–${hi}`} 分鐘，為表定值，不含實際路況。`,
		);
	}
	if (showDir)
		lines.push(
			"官網的「去程」表是臺中往日月潭方向（部分班次延駛水社、向山），「回程」表是往臺中方向；「表定終點」是該班表上最後停靠的站。",
		);
	if (!dayCol) lines.push(`使用官網${DAY_LABEL[days[0]]}時刻表。`);
	if (dayInfo.kind === "day" && dayInfo.note) lines.push(dayInfo.note);
	if (dayInfo.kind === "none")
		lines.push(
			"你沒有指定星期，所以平日、假日兩種表都列出（官網：平日＝周一~周四，假日＝周五~周日）。",
		);
	if (time?.guessedPeriod)
		lines.push(
			`你沒有說上午或下午，我以 ${time.hhmm} 計；若指下午請加上「下午」。`,
		);
	for (const m of [origin, dest]) if (m?.ambiguity) lines.push(m.ambiguity);
	lines.push(...notes);

	const head = [
		...(dayCol ? ["日型"] : []),
		...(showDir ? ["方向"] : []),
		"班次",
		dest ? `${origin.label} 出發` : "出發",
		dest ? `${dest.label} 抵達` : "表定終點",
	];
	const airport = [origin, dest].some((s) => s?.label === "台中航空站");
	const caution = [
		`表定時刻取自官網（擷取於 ${taipeiDate(ctx.timetable.retrievedAt)}），不是即時資訊：實際到站可能因路況誤點，班次也可能臨時調整；官網時刻表頁沒有標示更新日期。`,
		"班次欄是官網表上的序號，與子路線（A–F）沒有對應。",
		airport && ctx.timetable.changeNotice
			? `機場線異動備註：${ctx.timetable.changeNotice.slice(0, 80)}…請以官網為準。`
			: "",
	]
		.filter(Boolean)
		.join(" ");

	return {
		kind: "answer",
		headline: "表定時刻查詢結果",
		lines,
		table: { head, rows: finalRows },
		caution,
		followUps: dest ? undefined : ["高鐵臺中站到日月潭的末班車？"],
		...base,
		trace: `rule:timetable origin=${origin.label}${dest ? ` dest=${dest.label}` : ""} days=${days.join("+")} ${time ? `${time.relation} ${time.hhmm}` : wantsLast ? "last" : wantsFirst ? "first" : "firstlast"}`,
	};
}

/* ───────────────────────── 5. 歷史統計 ───────────────────────── */

const HISTORY_WORDS =
	/人多|人少|擁擠|尖峰|離峰|熱門|人潮|繁忙|比較多人|比較少人|多少人|搭乘人數|上車人數|乘客數|避開人潮|最多人|最少人|客流|運量|刷卡量|哪天人|哪個時段|幾點.{0,4}(人|搭乘|上車)/;
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

function historyAnswer(
	q: string,
	ctx: Context,
	mentions: StopMention[],
): Answer | null {
	if (!HISTORY_WORDS.test(q)) return null;
	const h = ctx.history;
	const base = { basis: ["history"] as Basis[], sources: sources(["history"]) };
	const stop = mentions[0]?.stop;
	if (!stop)
		return {
			kind: "clarify",
			headline: "請指定要看哪一站",
			lines: [
				"歷史搭乘統計是以站點為單位。請指定站點，例如「埔里站週末幾點上車人比較多」「高鐵臺中站週五的上車尖峰」。",
			],
			...base,
			followUps: [
				"埔里站週末幾點上車人比較多？",
				"日月潭站平日的上車尖峰時段？",
			],
			trace: "rule:history/no-stop",
		};
	if (!stop.hist.length)
		return refusal(
			`無法回答：歷史資料沒有「${stop.label}」的上車紀錄`,
			[
				"本專案的刷卡彙總沒有收錄這一站（可能該站未被刷卡資料使用，或名稱未對應）。不代表沒有人搭，只是我沒有數據。",
			],
			"rule:history/no-data-stop",
			{ sources: sources(["history"]) },
		);

	const t = norm(q);
	let weekdays = [0, 1, 2, 3, 4, 5, 6];
	let dayLabel = "全部星期";
	const w = t.match(/(?:週|周|星期|禮拜)([一二三四五六日天])/);
	if (w) {
		const wd = "日一二三四五六".indexOf(w[1] === "天" ? "日" : w[1]);
		weekdays = [wd];
		dayLabel = `週${WD_NAME[wd]}`;
	} else if (/週末|周末|假日/.test(t)) {
		weekdays = [0, 6];
		dayLabel = "週六、週日";
	} else if (/平日/.test(t)) {
		weekdays = [1, 2, 3, 4, 5];
		dayLabel = "週一至週五";
	}

	const lines: string[] = [];
	const table: { head: string[]; rows: string[][] } = {
		head: ["方向", "上車刷卡最多的時段（平均每日）"],
		rows: [],
	};
	for (const dir of ["outbound", "inbound"] as Direction[]) {
		const p = profile(h, stop.hist, dir, weekdays);
		const top = topHours(p.hourly, 3);
		table.rows.push([
			DIR_LABEL[dir],
			top.length
				? top
						.map((x) => `${hh(x.hour)}–${hh(x.hour + 1)}：${x.v.toFixed(1)} 次`)
						.join("；")
				: "無紀錄",
		]);
	}
	lines.push(
		`「${stop.label}」在 ${dayLabel}、2024-01-01 ~ 2025-12-31 的歷史上車刷卡量最高的三個時段如下（單位：平均每個有紀錄的日子的刷卡次數）。`,
	);
	if (/哪天|週幾|星期幾|禮拜幾/.test(t)) {
		const avg = weekdayAverages(h, stop.hist);
		const order = avg.map((v, wd) => ({ wd, v })).sort((a, b) => b.v - a.v);
		table.rows.push([
			"各星期平均每日（兩方向合計）",
			order.map((o) => `週${WD_NAME[o.wd]} ${o.v.toFixed(0)}`).join("、"),
		]);
	}
	for (const s of stop.hist.length > 1 ? [stop] : [])
		if (s.ambiguity) lines.push(s.ambiguity);
	lines.push(
		`資料有紀錄 ${h.observedDays} 天，日曆共 ${h.calendarDays} 天；缺的日子不代表停駛或零搭乘。這裡的「週六、週日」「週一至週五」是日曆星期，沒有排除國定假日，也和官網班表的平日／假日分法不同。`,
	);
	return {
		kind: "answer",
		headline: `歷史上車刷卡統計：${stop.label}`,
		lines,
		table,
		caution:
			"這是過去成功刷卡上車的次數，不是候車人數、座位使用率或即時狀態，也不能推論某班客滿或拒載。同一站的各子路線（A–F、H）合併計算，且沒有區分班次。方向以站序推定，方向未知的刷卡未納入。",
		...base,
		followUps: ["刷卡資料和座位、需求有什麼差別？"],
		trace: `rule:history stop=${stop.label} days=${weekdays.join("")}`,
	};
}

/* ───────────────────────── 6. 知識庫檢索 ───────────────────────── */

const MIN_SCORE = 2;

export function scoreEntries(q: string) {
	const t = norm(q);
	return KB.map((e) => {
		if (e.anyOf && !e.anyOf.some((k) => t.includes(norm(k))))
			return { e, score: 0, hits: [] as string[] };
		const hits = e.triggers.filter((k) => t.includes(norm(k)));
		return { e, score: hits.reduce((s, k) => s + k.length, 0), hits };
	})
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score);
}

/* ───────────────────────── 入口 ───────────────────────── */

export const EXAMPLES = [
	"6670 單程票價多少？",
	"高鐵臺中站 9 點後到日月潭有哪些班次？",
	"日月潭站的末班車幾點？",
	"客滿的時候中間站能上車嗎？",
	"現在還有位子嗎？",
	"埔里站週末幾點上車人比較多？",
];

export function answer(query: string, ctx: Context): Answer {
	const q = query.trim();
	if (!q)
		return {
			kind: "clarify",
			headline: "請輸入問題",
			lines: ["可以問 6670 的票價、停靠站、表定時刻、規定，或歷史搭乘統計。"],
			basis: [],
			sources: [],
			trace: "rule:empty",
		};

	const early = checkRealtime(q) ?? checkForecast(q);
	if (early) return early;

	const out = checkOutOfScope(q) ?? checkSpecialDay(q);
	if (out) return out;

	const mentions = findStops(q);
	if (CLOCK_RE.test(norm(q)) && parseClock(q) === null) {
		return {
			kind: "clarify",
			headline: "請確認日期與時間",
			lines: [
				"時間無效或涉及午夜跨日，請指定日期並用 00:00 至 23:59 表示；本原型不會自動進位日期或忽略時間條件。",
			],
			basis: [],
			sources: [],
			trace: "rule:invalid-clock",
		};
	}
	if (
		mentions.length > 0 &&
		/6670\s*[a-h]\b|[a-h]\s*線/i.test(norm(q)) &&
		(TIME_WORDS.test(q) ||
			parseClock(q) !== null ||
			/有停|停嗎|停靠|會停/.test(q))
	) {
		return refusal(
			"無法依指定支線查詢班次",
			[
				"此時刻表快照沒有班次序號與 A–H 支線的可靠對應，不能把其他支線的班次或停靠套用到指定支線。請移除支線條件後再查全部班次，或向營運方確認。",
			],
			"rule:unsupported-subroute",
			{ sources: sources(["timetable"]) },
		);
	}
	// A stop-existence question needs the matching table rows, not a generic route list.
	if (mentions.length === 1 && /有停|停嗎|停靠嗎|會停/.test(q)) {
		const stop = mentions[0].stop;
		const served = ctx.timetable.tables.some((table) =>
			table.trips.some((trip) =>
				stop.tt.some((name) => {
					const i = table.stops.indexOf(name);
					return (
						i >= 0 && trip.times[i] !== null && trip.times[i] !== undefined
					);
				}),
			),
		);
		return {
			kind: "answer",
			headline: `${stop.label}的表定停靠資料`,
			lines: [
				served
					? `此官網時刻表快照有班次列出「${stop.label}」的停靠時間，不能據此認定每一班都停靠。請再提供出發站、星期與時間查詢符合的班次。`
					: `此官網時刻表快照未找到「${stop.label}」的停靠時間；不代表其他路線或臨時班次不服務，請向營運方確認。`,
			],
			basis: ["timetable"],
			sources: sources(["timetable"]),
			caution: "這是靜態表定資料，非即時行駛、座位或停駛資訊。",
			trace: `rule:stop-service stop=${stop.label}`,
		};
	}

	const fare = fareAnswer(q, mentions);
	if (fare) return fare;

	if (!FARE_WORDS.test(q)) {
		const hist = historyAnswer(q, ctx, mentions);
		if (hist) return hist;
		const tt = timetableAnswer(q, ctx, mentions);
		if (tt) return tt;
	}

	const ranked = scoreEntries(q);
	const top = ranked[0];
	if (top && top.score >= MIN_SCORE) {
		const a = fromEntry(
			top.e,
			`kb:${top.e.id} score=${top.score} hits=${top.hits.join("|")}`,
		);
		return a;
	}

	return refusal(
		"我沒有可靠的依據回答這個問題",
		[
			"這個問題不在我收錄的範圍內，或我無法從官網資料與歷史統計中找到支持的答案。我不會用猜測的內容填補。",
			"我能回答：6670 路線與子路線、停靠站、官方票價與半票規定、購票與預約方式、攜帶腳踏車／寵物、無障礙、官網表定時刻，以及 2024–2025 的歷史搭乘統計。",
			"其他問題請洽南投客運 049-2984031 或台灣好行官網。",
		],
		"fallback:no-evidence",
		{
			sources: sources(["route", "timetable"]),
			followUps: EXAMPLES.slice(0, 3),
		},
	);
}
