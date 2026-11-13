/**
 * Historical operations replay (lab direction 6: 即時營運決策儀表板, history-only prototype).
 *
 * Everything here is causal: a baseline for date D only reads dates strictly before D, and a
 * decision at replay clock T only reads hours that would already have been delivered by T.
 * The "forecast" is a transparent same-weekday average, NOT a trained model, and card data
 * only shows people who boarded — capacity, queues and refusals are invisible.
 */

import type { Row } from "#/lib/midstop";

export const DIRS = ["outbound", "inbound"] as const;
export type Dir = (typeof DIRS)[number];
export const DIR_LABEL: Record<Dir, string> = {
	outbound: "去程 臺中 → 日月潭",
	inbound: "回程 日月潭 → 臺中",
};

/** Hourly series (index = hour 0–23). b/a = boardings/alightings, m = boardings at middle stops. */
export type Series = { b: number[]; a: number[]; m: number[] };
export type Day = Record<Dir, Series> & { unknown: number };
export type Days = Map<string, Day>;
/** Dates where the office calendar differs from the plain weekend rule, or that carry a name. */
export type Calendar = Record<
	string,
	{ holiday: boolean; name: string | null }
>;
export type Metric = "b" | "a" | "m" | "e";

export const RULES = {
	lookbackDays: 56,
	maxPeers: 4,
	minPeers: 2,
	surgeRatio: 1.5,
	surgeMinExcess: 10,
	dropRatio: 0.5,
	dropMinBase: 10,
	silenceMinBase: 5,
	sustainedHours: 2,
	midMinBase: 3,
	firstHour: 5,
	lastHour: 23,
} as const;

const zeros = () => new Array<number>(24).fill(0);
const emptySeries = (): Series => ({ b: zeros(), a: zeros(), m: zeros() });

/** Terminal groups (orders 1–3 and 14–16) are endpoints; the rest are middle stops (same as /analysis). */
export function middleStopNames(stops: { name: string; order: number }[]) {
	return new Set(
		stops.filter((s) => s.order > 3 && s.order < 14).map((s) => s.name),
	);
}

export function buildDays(rows: Row[], middle: Set<string>): Days {
	const days: Days = new Map();
	for (const [date, , dir, stop, hour, b, a] of rows) {
		let d = days.get(date);
		if (!d) {
			d = { outbound: emptySeries(), inbound: emptySeries(), unknown: 0 };
			days.set(date, d);
		}
		if (dir === "unknown") {
			d.unknown += b;
			continue;
		}
		const s = d[dir];
		s.b[hour] += b;
		s.a[hour] += a;
		if (middle.has(stop)) s.m[hour] += b;
	}
	return days;
}

/** Flat packed form: [ob, oa, om, ib, ia, im, unknown] per date. */
export type PackedDays = Record<string, [...number[][], number]>;
export function packDays(days: Days): PackedDays {
	const out: PackedDays = {};
	for (const [date, d] of [...days].sort((x, y) => x[0].localeCompare(y[0]))) {
		out[date] = [
			d.outbound.b,
			d.outbound.a,
			d.outbound.m,
			d.inbound.b,
			d.inbound.a,
			d.inbound.m,
			d.unknown,
		] as PackedDays[string];
	}
	return out;
}
export function unpackDays(p: PackedDays): Days {
	const days: Days = new Map();
	for (const [date, v] of Object.entries(p)) {
		const n = v as unknown as [
			number[],
			number[],
			number[],
			number[],
			number[],
			number[],
			number,
		];
		days.set(date, {
			outbound: { b: n[0], a: n[1], m: n[2] },
			inbound: { b: n[3], a: n[4], m: n[5] },
			unknown: n[6],
		});
	}
	return days;
}

export const weekdayOf = (date: string) =>
	new Date(`${date}T00:00:00Z`).getUTCDay();
const dayNumber = (date: string) =>
	Date.parse(`${date}T00:00:00Z`) / 86_400_000;

export function isHoliday(date: string, cal: Calendar) {
	const c = cal[date];
	if (c) return c.holiday;
	const w = weekdayOf(date);
	return w === 0 || w === 6;
}

/** Observed value of one metric at one hour. "e" = endpoint boardings = b − m. */
export function valueAt(day: Day, dir: Dir, metric: Metric, hour: number) {
	const s = day[dir];
	return metric === "e" ? s.b[hour] - s.m[hour] : s[metric][hour];
}

export type Baseline = {
	/** previous same-weekday, same-day-type dates used (newest first) */
	peers: string[];
	n: number;
	mean: number[];
	lo: number[];
	hi: number[];
};

/**
 * Causal baseline: the nearest ≤4 earlier dates with the same weekday and the same
 * holiday flag, within 56 days. Fewer than 2 such dates → null (shown as "基準不足").
 * Dates missing from the data are never treated as zero.
 */
export function baselineFor(
	days: Days,
	cal: Calendar | null,
	date: string,
	dir: Dir,
	metric: Metric,
	opts: { useCalendar?: boolean; maxPeers?: number } = {},
): Baseline | null {
	const useCal = opts.useCalendar ?? true;
	const maxPeers = opts.maxPeers ?? RULES.maxPeers;
	const calendar = cal ?? {};
	const dn = dayNumber(date);
	const hol = isHoliday(date, calendar);
	const peers: string[] = [];
	for (
		let back = 7;
		back <= RULES.lookbackDays && peers.length < maxPeers;
		back += 7
	) {
		const p = new Date((dn - back) * 86_400_000).toISOString().slice(0, 10);
		if (!days.has(p)) continue;
		if (useCal && isHoliday(p, calendar) !== hol) continue;
		peers.push(p);
	}
	if (peers.length < RULES.minPeers) return null;
	const mean: number[] = [];
	const lo: number[] = [];
	const hi: number[] = [];
	for (let h = 0; h < 24; h++) {
		const vs = peers.map((p) => valueAt(days.get(p) as Day, dir, metric, h));
		mean.push(vs.reduce((x, y) => x + y, 0) / vs.length);
		lo.push(Math.min(...vs));
		hi.push(Math.max(...vs));
	}
	return { peers, n: peers.length, mean, lo, hi };
}

export type AlertKind =
	| "surge"
	| "sustained-surge"
	| "drop"
	| "silent"
	| "mid-dip-lead"
	| "baseline-missing";
export type Severity = "info" | "watch" | "review";

export type Alert = {
	/** stable id for the manual-review log */
	id: string;
	kind: AlertKind;
	severity: Severity;
	dir: Dir;
	/** the completed hour the evidence is about */
	hour: number;
	observed: number | null;
	baseline: number | null;
	peers: number;
	title: string;
	reason: string;
	action: string;
	/** inputs we do not have that a real decision would need */
	missing: string[];
};

const MISSING_OPS = ["逐班容量與車型", "實際班表與車次", "車輛位置（GPS）"];
const ratioText = (o: number, b: number) =>
	b > 0 ? `${(o / b).toFixed(2)} 倍` : "基準為 0";
const hhmm = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Latest hour fully delivered when the replay clock reads `clock`:00 with `lag` hours of feed delay. */
export const lastDeliveredHour = (clock: number, lag: number) =>
	clock - 1 - lag;

export type Opts = Partial<Record<keyof typeof RULES, number>> & {
	useCalendar?: boolean;
};

export function decisionsAt(
	days: Days,
	cal: Calendar | null,
	date: string,
	clock: number,
	lag: number,
	opts: Opts = {},
): Alert[] {
	const r = { ...RULES, ...opts };
	const day = days.get(date);
	const last = lastDeliveredHour(clock, lag);
	if (!day || last < r.firstHour) return [];
	const alerts: Alert[] = [];
	const bopts = { useCalendar: opts.useCalendar };
	for (const dir of DIRS) {
		const base = baselineFor(days, cal, date, dir, "b", bopts);
		if (!base) {
			alerts.push({
				id: `${date}|${dir}|baseline-missing`,
				kind: "baseline-missing",
				severity: "info",
				dir,
				hour: last,
				observed: day[dir].b[last],
				baseline: null,
				peers: 0,
				title: "基準不足，不產生建議",
				reason:
					"同星期、同日型（平日／假日）的前期可用日期少於 2 天，無法比較。可能是假日平日、補班日或資料缺漏後的第一週。",
				action: "僅供檢視原始刷卡量；不做增減班判斷。",
				missing: [],
			});
			continue;
		}
		const obs = day[dir].b[last];
		const bh = base.mean[last];
		const common = {
			dir,
			hour: last,
			observed: obs,
			baseline: bh,
			peers: base.n,
		};
		const evidence = `${hhmm(last)}–${hhmm(last + 1)} 上車 ${obs} 人，基準 ${bh.toFixed(1)}（前 ${base.n} 個同型${["日", "一", "二", "三", "四", "五", "六"][weekdayOf(date)]}平均，${ratioText(obs, bh)}）`;

		if (obs === 0 && bh >= r.silenceMinBase) {
			alerts.push({
				...common,
				id: `${date}|${dir}|${last}|silent`,
				kind: "silent",
				severity: "watch",
				title: "該小時完全沒有刷卡紀錄",
				reason: `${evidence}。可能是無班次、停駛、資料延遲或缺漏，單憑刷卡無法區分。`,
				action: "先向營運單位／資料來源確認資料是否送達，再判斷是否停駛。",
				missing: ["班表與停駛公告", "資料傳輸狀態"],
			});
		} else if (obs >= r.surgeRatio * bh && obs - bh >= r.surgeMinExcess) {
			let run = 1;
			for (let h = last - 1; h >= r.firstHour; h--) {
				const bb = base.mean[h];
				const o = day[dir].b[h];
				if (o >= r.surgeRatio * bb && o - bb >= r.surgeMinExcess) run++;
				else break;
			}
			const sustained = run >= r.sustainedHours;
			alerts.push({
				...common,
				id: `${date}|${dir}|${last}|${sustained ? "sustained-surge" : "surge"}`,
				kind: sustained ? "sustained-surge" : "surge",
				severity: sustained ? "review" : "watch",
				title: sustained ? `連續 ${run} 小時上車量高於平常` : "上車量高於平常",
				reason: `${evidence}。高於基準 ≥ ${r.surgeRatio} 倍且多 ≥ ${r.surgeMinExcess} 人。刷卡只計已上車者，無法判斷是否已客滿或有人沒上到車。`,
				action: sustained
					? "建議人工評估：是否有機動車可加派、站務是否需人員引導。須先確認容量與車輛可用性。"
					: "持續觀察下一小時；若仍偏高，再評估是否需人工介入。",
				missing: MISSING_OPS,
			});
		} else if (obs > 0 && obs <= r.dropRatio * bh && bh >= r.dropMinBase) {
			alerts.push({
				...common,
				id: `${date}|${dir}|${last}|drop`,
				kind: "drop",
				severity: "info",
				title: "上車量明顯低於平常",
				reason: `${evidence}。低於基準一半以上。原因可能是需求低、天候、改道、停駛或資料延遲，不能推論為營運問題。`,
				action:
					"不建議減班。若連續多小時偏低，向營運單位確認是否停駛或資料缺漏。",
				missing: ["天候與活動資訊", "班表與停駛公告"],
			});
		}

		// Unverified lead (see /analysis): endpoint busy one hour ago, middle stops quiet now.
		const eBase = baselineFor(days, cal, date, dir, "e", bopts);
		const mBase = baselineFor(days, cal, date, dir, "m", bopts);
		if (eBase && mBase && last - 1 >= r.firstHour) {
			const e = valueAt(day, dir, "e", last - 1);
			const eb = eBase.mean[last - 1];
			const m = day[dir].m[last];
			const mb = mBase.mean[last];
			if (
				e >= r.surgeRatio * eb &&
				e - eb >= r.surgeMinExcess &&
				mb >= r.midMinBase &&
				m <= r.dropRatio * mb
			) {
				alerts.push({
					id: `${date}|${dir}|${last}|mid-dip-lead`,
					kind: "mid-dip-lead",
					severity: "info",
					dir,
					hour: last,
					observed: m,
					baseline: mb,
					peers: mBase.n,
					title: "待驗證線索：端點偏忙、隨後中站偏少",
					reason: `${hhmm(last - 1)} 端點上車 ${e} 人（基準 ${eb.toFixed(1)}），${hhmm(last)} 中站上車 ${m} 人（基準 ${mb.toFixed(1)}）。與「中站上車低窪分析」同型，但那項分析尚未證實因果。`,
					action: "僅作為人工覆核提示，不能視為拒載或客滿的證據。",
					missing: ["候車與未上車人數", "逐班容量與載客"],
				});
			}
		}
	}
	const rank = { review: 0, watch: 1, info: 2 } as const;
	return alerts.sort((x, y) => rank[x.severity] - rank[y.severity]);
}

export type Outlook = { dir: Dir; hour: number; baseline: number }[];
/** The three busiest baseline hours still ahead of the delivered data, per direction. */
export function outlookAfter(
	days: Days,
	cal: Calendar | null,
	date: string,
	clock: number,
	lag: number,
): Outlook {
	const from = Math.max(lastDeliveredHour(clock, lag) + 1, RULES.firstHour);
	const out: Outlook = [];
	for (const dir of DIRS) {
		const base = baselineFor(days, cal, date, dir, "b");
		if (!base) continue;
		const cand = base.mean
			.map((v, hour) => ({ dir, hour, baseline: v }))
			.filter((x) => x.hour >= from && x.hour <= RULES.lastHour);
		cand.sort((x, y) => y.baseline - x.baseline);
		out.push(...cand.slice(0, 3).sort((x, y) => x.hour - y.hour));
	}
	return out;
}

export const dayTotal = (day: Day) =>
	DIRS.reduce((s, d) => s + day[d].b.reduce((x, y) => x + y, 0), 0);

/* ---------------------------------------------------------------- backtest */

export type ErrStat = {
	cells: number;
	actual: number;
	abs: number;
	wape: number | null;
	mae: number | null;
};
const stat = (cells: number, actual: number, abs: number): ErrStat => ({
	cells,
	actual,
	abs,
	wape: actual > 0 ? abs / actual : null,
	mae: cells > 0 ? abs / cells : null,
});

export type MethodResult = {
	hourly: ErrStat;
	daily: ErrStat;
	rangeCoverage: number | null;
};
export type Backtest = {
	evaluatedDays: number;
	evaluatedDirDays: number;
	methods: Record<
		"mean4-calendar" | "mean4-weekday" | "nearest-peer-calendar",
		MethodResult
	>;
};

/**
 * Rolling-origin backtest over every date that has a calendar-aware 4-week baseline.
 * All methods are scored on the same (date, direction) set so numbers are comparable.
 * Hours outside 05–23 and missing dates are excluded; zero cells inside are kept.
 */
export function backtest(days: Days, cal: Calendar): Backtest {
	type Acc = {
		hc: number;
		ha: number;
		hx: number;
		dc: number;
		da: number;
		dx: number;
		inR: number;
		rN: number;
	};
	const mk = (): Acc => ({
		hc: 0,
		ha: 0,
		hx: 0,
		dc: 0,
		da: 0,
		dx: 0,
		inR: 0,
		rN: 0,
	});
	const acc = {
		"mean4-calendar": mk(),
		"mean4-weekday": mk(),
		"nearest-peer-calendar": mk(),
	};
	let dirDays = 0;
	const evalDates = new Set<string>();
	for (const date of [...days.keys()].sort()) {
		const day = days.get(date) as Day;
		for (const dir of DIRS) {
			const cal4 = baselineFor(days, cal, date, dir, "b");
			const wk4 = baselineFor(days, cal, date, dir, "b", {
				useCalendar: false,
			});
			if (!cal4 || !wk4) continue;
			// nearest-peer-calendar = the single newest calendar-aware peer date. It is NOT a fixed lag-7
			// baseline: when the previous week is missing or has a different day type it looks back up to 8 weeks.
			const nearest = cal4.peers[0];
			const nd = days.get(nearest) as Day;
			dirDays++;
			evalDates.add(date);
			const preds: [keyof typeof acc, number[], Baseline | null][] = [
				["mean4-calendar", cal4.mean, cal4],
				["mean4-weekday", wk4.mean, wk4],
				["nearest-peer-calendar", nd[dir].b, null],
			];
			for (const [name, pred, bl] of preds) {
				const a = acc[name];
				let dayActual = 0;
				let dayPred = 0;
				for (let h = RULES.firstHour; h <= RULES.lastHour; h++) {
					const actual = day[dir].b[h];
					a.hc++;
					a.ha += actual;
					a.hx += Math.abs(actual - pred[h]);
					dayActual += actual;
					dayPred += pred[h];
					if (bl) {
						a.rN++;
						if (actual >= bl.lo[h] && actual <= bl.hi[h]) a.inR++;
					}
				}
				a.dc++;
				a.da += dayActual;
				a.dx += Math.abs(dayActual - dayPred);
			}
		}
	}
	const res = (a: Acc): MethodResult => ({
		hourly: stat(a.hc, a.ha, a.hx),
		daily: stat(a.dc, a.da, a.dx),
		rangeCoverage: a.rN > 0 ? a.inR / a.rN : null,
	});
	return {
		evaluatedDays: evalDates.size,
		evaluatedDirDays: dirDays,
		methods: {
			"mean4-calendar": res(acc["mean4-calendar"]),
			"mean4-weekday": res(acc["mean4-weekday"]),
			"nearest-peer-calendar": res(acc["nearest-peer-calendar"]),
		},
	};
}

export type Highlight = {
	date: string;
	actual: number;
	baseline: number;
	ratio: number;
	tag: string | null;
};

/**
 * Why the office calendar might explain a day: its own holiday name, or an adjacent day off
 * (the day before/after a holiday). Null means the calendar offers no explanation — not that
 * none exists.
 */
export function calendarTag(date: string, cal: Calendar): string | null {
	const own = cal[date];
	if (own?.name) return own.name;
	for (const [delta, label] of [
		[1, "放假日前一日"],
		[-1, "放假日後一日"],
	] as const) {
		const d = new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000)
			.toISOString()
			.slice(0, 10);
		const c = cal[d];
		if (c?.holiday) return `${label}${c.name ? `（${c.name}）` : ""}`;
	}
	return null;
}

/** Days whose total boardings departed most from the causal baseline (both directions summed). */
export function highlights(days: Days, cal: Calendar, minBase = 100, top = 10) {
	const list: Highlight[] = [];
	for (const [date, day] of days) {
		const bo = baselineFor(days, cal, date, "outbound", "b");
		const bi = baselineFor(days, cal, date, "inbound", "b");
		if (!bo || !bi) continue;
		const baseline =
			bo.mean.reduce((x, y) => x + y, 0) + bi.mean.reduce((x, y) => x + y, 0);
		if (baseline < minBase) continue;
		const actual = DIRS.reduce(
			(s, d) => s + day[d].b.reduce((x, y) => x + y, 0),
			0,
		);
		list.push({
			date,
			actual,
			baseline,
			ratio: actual / baseline,
			tag: calendarTag(date, cal),
		});
	}
	list.sort((x, y) => y.ratio - x.ratio);
	return {
		surge: list.slice(0, top),
		drop: list.slice(-top).reverse(),
		eligible: list.length,
	};
}
