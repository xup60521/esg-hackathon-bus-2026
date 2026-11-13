import { type ReactNode, useState } from "react";
import type {
	Analysis,
	DayRow,
	DayStatus,
} from "#/features/lab/visualization/model";
import { movingAverage, perDay } from "#/features/lab/visualization/model";

type Metric = "b" | "a";
export const METRIC_COLOR: Record<Metric, string> = {
	b: "var(--boarding)",
	a: "var(--alighting)",
};
export const METRIC_LABEL: Record<Metric, string> = { b: "上車", a: "下車" };
const REST_COLOR = "var(--middle)";
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const fmt = new Intl.NumberFormat("en-US");
const fmt1 = (v: number) =>
	Number.isInteger(v) ? fmt.format(v) : v.toFixed(1);

function niceMax(v: number) {
	if (v <= 0) return 1;
	const p = 10 ** Math.floor(Math.log10(v));
	const m = v / p;
	return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

const STATUS_TEXT: Record<DayStatus, string> = {
	active: "",
	missing: "資料集無紀錄（不等於零，也不代表停駛）",
	inactive: "資料集當日有紀錄，但所選支線沒有",
	excluded: "被日類型篩選排除",
};

function Tip({ x, children }: { x: number; children: ReactNode }) {
	return (
		<div
			className="pointer-events-none absolute top-1 z-10 w-max max-w-[240px] rounded-lg border border-[var(--line)] bg-[var(--tip-bg)] px-2.5 py-1.5 text-[11px] leading-relaxed shadow-lg"
			style={{
				left: `${Math.min(Math.max(x * 100, 12), 88)}%`,
				transform: "translateX(-50%)",
			}}
		>
			{children}
		</div>
	);
}

function Legend({
	items,
}: {
	items: { color: string; label: string; dashed?: boolean; hatch?: boolean }[];
}) {
	return (
		<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--fg2)]">
			{items.map((i) => (
				<span key={i.label} className="inline-flex items-center gap-1.5">
					<span
						className="inline-block h-2 w-3 rounded-sm"
						style={
							i.hatch
								? {
										background:
											"repeating-linear-gradient(45deg, var(--muted) 0 1.5px, transparent 1.5px 4px)",
									}
								: i.dashed
									? { borderTop: `2px dashed ${i.color}`, height: 0 }
									: { background: i.color }
						}
					/>
					{i.label}
				</span>
			))}
		</div>
	);
}

// ── daily series ────────────────────────────────────────────────────────────────

const DW = 1000;
const DH = 230;
const DPAD = { top: 10, right: 8, bottom: 24, left: 46 };

export function DailyChart({
	days,
	metric,
	onPick,
}: {
	days: DayRow[];
	metric: Metric;
	onPick: (date: string) => void;
}) {
	const [hover, setHover] = useState<number | null>(null);
	const n = days.length;
	const ma = movingAverage(days, metric);
	const max = niceMax(
		Math.max(0, ...days.map((d) => (d.status === "active" ? d[metric] : 0))),
	);
	const iw = DW - DPAD.left - DPAD.right;
	const ih = DH - DPAD.top - DPAD.bottom;
	const bw = iw / Math.max(n, 1);
	const x = (i: number) => DPAD.left + i * bw;
	const y = (v: number) => DPAD.top + ih - (v / max) * ih;

	const ticks: { i: number; label: string }[] = [];
	days.forEach((d, i) => {
		const day = d.date.slice(8);
		const month = Number(d.date.slice(5, 7));
		if (
			n > 200
				? day === "01" && month % 3 === 1
				: n > 45
					? day === "01"
					: i % 7 === 0
		) {
			ticks.push({ i, label: n > 200 ? d.date.slice(0, 7) : d.date.slice(5) });
		}
	});

	let path = "";
	let pen = false;
	ma.forEach((v, i) => {
		if (v === null) {
			pen = false;
			return;
		}
		path += `${pen ? "L" : "M"}${(x(i) + bw / 2).toFixed(1)} ${y(v).toFixed(1)} `;
		pen = true;
	});

	const h = hover === null ? null : days[hover];
	return (
		<div className="relative">
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: pointer shortcut; keyboard users pick a single day with the date inputs */}
			<svg
				viewBox={`0 0 ${DW} ${DH}`}
				className="w-full cursor-crosshair"
				role="img"
				aria-label={`每日${METRIC_LABEL[metric]}人次長條圖，細線為 7 日平均；月別明細見下方表格`}
				onPointerMove={(e) => {
					const r = e.currentTarget.getBoundingClientRect();
					const px = ((e.clientX - r.left) / r.width) * DW;
					setHover(
						Math.min(n - 1, Math.max(0, Math.floor((px - DPAD.left) / bw))),
					);
				}}
				onPointerLeave={() => setHover(null)}
				onClick={() => h && h.status === "active" && onPick(h.date)}
			>
				<defs>
					<pattern
						id="viz-hatch"
						width="4"
						height="4"
						patternUnits="userSpaceOnUse"
						patternTransform="rotate(45)"
					>
						<line
							x1="0"
							y1="0"
							x2="0"
							y2="4"
							stroke="var(--muted)"
							strokeWidth="1.6"
						/>
					</pattern>
				</defs>
				{[0, max / 2, max].map((t) => (
					<g key={t}>
						<line
							x1={DPAD.left}
							x2={DW - DPAD.right}
							y1={y(t)}
							y2={y(t)}
							style={{ stroke: t === 0 ? "var(--axis)" : "var(--grid)" }}
						/>
						<text
							x={DPAD.left - 6}
							y={y(t) + 3}
							textAnchor="end"
							className="fill-[var(--muted)] text-[10px]"
						>
							{fmt1(t)}
						</text>
					</g>
				))}
				{days.map((d, i) =>
					d.status === "missing" ? (
						<rect
							key={d.date}
							x={x(i)}
							y={DPAD.top}
							width={Math.max(bw, 2)}
							height={ih}
							fill="url(#viz-hatch)"
							opacity={0.55}
						/>
					) : d.status === "active" ? (
						<rect
							key={d.date}
							x={x(i)}
							y={y(d[metric])}
							width={Math.max(bw - 0.35, 0.6)}
							height={Math.max(0, DPAD.top + ih - y(d[metric]))}
							fill={d.rest ? REST_COLOR : METRIC_COLOR[metric]}
							opacity={hover === i ? 1 : 0.78}
						/>
					) : d.status === "inactive" ? (
						<rect
							key={d.date}
							x={x(i)}
							y={DPAD.top + ih - 3}
							width={Math.max(bw - 0.35, 0.6)}
							height={3}
							fill="var(--muted)"
						/>
					) : null,
				)}
				{path && (
					<path
						d={path}
						fill="none"
						strokeWidth={1.6}
						style={{ stroke: "var(--fg)" }}
					/>
				)}
				{ticks.map((t) => (
					<text
						key={t.i}
						x={x(t.i)}
						y={DH - 7}
						textAnchor="middle"
						className="fill-[var(--muted)] text-[10px]"
					>
						{t.label}
					</text>
				))}
				{hover !== null && (
					<line
						x1={x(hover) + bw / 2}
						x2={x(hover) + bw / 2}
						y1={DPAD.top}
						y2={DPAD.top + ih}
						style={{ stroke: "var(--axis)" }}
					/>
				)}
			</svg>
			{h && (
				<Tip x={(x(hover as number) + bw / 2) / DW}>
					<div className="font-semibold">
						{h.date}（週{WEEKDAYS[h.weekday]}）{h.rest ? " 休息日" : " 上班日"}
					</div>
					{h.status === "active" ? (
						<>
							<div>
								{METRIC_LABEL[metric]} {fmt.format(h[metric])} 人次
							</div>
							<div className="text-[var(--muted)]">點擊可只看這一天</div>
						</>
					) : (
						<div className="text-[var(--muted)]">{STATUS_TEXT[h.status]}</div>
					)}
				</Tip>
			)}
			<Legend
				items={[
					{ color: METRIC_COLOR[metric], label: "上班日" },
					{ color: REST_COLOR, label: "休息日（週休、國定假日、補假）" },
					{ color: "var(--fg)", label: "7 日平均（只含有紀錄日）" },
					{ color: "var(--muted)", label: "資料集當日無紀錄", hatch: true },
				]}
			/>
		</div>
	);
}

// ── hour-of-day profile: working days vs rest days ──────────────────────────────

const HW = 640;
const HH = 230;
const HPAD = { top: 12, right: 12, bottom: 24, left: 44 };
export const HOUR_FROM = 5;
export const HOUR_TO = 23;
const HOUR_LIST = Array.from(
	{ length: HOUR_TO - HOUR_FROM + 1 },
	(_, i) => i + HOUR_FROM,
);

export function HourChart({ a, metric }: { a: Analysis; metric: Metric }) {
	const [hover, setHover] = useState<number | null>(null);
	const series = [
		{
			key: "work" as const,
			label: "上班日",
			color: METRIC_COLOR[metric],
			dash: undefined,
		},
		{ key: "rest" as const, label: "休息日", color: REST_COLOR, dash: "5 3" },
	].map((s) => ({
		...s,
		days: a.hours[s.key].days,
		vals: perDay(a.hours[s.key][metric], a.hours[s.key].days),
	}));
	const max = niceMax(
		Math.max(0, ...series.flatMap((s) => HOUR_LIST.map((h) => s.vals[h] ?? 0))),
	);
	const iw = HW - HPAD.left - HPAD.right;
	const ih = HH - HPAD.top - HPAD.bottom;
	const x = (h: number) =>
		HPAD.left + ((h - HOUR_FROM) / (HOUR_LIST.length - 1)) * iw;
	const y = (v: number) => HPAD.top + ih - (v / max) * ih;
	return (
		<div className="relative">
			<svg
				viewBox={`0 0 ${HW} ${HH}`}
				className="w-full"
				role="img"
				aria-label={`各小時平均${METRIC_LABEL[metric]}人次，上班日與休息日分開`}
				onPointerMove={(e) => {
					const r = e.currentTarget.getBoundingClientRect();
					const px = ((e.clientX - r.left) / r.width) * HW;
					setHover(
						Math.min(
							HOUR_TO,
							Math.max(
								HOUR_FROM,
								Math.round(
									HOUR_FROM + ((px - HPAD.left) / iw) * (HOUR_LIST.length - 1),
								),
							),
						),
					);
				}}
				onPointerLeave={() => setHover(null)}
			>
				{[0, max / 2, max].map((t) => (
					<g key={t}>
						<line
							x1={HPAD.left}
							x2={HW - HPAD.right}
							y1={y(t)}
							y2={y(t)}
							style={{ stroke: t === 0 ? "var(--axis)" : "var(--grid)" }}
						/>
						<text
							x={HPAD.left - 6}
							y={y(t) + 3}
							textAnchor="end"
							className="fill-[var(--muted)] text-[10px]"
						>
							{fmt1(t)}
						</text>
					</g>
				))}
				{HOUR_LIST.filter((h) => h % 2 === 1).map((h) => (
					<text
						key={h}
						x={x(h)}
						y={HH - 7}
						textAnchor="middle"
						className="fill-[var(--muted)] text-[10px]"
					>
						{h}
					</text>
				))}
				{series.map((s) => (
					<polyline
						key={s.key}
						fill="none"
						strokeWidth={2}
						strokeDasharray={s.dash}
						style={{ stroke: s.color }}
						points={HOUR_LIST.filter((h) => s.vals[h] !== null)
							.map(
								(h) =>
									`${x(h).toFixed(1)},${y(s.vals[h] as number).toFixed(1)}`,
							)
							.join(" ")}
					/>
				))}
				{hover !== null && (
					<line
						x1={x(hover)}
						x2={x(hover)}
						y1={HPAD.top}
						y2={HPAD.top + ih}
						style={{ stroke: "var(--axis)" }}
					/>
				)}
			</svg>
			{hover !== null && (
				<Tip x={x(hover) / HW}>
					<div className="font-semibold">
						{String(hover).padStart(2, "0")}:00–{String(hover).padStart(2, "0")}
						:59
					</div>
					{series.map((s) => (
						<div key={s.key}>
							<span style={{ color: s.color }}>●</span> {s.label}：
							{s.vals[hover] === null
								? "無資料"
								: `${fmt1(Math.round((s.vals[hover] as number) * 10) / 10)} 人次/日`}
							<span className="text-[var(--muted)]">（{s.days} 日）</span>
						</div>
					))}
				</Tip>
			)}
			<Legend
				items={series.map((s) => ({
					color: s.color,
					label: `${s.label}（${fmt.format(s.days)} 日平均）`,
					dashed: s.key === "rest",
				}))}
			/>
		</div>
	);
}

// ── weekday × hour heatmap ──────────────────────────────────────────────────────

export function WeekdayHeat({ a, metric }: { a: Analysis; metric: Metric }) {
	const [hover, setHover] = useState<{ wd: number; h: number } | null>(null);
	const sums = a.weekdayHour[metric];
	const avg = (wd: number, h: number) =>
		a.weekdayHour.days[wd] > 0 ? sums[wd][h] / a.weekdayHour.days[wd] : null;
	const max = Math.max(
		0,
		...WEEKDAYS.flatMap((_, wd) => HOUR_LIST.map((h) => avg(wd, h) ?? 0)),
	);
	const cw = 30;
	const ch = 26;
	const left = 34;
	const top = 4;
	const w = left + cw * HOUR_LIST.length;
	const hh = top + ch * 7 + 22;
	const hv = hover ? avg(hover.wd, hover.h) : null;
	return (
		<div className="relative overflow-x-auto">
			<svg
				viewBox={`0 0 ${w} ${hh}`}
				className="w-full"
				role="img"
				aria-label={`星期與小時的平均${METRIC_LABEL[metric]}人次熱度圖`}
				onPointerLeave={() => setHover(null)}
			>
				{WEEKDAYS.map((d, wd) => (
					<g key={d}>
						<text
							x={left - 8}
							y={top + wd * ch + ch / 2 + 4}
							textAnchor="end"
							className="fill-[var(--fg2)] text-[11px]"
						>
							週{d}
						</text>
						{HOUR_LIST.map((h, hi) => {
							const v = avg(wd, h);
							return (
								<rect
									key={h}
									x={left + hi * cw + 1}
									y={top + wd * ch + 1}
									width={cw - 2}
									height={ch - 2}
									rx={3}
									fill={v === null ? "url(#viz-hatch)" : METRIC_COLOR[metric]}
									fillOpacity={
										v === null
											? 0.5
											: max === 0
												? 0.05
												: 0.06 + 0.94 * (v / max)
									}
									stroke={
										hover?.wd === wd && hover.h === h ? "var(--fg)" : "none"
									}
									onPointerEnter={() => setHover({ wd, h })}
								/>
							);
						})}
					</g>
				))}
				{HOUR_LIST.filter((h) => h % 2 === 1).map((h) => (
					<text
						key={h}
						x={left + (h - HOUR_FROM) * cw + cw / 2}
						y={top + ch * 7 + 14}
						textAnchor="middle"
						className="fill-[var(--muted)] text-[10px]"
					>
						{h}
					</text>
				))}
			</svg>
			{hover && (
				<Tip x={(left + (hover.h - HOUR_FROM) * cw + cw / 2) / w}>
					<div className="font-semibold">
						週{WEEKDAYS[hover.wd]} {String(hover.h).padStart(2, "0")}:00
					</div>
					<div>
						{hv === null
							? "此星期在篩選下沒有有紀錄日"
							: `${METRIC_LABEL[metric]}平均 ${fmt1(Math.round(hv * 10) / 10)} 人次/日`}
					</div>
					<div className="text-[var(--muted)]">
						{a.weekdayHour.days[hover.wd]} 個有紀錄日
						{a.weekdayHour.days[hover.wd] > 0 &&
						a.weekdayHour.days[hover.wd] < 5
							? "（天數少，僅供參考）"
							: ""}
					</div>
				</Tip>
			)}
			<div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--fg2)]">
				<span className="inline-flex items-center gap-1.5">
					少
					<span
						className="inline-block h-2 w-24 rounded-sm"
						style={{
							background: `linear-gradient(to right, color-mix(in srgb, ${METRIC_COLOR[metric]} 6%, transparent), ${METRIC_COLOR[metric]})`,
						}}
					/>
					多（上限 {fmt1(Math.round(max * 10) / 10)} 人次/日）
				</span>
				<span>每格 = 該星期、該小時的平均，分母為有紀錄日數（見提示）</span>
			</div>
		</div>
	);
}

// ── stops ───────────────────────────────────────────────────────────────────────

export function StopBars({
	stops,
	totals,
	selected,
	onToggle,
}: {
	stops: { name: string; order: number }[];
	totals: { b: number; a: number }[];
	selected: Set<number>;
	onToggle: (i: number) => void;
}) {
	const order = stops
		.map((_, i) => i)
		.sort((p, q) => stops[p].order - stops[q].order);
	const max = Math.max(1, ...totals.map((t) => Math.max(t.b, t.a)));
	return (
		<div>
			<div className="space-y-1">
				{order.map((i) => {
					const on = selected.has(i);
					return (
						<button
							key={stops[i].name}
							type="button"
							onClick={() => onToggle(i)}
							aria-pressed={on}
							className={`grid w-full grid-cols-[88px_1fr] items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-[var(--chip)] ${on ? "" : "opacity-45"}`}
						>
							<span className="truncate text-[11px] text-[var(--fg2)]">
								<span className="mr-1 tabular-nums text-[var(--muted)]">
									{stops[i].order}
								</span>
								{stops[i].name}
							</span>
							<span className="block">
								{(["b", "a"] as const).map((k) => (
									<span key={k} className="flex items-center gap-1.5">
										<span
											className="block h-[7px] rounded-sm"
											style={{
												width: `${Math.max((totals[i][k] / max) * 100, totals[i][k] > 0 ? 0.4 : 0)}%`,
												background: METRIC_COLOR[k],
											}}
										/>
										<span className="text-[10px] tabular-nums text-[var(--muted)]">
											{fmt.format(totals[i][k])}
										</span>
									</span>
								))}
							</span>
						</button>
					);
				})}
			</div>
			<Legend
				items={[
					{ color: METRIC_COLOR.b, label: "上車" },
					{ color: METRIC_COLOR.a, label: "下車" },
				]}
			/>
		</div>
	);
}
