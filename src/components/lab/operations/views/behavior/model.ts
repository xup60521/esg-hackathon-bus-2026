import type {
	ArchetypeId,
	BehaviorAnalysisSummary,
	OdPairStat,
	TicketGroupShare,
} from "#/features/lab/behavior";
import { meanDurationMinutes } from "#/features/lab/behavior/duration";

/**
 * Loading + validation for the three behavior JSON files (schemaVersion 2).
 *
 * Nothing here trusts the files: every field the page reads is checked, then the numbers are
 * reconciled against each other (OD totals, ticket partitions, hourly sums, cluster rollups,
 * companion files from the same snapshot). Any failure becomes a readable message that names
 * the field, never the offending raw value, and the page shows no partial numbers.
 */

export const DATA_URLS = {
	summary: "/data/lab/behavior/od-behavior-summary.json",
	clusters: "/data/lab/behavior/od-clusters.json",
	temporal: "/data/lab/behavior/temporal-behavior.json",
} as const;

export const TICKET_GROUPS = [
	"general",
	"student",
	"concession",
	"tpass_commuter",
	"other",
] as const satisfies readonly TicketGroupShare["group"][];
export type TicketGroupId = (typeof TICKET_GROUPS)[number];

/** Which OdPairStat count field holds each ticket group (the five partition every trip). */
export const TICKET_FIELD: Record<
	TicketGroupId,
	| "generalTrips"
	| "studentTrips"
	| "concessionTrips"
	| "tpassTrips"
	| "otherTrips"
> = {
	general: "generalTrips",
	student: "studentTrips",
	concession: "concessionTrips",
	tpass_commuter: "tpassTrips",
	other: "otherTrips",
};

/**
 * The documented rule order (docs/lab/behavior/report.zh-TW.md): the first matching rule wins.
 * `archetype` values are legacy machine ids; the label and rule text carry the meaning, so
 * they must not be read as a trip purpose.
 */
export const RULE_ORDER = [
	"abnormal_tap",
	"campus_student",
	"tourism_intercity",
	"regional_commute",
	"local_shuttle",
	"intermediate_minor",
] as const satisfies readonly ArchetypeId[];

export type ClusterFile = {
	schemaVersion: 2;
	generatedAt: string;
	totalTrips: number;
	clusters: { clusterId: number; totalTrips: number; odPairCount: number }[];
};
export type TemporalFile = {
	schemaVersion: 2;
	generatedAt: string;
	overallHourly: { hour: number; trips: number }[];
	topOdHourly: { odPair: string; trips: number; hourly: number[] }[];
};
export type BehaviorData = {
	summary: BehaviorAnalysisSummary;
	clusters: ClusterFile;
	temporal: TemporalFile;
};

export type Parsed<T> = { ok: true; data: T } | { ok: false; message: string };

/* ------------------------------------------------------------------ */
/* primitives                                                          */
/* ------------------------------------------------------------------ */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
	typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number =>
	typeof v === "number" && Number.isFinite(v);
const isCount = (v: unknown): v is number =>
	isNum(v) && Number.isInteger(v) && v >= 0;
const isText = (v: unknown): v is string => typeof v === "string" && v !== "";
const isRuleArchetype = (v: unknown): v is ArchetypeId =>
	(RULE_ORDER as readonly unknown[]).includes(v);

/** `YYYY-MM-DD` that is a real calendar day. */
export function isCalendarDate(v: unknown): v is string {
	if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
	const d = new Date(`${v}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const isHourly = (v: unknown): v is number[] =>
	Array.isArray(v) && v.length === 24 && v.every(isCount);

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

export function summarizeIssues(issues: string[], max = 5): string {
	const shown = issues.slice(0, max).join("；");
	return issues.length > max
		? `${shown}；另有 ${issues.length - max} 項問題`
		: shown;
}

const fail = (issues: string[]): { ok: false; message: string } => ({
	ok: false,
	message: summarizeIssues(issues),
});

/* ------------------------------------------------------------------ */
/* per-record structure                                                */
/* ------------------------------------------------------------------ */

const OD_COUNT_FIELDS = [
	"trips",
	"durationSampleCount",
	"durationSumSec",
	"weekendTrips",
	"weekdayTrips",
	"amPeakTrips",
	"pmPeakTrips",
	"offPeakTrips",
	"studentTrips",
	"concessionTrips",
	"generalTrips",
	"tpassTrips",
	"otherTrips",
	"rank",
	"clusterId",
] as const;

function odStructure(o: unknown, i: number): string[] {
	const at = `allOdPairs[${i}]`;
	if (!isObj(o)) return [`${at} 不是物件`];
	const out: string[] = [];
	if (!isText(o.id)) out.push(`${at}.id 缺失`);
	if (!isRuleArchetype(o.archetype)) out.push(`${at}.archetype 不是已知規則組`);
	if (!isText(o.boardStop)) out.push(`${at}.boardStop 缺失`);
	if (!isText(o.alightStop)) out.push(`${at}.alightStop 缺失`);
	for (const f of OD_COUNT_FIELDS)
		if (!isCount(o[f])) out.push(`${at}.${f} 不是非負整數`);
	if (!isHourly(o.hourly)) out.push(`${at}.hourly 不是 24 筆非負整數`);
	if (
		o.avgDurationMin !== null &&
		!(isNum(o.avgDurationMin) && o.avgDurationMin >= 0)
	)
		out.push(`${at}.avgDurationMin 不是數字或 null`);
	if (!isObj(o.subroutes) || !Object.values(o.subroutes).every(isCount))
		out.push(`${at}.subroutes 結構不符`);
	return out;
}

function odReconcile(o: OdPairStat): string[] {
	const at = `OD ${o.id}`;
	const out: string[] = [];
	if (sum(o.hourly) !== o.trips) out.push(`${at} 每小時合計不等於旅次`);
	if (o.weekendTrips + o.weekdayTrips !== o.trips)
		out.push(`${at} 週末＋平日不等於旅次`);
	if (o.amPeakTrips + o.pmPeakTrips + o.offPeakTrips !== o.trips)
		out.push(`${at} 三個時段窗口合計不等於旅次`);
	const tickets = sum(TICKET_GROUPS.map((g) => o[TICKET_FIELD[g]]));
	if (tickets !== o.trips) out.push(`${at} 五種票種合計不等於旅次`);
	if (sum(Object.values(o.subroutes)) !== o.trips)
		out.push(`${at} 支線合計不等於旅次`);
	if (o.durationSampleCount > o.trips) out.push(`${at} 有效時長樣本多於旅次`);
	if (o.durationSampleCount === 0) {
		if (o.avgDurationMin !== null || o.durationSumSec !== 0)
			out.push(`${at} 無有效時長樣本但仍有平均時長`);
	} else if (
		o.avgDurationMin !==
		meanDurationMinutes(o.durationSumSec, o.durationSampleCount)
	) {
		out.push(`${at} 平均時長與總秒數／樣本數不一致`);
	}
	return out;
}

/* ------------------------------------------------------------------ */
/* summary                                                             */
/* ------------------------------------------------------------------ */

function summaryStructure(v: Obj): string[] {
	const out: string[] = [];
	if (v.method !== "ordered_manual_rules")
		out.push("method 不是 ordered_manual_rules");
	if (
		typeof v.generatedAt !== "string" ||
		Number.isNaN(Date.parse(v.generatedAt))
	)
		out.push("generatedAt 不是可解析的時間");
	for (const f of [
		"totalTrips",
		"activeDatesCount",
		"distinctOdPairsCount",
		"validOdTripsCount",
		"sameStopOdCount",
	] as const)
		if (!isCount(v[f])) out.push(`${f} 不是非負整數`);
	const r = v.dateRange;
	if (!isObj(r) || !isCalendarDate(r.start) || !isCalendarDate(r.end))
		out.push("dateRange 不是真實日期");
	else if (r.start > r.end) out.push("dateRange 起日晚於迄日");
	if (
		!isObj(v.qualityEvidence) ||
		!Object.values(v.qualityEvidence).every(isCount)
	)
		out.push("qualityEvidence 結構不符");
	if (
		!isObj(v.reconciliation) ||
		!Object.values(v.reconciliation).every((b) => typeof b === "boolean")
	)
		out.push("reconciliation 結構不符");
	const d = v.durationAnomalies;
	if (
		!isObj(d) ||
		!["under3Min", "over6Hours", "zeroDuration", "negativeDuration"].every(
			(k) => isCount(d[k]),
		)
	)
		out.push("durationAnomalies 結構不符");
	const f = v.feasibility;
	if (
		!isObj(f) ||
		!(
			[
				"singleTripOdFeasible",
				"returnTripTrackingFeasible",
				"transferChainFeasible",
				"loyaltyAnalysisFeasible",
			] as const
		).every((k) => typeof f[k] === "boolean") ||
		!isObj(f.reasons) ||
		!(
			[
				"singleTripOd",
				"returnTripTracking",
				"transferChain",
				"cardTapLimitation",
			] as const
		).every((k) => isText((f.reasons as Obj)[k]))
	)
		out.push("feasibility 結構不符");
	const a = v.invariantsAudit;
	if (
		!isObj(a) ||
		!(
			[
				"totalTripsPreserved",
				"missingAlightStopZero",
				"cardIdExcluded",
				"noCardLinkedInferences",
			] as const
		).every((k) => typeof a[k] === "boolean")
	)
		out.push("invariantsAudit 結構不符");
	if (!Array.isArray(v.dataInventory)) out.push("dataInventory 不是陣列");
	if (!Array.isArray(v.topOdPairs)) out.push("topOdPairs 不是陣列");

	const hourly = v.overallHourly;
	if (
		!Array.isArray(hourly) ||
		hourly.length !== 24 ||
		!hourly.every((h, i) => isObj(h) && h.hour === i && isCount(h.trips))
	)
		out.push("overallHourly 不是 0–23 共 24 筆");
	const sub = v.subrouteOverview;
	if (
		!Array.isArray(sub) ||
		!sub.every((s) => isObj(s) && isText(s.subroute) && isCount(s.trips))
	)
		out.push("subrouteOverview 結構不符");
	const tg = v.ticketGroupOverview;
	if (
		!Array.isArray(tg) ||
		tg.length !== TICKET_GROUPS.length ||
		!TICKET_GROUPS.every((g) =>
			tg.some(
				(t) =>
					isObj(t) && t.group === g && isText(t.groupLabel) && isCount(t.trips),
			),
		)
	)
		out.push("ticketGroupOverview 必須恰好含五種票種（含 other）");

	const cl = v.clusters;
	if (
		!Array.isArray(cl) ||
		cl.length === 0 ||
		!cl.every(
			(c) =>
				isObj(c) &&
				isCount(c.clusterId) &&
				isRuleArchetype(c.archetype) &&
				isText(c.label) &&
				typeof c.description === "string" &&
				isCount(c.odPairCount) &&
				isCount(c.totalTrips) &&
				isCount(c.durationSampleCount) &&
				isCount(c.durationSumSec) &&
				Array.isArray(c.topOdPairs) &&
				c.topOdPairs.every(
					(p) =>
						isObj(p) &&
						isText(p.boardStop) &&
						isText(p.alightStop) &&
						isCount(p.trips) &&
						(p.avgDurationMin === null ||
							(isNum(p.avgDurationMin) && p.avgDurationMin >= 0)),
				),
		)
	)
		out.push("clusters 結構不符");
	const ods = v.allOdPairs;
	if (!Array.isArray(ods) || ods.length === 0)
		out.push("allOdPairs 不是非空陣列");
	else
		for (let i = 0; i < ods.length && out.length < 40; i++)
			out.push(...odStructure(ods[i], i));
	return out;
}

/** Numeric consistency across a structurally valid summary. Returns every problem found. */
export function reconcileSummary(s: BehaviorAnalysisSummary): string[] {
	const out: string[] = [];
	const ods = s.allOdPairs;
	const failedChecks = Object.entries(s.reconciliation)
		.filter(([, ok]) => !ok)
		.map(([k]) => k);
	if (failedChecks.length > 0)
		out.push(`資料檔自帶的對帳有未通過項目：${failedChecks.join("、")}`);
	if (Object.values(s.invariantsAudit).some((ok) => !ok))
		out.push("資料檔的不變條件稽核有未通過項目");
	if (ods.length !== s.distinctOdPairsCount)
		out.push("allOdPairs 筆數不等於 distinctOdPairsCount");
	if (new Set(ods.map((o) => o.id)).size !== ods.length)
		out.push("OD id 有重複");
	if (
		new Set(ods.map((o) => `${o.boardStop}\u0000${o.alightStop}`)).size !==
		ods.length
	)
		out.push("上下車站配對有重複");
	const total = sum(ods.map((o) => o.trips));
	if (total !== s.validOdTripsCount)
		out.push("全部 OD 旅次合計不等於 validOdTripsCount");
	if (s.validOdTripsCount > s.totalTrips)
		out.push("validOdTripsCount 大於 totalTrips");
	for (const o of ods) out.push(...odReconcile(o));

	for (const g of s.ticketGroupOverview) {
		const field = TICKET_FIELD[g.group];
		if (sum(ods.map((o) => o[field])) !== g.trips)
			out.push(`票種 ${g.group} 的 OD 合計不等於總覽`);
	}
	if (sum(s.ticketGroupOverview.map((g) => g.trips)) !== s.validOdTripsCount)
		out.push("五種票種總覽合計不等於旅次");
	for (const h of s.overallHourly)
		if (sum(ods.map((o) => o.hourly[h.hour])) !== h.trips)
			out.push(`overallHourly 第 ${h.hour} 時不等於 OD 合計`);
	const subTotals = new Map<string, number>();
	for (const o of ods)
		for (const [k, n] of Object.entries(o.subroutes))
			subTotals.set(k, (subTotals.get(k) ?? 0) + n);
	for (const r of s.subrouteOverview)
		if ((subTotals.get(r.subroute) ?? 0) !== r.trips)
			out.push(`支線 ${r.subroute} 不等於 OD 合計`);

	const durCount = sum(ods.map((o) => o.durationSampleCount));
	const durSum = sum(ods.map((o) => o.durationSumSec));
	const q = s.qualityEvidence;
	if (q.valid_dur_count !== undefined && q.valid_dur_count !== durCount)
		out.push("有效時長樣本數與 qualityEvidence 不一致");
	if (q.duration_sum_sec !== undefined && q.duration_sum_sec !== durSum)
		out.push("時長總秒數與 qualityEvidence 不一致");

	const sameStop = ods.filter((o) => o.boardStop === o.alightStop);
	if (sum(sameStop.map((o) => o.trips)) !== s.sameStopOdCount)
		out.push("同站 OD 旅次不等於 sameStopOdCount");
	const sameStopGroups = new Set(sameStop.map((o) => o.clusterId));
	if (
		sameStopGroups.size > 1 ||
		(sameStopGroups.size === 1 &&
			ods.some(
				(o) => o.boardStop !== o.alightStop && sameStopGroups.has(o.clusterId),
			))
	)
		out.push("同站 OD 與規則組歸屬不一致");

	const ids = new Set(s.clusters.map((c) => c.clusterId));
	if (ids.size !== s.clusters.length) out.push("規則組 clusterId 有重複");
	const archetypes = new Set(s.clusters.map((c) => c.archetype));
	if (
		archetypes.size !== RULE_ORDER.length ||
		s.clusters.length !== RULE_ORDER.length
	)
		out.push("規則組必須恰好是文件記載的六組，各一次");
	const archetypeOf = new Map(
		s.clusters.map((c) => [c.clusterId, c.archetype]),
	);
	for (const o of ods)
		if (
			archetypeOf.has(o.clusterId) &&
			archetypeOf.get(o.clusterId) !== o.archetype
		)
			out.push(`OD ${o.id} 的規則組識別與群別不一致`);
	for (const o of ods)
		if (!ids.has(o.clusterId)) out.push(`OD ${o.id} 指向不存在的規則組`);
	for (const c of s.clusters) {
		const m = ods.filter((o) => o.clusterId === c.clusterId);
		const seen = new Set<string>();
		if (c.topOdPairs.length === 0 || c.topOdPairs.length > m.length)
			out.push(`規則組 ${c.clusterId} 的代表 OD 數不符`);
		for (const p of c.topOdPairs) {
			const key = `${p.boardStop}\u0000${p.alightStop}`;
			const member = m.find(
				(o) => o.boardStop === p.boardStop && o.alightStop === p.alightStop,
			);
			if (
				seen.has(key) ||
				!member ||
				p.trips !== member.trips ||
				p.avgDurationMin !== member.avgDurationMin
			)
				out.push(`規則組 ${c.clusterId} 的代表 OD 與完整成員不一致`);
			seen.add(key);
		}
		if (m.length !== c.odPairCount)
			out.push(`規則組 ${c.clusterId} 的 OD 數與成員不一致`);
		if (sum(m.map((o) => o.trips)) !== c.totalTrips)
			out.push(`規則組 ${c.clusterId} 的旅次與成員不一致`);
		if (sum(m.map((o) => o.durationSumSec)) !== c.durationSumSec)
			out.push(`規則組 ${c.clusterId} 的時長總秒數與成員不一致`);
		if (sum(m.map((o) => o.durationSampleCount)) !== c.durationSampleCount)
			out.push(`規則組 ${c.clusterId} 的時長樣本數與成員不一致`);
		if (
			c.durationSampleCount > 0 &&
			c.avgDurationMin !==
				meanDurationMinutes(c.durationSumSec, c.durationSampleCount)
		)
			out.push(`規則組 ${c.clusterId} 的平均時長與總秒數／樣本數不一致`);
		if (c.durationSampleCount === 0 && c.avgDurationMin !== null)
			out.push(`規則組 ${c.clusterId} 無有效樣本但仍有平均時長`);
	}
	return out;
}

export function parseSummary(v: unknown): Parsed<BehaviorAnalysisSummary> {
	if (!isObj(v)) return fail(["根層不是物件"]);
	if (v.schemaVersion !== 2)
		return fail([
			`schemaVersion 不是 2（舊版或未知版本不載入，實際：${
				typeof v.schemaVersion === "number" ||
				typeof v.schemaVersion === "string"
					? String(v.schemaVersion).slice(0, 12)
					: "缺失"
			}）`,
		]);
	const structure = summaryStructure(v);
	if (structure.length > 0) return fail(structure);
	const s = v as unknown as BehaviorAnalysisSummary;
	const numeric = reconcileSummary(s);
	if (numeric.length > 0) return fail(numeric.map((m) => `數值對不上：${m}`));
	return { ok: true, data: s };
}

/* ------------------------------------------------------------------ */
/* companion files                                                     */
/* ------------------------------------------------------------------ */

function baseIssues(v: Obj): string[] {
	const out: string[] = [];
	if (v.schemaVersion !== 2) out.push("schemaVersion 不是 2");
	if (typeof v.generatedAt !== "string") out.push("generatedAt 缺失");
	return out;
}

export function parseClusters(v: unknown): Parsed<ClusterFile> {
	if (!isObj(v)) return fail(["根層不是物件"]);
	const out = baseIssues(v);
	if (!isCount(v.totalTrips)) out.push("totalTrips 不是非負整數");
	if (
		!Array.isArray(v.clusters) ||
		!v.clusters.every(
			(c) =>
				isObj(c) &&
				isCount(c.clusterId) &&
				isCount(c.totalTrips) &&
				isCount(c.odPairCount),
		)
	)
		out.push("clusters 結構不符");
	return out.length > 0
		? fail(out)
		: { ok: true, data: v as unknown as ClusterFile };
}

export function parseTemporal(v: unknown): Parsed<TemporalFile> {
	if (!isObj(v)) return fail(["根層不是物件"]);
	const out = baseIssues(v);
	const h = v.overallHourly;
	if (
		!Array.isArray(h) ||
		h.length !== 24 ||
		!h.every((x, i) => isObj(x) && x.hour === i && isCount(x.trips))
	)
		out.push("overallHourly 不是 0–23 共 24 筆");
	if (
		!Array.isArray(v.topOdHourly) ||
		!v.topOdHourly.every(
			(t) =>
				isObj(t) && isText(t.odPair) && isCount(t.trips) && isHourly(t.hourly),
		)
	)
		out.push("topOdHourly 結構不符");
	return out.length > 0
		? fail(out)
		: { ok: true, data: v as unknown as TemporalFile };
}

/** The three files must come from one snapshot; a mixed set is rejected rather than shown. */
export function crossCheck(
	s: BehaviorAnalysisSummary,
	c: ClusterFile,
	t: TemporalFile,
): string[] {
	const out: string[] = [];
	if (c.generatedAt !== s.generatedAt || t.generatedAt !== s.generatedAt)
		out.push("三個檔案的 generatedAt 不同，不屬於同一快照");
	if (c.totalTrips !== s.totalTrips) out.push("群彙總檔的總旅次與主檔不同");
	const byId = new Map(s.clusters.map((x) => [x.clusterId, x]));
	if (c.clusters.length !== s.clusters.length)
		out.push("群彙總檔與主檔的規則組數不同");
	for (const x of c.clusters) {
		const m = byId.get(x.clusterId);
		if (!m || m.totalTrips !== x.totalTrips || m.odPairCount !== x.odPairCount)
			out.push(`群彙總檔的規則組 ${x.clusterId} 與主檔不同`);
	}
	for (const h of t.overallHourly)
		if (s.overallHourly[h.hour]?.trips !== h.trips)
			out.push(`時段檔第 ${h.hour} 時與主檔不同`);
	const byPair = new Map(
		s.allOdPairs.map((o) => [`${o.boardStop} -> ${o.alightStop}`, o]),
	);
	for (const x of t.topOdHourly) {
		const o = byPair.get(x.odPair);
		if (!o || o.trips !== x.trips || o.hourly.some((n, i) => n !== x.hourly[i]))
			out.push(`時段檔的 OD「${x.odPair}」與主檔不同`);
	}
	return out;
}

export function assembleData(
	summary: BehaviorAnalysisSummary,
	clusters: ClusterFile,
	temporal: TemporalFile,
): Parsed<BehaviorData> {
	const issues = crossCheck(summary, clusters, temporal);
	return issues.length > 0
		? fail(issues)
		: { ok: true, data: { summary, clusters, temporal } };
}

/* ------------------------------------------------------------------ */
/* loader                                                              */
/* ------------------------------------------------------------------ */

/** Fetch one JSON file; every failure becomes a readable message instead of a throw. */
export async function loadJson<T>(
	url: string,
	parse: (v: unknown) => Parsed<T>,
	fetcher: typeof fetch = fetch,
	signal?: AbortSignal,
): Promise<Parsed<T>> {
	let res: Response;
	try {
		res = await fetcher(url, { signal });
	} catch {
		return { ok: false, message: "網路錯誤，無法取得檔案" };
	}
	if (!res.ok) return { ok: false, message: `載入失敗（HTTP ${res.status}）` };
	let json: unknown;
	try {
		json = await res.json();
	} catch {
		return { ok: false, message: "檔案無法解析為 JSON" };
	}
	try {
		return parse(json);
	} catch {
		return { ok: false, message: "資料格式與預期不符" };
	}
}

export type Loaded =
	| { state: "loading" }
	| { state: "error"; lines: string[] }
	| { state: "ready"; data: BehaviorData };

/** Load and validate all three files; errors are listed per file. */
export async function loadBehavior(
	fetcher: typeof fetch = fetch,
	signal?: AbortSignal,
): Promise<Exclude<Loaded, { state: "loading" }>> {
	const [s, c, t] = await Promise.all([
		loadJson(DATA_URLS.summary, parseSummary, fetcher, signal),
		loadJson(DATA_URLS.clusters, parseClusters, fetcher, signal),
		loadJson(DATA_URLS.temporal, parseTemporal, fetcher, signal),
	]);
	const lines: string[] = [];
	if (!s.ok) lines.push(`${DATA_URLS.summary}：${s.message}`);
	if (!c.ok) lines.push(`${DATA_URLS.clusters}：${c.message}`);
	if (!t.ok) lines.push(`${DATA_URLS.temporal}：${t.message}`);
	if (!s.ok || !c.ok || !t.ok) return { state: "error", lines };
	const merged = assembleData(s.data, c.data, t.data);
	if (!merged.ok) return { state: "error", lines: [merged.message] };
	return { state: "ready", data: merged.data };
}
