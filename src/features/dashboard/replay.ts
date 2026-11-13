/**
 * 回測營運儀表板的資料模型：把一天的刷卡流（scripts/dashboard/export_replay.py 匯出）
 * 還原成「時間 T 時系統知道什麼」。所有函式只用 T 以前的刷卡，結果驗證則等車真的開過下游站才揭曉。
 */

export type Seats = 41 | 37;
export type SeatStatus = "ok" | "few" | "full" | "unknown";

export type CardRow = {
	sub: string;
	from: string;
	to: string;
	band: string;
	ratio: number;
	n: number;
};
export type HotWindow = {
	sub: string;
	dir: number;
	hour: number;
	rest: boolean;
	train: number;
	holdout: number;
	perDay: number;
};
export type DaySummary = {
	date: string;
	rest: boolean;
	note: string | null;
	runs: number;
	rides: number;
	alerts: number;
	hits: number;
	anom: number;
	anomHits: number;
	deps: number;
	abstain: number;
	near41: number;
	near37: number;
};
/** [子路線, 離站站序, 下游站序, 載客區間(=min(載客,50)/3), 41 席座位不多比率, 37 席比率, 訓練期樣本] */
export type LookupRow = [
	string,
	number,
	number,
	number,
	number,
	number,
	number,
];
export type IndexFile = {
	stops: [number, string][];
	mid: number[];
	card: CardRow[];
	lookup: LookupRow[];
	/** "子路線|方向" → 該方向實際服務的站序（訓練期） */
	served: Record<string, number[]>;
	hot: HotWindow[];
	days: DaySummary[];
};

/** [run, 上車秒, 上車站序, 下車秒, 下車站序]；秒＝當日 00:00 起算 */
type TripRow = [number, number, number, number, number];
/** [離站秒, run, 離站站序, 即時方向(0=未知), 上游載客(-1=棄權), 調度卡列(-1=無), 是否提示, 前 3 站任一達門檻, [[下游站序, 實際載客]]] */
type DepRow = [
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	[number, number][],
];
/** [到站秒, 站序, 子路線, 方向, 上車前載客, 上車人數] */
type ArrRow = [number, number, string, number, number, number];
export type DayFile = {
	date: string;
	rest: boolean;
	runs: [string, string, number][];
	trips: TripRow[];
	deps: DepRow[];
	arr: ArrRow[];
};

export type Run = {
	i: number;
	sub: string;
	vehicle: string;
	start: number;
	end: number;
	boards: number[]; // sorted board times
	alights: number[]; // sorted alight times
	events: { t: number; stop: number }[]; // every tap, sorted
	/** 離站判斷（60 秒靜默）：[離站秒, 離站站序, 即時方向, 上游載客]，只含方向已知者 */
	deps: [number, number, number, number][];
	/** 第一個與起點不同的上車站出現的時刻與方向（即時方向推斷，與提案因果回放相同） */
	dirAt: number;
	dir: number;
};

export type Alert = {
	t: number;
	run: Run;
	from: number;
	dir: number;
	load: number;
	card: CardRow;
	hit: boolean;
	down: [number, number][];
	resolveAt: number;
	anomaly: boolean;
};

export type Day = {
	date: string;
	rest: boolean;
	runs: Run[];
	alerts: Alert[];
	arr: ArrRow[];
	abstain: number;
	deps: number;
};

const upper = (xs: number[], t: number) => {
	let lo = 0;
	let hi = xs.length;
	while (lo < hi) {
		const m = (lo + hi) >> 1;
		if (xs[m] <= t) lo = m + 1;
		else hi = m;
	}
	return lo;
};

export function buildDay(f: DayFile, card: CardRow[]): Day {
	const runs: Run[] = f.runs.map(([sub, vehicle], i) => ({
		i,
		sub,
		vehicle,
		start: Number.POSITIVE_INFINITY,
		end: 0,
		boards: [],
		alights: [],
		events: [],
		deps: [],
		dirAt: Number.POSITIVE_INFINITY,
		dir: 0,
	}));
	for (const [ri, bt, bo, at, ao] of f.trips) {
		const r = runs[ri];
		r.boards.push(bt);
		r.alights.push(at);
		r.events.push({ t: bt, stop: bo }, { t: at, stop: ao });
		r.start = Math.min(r.start, bt);
		r.end = Math.max(r.end, at);
	}
	for (const r of runs) {
		r.boards.sort((a, b) => a - b);
		r.alights.sort((a, b) => a - b);
		r.events.sort((a, b) => a.t - b.t);
	}
	// trips are sorted by board time, so the first differing board stop fixes the direction
	const firstStop = new Map<number, number>();
	for (const [ri, bt, bo] of f.trips) {
		const r = runs[ri];
		const s0 = firstStop.get(ri);
		if (s0 === undefined) firstStop.set(ri, bo);
		else if (r.dir === 0 && bo !== s0) {
			r.dir = Math.sign(bo - s0);
			r.dirAt = bt;
		}
	}
	for (const [t, ri, u, d, up] of f.deps)
		if (d !== 0) runs[ri].deps.push([t, u, d, up]);
	const alerts: Alert[] = f.deps
		.filter((d) => d[6] === 1)
		.map(([t, ri, from, dir, load, ci, , y, down]) => {
			const run = runs[ri];
			const last = down[down.length - 1][0];
			const pass = run.events.find((e) => e.t >= t && e.stop === last);
			return {
				t,
				run,
				from,
				dir,
				load,
				card: card[ci],
				hit: y === 1,
				down,
				resolveAt: pass ? pass.t : run.end,
				anomaly: load > 50 || down.some(([, l]) => l > 50),
			};
		});
	return {
		date: f.date,
		rest: f.rest,
		runs,
		alerts,
		arr: f.arr,
		abstain: f.deps.filter((d) => d[3] === 0).length,
		deps: f.deps.length,
	};
}

/** 已上車、尚未下車的旅次數（只用 t 以前的刷卡） */
export const loadAt = (r: Run, t: number) =>
	upper(r.boards, t) - upper(r.alights, t);

export const isActive = (r: Run, t: number) => r.start <= t && t < r.end;

export function lastStopAt(r: Run, t: number) {
	let lo = 0;
	let hi = r.events.length;
	while (lo < hi) {
		const m = (lo + hi) >> 1;
		if (r.events[m].t <= t) lo = m + 1;
		else hi = m;
	}
	return lo === 0 ? null : r.events[lo - 1];
}

export const dirAt = (r: Run, t: number) => (t >= r.dirAt ? r.dir : 0);

/** 提案 2.1(a)：座位不多＝載客 ≥ 席數−5；推估已滿＝≥ 席數；重建 >50 人視為資料異常，交人工核對 */
export function seatStatus(load: number, seats: Seats): SeatStatus {
	if (load > 50) return "unknown";
	if (load >= seats) return "full";
	if (load >= seats - 5) return "few";
	return "ok";
}

/** 依載客變化切成區段，供時間軸繪製 */
export function loadSegments(r: Run) {
	const ts = [...new Set([...r.boards, ...r.alights])].sort((a, b) => a - b);
	const out: { t0: number; t1: number; load: number }[] = [];
	for (let k = 0; k < ts.length - 1; k++) {
		const load = loadAt(r, ts[k]);
		if (load > 0) out.push({ t0: ts[k], t1: ts[k + 1], load });
	}
	return out;
}

export type AlertState = "pending" | "hit" | "miss" | "review";
export function alertState(a: Alert, t: number): AlertState {
	if (a.load > 50) return "review";
	if (t < a.resolveAt) return "pending";
	if (a.anomaly) return "review";
	return a.hit ? "hit" : "miss";
}

/** 熱點窗口在 t 以前累積的「座位不多」到站數 */
export function hotCounts(day: Day, hot: HotWindow[], t: number, seats: Seats) {
	return hot.map(
		(w) =>
			day.arr.filter(
				([at, , sub, dir, load]) =>
					at <= t &&
					w.rest === day.rest &&
					sub === w.sub &&
					dir === w.dir &&
					Math.floor(at / 3600) === w.hour &&
					load >= seats - 5,
			).length,
	);
}

export const clock = (t: number) => {
	const h = Math.floor(t / 3600);
	const m = Math.floor((t % 3600) / 60);
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/** 到站時速度假設：0.7 km/分（提案 2.1 提前量估算的中間值），沒有塞車資料 */
export const SPEED_M_PER_S = 700 / 60;

export type Lookup = Map<string, { r41: number; r37: number; n: number }>;
export const makeLookup = (rows: LookupRow[]): Lookup =>
	new Map(
		rows.map(([sub, u, s, ub, r41, r37, n]) => [
			`${sub}|${u}|${s}|${ub}`,
			{ r41, r37, n },
		]),
	);

export type Outlook = {
	status: SeatStatus;
	/** 站牌清單用的短標籤 */
	short: string;
	text: string;
	/** 依據說明 */
	basis: string;
	p?: number;
};

/**
 * 車到站 s 時還有座位嗎：以該班最近一次離站（站 u、載客 up）查完整查表（訓練期）；
 * 查表沒有的組合（超過下游 3 站或樣本未見）退回「依目前載客」。
 */
export function arrivalOutlook(
	run: Run,
	t: number,
	s: number,
	seats: Seats,
	lookup: Lookup,
	stopName: (o: number) => string,
): Outlook {
	const now = loadAt(run, t);
	if (now > 50)
		return {
			status: "unknown",
			short: "資料不足",
			text: "資料異常，交人工核對",
			basis: `重建載客 ${now} 人 >50`,
		};
	let dep: Run["deps"][number] | undefined;
	for (const d of run.deps) if (d[0] <= t) dep = d;
	const cell =
		dep &&
		lookup.get(
			`${run.sub}|${dep[1]}|${s}|${Math.floor(Math.min(dep[3], 50) / 3)}`,
		);
	if (dep && cell) {
		const p = seats === 41 ? cell.r41 : cell.r37;
		const basis = `${stopName(dep[1])} 離站載客 ${dep[3]} 人・查表 ${cell.n} 筆`;
		const pct = `${Math.round(p * 100)}%`;
		if (p >= 0.944)
			return {
				status: "few",
				short: "座位不多",
				text: `座位不多（調度卡 ${pct}）`,
				basis,
				p,
			};
		if (p >= 0.5)
			return {
				status: "few",
				short: "可能座位不多",
				text: `可能座位不多（${pct}）`,
				basis,
				p,
			};
		return {
			status: "ok",
			short: "有座位",
			text: `預估有座位（座位不多 ${pct}）`,
			basis,
			p,
		};
	}
	const st = seatStatus(now, seats);
	const label = st === "ok" ? "有座位" : st === "few" ? "座位不多" : "推估已滿";
	return {
		status: st,
		short: label,
		text: `依目前載客：${label}`,
		basis: "查表無此組合（超過下游 3 站或樣本不足）",
	};
}

export type Approach = {
	run: Run;
	eta: number;
	from: number;
	stopsAway: number;
};

/** 正朝站 s（方向 dir）前進、且該子路線有停 s 的班次；到站時間＝最後刷卡站起算、沿停靠站逐段累加的道路距離 ÷ 假設速度 */
export function approaching(
	day: Day,
	t: number,
	s: number,
	dir: number,
	served: Record<string, number[]>,
	dist: (a: number, b: number) => number,
	sub: string | null,
): Approach[] {
	const out: Approach[] = [];
	for (const run of day.runs) {
		if (sub && run.sub !== sub) continue;
		if (!isActive(run, t) || dirAt(run, t) !== dir) continue;
		const stops = served[`${run.sub}|${dir}`];
		if (!stops?.includes(s)) continue;
		const last = lastStopAt(run, t);
		if (!last || (s - last.stop) * dir <= 0) continue;
		// sum stop-to-stop road distances along the served sequence so ETAs stay monotonic
		const path = [
			last.stop,
			...stops
				.filter((o) => (o - last.stop) * dir > 0 && (s - o) * dir >= 0)
				.sort((a, b) => (a - b) * dir),
		];
		let meters = 0;
		for (let k = 1; k < path.length; k++) meters += dist(path[k - 1], path[k]);
		const eta = last.t + meters / SPEED_M_PER_S;
		const stopsAway = path.length - 1;
		out.push({ run, eta: Math.max(t, eta), from: last.stop, stopsAway });
	}
	return out.sort((a, b) => a.eta - b.eta);
}
