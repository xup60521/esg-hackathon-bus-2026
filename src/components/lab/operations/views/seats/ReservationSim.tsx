import { useMemo, useState } from "react";
import { Field, KindBadge, Section, Stat } from "#/components/lab/shared";
import {
	type AllocationOptions,
	allocate,
	type Demand,
	reservations,
} from "#/features/lab/seats/model";
import { CONTROL, type DemandFile, hhmm } from "./data";

const DAY_FILTERS = {
	fri: {
		label: "週五",
		test: (d: DemandFile["days"][number]) => d.weekday === 5,
	},
	sun: {
		label: "週日",
		test: (d: DemandFile["days"][number]) => d.weekday === 0,
	},
	rest: {
		label: "所有休息日",
		test: (d: DemandFile["days"][number]) => d.rest,
	},
	work: {
		label: "所有上班日",
		test: (d: DemandFile["days"][number]) => !d.rest,
	},
	all: { label: "全部日期", test: () => true },
} as const;
type DayFilter = keyof typeof DAY_FILTERS;

const HOURS = Array.from({ length: 18 }, (_, i) => i + 5);

function NumberField({
	label,
	value,
	onChange,
	min,
	max,
	step = 1,
	suffix,
}: {
	label: string;
	value: number;
	onChange: (n: number) => void;
	min: number;
	max: number;
	step?: number;
	suffix?: string;
}) {
	return (
		<Field label={suffix ? `${label}（${suffix}）` : label}>
			<input
				type="number"
				className={CONTROL}
				value={value}
				min={min}
				max={max}
				step={step}
				onChange={(e) => {
					const n = Number(e.target.value);
					if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
				}}
			/>
		</Field>
	);
}

export function ReservationSim({ demand }: { demand: DemandFile }) {
	const [corridor, setCorridor] = useState(0);
	const [dayFilter, setDayFilter] = useState<DayFilter>("sun");
	const [startHour, setStartHour] = useState(13);
	const [endHour, setEndHour] = useState(17);
	const [interval, setIntervalMinutes] = useState(30);
	const [share, setShare] = useState(20);
	const [uplift, setUplift] = useState(0);
	const [seats, setSeats] = useState(43);
	const [minToRun, setMinToRun] = useState(20);
	const [tolerance, setTolerance] = useState(60);

	/** riders per day for the chosen corridor, keyed by day index */
	const byDay = useMemo(() => {
		const map = new Map<number, Demand[]>();
		for (const [d, c, minute, riders] of demand.rows) {
			if (c !== corridor) continue;
			const list = map.get(d);
			if (list) list.push({ minute, riders });
			else map.set(d, [{ minute, riders }]);
		}
		return map;
	}, [demand, corridor]);

	const options = useMemo<AllocationOptions>(
		() => ({
			start: startHour * 60,
			end: Math.max(startHour, endHour) * 60,
			interval,
			seats,
			tolerance,
			minToRun: Math.min(minToRun, seats),
		}),
		[startHour, endHour, interval, seats, tolerance, minToRun],
	);

	const result = useMemo(() => {
		const days = demand.days
			.map((d, i) => ({ ...d, i }))
			.filter((d) => DAY_FILTERS[dayFilter].test(d));
		const perDay = days.map((d) => {
			const window = (byDay.get(d.i) ?? [])
				.filter(
					(x) =>
						x.minute + demand.binMinutes > options.start - options.tolerance &&
						x.minute <= options.end + options.tolerance,
				)
				.map((x) => ({
					// a 15-minute bin is treated as requests at its midpoint
					minute: x.minute + Math.floor(demand.binMinutes / 2),
					riders: x.riders * (1 + uplift / 100),
				}));
			return {
				date: d.date,
				...allocate(reservations(window, share / 100), options),
			};
		});
		const departures = new Map<number, { runs: number; riders: number }>();
		for (const d of perDay)
			for (const b of d.buses) {
				const s = departures.get(b.departure) ?? { runs: 0, riders: 0 };
				s.runs++;
				s.riders += b.riders;
				departures.set(b.departure, s);
			}
		const sum = (f: (d: (typeof perDay)[number]) => number) =>
			perDay.reduce((s, d) => s + f(d), 0);
		const buses = sum((d) => d.buses.length);
		const carried = sum((d) => d.carried);
		const histogram = [0, 0, 0, 0, 0];
		for (const d of perDay) histogram[Math.min(4, d.buses.length)]++;
		return {
			days: perDay.length,
			buses,
			carried,
			requested: sum((d) => d.requested),
			toRegular: sum((d) => d.toRegular),
			fill: buses ? carried / (buses * options.seats) : null,
			histogram,
			departures: [...departures.entries()].sort((a, b) => a[0] - b[0]),
			top: [...perDay]
				.sort(
					(a, b) => b.buses.length - a.buses.length || b.carried - a.carried,
				)
				.slice(0, 5),
		};
	}, [demand, byDay, dayFilter, share, uplift, options]);

	const c = demand.corridors[corridor];
	const pct = (x: number | null) =>
		x === null ? "—" : `${(100 * x).toFixed(0)}%`;

	return (
		<Section
			title="2. 全預約制加開專車：電腦分配模擬"
			subtitle="正班維持現場上車；另開只收預約的專車。把 2024–2025 年實際刷卡上車的人當需求基礎，假設其中一定比例會改預約，電腦在截止時把預約分到最近的專車時刻（可前後挪移），不到開車門檻的班次取消，乘客改搭正班。"
			badges={
				<>
					<KindBadge kind="history" />
					<KindBadge kind="scenario" />
				</>
			}
		>
			<div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
				<Field label="路廊（上車站 → 下車站）">
					<select
						className={CONTROL}
						value={corridor}
						onChange={(e) => setCorridor(Number(e.target.value))}
					>
						{demand.corridors.map((x, i) => (
							<option key={`${x.from}-${x.to}`} value={i}>
								{x.from} → {x.to}
							</option>
						))}
					</select>
				</Field>
				<Field label="日期類型">
					<select
						className={CONTROL}
						value={dayFilter}
						onChange={(e) => setDayFilter(e.target.value as DayFilter)}
					>
						{(Object.keys(DAY_FILTERS) as DayFilter[]).map((k) => (
							<option key={k} value={k}>
								{DAY_FILTERS[k].label}
							</option>
						))}
					</select>
				</Field>
				<Field label="專車時段">
					<div className="flex items-center gap-1.5">
						<select
							className={CONTROL}
							value={startHour}
							onChange={(e) => setStartHour(Number(e.target.value))}
						>
							{HOURS.map((h) => (
								<option key={h} value={h}>
									{hhmm(h * 60)}
								</option>
							))}
						</select>
						<span className="text-xs text-[var(--muted)]">至</span>
						<select
							className={CONTROL}
							value={endHour}
							onChange={(e) => setEndHour(Number(e.target.value))}
						>
							{HOURS.filter((h) => h >= startHour).map((h) => (
								<option key={h} value={h}>
									{hhmm(h * 60)}
								</option>
							))}
						</select>
					</div>
				</Field>
				<Field label="發車間隔">
					<select
						className={CONTROL}
						value={interval}
						onChange={(e) => setIntervalMinutes(Number(e.target.value))}
					>
						{[15, 30, 60].map((n) => (
							<option key={n} value={n}>
								每 {n} 分鐘一個時刻
							</option>
						))}
					</select>
				</Field>
				<NumberField
					label="可接受挪移"
					suffix="± 分鐘"
					value={tolerance}
					onChange={setTolerance}
					min={0}
					max={120}
					step={15}
				/>
				<NumberField
					label="改用預約的比例"
					suffix="%"
					value={share}
					onChange={setShare}
					min={0}
					max={100}
					step={5}
				/>
				<NumberField
					label="未被記錄的需求加成"
					suffix="%"
					value={uplift}
					onChange={setUplift}
					min={0}
					max={200}
					step={10}
				/>
				<NumberField
					label="專車座位"
					suffix="席"
					value={seats}
					onChange={setSeats}
					min={10}
					max={60}
				/>
				<NumberField
					label="開車門檻"
					suffix="預約人數"
					value={minToRun}
					onChange={setMinToRun}
					min={1}
					max={seats}
				/>
			</div>

			<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Stat
					label="符合條件的日期"
					value={result.days}
					sub={`${c.from} → ${c.to}`}
				/>
				<Stat
					label="平均每天開幾班專車"
					value={result.days ? (result.buses / result.days).toFixed(1) : "—"}
					sub={`合計 ${result.buses} 班`}
				/>
				<Stat
					label="專車平均坐滿"
					value={pct(result.fill)}
					sub={`${result.carried.toLocaleString()} 人次 ÷ (${result.buses} 班 × ${seats} 席)`}
				/>
				<Stat
					label="預約者搭上專車"
					value={pct(
						result.requested ? result.carried / result.requested : null,
					)}
					sub={`其餘 ${result.toRegular.toLocaleString()} 人次改搭正班`}
				/>
			</div>

			<div className="mt-4 grid gap-4 lg:grid-cols-2">
				<div>
					<h3 className="text-xs font-semibold">每天開幾班（天數）</h3>
					<table className="mt-2 w-full border-collapse text-xs tabular-nums">
						<tbody>
							{result.histogram.map((n, k) => (
								<tr
									key={k === 4 ? "4+" : String(k)}
									className="border-b border-[var(--line)] last:border-0"
								>
									<td className="py-1.5 pr-3">
										{k === 4 ? "4 班以上" : `${k} 班`}
									</td>
									<td className="w-full py-1.5">
										<div
											className="h-2 rounded-sm bg-[var(--k-scenario)]"
											style={{
												width: `${result.days ? (100 * n) / result.days : 0}%`,
											}}
										/>
									</td>
									<td className="py-1.5 pl-3 text-right">{n}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<div>
					<h3 className="text-xs font-semibold">各專車時刻</h3>
					{result.departures.length === 0 ? (
						<p className="mt-2 text-xs text-[var(--muted)]">
							這組條件下沒有任何一班達到開車門檻。
						</p>
					) : (
						<table className="mt-2 w-full border-collapse text-xs tabular-nums">
							<thead>
								<tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
									<th className="py-1.5 pr-3 font-medium">時刻</th>
									<th className="py-1.5 pr-3 text-right font-medium">
										開出天數比例
									</th>
									<th className="py-1.5 text-right font-medium">
										開出時平均人數
									</th>
								</tr>
							</thead>
							<tbody>
								{result.departures.map(([m, s]) => (
									<tr
										key={m}
										className="border-b border-[var(--line)] last:border-0"
									>
										<td className="py-1.5 pr-3">{hhmm(m)}</td>
										<td className="py-1.5 pr-3 text-right">
											{pct(s.runs / result.days)}
										</td>
										<td className="py-1.5 text-right">
											{(s.riders / s.runs).toFixed(1)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			</div>

			{result.top.length > 0 && result.top[0].buses.length > 0 && (
				<p className="mt-3 text-xs text-[var(--fg2)]">
					需要最多專車的日期：
					{result.top
						.filter((d) => d.buses.length > 0)
						.map((d) => `${d.date}（${d.buses.length} 班、${d.carried} 人）`)
						.join("、")}
				</p>
			)}
		</Section>
	);
}
