import { useQuery } from "@tanstack/react-query";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Clock3, Moon, Pause, Play, Sun } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { AnimatedTrip, StopValue } from "#/components/BusMap";
import HourBars from "#/components/HourBars";
import Timeline, { type DailySeries } from "#/components/Timeline";
import { useTRPC } from "#/integrations/trpc/react";
import { type GeoAssets, loadGeoAssets } from "#/lib/geo";
import { PALETTES, SUBROUTES, type Theme } from "#/lib/palette";

const BusMap = lazy(() => import("#/components/BusMap"));

export const Route = createFileRoute("/")({ component: Home });

const fmt = new Intl.NumberFormat("en-US");
const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
const DAY_START = 5 * 3600;
const DAY_END = 24.5 * 3600;
const SPEEDS = [600, 1200, 2400]; // simulated seconds per real second

type Mode = "year" | "day";

const dayStartTs = (date: string) =>
	Date.parse(`${date}T00:00:00+08:00`) / 1000;
const clock = (t: number) => {
	const h = Math.floor(t / 3600);
	const m = Math.floor((t % 3600) / 60);
	return `${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

function haversine(a: [number, number], b: [number, number]) {
	const R = 6371000;
	const toR = Math.PI / 180;
	const dLat = (b[1] - a[1]) * toR;
	const dLon = (b[0] - a[0]) * toR;
	const s =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(s));
}

const THEME_KEY = "bus6670-theme";

/** Palette-driven CSS variables (sub-route colours etc.); neutral UI tokens live in styles.css. */
function themeVars(theme: Theme): React.CSSProperties {
	const p = PALETTES[theme];
	const vars: Record<string, string> = {
		"--boarding": p.boardingHex,
		"--alighting": p.alightingHex,
		"--rider": p.riderHex,
		"--chart-surface": p.chartSurface,
	};
	for (const [k, v] of Object.entries(p.subroutes)) vars[`--s-${k}`] = v;
	return vars as React.CSSProperties;
}

function Home() {
	// Light by default; remembers the visitor's choice.
	const [theme, setTheme] = useState<Theme>("light");
	useEffect(() => {
		const saved = localStorage.getItem(THEME_KEY);
		if (saved === "dark" || saved === "light") setTheme(saved);
	}, []);
	const toggleTheme = () =>
		setTheme((t) => {
			const next = t === "light" ? "dark" : "light";
			localStorage.setItem(THEME_KEY, next);
			return next;
		});

	const trpc = useTRPC();
	const daily = useQuery({
		...trpc.ridership.daily.queryOptions(),
		staleTime: Infinity,
	});
	const stopDaily = useQuery({
		...trpc.ridership.stopDaily.queryOptions(),
		staleTime: Infinity,
	});

	const [assets, setAssets] = useState<GeoAssets | null>(null);
	const [geoError, setGeoError] = useState<string | null>(null);
	useEffect(() => {
		loadGeoAssets().then(setAssets, (e: Error) => setGeoError(e.message));
	}, []);

	// ---- timeline series -------------------------------------------------
	const series = useMemo<DailySeries | null>(() => {
		if (!daily.data) return null;
		const dates = [...new Set(daily.data.map((r) => r.date))].sort();
		const idx = new Map(dates.map((d, i) => [d, i]));
		const values: Record<string, number[]> = Object.fromEntries(
			SUBROUTES.map((s) => [s, new Array(dates.length).fill(0)]),
		);
		const totals = new Array(dates.length).fill(0);
		const revenue = new Array(dates.length).fill(0);
		for (const r of daily.data) {
			const i = idx.get(r.date) ?? 0;
			if (!values[r.subroute])
				values[r.subroute] = new Array(dates.length).fill(0);
			values[r.subroute][i] += r.trips;
			totals[i] += r.trips;
			revenue[i] += r.revenue;
		}
		return { dates, values, totals, revenue } as DailySeries & {
			revenue: number[];
		};
	}, [daily.data]);

	const stopIndex = useMemo(() => {
		const m = new Map<string, Map<string, StopValue>>();
		let max = 1;
		for (const [date, stop, b, a] of stopDaily.data ?? []) {
			let day = m.get(date);
			if (!day) {
				day = new Map();
				m.set(date, day);
			}
			day.set(stop, { boardings: b, alightings: a });
			max = Math.max(max, b, a);
		}
		return { byDate: m, max };
	}, [stopDaily.data]);

	// ---- selection & playback state ---------------------------------------
	const [selected, setSelected] = useState<number | null>(null);
	const [mode, setMode] = useState<Mode>("year");
	const [playingYear, setPlayingYear] = useState(false);
	const [playingDay, setPlayingDay] = useState(false);
	const [speedIdx, setSpeedIdx] = useState(1);
	const [time, setTime] = useState(DAY_START);

	// default selection: the busiest day in the dataset
	useEffect(() => {
		if (series && selected === null) {
			let best = 0;
			for (let i = 1; i < series.totals.length; i++) {
				if (series.totals[i] > series.totals[best]) best = i;
			}
			setSelected(best);
		}
	}, [series, selected]);

	const selIndex = selected ?? 0;
	const date = series?.dates[selIndex] ?? null;

	// year playback: one day per tick
	useEffect(() => {
		if (!playingYear || !series) return;
		const id = setInterval(() => {
			setSelected((i) => {
				const next = (i ?? 0) + 1;
				if (next >= series.dates.length) {
					setPlayingYear(false);
					return i;
				}
				return next;
			});
		}, 140);
		return () => clearInterval(id);
	}, [playingYear, series]);

	// day playback: requestAnimationFrame clock
	const raf = useRef<number>(0);
	useEffect(() => {
		if (!playingDay) return;
		let last = performance.now();
		const tick = (now: number) => {
			const dt = (now - last) / 1000;
			last = now;
			setTime((t) => {
				const next = t + dt * SPEEDS[speedIdx];
				if (next >= DAY_END) {
					setPlayingDay(false);
					return DAY_END;
				}
				return next;
			});
			raf.current = requestAnimationFrame(tick);
		};
		raf.current = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf.current);
	}, [playingDay, speedIdx]);

	// ---- single-day trips ---------------------------------------------------
	const day = useQuery({
		...trpc.ridership.day.queryOptions({ date: date ?? "2024-01-01" }),
		enabled: mode === "day" && !!date,
		staleTime: Infinity,
	});

	const dayData = useMemo(() => {
		if (!day.data || !assets || !date) return null;
		const t0 = dayStartTs(date);
		const pathCache = new Map<
			string,
			{ path: [number, number, number][]; frac: number[] } | null
		>();
		const trips: AnimatedTrip[] = [];
		const hours = new Array(24).fill(0);
		const od = new Map<string, number>();
		const subs = new Map<string, number>();
		for (const r of day.data) {
			const hb = Math.floor((r.b - t0) / 3600);
			if (hb >= 0 && hb < 24) hours[hb]++;
			subs.set(r.sub, (subs.get(r.sub) ?? 0) + 1);
			if (!r.to || !r.a || r.to === r.from || r.a <= r.b) continue;
			const key = `${r.from}|${r.to}`;
			od.set(key, (od.get(key) ?? 0) + 1);
			let cached = pathCache.get(key);
			if (cached === undefined) {
				const pair = assets.routes[key];
				if (!pair || pair.coords.length < 2) cached = null;
				else {
					const cum = [0];
					for (let i = 1; i < pair.coords.length; i++)
						cum.push(
							cum[i - 1] + haversine(pair.coords[i - 1], pair.coords[i]),
						);
					const total = cum[cum.length - 1] || 1;
					cached = {
						path: assets.sampler.drape(pair.coords, 60),
						frac: cum.map((c) => c / total),
					};
				}
				pathCache.set(key, cached);
			}
			if (!cached) continue;
			const b = r.b - t0;
			const dur = r.a - r.b;
			trips.push({
				path: cached.path,
				timestamps: cached.frac.map((f) => b + f * dur),
				sub: r.sub,
			});
		}
		const topOd = [...od.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
		return { trips, hours, topOd, subs, rows: day.data, t0 };
	}, [day.data, assets, date]);

	// stop values shown as columns
	const stopValues = useMemo(() => {
		if (mode === "day" && dayData) {
			const m = new Map<string, StopValue>();
			const now = dayData.t0 + time;
			for (const r of dayData.rows) {
				if (r.b <= now) {
					const v = m.get(r.from) ?? { boardings: 0, alightings: 0 };
					v.boardings++;
					m.set(r.from, v);
				}
				if (r.to && r.a && r.a <= now) {
					const v = m.get(r.to) ?? { boardings: 0, alightings: 0 };
					v.alightings++;
					m.set(r.to, v);
				}
			}
			return m;
		}
		return (date && stopIndex.byDate.get(date)) || new Map<string, StopValue>();
	}, [mode, dayData, time, date, stopIndex]);

	const onBoard = useMemo(() => {
		if (mode !== "day" || !dayData) return 0;
		const now = dayData.t0 + time;
		let n = 0;
		for (const r of dayData.rows) if (r.b <= now && r.a && r.a > now) n++;
		return n;
	}, [mode, dayData, time]);

	// ---- KPIs -------------------------------------------------------------
	const kpi = useMemo(() => {
		if (!series) return null;
		const sumYear = (y: string) =>
			series.totals.reduce(
				(s, v, i) => (series.dates[i].startsWith(y) ? s + v : s),
				0,
			);
		const y24 = sumYear("2024");
		const y25 = sumYear("2025");
		return {
			y24,
			y25,
			yoy: (y25 - y24) / y24,
			avg: (y24 + y25) / series.dates.length,
		};
	}, [series]);

	const openDay = (i: number) => {
		setSelected(i);
		setPlayingYear(false);
		setMode("day");
		setTime(DAY_START);
		setPlayingDay(true);
	};

	const weekday = date
		? WEEKDAY[new Date(`${date}T12:00:00+08:00`).getUTCDay()]
		: "";
	const selTotal = series ? series.totals[selIndex] : 0;
	const selRevenue = series
		? (series as DailySeries & { revenue: number[] }).revenue[selIndex]
		: 0;
	const error =
		geoError ??
		daily.error?.message ??
		stopDaily.error?.message ??
		day.error?.message;

	return (
		<div
			data-theme={theme}
			style={themeVars(theme)}
			className="fixed inset-0 overflow-hidden bg-[var(--bg)] text-[var(--fg)]"
		>
			{/* 3D map */}
			<div className="absolute inset-0">
				<ClientOnly fallback={null}>
					{assets && (
						<Suspense fallback={null}>
							<BusMap
								theme={theme}
								assets={assets}
								stopValues={stopValues}
								scaleMax={stopIndex.max}
								trips={mode === "day" ? (dayData?.trips ?? null) : null}
								currentTime={time}
							/>
						</Suspense>
					)}
				</ClientOnly>
			</div>

			{(!assets || !series) && !error && (
				<div className="absolute inset-0 grid place-items-center text-sm text-[var(--fg2)]">
					載入地形與乘車資料中… Loading terrain & ridership…
				</div>
			)}
			{error && (
				<div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-lg border border-red-400/30 bg-red-950/80 px-4 py-2 text-sm">
					⚠ {error}
				</div>
			)}

			{/* header / KPIs */}
			<header className="panel absolute left-4 top-4 w-[340px] p-4">
				<button
					type="button"
					onClick={toggleTheme}
					className="btn absolute right-3 top-3 px-2"
					aria-label={
						theme === "light"
							? "切換深色模式 Dark mode"
							: "切換淺色模式 Light mode"
					}
					title={
						theme === "light" ? "深色模式 Dark mode" : "淺色模式 Light mode"
					}
				>
					{theme === "light" ? (
						<Moon className="size-4" />
					) : (
						<Sun className="size-4" />
					)}
				</button>
				<div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
					ESG Hackathon 2026 · 公共運輸
				</div>
				<h1 className="mt-1 text-xl font-bold leading-tight">
					6670 台灣好行日月潭線
				</h1>
				<p className="mt-0.5 text-xs text-[var(--fg2)]">
					臺中 ⇄ 高鐵臺中站 ⇄ 埔里 ⇄ 日月潭 · 電子票證刷卡運量 2024–2025
				</p>
				{kpi && (
					<div className="mt-3 grid grid-cols-3 gap-2">
						<Stat label="2024 人次" value={fmt.format(kpi.y24)} />
						<Stat
							label="2025 人次"
							value={fmt.format(kpi.y25)}
							sub={`${kpi.yoy >= 0 ? "▲" : "▼"} ${(Math.abs(kpi.yoy) * 100).toFixed(1)}% YoY`}
						/>
						<Stat label="日平均" value={fmt.format(Math.round(kpi.avg))} />
					</div>
				)}
				<div className="mt-3 flex items-center gap-4 text-[11px] text-[var(--fg2)]">
					<span className="flex items-center gap-1.5">
						<span
							className="inline-block h-3 w-2 rounded-sm"
							style={{ background: "var(--boarding)" }}
						/>{" "}
						上車 boardings
					</span>
					<span className="flex items-center gap-1.5">
						<span
							className="inline-block h-3 w-2 rounded-sm"
							style={{ background: "var(--alighting)" }}
						/>{" "}
						下車 alightings
					</span>
					{mode === "day" && (
						<span className="flex items-center gap-1.5">
							<span className="inline-block h-0.5 w-4 rounded bg-[var(--rider)]" />{" "}
							乘客 riders
						</span>
					)}
				</div>
			</header>

			{/* selected-day panel */}
			{date && series && (
				<aside className="panel absolute right-4 top-4 w-[320px] p-4">
					<div className="flex items-baseline justify-between">
						<div>
							<div className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
								{mode === "day" ? "單日動畫 Day replay" : "每日運量 Daily view"}
							</div>
							<div className="text-lg font-bold">
								{date}{" "}
								<span className="text-sm font-medium text-[var(--fg2)]">
									週{weekday}
								</span>
							</div>
						</div>
						{mode === "day" && (
							<div className="text-2xl font-bold tabular-nums text-[var(--accent)]">
								{clock(time)}
							</div>
						)}
					</div>
					<div className="mt-2 grid grid-cols-3 gap-2">
						<Stat label="當日人次" value={fmt.format(selTotal)} />
						<Stat label="票收 NT$" value={fmt.format(selRevenue)} />
						{mode === "day" ? (
							<Stat label="車上乘客" value={fmt.format(onBoard)} />
						) : (
							<Stat
								label="vs 日均"
								value={
									kpi ? `${((selTotal / kpi.avg - 1) * 100).toFixed(0)}%` : "–"
								}
							/>
						)}
					</div>

					{mode === "day" && dayData && (
						<>
							<div className="mt-4 mb-1 text-[11px] text-[var(--muted)]">
								每小時上車人次 Boardings by hour
							</div>
							<HourBars
								hours={dayData.hours}
								activeHour={Math.floor(time / 3600) % 24}
							/>
							<div className="mt-3 mb-1 text-[11px] text-[var(--muted)]">
								熱門起訖 Top origin → destination
							</div>
							<ul className="space-y-1 text-xs">
								{dayData.topOd.map(([k, v]) => {
									const [f, t] = k.split("|");
									return (
										<li
											key={k}
											className="flex items-center justify-between gap-2"
										>
											<span className="truncate text-[var(--fg2)]">
												{f} → {t}
											</span>
											<span className="tabular-nums">{fmt.format(v)}</span>
										</li>
									);
								})}
							</ul>
						</>
					)}
					{mode === "day" && day.isLoading && (
						<div className="mt-4 text-xs text-[var(--muted)]">
							載入當日刷卡紀錄…
						</div>
					)}

					{mode === "year" && (
						<div className="mt-4 space-y-1 text-xs">
							{SUBROUTES.map((s) => (
								<div key={s} className="flex items-center justify-between">
									<span className="flex items-center gap-1.5 text-[var(--fg2)]">
										<span
											className="inline-block size-2 rounded-sm"
											style={{ background: `var(--s-${s})` }}
										/>
										{s}
									</span>
									<span className="tabular-nums">
										{fmt.format(series.values[s]?.[selIndex] ?? 0)}
									</span>
								</div>
							))}
							<button
								type="button"
								className="btn mt-3 w-full justify-center"
								onClick={() => openDay(selIndex)}
							>
								<Clock3 className="size-4" /> 播放當日動畫 Replay this day
							</button>
						</div>
					)}
				</aside>
			)}

			{/* bottom timeline */}
			{series && (
				<footer className="panel absolute inset-x-4 bottom-4 px-4 pt-3 pb-2">
					<div className="mb-1 flex flex-wrap items-center gap-2">
						<div className="mr-2 text-sm font-semibold">
							每日搭乘人次 Daily trips by sub-route
						</div>
						<button
							type="button"
							className={`btn ${mode === "year" ? "btn-active" : ""}`}
							onClick={() => {
								setMode("year");
								setPlayingDay(false);
								if (!playingYear && selIndex >= series.dates.length - 1)
									setSelected(0);
								setPlayingYear((p) => !p);
							}}
						>
							{playingYear ? (
								<Pause className="size-4" />
							) : (
								<CalendarDays className="size-4" />
							)}
							{playingYear ? "暫停" : "逐日播放"} Timeline
						</button>
						<button
							type="button"
							className={`btn ${mode === "day" ? "btn-active" : ""}`}
							onClick={() => {
								if (mode !== "day") return openDay(selIndex);
								if (!playingDay && time >= DAY_END) setTime(DAY_START);
								setPlayingDay((p) => !p);
							}}
						>
							{mode === "day" && playingDay ? (
								<Pause className="size-4" />
							) : (
								<Play className="size-4" />
							)}
							單日動畫 Day
						</button>
						{mode === "day" && (
							<>
								<input
									aria-label="Time of day"
									type="range"
									min={DAY_START}
									max={DAY_END}
									step={60}
									value={time}
									onChange={(e) => {
										setPlayingDay(false);
										setTime(Number(e.target.value));
									}}
									className="mx-2 w-48 accent-[var(--rider)]"
								/>
								<button
									type="button"
									className="btn"
									onClick={() => setSpeedIdx((s) => (s + 1) % SPEEDS.length)}
								>
									{SPEEDS[speedIdx] / 600}×
								</button>
							</>
						)}
						<div className="ml-auto text-right text-[10px] leading-tight text-[var(--muted)]">
							<div>運量：電子票證刷卡紀錄（已移除卡號）</div>
							<a
								href="/geo/SOURCES.md"
								target="_blank"
								rel="noreferrer"
								className="hover:text-[var(--fg)]"
							>
								地圖：內政部 20m DEM・鄉鎮界／交通部觀光署站點 ↗
							</a>
						</div>
					</div>
					<Timeline
						series={series}
						selectedIndex={selIndex}
						onSelect={(i) => {
							if (mode === "day") return openDay(i);
							setPlayingYear(false);
							setSelected(i);
						}}
					/>
				</footer>
			)}
		</div>
	);
}

function Stat({
	label,
	value,
	sub,
}: {
	label: string;
	value: string;
	sub?: string;
}) {
	return (
		<div className="rounded-lg bg-[var(--chip)] px-2.5 py-2">
			<div className="text-[10px] text-[var(--muted)]">{label}</div>
			<div className="text-base font-bold tabular-nums leading-tight">
				{value}
			</div>
			{sub && <div className="text-[10px] text-[var(--fg2)]">{sub}</div>}
		</div>
	);
}
