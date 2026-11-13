/**
 * /lab/visualization data model: a compact columnar copy of public/data/midstop.json plus the
 * filter → aggregate logic. Pure functions only, so the same code runs in the page, the build
 * script and the tests.
 *
 * Source rows are (date, sub-route, direction, stop, hour, boardings, alightings) buckets of
 * smart-card taps. They are NOT trips, wait times or demand: only people who tapped on are seen.
 */

export type Direction = "outbound" | "inbound" | "unknown";
export type SourceRow = [
	string,
	string,
	Direction,
	string,
	number,
	number,
	number,
];
export type SourceData = {
	generatedAt: string;
	stops: { name: string; order: number }[];
	rows: SourceRow[];
	notes: string[];
};

export const DIRS: Direction[] = ["outbound", "inbound", "unknown"];
const HOURS = 24;

/** key = ((sub * 3 + dir) * stopCount + stop) * 24 + hour */
export type Cube = {
	meta: {
		generatedAt: string;
		source: string;
		rowCount: number;
		totalBoardings: number;
		totalAlightings: number;
		notes: string[];
	};
	subs: string[];
	stops: { name: string; order: number }[];
	/** dates that have at least one record, ascending */
	dates: string[];
	/** rows of dates[i] are keys[dateOffsets[i] .. dateOffsets[i+1]) */
	dateOffsets: number[];
	keys: number[];
	b: number[];
	a: number[];
};

export type CalendarFile = {
	retrievedAt: string;
	dataset: string;
	provider: string;
	sources: {
		year: number;
		label: string;
		days: number;
		sha256: string;
		url: string;
	}[];
	days: Record<string, { rest: boolean; note?: string }>;
};

export function encodeCube(src: SourceData, sourceLabel: string): Cube {
	const subs = [...new Set(src.rows.map((r) => r[1]))].sort();
	const stopIdx = new Map(src.stops.map((s, i) => [s.name, i]));
	const rows = src.rows
		.map((r) => ({
			r,
			s: subs.indexOf(r[1]),
			d: DIRS.indexOf(r[2]),
			p: stopIdx.get(r[3]),
		}))
		.map((x) => {
			if (x.p === undefined || x.d < 0)
				throw new Error(`unknown stop/direction: ${x.r.join(",")}`);
			return {
				date: x.r[0],
				key: ((x.s * 3 + x.d) * src.stops.length + x.p) * HOURS + x.r[4],
				b: x.r[5],
				a: x.r[6],
			};
		})
		.sort((x, y) =>
			x.date < y.date ? -1 : x.date > y.date ? 1 : x.key - y.key,
		);
	const dates: string[] = [];
	const dateOffsets: number[] = [];
	rows.forEach((r, i) => {
		if (dates[dates.length - 1] !== r.date) {
			dates.push(r.date);
			dateOffsets.push(i);
		}
	});
	dateOffsets.push(rows.length);
	return {
		meta: {
			generatedAt: src.generatedAt,
			source: sourceLabel,
			rowCount: rows.length,
			totalBoardings: rows.reduce((s, r) => s + r.b, 0),
			totalAlightings: rows.reduce((s, r) => s + r.a, 0),
			notes: src.notes,
		},
		subs,
		stops: src.stops,
		dates,
		dateOffsets,
		keys: rows.map((r) => r.key),
		b: rows.map((r) => r.b),
		a: rows.map((r) => r.a),
	};
}

/** Decoded, typed-array view of a Cube for fast scans. */
export type Table = {
	cube: Cube;
	n: number;
	sub: Uint8Array;
	dir: Uint8Array;
	stop: Uint8Array;
	hour: Uint8Array;
	b: Int32Array;
	a: Int32Array;
	dateIndex: Map<string, number>;
	/** subHas[sub * dates.length + dateIdx] = 1 when that sub-route has any record on that date */
	subHas: Uint8Array;
};

export function decodeCube(cube: Cube): Table {
	const n = cube.keys.length;
	const S = cube.stops.length;
	const sub = new Uint8Array(n);
	const dir = new Uint8Array(n);
	const stop = new Uint8Array(n);
	const hour = new Uint8Array(n);
	const nd = cube.dates.length;
	const subHas = new Uint8Array(cube.subs.length * nd);
	for (let di = 0; di < nd; di++) {
		for (let i = cube.dateOffsets[di]; i < cube.dateOffsets[di + 1]; i++) {
			const k = cube.keys[i];
			hour[i] = k % HOURS;
			stop[i] = Math.floor(k / HOURS) % S;
			const sd = Math.floor(k / (HOURS * S));
			dir[i] = sd % 3;
			sub[i] = Math.floor(sd / 3);
			subHas[sub[i] * nd + di] = 1;
		}
	}
	return {
		cube,
		n,
		sub,
		dir,
		stop,
		hour,
		b: Int32Array.from(cube.b),
		a: Int32Array.from(cube.a),
		dateIndex: new Map(cube.dates.map((d, i) => [d, i])),
		subHas,
	};
}

// ── dates ───────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Monday = 0 … Sunday = 6 */
export const weekdayOf = (d: string) =>
	(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;

export function dateRange(from: string, to: string): string[] {
	const out: string[] = [];
	for (let t = toMs(from); t <= toMs(to); t += DAY_MS) out.push(toIso(t));
	return out;
}

// ── filter / aggregate ──────────────────────────────────────────────────────────

export type DayType = "all" | "work" | "rest";
export type Filter = {
	/** indexes into cube.subs */
	subs: number[];
	direction: "all" | "outbound" | "inbound";
	/** indexes into cube.stops; boardings/alightings of other stops are not counted */
	stops: number[];
	from: string;
	to: string;
	dayType: DayType;
};

/**
 * active: the date has records for a selected sub-route; zero buckets are filled only on such dates.
 * missing: the whole dataset has no record on that date (not a zero, not proof of no service).
 * inactive: the dataset has records that day but none for the selected sub-routes.
 * excluded: removed by the day-type filter (checked first, so missing dates of an excluded day type are not reported).
 */
export type DayStatus = "active" | "missing" | "inactive" | "excluded";

export type DayRow = {
	date: string;
	weekday: number;
	rest: boolean;
	status: DayStatus;
	b: number;
	a: number;
};

export type HourSums = { b: number[]; a: number[]; days: number };
export type Analysis = {
	days: DayRow[];
	activeDays: number;
	missingDays: string[];
	inactiveDays: number;
	totalB: number;
	totalA: number;
	/** hour profile summed over active days, by day type; divide by `days` for per-day average */
	hours: Record<"all" | "work" | "rest", HourSums>;
	/** weekday (Mon=0) × hour sums over active days */
	weekdayHour: { b: number[][]; a: number[][]; days: number[] };
	/** per stop, ignoring the stop filter (other filters applied) */
	stopTotals: { b: number; a: number }[];
	/** boardings/alightings of "unknown" direction that were dropped by a direction filter */
	unknownDropped: { b: number; a: number };
	months: MonthRow[];
};

export type MonthRow = {
	month: string;
	calendarDays: number;
	activeDays: number;
	missingDays: number;
	b: number;
	a: number;
};

const zeros = (n: number) => new Array<number>(n).fill(0);
const emptyHours = (): HourSums => ({
	b: zeros(HOURS),
	a: zeros(HOURS),
	days: 0,
});

export function isRestDay(cal: CalendarFile, date: string): boolean {
	const c = cal.days[date];
	return c ? c.rest : weekdayOf(date) >= 5;
}

export function analyze(t: Table, cal: CalendarFile, f: Filter): Analysis {
	const { cube } = t;
	const subMask = new Uint8Array(cube.subs.length);
	for (const s of f.subs) subMask[s] = 1;
	const stopMask = new Uint8Array(cube.stops.length);
	for (const s of f.stops) stopMask[s] = 1;
	const dirWanted = f.direction === "all" ? -1 : DIRS.indexOf(f.direction);
	const nd = cube.dates.length;

	const hours = { all: emptyHours(), work: emptyHours(), rest: emptyHours() };
	const weekdayHour = {
		b: Array.from({ length: 7 }, () => zeros(HOURS)),
		a: Array.from({ length: 7 }, () => zeros(HOURS)),
		days: zeros(7),
	};
	const stopTotals = cube.stops.map(() => ({ b: 0, a: 0 }));
	const unknownDropped = { b: 0, a: 0 };
	const days: DayRow[] = [];
	const missingDays: string[] = [];
	let inactiveDays = 0;
	let activeDays = 0;
	let totalB = 0;
	let totalA = 0;

	for (const date of dateRange(f.from, f.to)) {
		const rest = isRestDay(cal, date);
		const weekday = weekdayOf(date);
		const row: DayRow = { date, weekday, rest, status: "active", b: 0, a: 0 };
		days.push(row);
		if ((f.dayType === "work" && rest) || (f.dayType === "rest" && !rest)) {
			row.status = "excluded";
			continue;
		}
		const di = t.dateIndex.get(date);
		if (di === undefined) {
			row.status = "missing";
			missingDays.push(date);
			continue;
		}
		if (!f.subs.some((s) => t.subHas[s * nd + di])) {
			row.status = "inactive";
			inactiveDays++;
			continue;
		}
		activeDays++;
		const group = rest ? hours.rest : hours.work;
		group.days++;
		hours.all.days++;
		weekdayHour.days[weekday]++;
		for (let i = cube.dateOffsets[di]; i < cube.dateOffsets[di + 1]; i++) {
			if (!subMask[t.sub[i]]) continue;
			if (dirWanted >= 0 && t.dir[i] !== dirWanted) {
				if (t.dir[i] === 2) {
					unknownDropped.b += t.b[i];
					unknownDropped.a += t.a[i];
				}
				continue;
			}
			stopTotals[t.stop[i]].b += t.b[i];
			stopTotals[t.stop[i]].a += t.a[i];
			if (!stopMask[t.stop[i]]) continue;
			const h = t.hour[i];
			row.b += t.b[i];
			row.a += t.a[i];
			group.b[h] += t.b[i];
			group.a[h] += t.a[i];
			hours.all.b[h] += t.b[i];
			hours.all.a[h] += t.a[i];
			weekdayHour.b[weekday][h] += t.b[i];
			weekdayHour.a[weekday][h] += t.a[i];
		}
		totalB += row.b;
		totalA += row.a;
	}

	const monthMap = new Map<string, MonthRow>();
	for (const d of days) {
		const m = d.date.slice(0, 7);
		const mr = monthMap.get(m) ?? {
			month: m,
			calendarDays: 0,
			activeDays: 0,
			missingDays: 0,
			b: 0,
			a: 0,
		};
		mr.calendarDays++;
		if (d.status === "missing") mr.missingDays++;
		if (d.status === "active") {
			mr.activeDays++;
			mr.b += d.b;
			mr.a += d.a;
		}
		monthMap.set(m, mr);
	}

	return {
		days,
		activeDays,
		missingDays,
		inactiveDays,
		totalB,
		totalA,
		hours,
		weekdayHour,
		stopTotals,
		unknownDropped,
		months: [...monthMap.values()],
	};
}

// ── derived indicators ──────────────────────────────────────────────────────────

/** Per-active-day average of a profile; null for hours of an empty group. */
export function perDay(sums: number[], days: number): (number | null)[] {
	return sums.map((v) => (days > 0 ? v / days : null));
}

/** Weekend/holiday ÷ working-day average daily total. null when either side has < minDays active days. */
export function restWorkRatio(
	a: Analysis,
	metric: "b" | "a",
	minDays = 5,
): number | null {
	const total = (g: HourSums) => g[metric].reduce((s, v) => s + v, 0);
	const { work, rest } = a.hours;
	if (work.days < minDays || rest.days < minDays) return null;
	const w = total(work) / work.days;
	return w === 0 ? null : total(rest) / rest.days / w;
}

/** The busiest hour of the all-day profile and its share of the total; null on an empty profile. */
export function peakHour(
	a: Analysis,
	metric: "b" | "a",
): { hour: number; share: number } | null {
	const p = a.hours.all[metric];
	const total = p.reduce((s, v) => s + v, 0);
	if (total === 0) return null;
	let hour = 0;
	for (let h = 1; h < HOURS; h++) if (p[h] > p[hour]) hour = h;
	return { hour, share: p[hour] / total };
}

/** Share of the total taken by the three busiest hours (a rough concentration indicator). */
export function top3HourShare(a: Analysis, metric: "b" | "a"): number | null {
	const p = a.hours.all[metric];
	const total = p.reduce((s, v) => s + v, 0);
	if (total === 0) return null;
	const top = [...p].sort((x, y) => y - x).slice(0, 3);
	return top.reduce((s, v) => s + v, 0) / total;
}

/** Centred 7-day mean over active days only; null when fewer than 4 active days in the window. */
export function movingAverage(
	days: DayRow[],
	metric: "b" | "a",
	half = 3,
	minDays = 4,
): (number | null)[] {
	return days.map((_, i) => {
		let sum = 0;
		let n = 0;
		for (
			let j = Math.max(0, i - half);
			j <= Math.min(days.length - 1, i + half);
			j++
		) {
			if (days[j].status === "active") {
				sum += days[j][metric];
				n++;
			}
		}
		return n >= minDays ? sum / n : null;
	});
}

// ── CSV ─────────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<DayStatus, string> = {
	active: "有紀錄",
	missing: "資料集無紀錄",
	inactive: "所選支線無紀錄",
	excluded: "日類型排除",
};

export function dailyCsv(a: Analysis, cal: CalendarFile): string {
	const lines = ["date,weekday_mon0,day_type,note,status,boardings,alightings"];
	for (const d of a.days) {
		const val = d.status === "active";
		lines.push(
			[
				d.date,
				d.weekday,
				d.rest ? "rest" : "work",
				JSON.stringify(cal.days[d.date]?.note ?? ""),
				STATUS_LABEL[d.status],
				val ? d.b : "",
				val ? d.a : "",
			].join(","),
		);
	}
	return `${lines.join("\n")}\n`;
}

export function monthlyCsv(a: Analysis): string {
	const lines = [
		"month,calendar_days,active_days,missing_days,boardings,alightings",
	];
	for (const m of a.months)
		lines.push(
			[m.month, m.calendarDays, m.activeDays, m.missingDays, m.b, m.a].join(
				",",
			),
		);
	return `${lines.join("\n")}\n`;
}

/** Filter that selects everything in the dataset. */
export function fullFilter(t: Table): Filter {
	return {
		subs: t.cube.subs.map((_, i) => i),
		direction: "all",
		stops: t.cube.stops.map((_, i) => i),
		from: t.cube.dates[0],
		to: t.cube.dates[t.cube.dates.length - 1],
		dayType: "all",
	};
}
