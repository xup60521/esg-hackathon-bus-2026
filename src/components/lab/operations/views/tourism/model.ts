import {
	type Attraction,
	type DayType,
	getDayType,
	type ItineraryRequest,
	isValidDateString,
	type ReachabilityResult,
	type RiskLevel,
	type ScenarioExample,
	type TimetableData,
	type TimetableTrip,
	type TouristProfile,
	timeToMinutes,
	verifyTripReachability,
} from "#/features/lab/tourism";

/* ------------------------------------------------------------------ */
/* Data files                                                          */
/* ------------------------------------------------------------------ */

export const DATA_URLS = {
	timetable: "/data/lab/tourism/timetable.json",
	attractions: "/data/lab/tourism/attractions.json",
	scenarios: "/data/lab/tourism/sample-scenarios.json",
} as const;

export type Data = { timetable: TimetableData; attractions: Attraction[] };

const isRec = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number =>
	typeof v === "number" && Number.isFinite(v);
const strArr = (v: unknown): v is string[] =>
	Array.isArray(v) && v.every(isStr);
const allStr = (r: Record<string, unknown>, keys: string[]) =>
	keys.every((k) => isStr(r[k]));

function isTrip(v: unknown): v is TimetableTrip {
	return (
		isRec(v) &&
		isNum(v.tripNumber) &&
		isStr(v.inferredSubroute) &&
		v.subrouteClassification === "inferred" &&
		isRec(v.stopTimes) &&
		Object.values(v.stopTimes).every(isStr)
	);
}

function isTable(v: unknown): boolean {
	return (
		isRec(v) &&
		isStr(v.label) &&
		isNum(v.totalTrips) &&
		Array.isArray(v.stopsHeader) &&
		v.stopsHeader.every((h) => isRec(h) && allStr(h, ["id", "name"])) &&
		Array.isArray(v.trips) &&
		v.trips.every(isTrip)
	);
}

export function isTimetable(v: unknown): v is TimetableData {
	if (!isRec(v) || !isRec(v.metadata) || !isRec(v.schedules)) return false;
	const m = v.metadata;
	return (
		allStr(m, [
			"routeNumber",
			"routeName",
			"operator",
			"authority",
			"sourceUrl",
			"snapshotSha256",
			"retrievedDate",
			"scheduleType",
			"subrouteDisclaimer",
			"lastBusDisclaimer",
		]) &&
		isValidDateString(m.retrievedDate as string) &&
		m.validityRange === "UNKNOWN" &&
		strArr(m.scheduleNotes) &&
		(
			[
				"weekday_outbound",
				"weekday_inbound",
				"holiday_outbound",
				"holiday_inbound",
			] as const
		).every((k) => isTable((v.schedules as Record<string, unknown>)[k]))
	);
}

const STATUSES = ["OFFICIAL_VERIFIED", "ASSUMED_ESTIMATE", "UNKNOWN"];

function isAttraction(v: unknown): v is Attraction {
	if (!isRec(v) || !isRec(v.provenance)) return false;
	const p = v.provenance;
	return (
		allStr(v, [
			"id",
			"name",
			"englishName",
			"stopId",
			"stopName",
			"openTime",
			"closeTime",
			"scheduleNote",
			"ticketInfo",
			"officialUrl",
		]) &&
		isNum(v.walkTimeMinutes) &&
		isNum(v.recommendedDwellMinutes) &&
		isNum(v.minDwellMinutes) &&
		(v.lastEntryTime === null || isStr(v.lastEntryTime)) &&
		(v.walkDistanceMeters === null || isNum(v.walkDistanceMeters)) &&
		(v.ticketRequired === null || typeof v.ticketRequired === "boolean") &&
		(v.coordinates === null ||
			(isRec(v.coordinates) &&
				isNum(v.coordinates.lat) &&
				isNum(v.coordinates.lon))) &&
		strArr(v.closedDays) &&
		STATUSES.includes(v.walkTimeStatus as string) &&
		STATUSES.includes(v.lastEntryStatus as string) &&
		STATUSES.includes(v.ticketStatus as string) &&
		allStr(p, [
			"exactSourceUrl",
			"evidenceBasis",
			"sourceScheduleNote",
			"retrievedDate",
		]) &&
		strArr(p.verifiedFields) &&
		strArr(p.assumedFields) &&
		strArr(p.unknownFields)
	);
}

export function isAttractionsFile(
	v: unknown,
): v is { attractions: Attraction[] } {
	return (
		isRec(v) &&
		Array.isArray(v.attractions) &&
		v.attractions.length > 0 &&
		v.attractions.every(isAttraction)
	);
}

const RISKS: RiskLevel[] = [
	"SAFE",
	"MODERATE",
	"HIGH_RISK",
	"CRITICAL",
	"STRANDED",
	"INVALID",
];

export function isScenarios(v: unknown): v is ScenarioExample[] {
	return (
		Array.isArray(v) &&
		v.every(
			(s) =>
				isRec(s) &&
				allStr(s, ["scenarioId", "title", "targetUser"]) &&
				isRec(s.request) &&
				allStr(s.request, [
					"originStopId",
					"attractionId",
					"departureDate",
					"departureTime",
				]) &&
				isRec(s.result) &&
				s.result.status === "conditional_snapshot_simulation" &&
				typeof s.result.isValid === "boolean" &&
				(s.result.lastBusRisk === null ||
					(isRec(s.result.lastBusRisk) &&
						RISKS.includes(s.result.lastBusRisk.riskLevel as RiskLevel))),
		)
	);
}

export type Loaded<T> = { ok: true; data: T } | { ok: false; message: string };

/** Fetch one JSON file; every failure becomes a readable message instead of a throw. */
export async function loadJson<T>(
	url: string,
	guard: (v: unknown) => v is T,
	fetcher: typeof fetch = fetch,
	signal?: AbortSignal,
): Promise<Loaded<T>> {
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
	if (!guard(json)) return { ok: false, message: "資料格式與預期不符" };
	return { ok: true, data: json };
}

/* ------------------------------------------------------------------ */
/* Stops                                                               */
/* ------------------------------------------------------------------ */

export type StopOption = { id: string; name: string };

const TABLES = [
	"weekday_outbound",
	"weekday_inbound",
	"holiday_outbound",
	"holiday_inbound",
] as const;

/** Every stop that has at least one scheduled time in some table, in timetable order. */
export function originOptions(t: TimetableData): StopOption[] {
	const used = new Set<string>();
	for (const k of TABLES)
		for (const trip of t.schedules[k].trips)
			for (const id of Object.keys(trip.stopTimes)) used.add(id);
	return t.schedules.weekday_outbound.stopsHeader.filter((h) => used.has(h.id));
}

export function stopNames(t: TimetableData): Map<string, string> {
	const m = new Map<string, string>();
	for (const k of TABLES)
		for (const h of t.schedules[k].stopsHeader) m.set(h.id, h.name);
	return m;
}

/* ------------------------------------------------------------------ */
/* Form + reducer                                                      */
/* ------------------------------------------------------------------ */

export type DayTypeChoice = "auto" | DayType;

export type FormState = {
	originStopId: string;
	attractionId: string;
	date: string;
	time: string;
	/** raw text; "" means "use the attraction's suggested dwell" */
	dwell: string;
	profile: TouristProfile;
	dayType: DayTypeChoice;
};

export type FormErrors = Partial<
	Record<"originStopId" | "attractionId" | "date" | "time" | "dwell", string>
>;

export type ParseResult =
	| { ok: true; request: ItineraryRequest }
	| { ok: false; errors: FormErrors };

/**
 * Blocks only input that cannot even be expressed as a request (blank, malformed, unknown id,
 * non-integer text). Everything that parses is passed to the engine, which owns the rules
 * (history before the snapshot, closing time, weekly closure, same-stop, ...).
 */
export function parseForm(f: FormState, data: Data): ParseResult {
	const errors: FormErrors = {};
	const stops = new Set(originOptions(data.timetable).map((s) => s.id));
	if (!stops.has(f.originStopId)) errors.originStopId = "請選擇班表中的出發站";
	if (!data.attractions.some((a) => a.id === f.attractionId))
		errors.attractionId = "請選擇景點";
	if (f.date === "") errors.date = "請輸入出發日期";
	else if (!isValidDateString(f.date))
		errors.date = "日期須為真實存在的 YYYY-MM-DD";
	if (f.time === "") errors.time = "請輸入出發時間";
	else if (timeToMinutes(f.time) < 0) errors.time = "時間須為 24 小時制 HH:MM";
	let dwell: number | undefined;
	if (f.dwell.trim() !== "") {
		const n = Number(f.dwell.trim());
		if (!Number.isInteger(n))
			errors.dwell = "停留須為整數分鐘，或留空使用建議值";
		else dwell = n;
	}
	if (Object.keys(errors).length > 0) return { ok: false, errors };
	return {
		ok: true,
		request: {
			originStopId: f.originStopId,
			attractionId: f.attractionId,
			departureDate: f.date,
			departureTime: f.time,
			...(dwell === undefined ? {} : { customDwellMinutes: dwell }),
			profile: f.profile,
			...(f.dayType === "auto" ? {} : { dayTypeOverride: f.dayType }),
		},
	};
}

export function formFromRequest(r: ItineraryRequest): FormState {
	return {
		originStopId: r.originStopId,
		attractionId: r.attractionId,
		date: r.departureDate,
		time: r.departureTime,
		dwell:
			r.customDwellMinutes === undefined ? "" : String(r.customDwellMinutes),
		profile: r.profile ?? "general",
		dayType: r.dayTypeOverride ?? "auto",
	};
}

export function initialForm(
	data: Data,
	scenarios: ScenarioExample[] | null,
): FormState {
	const first = scenarios?.[0]?.request;
	if (first) return formFromRequest(first);
	return {
		originStopId: originOptions(data.timetable)[0]?.id ?? "",
		attractionId: data.attractions[0]?.id ?? "",
		date: data.timetable.metadata.retrievedDate,
		time: "09:00",
		dwell: "",
		profile: "general",
		dayType: "auto",
	};
}

export type Run = {
	request: ItineraryRequest;
	result: ReachabilityResult;
	scenarioId: string | null;
};

export type State = {
	form: FormState;
	errors: FormErrors;
	run: Run | null;
	/** the form changed after `run` was produced */
	stale: boolean;
	engineError: string | null;
};

export type Action =
	| { type: "patch"; patch: Partial<FormState> }
	| { type: "submit"; data: Data }
	| { type: "load"; scenario: ScenarioExample; data: Data };

export function initialState(form: FormState): State {
	return { form, errors: {}, run: null, stale: false, engineError: null };
}

function execute(
	form: FormState,
	data: Data,
	scenarioId: string | null,
): Pick<State, "errors" | "run" | "engineError"> | { fail: FormErrors } {
	const parsed = parseForm(form, data);
	if (!parsed.ok) return { fail: parsed.errors };
	try {
		const result = verifyTripReachability(
			parsed.request,
			data.timetable,
			data.attractions,
		);
		return {
			errors: {},
			engineError: null,
			run: { request: parsed.request, result, scenarioId },
		};
	} catch (e) {
		return {
			errors: {},
			engineError: e instanceof Error ? e.message : "模擬引擎發生未知例外",
			run: null,
		};
	}
}

export function reducer(state: State, action: Action): State {
	switch (action.type) {
		case "patch":
			return {
				...state,
				form: { ...state.form, ...action.patch },
				errors: {},
				stale: state.run !== null,
			};
		case "submit": {
			const r = execute(state.form, action.data, null);
			if ("fail" in r) return { ...state, errors: r.fail };
			return { ...state, ...r, stale: false };
		}
		case "load": {
			const form = formFromRequest(action.scenario.request);
			const r = execute(form, action.data, action.scenario.scenarioId);
			if ("fail" in r) return { ...state, form, errors: r.fail };
			return { ...state, ...r, form, stale: false };
		}
	}
}

/* ------------------------------------------------------------------ */
/* Labels and result helpers                                           */
/* ------------------------------------------------------------------ */

export const PROFILE_LABEL: Record<TouristProfile, string> = {
	general: "一般（步行 ×1.0）",
	family: "親子（步行 ×1.3）",
	senior_accessible: "長者／行動較慢（步行 ×1.4）",
};

export const DAYTYPE_LABEL: Record<DayType, string> = {
	weekday: "平日班表",
	holiday: "假日班表",
};

const WEEKDAY_ZH: Record<string, string> = {
	Monday: "週一",
	Tuesday: "週二",
	Wednesday: "週三",
	Thursday: "週四",
	Friday: "週五",
	Saturday: "週六",
	Sunday: "週日",
};

export function weekdayZh(english: string): string {
	return WEEKDAY_ZH[english] ?? english;
}

/** What the timetable notes say about a calendar date, before any override. Null if the date is not real. */
export function dayTypePreview(
	date: string,
): { weekday: string; dayType: DayType } | null {
	const d = getDayType(date);
	return d.isValidDate
		? { weekday: weekdayZh(d.dayOfWeek), dayType: d.dayType }
		: null;
}

export const RISK_META: Record<
	RiskLevel,
	{ label: string; tone: string; note: string }
> = {
	SAFE: {
		label: "快照內有緩衝",
		tone: "--sev-info",
		note: "只代表快照班次之間留有時間，不是安全保證，也不保證準點或有座位。",
	},
	MODERATE: {
		label: "緩衝偏少",
		tone: "--sev-watch",
		note: "距末班車的緩衝不多，錯過此班的選擇有限。",
	},
	HIGH_RISK: {
		label: "高風險：緩衝很少",
		tone: "--sev-watch",
		note: "距末班車緩衝很少，快照內剩餘班次不多。",
	},
	CRITICAL: {
		label: "臨界：快照內最後一班",
		tone: "--sev-review",
		note: "此班即為快照中可回到出發站的最後一班。",
	},
	STRANDED: {
		label: "快照內已無回程班次",
		tone: "--sev-review",
		note: "抵達站牌時已晚於快照中回到出發站的末班車；其他服務未查證。",
	},
	INVALID: {
		label: "快照內無可回程班次",
		tone: "--sev-review",
		note: "快照中此站在該日型沒有可直達出發站的班次，無末班車可比較。",
	},
};

type Risk = NonNullable<ReachabilityResult["lastBusRisk"]>;

/** The engine uses "00:00" and -999 as "no match" sentinels for INVALID; never show them as real values. */
export function lastBusText(risk: Risk): string {
	return risk.riskLevel === "INVALID"
		? "無（快照中無匹配班次）"
		: risk.lastBusDepartureTime;
}

export function bufferText(risk: Risk): string {
	if (risk.riskLevel === "INVALID") return "無（沒有末班可比較）";
	if (risk.bufferMinutes < 0) return `晚於末班 ${-risk.bufferMinutes} 分鐘`;
	return `${risk.bufferMinutes} 分鐘`;
}

export const DAYTYPE_SOURCE_LABEL: Record<
	ReachabilityResult["dayTypeSource"],
	string
> = {
	OFFICIAL_NOTES_CALENDAR:
		"依班表備註推算（週一至週四平日、週五至週日假日；未另推定國定假日）",
	MANUAL_OVERRIDE: "手動覆寫（只切換班表，景點公休仍依實際日期的星期判斷）",
};

export const TIMETABLE_STATUS_LABEL: Record<
	ReachabilityResult["timetableStatus"],
	string
> = {
	OFFICIAL_SCHEDULED: "使用官網排定班表快照（不代表當日行駛已確認）",
	NO_ACTIVE_SCHEDULE: "本次未採用任何班表",
};

/** Same text can repeat across engine layers; show it once. */
export function uniqueWarnings(warnings: string[]): string[] {
	return [...new Set(warnings)];
}

export type Segment = {
	key: string;
	label: string;
	start: number;
	end: number;
};

export const SEGMENT_COLOR: Record<string, string> = {
	ride_out: "var(--boarding)",
	walk_in: "var(--muted)",
	wait_open: "var(--axis)",
	dwell: "var(--middle)",
	walk_back: "var(--muted)",
	wait_bus: "var(--axis)",
	ride_back: "var(--alighting)",
};

/** Time segments that exist in the result, in order. Empty if any time is inconsistent. */
export function buildSegments(result: ReachabilityResult): Segment[] {
	const { outbound, dwell, inbound } = result;
	if (!outbound) return [];
	const t = (s: string) => timeToMinutes(s);
	const raw: Segment[] = [
		{
			key: "ride_out",
			label: "去程乘車",
			start: t(outbound.departureTime),
			end: t(outbound.arrivalTime),
		},
		{
			key: "walk_in",
			label: "步行到景點",
			start: t(outbound.arrivalTime),
			end: t(outbound.attractionArrivalTime),
		},
	];
	if (dwell) {
		const leave = t(dwell.attractionDepartureTime);
		const visitStart = leave - dwell.actualDwellMinutes;
		raw.push(
			{
				key: "wait_open",
				label: "等待開門",
				start: t(dwell.attractionArrivalTime),
				end: visitStart,
			},
			{ key: "dwell", label: "景點停留", start: visitStart, end: leave },
			{
				key: "walk_back",
				label: "步行回站牌",
				start: leave,
				end: t(dwell.busStopArrivalTime),
			},
		);
		if (inbound)
			raw.push(
				{
					key: "wait_bus",
					label: "候車",
					start: t(dwell.busStopArrivalTime),
					end: t(inbound.departureTime),
				},
				{
					key: "ride_back",
					label: "回程乘車",
					start: t(inbound.departureTime),
					end: t(inbound.destinationArrivalTime),
				},
			);
	}
	if (raw.some((s) => s.start < 0 || s.end < s.start)) return [];
	return raw.filter((s) => s.end > s.start);
}

/** Compare the parts of a result that matter, to check a stored example against a fresh run. */
export function sameOutcome(
	a: ReachabilityResult,
	b: ReachabilityResult,
): boolean {
	const key = (r: ReachabilityResult) =>
		JSON.stringify([
			r.isValid,
			r.invalidReason ?? null,
			r.dayType,
			r.outbound?.tripNumber ?? null,
			r.inbound?.tripNumber ?? null,
			r.lastBusRisk?.riskLevel ?? null,
			r.lastBusRisk?.bufferMinutes ?? null,
		]);
	return key(a) === key(b);
}

/* ------------------------------------------------------------------ */
/* Attraction provenance, item by item                                 */
/* ------------------------------------------------------------------ */

export type Basis = "supported" | "assumed" | "unknown";

export const BASIS_LABEL: Record<Basis, string> = {
	supported: "有正文摘要支持",
	assumed: "演算法假設",
	unknown: "未知",
};

const FIELD_LABEL: Record<string, string> = {
	name: "景點名稱",
	openTime: "開放時間",
	closeTime: "閉館時間",
	lastEntryTime: "最後入園",
	closedDays: "每週公休",
	scheduleNote: "營業說明",
	stopId: "對應站牌代碼",
	stopName: "對應站牌",
	walkTimeMinutes: "站牌與景點間步行",
	recommendedDwellMinutes: "建議停留",
	minDwellMinutes: "最短停留",
	coordinates: "座標",
	walkDistanceMeters: "步行距離",
	ticketInfo: "收費條件與金額",
	ticketRequired: "是否收費",
};

const DAY_EN_TO_ZH: Record<string, string> = WEEKDAY_ZH;

export function fieldLabel(key: string): string {
	return FIELD_LABEL[key] ?? key;
}

/** Value shown next to a provenance field. Prices are never shown; unknown stays unknown. */
export function fieldValue(a: Attraction, key: string): string {
	switch (key) {
		case "name":
			return a.name;
		case "openTime":
			return a.openTime;
		case "closeTime":
			return a.closeTime;
		case "lastEntryTime":
			return a.lastEntryTime ?? "未知";
		case "closedDays":
			return a.closedDays.length
				? a.closedDays.map((d) => DAY_EN_TO_ZH[d] ?? d).join("、")
				: "資料中未列每週公休";
		case "scheduleNote":
			return a.scheduleNote;
		case "stopId":
			return a.stopId;
		case "stopName":
			return a.stopName;
		case "walkTimeMinutes":
			return `${a.walkTimeMinutes} 分鐘（未實測路徑）`;
		case "recommendedDwellMinutes":
			return `${a.recommendedDwellMinutes} 分鐘`;
		case "minDwellMinutes":
			return `${a.minDwellMinutes} 分鐘（僅提示，引擎不強制）`;
		case "coordinates":
			return a.coordinates
				? `${a.coordinates.lat}, ${a.coordinates.lon}`
				: "無";
		case "walkDistanceMeters":
			return a.walkDistanceMeters === null
				? "無"
				: `${a.walkDistanceMeters} 公尺`;
		case "ticketInfo":
			return "未核實，不顯示金額；請向景點確認";
		case "ticketRequired":
			return a.ticketRequired === null
				? "未知"
				: a.ticketRequired
					? "需收費（金額未知）"
					: "不需收費";
		default:
			return "—";
	}
}

export type ProvenanceRow = {
	key: string;
	label: string;
	basis: Basis;
	value: string;
};

export function provenanceRows(a: Attraction): ProvenanceRow[] {
	const p = a.provenance;
	const rows: ProvenanceRow[] = [];
	const add = (keys: string[], basis: Basis) => {
		for (const key of keys)
			rows.push({
				key: `${basis}:${key}`,
				label: fieldLabel(key),
				basis,
				value:
					basis === "unknown" && key !== "ticketInfo"
						? "未知"
						: fieldValue(a, key),
			});
	};
	add(p.verifiedFields, "supported");
	add(p.assumedFields, "assumed");
	add(p.unknownFields, "unknown");
	return rows;
}

export function requestSummary(
	r: ItineraryRequest,
	names: Map<string, string>,
	attractions: Attraction[],
): string {
	const a = attractions.find((x) => x.id === r.attractionId);
	const dwell =
		r.customDwellMinutes === undefined
			? "停留用建議值"
			: `停留 ${r.customDwellMinutes} 分`;
	return `${names.get(r.originStopId) ?? r.originStopId} → ${a?.name ?? r.attractionId}，${r.departureDate} ${r.departureTime}，${dwell}`;
}
