/**
 * Mid-stop boarding dip analysis (see docs/midstop-analysis.md).
 *
 * Question: when endpoint stops are unusually busy, is boarding at the middle
 * stops (lag hours later/earlier) unusually low? Everything is compared against
 * a baseline of the same sub-route set, direction, hour, weekday and month,
 * excluding the observed day. This yields a statistical lead only — card data
 * cannot see people who failed to board.
 */

export type Direction = "outbound" | "inbound" | "unknown";
/** [date, subroute, direction, stop, hour, boardings, alightings] */
export type Row = [string, string, Direction, string, number, number, number];
export type MidstopData = {
	generatedAt: string;
	columns: string[];
	stops: { name: string; order: number }[];
	rows: Row[];
	notes: string[];
};

export type Role = "endpoint" | "middle" | "off";
export type Reference = "board" | "alight";

export type Params = {
	subroutes: string[];
	direction: "outbound" | "inbound";
	from: string;
	to: string;
	roles: Record<string, Role>;
	/** which endpoint series defines a "busy endpoint" slot */
	reference: Reference;
	/** middle hour = reference hour + lag (may cross into the next/previous date) */
	lag: number;
};

/** Thresholds are deliberately fixed and shown in the UI. */
export const RULES = {
	minBaselineDays: 2,
	highRatio: 1.5,
	highMinExcess: 10,
	lowRatio: 0.5,
	minMidBase: 3,
} as const;

export type Slot = {
	date: string;
	hour: number;
	midDate: string;
	midHour: number;
	endBoard: number;
	endAlight: number;
	ref: number;
	refBase: number | null;
	mid: number | null;
	midBase: number | null;
	baseDays: number;
	high: boolean;
	candidate: boolean;
};

export type Bin = {
	label: string;
	slots: number;
	mid: number;
	midBase: number;
	/** pooled middle boardings / pooled middle baseline, null when baseline is 0 */
	ratio: number | null;
};

export type Analysis = {
	activeDates: number;
	slots: Slot[];
	candidates: Slot[];
	/** average per active date in range, by hour (no lag) */
	profile: { endBoard: number[]; endAlight: number[]; mid: number[] };
	bins: Bin[];
	high: Bin;
	other: Bin;
	/** Pearson r between endpoint and middle deviations from baseline */
	correlation: { r: number | null; n: number };
	verdict: "insufficient" | "not-supported" | "weak" | "signal";
};

const WEEKDAY = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const groupKey = (date: string) =>
	`${date.slice(0, 7)}|${WEEKDAY(date)}`;

export function shiftHour(date: string, hour: number, lag: number) {
	const t = Date.parse(`${date}T00:00:00Z`) + (hour + lag) * 3_600_000;
	const d = new Date(t);
	return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

export function pearson(xs: number[], ys: number[]): number | null {
	const n = xs.length;
	if (n < 3 || ys.length !== n) return null;
	const mx = xs.reduce((a, b) => a + b, 0) / n;
	const my = ys.reduce((a, b) => a + b, 0) / n;
	let sxy = 0;
	let sxx = 0;
	let syy = 0;
	for (let i = 0; i < n; i++) {
		const dx = xs[i] - mx;
		const dy = ys[i] - my;
		sxy += dx * dy;
		sxx += dx * dx;
		syy += dy * dy;
	}
	if (sxx === 0 || syy === 0) return null;
	return sxy / Math.sqrt(sxx * syy);
}

type Series = Map<string, Float64Array>;

/** Mean over the other active dates in the same month+weekday group; null if too few. */
function baseline(
	series: Series,
	groups: Map<string, string[]>,
	date: string,
	hour: number,
) {
	const peers = (groups.get(groupKey(date)) ?? []).filter((d) => d !== date);
	if (peers.length < RULES.minBaselineDays) return { value: null, days: 0 };
	let sum = 0;
	for (const d of peers) sum += series.get(d)?.[hour] ?? 0;
	return { value: sum / peers.length, days: peers.length };
}

const ENDPOINT_BINS: [string, number, number][] = [
	["< 0.75×", 0, 0.75],
	["0.75–1.25×", 0.75, 1.25],
	["1.25–1.5×", 1.25, 1.5],
	["1.5–2×", 1.5, 2],
	["≥ 2×", 2, Number.POSITIVE_INFINITY],
];

function pool(label: string, slots: Slot[]): Bin {
	let mid = 0;
	let midBase = 0;
	for (const s of slots) {
		mid += s.mid ?? 0;
		midBase += s.midBase ?? 0;
	}
	return {
		label,
		slots: slots.length,
		mid,
		midBase,
		ratio: midBase > 0 ? mid / midBase : null,
	};
}

export function analyze(rows: Row[], p: Params): Analysis {
	const subs = new Set(p.subroutes);
	const empty = () => new Float64Array(24);

	// Dates where the selected sub-routes have *any* record. Only these get
	// zero-valued slots; whole missing dates are never zero-filled.
	const active = new Set<string>();
	for (const r of rows) if (subs.has(r[1])) active.add(r[0]);
	const endBoard: Series = new Map();
	const endAlight: Series = new Map();
	const mid: Series = new Map();
	for (const d of active) {
		endBoard.set(d, empty());
		endAlight.set(d, empty());
		mid.set(d, empty());
	}
	for (const [date, sub, dir, stop, hour, b, a] of rows) {
		if (dir !== p.direction || !subs.has(sub)) continue;
		const role = p.roles[stop] ?? "off";
		if (role === "endpoint") {
			(endBoard.get(date) as Float64Array)[hour] += b;
			(endAlight.get(date) as Float64Array)[hour] += a;
		} else if (role === "middle") {
			(mid.get(date) as Float64Array)[hour] += b;
		}
	}

	const groups = new Map<string, string[]>();
	for (const d of [...active].sort()) {
		const k = groupKey(d);
		const g = groups.get(k);
		if (g) g.push(d);
		else groups.set(k, [d]);
	}

	const refSeries = p.reference === "board" ? endBoard : endAlight;
	const inRange = [...active].filter((d) => d >= p.from && d <= p.to).sort();
	const profile = { endBoard: empty(), endAlight: empty(), mid: empty() };
	const slots: Slot[] = [];
	for (const date of inRange) {
		for (let hour = 0; hour < 24; hour++) {
			const eb = endBoard.get(date)?.[hour] ?? 0;
			const ea = endAlight.get(date)?.[hour] ?? 0;
			profile.endBoard[hour] += eb / inRange.length;
			profile.endAlight[hour] += ea / inRange.length;
			profile.mid[hour] += (mid.get(date)?.[hour] ?? 0) / inRange.length;

			const ref = p.reference === "board" ? eb : ea;
			const rb = baseline(refSeries, groups, date, hour);
			const m = shiftHour(date, hour, p.lag);
			const midKnown = active.has(m.date);
			const mv = midKnown ? (mid.get(m.date)?.[m.hour] ?? 0) : null;
			const mb = midKnown
				? baseline(mid, groups, m.date, m.hour)
				: { value: null, days: 0 };
			// skip slots with no activity and no expected activity (night hours)
			if (!ref && !rb.value && !mv && !mb.value) continue;
			const high =
				rb.value !== null &&
				ref >= RULES.highRatio * rb.value &&
				ref - rb.value >= RULES.highMinExcess;
			const candidate =
				high &&
				mv !== null &&
				mb.value !== null &&
				mb.value >= RULES.minMidBase &&
				mv <= RULES.lowRatio * mb.value;
			slots.push({
				date,
				hour,
				midDate: m.date,
				midHour: m.hour,
				endBoard: eb,
				endAlight: ea,
				ref,
				refBase: rb.value,
				mid: mv,
				midBase: mb.value,
				baseDays: Math.min(rb.days, mb.days),
				high,
				candidate,
			});
		}
	}

	// Comparable slots: both baselines exist and the middle normally sees riders.
	const comparable = slots.filter(
		(s) =>
			s.refBase !== null &&
			s.midBase !== null &&
			s.mid !== null &&
			s.midBase >= RULES.minMidBase,
	);
	const refRatio = (s: Slot) =>
		(s.refBase as number) > 0
			? s.ref / (s.refBase as number)
			: Number.POSITIVE_INFINITY;
	const bins = ENDPOINT_BINS.map(([label, lo, hi]) =>
		pool(
			label,
			comparable.filter((s) => refRatio(s) >= lo && refRatio(s) < hi),
		),
	);
	const high = pool(
		"端點高峰",
		comparable.filter((s) => s.high),
	);
	const other = pool(
		"其他時段",
		comparable.filter((s) => !s.high),
	);
	const xs = comparable.map((s) => s.ref - (s.refBase as number));
	const ys = comparable.map((s) => (s.mid as number) - (s.midBase as number));
	const correlation = { r: pearson(xs, ys), n: comparable.length };

	let verdict: Analysis["verdict"] = "insufficient";
	if (high.slots >= 10 && high.ratio !== null && other.ratio !== null) {
		const gap = other.ratio - high.ratio;
		verdict = gap <= 0 ? "not-supported" : gap < 0.1 ? "weak" : "signal";
	}

	return {
		activeDates: inRange.length,
		slots,
		candidates: slots
			.filter((s) => s.candidate)
			.sort(
				(a, b) =>
					(a.mid as number) / (a.midBase as number) -
						(b.mid as number) / (b.midBase as number) || b.ref - a.ref,
			),
		profile: {
			endBoard: [...profile.endBoard],
			endAlight: [...profile.endAlight],
			mid: [...profile.mid],
		},
		bins,
		high,
		other,
		correlation,
		verdict,
	};
}

/** Whole-file totals for the data-quality panel. */
export function quality(rows: Row[], subroutes: string[]) {
	const subs = new Set(subroutes);
	let boardings = 0;
	let alightings = 0;
	let unknown = 0;
	let selectedTotal = 0;
	let invalid = 0;
	const dates = new Set<string>();
	for (const r of rows) {
		const [date, , dir, , hour, b, a] = r;
		if (
			r.length !== 7 ||
			!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
			!Number.isInteger(hour) ||
			hour < 0 ||
			hour > 23 ||
			!(b >= 0 && a >= 0) ||
			!["outbound", "inbound", "unknown"].includes(dir)
		)
			invalid++;
		boardings += b;
		alightings += a;
		dates.add(date);
		if (subs.has(r[1])) {
			selectedTotal += b;
			if (dir === "unknown") unknown += b;
		}
	}
	const sorted = [...dates].sort();
	return {
		rows: rows.length,
		invalid,
		boardings,
		alightings,
		dates: sorted.length,
		first: sorted[0],
		last: sorted.at(-1),
		selectedTotal,
		unknown,
	};
}

const csvCell = (v: string | number | null) => {
	const s = v === null ? "" : String(v);
	return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const round = (v: number | null) =>
	v === null ? null : Math.round(v * 100) / 100;

export function slotsToCsv(slots: Slot[], p: Params) {
	const head = [
		"date",
		"hour",
		"endpoint_boardings",
		"endpoint_alightings",
		`reference_${p.reference}`,
		"reference_baseline",
		"middle_date",
		"middle_hour",
		"middle_boardings",
		"middle_baseline",
		"baseline_days",
		"endpoint_high",
		"candidate",
	];
	const lines = slots.map((s) =>
		[
			s.date,
			s.hour,
			s.endBoard,
			s.endAlight,
			s.ref,
			round(s.refBase),
			s.midDate,
			s.midHour,
			s.mid,
			round(s.midBase),
			s.baseDays,
			s.high ? 1 : 0,
			s.candidate ? 1 : 0,
		]
			.map(csvCell)
			.join(","),
	);
	const meta = `# direction=${p.direction};subroutes=${p.subroutes.join("|")};lag=${p.lag};endpoints=${Object.keys(
		p.roles,
	)
		.filter((k) => p.roles[k] === "endpoint")
		.join("|")};middle=${Object.keys(p.roles)
		.filter((k) => p.roles[k] === "middle")
		.join("|")}`;
	return [meta, head.join(","), ...lines].join("\n");
}

/** Default roles: terminal groups (orders 1–3, 14–16) are endpoints; 4–13 are middle. */
export function defaultRoles(stops: { name: string; order: number }[]) {
	const roles: Record<string, Role> = {};
	for (const s of stops)
		roles[s.name] = s.order <= 3 || s.order >= 14 ? "endpoint" : "middle";
	return roles;
}
