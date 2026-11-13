import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	ChevronLeft,
	ChevronRight,
	Moon,
	Pause,
	Play,
	Sun,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import AlertFeed from "#/components/dashboard/AlertFeed";
import type { BusDot, StopMark } from "#/components/dashboard/DashboardMap";
import HotWindows from "#/components/dashboard/HotWindows";
import PeriodChart, {
	PeriodLegend,
	type PeriodMetric,
} from "#/components/dashboard/PeriodChart";
import RunTimeline, {
	DAY_END,
	DAY_START,
} from "#/components/dashboard/RunTimeline";
import StopDetail from "#/components/dashboard/StopDetail";
import StopList, {
	etaText,
	type StopCtx,
} from "#/components/dashboard/StopList";
import {
	ALERT,
	DIR_LABEL,
	STATUS,
	StatusDot,
} from "#/components/dashboard/status";
import { makeGeo } from "#/features/dashboard/position";
import {
	alertState,
	approaching,
	buildDay,
	clock,
	type Day,
	type DayFile,
	dirAt,
	type IndexFile,
	isActive,
	loadAt,
	makeLookup,
	type SeatStatus,
	type Seats,
	seatStatus,
} from "#/features/dashboard/replay";
import { type GeoAssets, loadGeoAssets } from "#/lib/geo";
import { SUBROUTES, THEME_KEY, type Theme, themeVars } from "#/lib/palette";

const DashboardMap = lazy(() => import("#/components/dashboard/DashboardMap"));

export const Route = createFileRoute("/dashboard")({
	component: DashboardPage,
	head: () => ({ meta: [{ title: "6670 營運儀表板 · 歷史回測" }] }),
});

// the proposal's worked example (§2.1): 08:08 6670D leaves 埔里站 with 39 aboard, alert for 崎下
const DEFAULT_DAY = "2025-07-12";
const DEFAULT_T = 7.75 * 3600;
const DEFAULT_STOP = 5; // 崎下
const DEFAULT_DIR = -1;
const SPEEDS = [60, 300, 900];
const MAJOR_STOPS = new Set(["埔里站", "九族文化村", "日月潭"]);
const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
const weekday = (d: string) => WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()];
const pct = (a: number, b: number) =>
	b ? `${((a / b) * 100).toFixed(1)}%` : "–";

function DashboardPage() {
	const [theme, setTheme] = useState<Theme>("light");
	useEffect(() => {
		const saved = localStorage.getItem(THEME_KEY);
		if (saved === "dark" || saved === "light") setTheme(saved);
	}, []);
	const toggleTheme = () =>
		setTheme((v) => {
			const next = v === "light" ? "dark" : "light";
			localStorage.setItem(THEME_KEY, next);
			return next;
		});

	const [index, setIndex] = useState<IndexFile | null>(null);
	const [assets, setAssets] = useState<GeoAssets | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [date, setDate] = useState(DEFAULT_DAY);
	const [day, setDay] = useState<Day | null>(null);
	const [t, setT] = useState(DEFAULT_T);
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState(SPEEDS[0]);
	const [seats, setSeats] = useState<Seats>(41);
	const [metric, setMetric] = useState<PeriodMetric>("alerts");
	const [onlyBusy, setOnlyBusy] = useState(true);
	const [dir, setDir] = useState(DEFAULT_DIR);
	const [sub, setSub] = useState<string | null>(null);
	const [stop, setStop] = useState<number>(DEFAULT_STOP);
	const [tab, setTab] = useState<"stop" | "alerts">("stop");

	useEffect(() => {
		fetch("/data/dashboard/index.json")
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
			.then(setIndex, (e: Error) => setError(`無法載入回測資料：${e.message}`));
		loadGeoAssets().then(setAssets, (e: Error) =>
			setError(`無法載入地圖：${e.message}`),
		);
	}, []);
	useEffect(() => {
		if (!index) return;
		let live = true;
		setDay(null);
		fetch(`/data/dashboard/days/${date}.json`)
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
			.then(
				(f: DayFile) => live && setDay(buildDay(f, index.card)),
				(e: Error) => live && setError(`無法載入 ${date}：${e.message}`),
			);
		return () => {
			live = false;
		};
	}, [date, index]);

	// playback: `speed` simulated seconds per real second
	const last = useRef<number | null>(null);
	useEffect(() => {
		if (!playing) return;
		let raf = 0;
		const tick = (now: number) => {
			const dt = last.current === null ? 0 : (now - last.current) / 1000;
			last.current = now;
			setT((v) => {
				const next = v + dt * speed;
				if (next >= DAY_END) {
					setPlaying(false);
					return DAY_END;
				}
				return next;
			});
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(raf);
			last.current = null;
		};
	}, [playing, speed]);

	const stopName = useMemo(() => {
		const m = new Map(index?.stops ?? []);
		return (o: number) => m.get(o) ?? String(o);
	}, [index]);
	const geo = useMemo(
		() => (assets && index ? makeGeo(assets, index.stops) : null),
		[assets, index],
	);
	const lookup = useMemo(() => makeLookup(index?.lookup ?? []), [index]);

	const dates = index?.days.map((d) => d.date) ?? [];
	const di = dates.indexOf(date);
	const goDay = (d: string) => {
		setDate(d);
		setPlaying(false);
	};
	const seek = (v: number) => {
		setT(v);
		setPlaying(false);
	};

	const ctx: StopCtx | null =
		day && index && geo
			? {
					day,
					t,
					seats,
					dir,
					sub,
					served: index.served,
					lookup,
					dist: geo.dist,
					stopName,
				}
			: null;

	const pendingRuns = new Set(
		(day?.alerts ?? [])
			.filter((a) => a.t <= t && alertState(a, t) === "pending")
			.map((a) => a.run.i),
	);
	const focusRuns = new Set(
		ctx
			? approaching(ctx.day, t, stop, dir, ctx.served, ctx.dist, sub).map(
					(a) => a.run.i,
				)
			: [],
	);
	const buses: BusDot[] = [];
	if (day && geo)
		for (const run of day.runs) {
			if (!isActive(run, t) || (sub && run.sub !== sub)) continue;
			const position = geo.position(run, t);
			if (!position) continue;
			const load = loadAt(run, t);
			buses.push({
				run,
				position,
				load,
				status: seatStatus(load, seats),
				dir: dirAt(run, t),
				focus: focusRuns.has(run.i),
				alerted: pendingRuns.has(run.i),
			});
		}
	const stopMarks: StopMark[] =
		index && geo
			? index.stops.map(([o, name]) => {
					const next = ctx
						? approaching(ctx.day, t, o, dir, ctx.served, ctx.dist, sub)[0]
						: undefined;
					return {
						name,
						position: geo.point(o),
						selected: o === stop,
						major: !index.mid.includes(o) || MAJOR_STOPS.has(name),
						badge: next ? etaText(next, t) : null,
					};
				})
			: [];
	const alertsSoFar = (day?.alerts ?? []).filter((a) => a.t <= t).length;

	const selectStopByName = (name: string) => {
		const hit = index?.stops.find(([, n]) => n === name);
		if (hit) {
			setStop(hit[0]);
			setTab("stop");
		}
	};

	return (
		<div
			data-theme={theme}
			style={themeVars(theme)}
			className="min-h-screen bg-[var(--bg)] text-[var(--fg)]"
		>
			{error && (
				<div className="panel m-4 p-4 text-sm text-red-600">⚠ {error}</div>
			)}

			{/* ---- live view: 3D map + stop list + stop detail + playback ---- */}
			<section className="relative flex flex-col lg:block lg:h-[100dvh] lg:min-h-[680px]">
				<div className="relative h-[58vh] lg:absolute lg:inset-0 lg:h-auto">
					<ClientOnly fallback={null}>
						{assets && (
							<Suspense fallback={null}>
								<DashboardMap
									assets={assets}
									theme={theme}
									buses={buses}
									stops={stopMarks}
									onStopClick={selectStopByName}
								/>
							</Suspense>
						)}
					</ClientOnly>
					{(!assets || !day) && !error && (
						<div className="absolute inset-0 grid place-items-center text-sm text-[var(--fg2)]">
							載入地圖與 {date} 回放資料中…
						</div>
					)}
				</div>

				{/* header */}
				<div className="panel order-first m-3 px-3.5 py-3 lg:absolute lg:top-0 lg:left-0 lg:m-4 lg:w-[340px]">
					<div className="flex items-center justify-between gap-2">
						<Link to="/" className="btn px-2" aria-label="回 3D 地圖">
							<ArrowLeft className="size-4" />
						</Link>
						<div className="min-w-0 flex-1">
							<div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
								6670 座位看得見 · 歷史回測
							</div>
							<h1 className="truncate text-base font-bold">營運儀表板</h1>
						</div>
						<button
							type="button"
							onClick={toggleTheme}
							className="btn px-2"
							aria-label={theme === "light" ? "深色模式" : "淺色模式"}
						>
							{theme === "light" ? (
								<Moon className="size-4" />
							) : (
								<Sun className="size-4" />
							)}
						</button>
					</div>
					<div className="mt-2.5 flex items-center gap-1">
						<button
							type="button"
							className="btn px-1.5"
							disabled={di <= 0}
							onClick={() => goDay(dates[di - 1])}
							aria-label="前一天"
						>
							<ChevronLeft className="size-4" />
						</button>
						<input
							type="date"
							className="btn font-semibold tabular-nums"
							value={date}
							min={dates[0]}
							max={dates[dates.length - 1]}
							onChange={(e) =>
								dates.includes(e.target.value) && goDay(e.target.value)
							}
						/>
						<button
							type="button"
							className="btn px-1.5"
							disabled={di < 0 || di >= dates.length - 1}
							onClick={() => goDay(dates[di + 1])}
							aria-label="後一天"
						>
							<ChevronRight className="size-4" />
						</button>
						<span className="ml-1 text-[11px] text-[var(--fg2)]">
							週{weekday(date)}・{index?.days[di]?.rest ? "休息日" : "上班日"}
						</span>
					</div>
					<div className="mt-2">
						<Toggle
							label="車型"
							value={seats}
							options={[
								[41, "41 席"],
								[37, "37 席（無障礙）"],
							]}
							onChange={setSeats}
						/>
					</div>
				</div>

				{/* stop list (bus-app style) */}
				{ctx && index && (
					<div className="panel m-3 flex flex-col px-3 py-3 lg:absolute lg:top-[178px] lg:bottom-[104px] lg:left-0 lg:m-4 lg:mt-0 lg:w-[340px]">
						<div className="grid grid-cols-2 gap-1">
							{[1, -1].map((d) => (
								<button
									key={d}
									type="button"
									className={`btn justify-center ${dir === d ? "btn-active" : ""}`}
									aria-pressed={dir === d}
									onClick={() => setDir(d)}
								>
									{DIR_LABEL[d]}
								</button>
							))}
						</div>
						<div className="mt-1.5 flex flex-wrap gap-1">
							{[null, ...SUBROUTES].map((s) => (
								<button
									key={s ?? "all"}
									type="button"
									className={`btn px-2 py-0.5 text-[11px] ${sub === s ? "btn-active" : ""}`}
									aria-pressed={sub === s}
									onClick={() => setSub(s)}
								>
									{s && (
										<span
											className="inline-block size-2 rounded-full"
											style={{ background: `var(--s-${s})` }}
										/>
									)}
									{s ? s.slice(4) : "全部"}
								</button>
							))}
						</div>
						<div className="mt-1.5 flex justify-between px-1 text-[10px] text-[var(--muted)]">
							<span>下一班到站</span>
							<span>到站時座位（預估）</span>
						</div>
						<div className="mt-1 min-h-0 flex-1 overflow-y-auto pr-1 max-lg:max-h-[420px]">
							<StopList
								ctx={ctx}
								stops={index.stops}
								selected={stop}
								onSelect={(o) => {
									setStop(o);
									setTab("stop");
								}}
							/>
						</div>
					</div>
				)}

				{/* selected stop + dispatch alerts */}
				{ctx && index && day && (
					<div className="panel m-3 flex flex-col px-3 py-3 lg:absolute lg:top-0 lg:right-0 lg:m-4 lg:max-h-[calc(100%-136px)] lg:w-[360px]">
						<div className="grid grid-cols-2 gap-1">
							<button
								type="button"
								className={`btn justify-center ${tab === "stop" ? "btn-active" : ""}`}
								onClick={() => setTab("stop")}
							>
								站牌
							</button>
							<button
								type="button"
								className={`btn justify-center ${tab === "alerts" ? "btn-active" : ""}`}
								onClick={() => setTab("alerts")}
							>
								調度提示 {alertsSoFar}／{day.alerts.length}
							</button>
						</div>
						<div className="mt-2.5 min-h-0 flex-1 overflow-y-auto pr-1 max-lg:max-h-[520px]">
							{tab === "stop" ? (
								<StopDetail ctx={ctx} stop={stop} />
							) : (
								<>
									<p className="mb-2 text-[11px] text-[var(--muted)]">
										前一站離站時查調度卡（{index.card.length} 列，比率
										≥0.944）；提前量只有幾分鐘，只用於站務、客服與資訊。對錯等車開過下游站才揭曉。
									</p>
									<AlertFeed
										alerts={day.alerts}
										t={t}
										stopName={stopName}
										onSeek={seek}
									/>
								</>
							)}
						</div>
					</div>
				)}

				{/* map legend */}
				{day && (
					<div className="panel m-3 px-3 py-2 lg:absolute lg:bottom-[104px] lg:left-[372px] lg:m-4">
						<SeatLegend seats={seats} />
						<div className="mt-1 text-[10px] text-[var(--muted)]">
							圓點＝一班車，數字＝推估車上人數；粗外圈＝已發提示待驗證，細外圈＝正駛向選定站牌
						</div>
					</div>
				)}

				{/* playback timeline */}
				{day && (
					<div className="panel sticky bottom-2 z-20 m-3 px-3 py-2.5 lg:absolute lg:right-0 lg:bottom-0 lg:left-0 lg:m-4">
						<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
							<button
								type="button"
								className="btn btn-active px-2.5 py-1.5"
								onClick={() => {
									if (t >= DAY_END) setT(DAY_START);
									setPlaying((p) => !p);
								}}
								aria-label={playing ? "暫停" : "播放"}
							>
								{playing ? (
									<Pause className="size-4" />
								) : (
									<Play className="size-4" />
								)}
							</button>
							<span className="w-14 text-xl font-bold tabular-nums">
								{clock(t)}
							</span>
							<div className="relative min-w-[240px] flex-1 pt-3">
								{day.alerts.map((a) => {
									const st = a.t <= t ? alertState(a, t) : null;
									return (
										<button
											key={`${a.run.i}-${a.t}`}
											type="button"
											title={`${clock(a.t)} ${a.run.sub} ${st ? ALERT[st].label : "提示"}`}
											onClick={() => seek(a.t)}
											className="absolute top-0 h-2.5 w-1.5 -translate-x-1/2 rounded-sm"
											style={{
												left: `${((a.t - DAY_START) / (DAY_END - DAY_START)) * 100}%`,
												background:
													st && st !== "pending"
														? ALERT[st].color
														: "var(--axis)",
											}}
										/>
									);
								})}
								<input
									type="range"
									className="w-full accent-[var(--accent)]"
									min={DAY_START}
									max={DAY_END}
									step={60}
									value={t}
									onChange={(e) => setT(Number(e.target.value))}
									aria-label="回放時刻"
								/>
								<div className="flex justify-between text-[10px] text-[var(--muted)] tabular-nums">
									{[5, 8, 11, 14, 17, 20, 23].map((h) => (
										<span key={h}>{String(h).padStart(2, "0")}:00</span>
									))}
								</div>
							</div>
							<Toggle
								label="速度"
								value={speed}
								options={SPEEDS.map((s) => [s, `${s / 60} 分／秒`])}
								onChange={setSpeed}
							/>
						</div>
					</div>
				)}
			</section>

			{/* ---- analysis below the live view ---- */}
			{index && (
				<div className="mx-auto max-w-[1240px] px-4 pb-10 sm:px-6">
					<header className="pt-8">
						<h2 className="text-xl font-bold">回測怎麼讀</h2>
						<p className="mt-2 max-w-[80ch] text-sm leading-relaxed text-[var(--fg2)]">
							尚未串接即時 API，上方把 2025 年 7–12
							月（留出期）的刷卡紀錄依時間重新播放，模擬系統當下「收得到什麼、會說什麼」。
							地圖上的圓點是一班車，數字是「已上車、尚未下車」的推估人數，顏色是座位狀態；虛線外圈＝已發提示、尚待驗證，細外圈＝正駛向選定站牌。
							點地圖上的站或左側清單的站，右側會列出正在接近的車與「到這站時」的座位預估。
						</p>
						<p className="mt-2 max-w-[80ch] text-xs leading-relaxed text-[var(--muted)]">
							限制：刷卡只記錄上了車的人，被留下的人看不見；座位狀態是推估，不是實際空位。公車位置是用同班次前後兩個刷卡站的時間沿道路內插（回放用，代替日後的車機定位，短期方案並沒有定位）；到站時間只用最後刷卡站與
							0.7 km／分 估算，沒有塞車資料。系統不派車、不判定超載。
						</p>
					</header>

					<PeriodPanel
						index={index}
						date={date}
						onSelect={(d) => {
							goDay(d);
							window.scrollTo({ top: 0, behavior: "smooth" });
						}}
						metric={metric}
						setMetric={setMetric}
						seats={seats}
					/>

					{day && (
						<>
							<DayKpis day={day} t={t} seats={seats} />
							<div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
								<section className="panel min-w-0 p-4">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<h2 className="text-sm font-semibold">
											班次時間軸：推估載客與提示（{date}）
										</h2>
										<Toggle
											label=""
											value={onlyBusy}
											options={[
												[true, "只看曾座位不多的班次"],
												[false, "全部班次"],
											]}
											onChange={setOnlyBusy}
										/>
									</div>
									<p className="mt-0.5 text-xs text-[var(--muted)]">
										每列一班，只畫到目前時刻；▼＝提示（空心待驗證，綠命中、紅錯誤、灰交人工）。點選可跳到該時刻。
									</p>
									<div className="mt-2">
										<SeatLegend seats={seats} />
									</div>
									<div className="mt-2">
										<RunTimeline
											day={day}
											t={t}
											seats={seats}
											onlyBusy={onlyBusy}
											onSeek={seek}
										/>
									</div>
								</section>
								<section className="panel p-4">
									<h2 className="text-sm font-semibold">中期：熱點窗口追蹤</h2>
									<p className="mt-0.5 text-xs text-[var(--muted)]">
										依訓練期排序的前 10 個窗口（約占 303 個的 3%，涵蓋留出期 32%
										的座位不多到站）。只是優先觀察的線索；調整班次須 G0
										現場計數。「留出期／日」為 41
										席情境，「今日」隨車型情境切換。
									</p>
									<div className="mt-2">
										<HotWindows day={day} hot={index.hot} t={t} seats={seats} />
									</div>
								</section>
							</div>
						</>
					)}

					<section className="panel mt-4 p-4 text-xs leading-relaxed text-[var(--fg2)]">
						<h2 className="text-sm font-semibold text-[var(--fg)]">
							這個回測沒有模擬的部分
						</h2>
						<ul className="mt-1.5 list-disc space-y-1 pl-5">
							<li>
								中期措施（熱點班次調整、車型指派、保留座、條件式加班）需 G0
								現場計數確認有人被留下才評估；本頁只顯示熱點窗口的累積，作為優先觀察的線索，不是排班依據。
							</li>
							<li>
								長期（車輛定位、整合票證與預約、跨運具資料）是願景；地圖上的位置內插只是示意。
							</li>
							<li>
								上傳延遲（資料逾 3
								分鐘顯示「資料不足」）、現金與漏刷、班表（未發車班次）都未模擬；回測假設刷卡即時可見。
							</li>
							<li>
								車碼與車型對照尚未取得，所以用 41／37
								席兩種情境切換；提示用的調度卡固定以 41 席「座位不多」（≥36
								人）訓練，不隨情境改變。
							</li>
						</ul>
					</section>
				</div>
			)}
		</div>
	);
}

function DayKpis({ day, t, seats }: { day: Day; t: number; seats: Seats }) {
	const active = day.runs.filter((r) => isActive(r, t));
	const byStatus: Record<SeatStatus, number> = {
		ok: 0,
		few: 0,
		full: 0,
		unknown: 0,
	};
	for (const r of active) byStatus[seatStatus(loadAt(r, t), seats)]++;
	const states = day.alerts
		.filter((a) => a.t <= t)
		.map((a) => alertState(a, t));
	const count = (s: string) => states.filter((x) => x === s).length;
	const nearSoFar = day.arr.filter(
		([at, , , , load]) => at <= t && load >= seats - 5,
	).length;
	return (
		<div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
			<Kpi
				label={`行駛中班次（${clock(t)}）`}
				value={String(active.length)}
				sub={
					<span className="flex flex-wrap gap-x-2.5">
						{(["ok", "few", "full", "unknown"] as const).map(
							(s) =>
								(byStatus[s] > 0 || s !== "unknown") && (
									<span key={s} className="inline-flex items-center gap-1">
										<StatusDot s={s} />
										{STATUS[s].label.replace("（交人工核對）", "")}{" "}
										{byStatus[s]}
									</span>
								),
						)}
					</span>
				}
			/>
			<Kpi
				label="今日提示（至目前）"
				value={`${states.length}／${day.alerts.length}`}
				sub={`命中 ${count("hit")}・錯誤 ${count("miss")}・待驗證 ${count("pending")}・人工 ${count("review")}`}
			/>
			<Kpi
				label={`座位不多到站（${seats} 席，至目前）`}
				value={String(nearSoFar)}
				sub="12 站、上車前載客 ≥ 席數−5"
			/>
			<Kpi
				label="離站判斷（全日）"
				value={`${day.deps - day.abstain}／${day.deps}`}
				sub={`其餘 ${day.abstain} 次因方向未知而棄權，不提示`}
			/>
		</div>
	);
}

function PeriodPanel({
	index,
	date,
	onSelect,
	metric,
	setMetric,
	seats,
}: {
	index: IndexFile;
	date: string;
	onSelect: (d: string) => void;
	metric: PeriodMetric;
	setMetric: (m: PeriodMetric) => void;
	seats: Seats;
}) {
	const s = index.days.reduce(
		(a, d) => ({
			alerts: a.alerts + d.alerts,
			hits: a.hits + d.hits,
			anom: a.anom + d.anom,
			anomHits: a.anomHits + d.anomHits,
			near: a.near + (seats === 41 ? d.near41 : d.near37),
		}),
		{ alerts: 0, hits: 0, anom: 0, anomHits: 0, near: 0 },
	);
	const n = index.days.length;
	const valid = s.alerts - s.anom;
	const validHits = s.hits - s.anomHits;
	return (
		<section className="panel mt-6 p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="text-sm font-semibold">
						留出期逐日回測（2025-07-01 至 12-31，{n} 日）
					</h2>
					<p className="mt-0.5 text-xs text-[var(--muted)]">
						因果查表調度卡（訓練期 ≤2025-03），每班最多一次、每日最多 5
						則；點選任一天回放。
					</p>
				</div>
				<Toggle
					label="顯示"
					value={metric}
					options={[
						["alerts", "每日提示"],
						["near", `座位不多到站（${seats} 席）`],
					]}
					onChange={setMetric}
				/>
			</div>
			<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
				<Kpi
					label="提示總數"
					value={String(s.alerts)}
					sub={`每日 ${(s.alerts / n).toFixed(1)} 則`}
				/>
				<Kpi
					label="提示精確率（排除資料異常）"
					value={pct(validHits, valid)}
					sub={`${validHits}／${valid}；異常 ${s.anom} 則交人工`}
				/>
				<Kpi
					label="錯誤提示"
					value={String(valid - validHits)}
					sub={`每週約 ${(((valid - validHits) / n) * 7).toFixed(1)} 次`}
				/>
				<Kpi
					label={`座位不多到站（${seats} 席，12 站）`}
					value={String(s.near)}
					sub={`每日約 ${(s.near / n).toFixed(1)} 次`}
				/>
			</div>
			<div className="mt-3">
				<PeriodChart
					days={index.days}
					selected={date}
					onSelect={onSelect}
					metric={metric}
					seats={seats}
				/>
				<PeriodLegend metric={metric} />
			</div>
		</section>
	);
}

function SeatLegend({ seats }: { seats: Seats }) {
	const rule: Record<SeatStatus, string> = {
		ok: `< ${seats - 5}`,
		few: `≥ ${seats - 5}`,
		full: `≥ ${seats}`,
		unknown: "> 50",
	};
	return (
		<div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--fg2)]">
			{(["ok", "few", "full", "unknown"] as const).map((s) => (
				<span key={s} className="inline-flex items-center gap-1">
					<StatusDot s={s} />
					{STATUS[s].label.replace("（交人工核對）", "")}
					<span className="text-[var(--muted)]">{rule[s]}</span>
				</span>
			))}
		</div>
	);
}

function Kpi({
	label,
	value,
	sub,
}: {
	label: string;
	value: string;
	sub?: React.ReactNode;
}) {
	return (
		<div className="panel px-3 py-2.5">
			<div className="text-[11px] text-[var(--muted)]">{label}</div>
			<div className="mt-0.5 text-xl font-bold tabular-nums">{value}</div>
			{sub && <div className="mt-0.5 text-[11px] text-[var(--fg2)]">{sub}</div>}
		</div>
	);
}

function Toggle<T extends string | number | boolean>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: [T, string][];
	onChange: (v: T) => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-1">
			{label && (
				<span className="mr-1 text-[11px] text-[var(--muted)]">{label}</span>
			)}
			{options.map(([v, l]) => (
				<button
					key={String(v)}
					type="button"
					className={`btn ${v === value ? "btn-active" : ""}`}
					aria-pressed={v === value}
					onClick={() => onChange(v)}
				>
					{l}
				</button>
			))}
		</div>
	);
}
