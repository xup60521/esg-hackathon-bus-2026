import { useState } from "react";
import type { DaySummary, Seats } from "#/features/dashboard/replay";

const W = 1000;
const H = 130;
const PAD_L = 28;
const PAD_B = 22;
const ERR = "#d03b3b";
const REVIEW = "#8b8f98";

export type PeriodMetric = "alerts" | "near";

type Seg = { v: number; color: string; label: string };

function segments(d: DaySummary, metric: PeriodMetric, seats: Seats): Seg[] {
	if (metric === "near")
		return [
			{
				v: seats === 41 ? d.near41 : d.near37,
				color: "var(--boarding)",
				label: "座位不多到站",
			},
		];
	const wrong = d.alerts - d.hits - (d.anom - d.anomHits);
	return [
		{ v: d.hits - d.anomHits, color: "var(--boarding)", label: "命中" },
		{ v: d.anom, color: REVIEW, label: "交人工核對" },
		{ v: wrong, color: ERR, label: "錯誤提示" },
	];
}

export default function PeriodChart({
	days,
	selected,
	onSelect,
	metric,
	seats,
}: {
	days: DaySummary[];
	selected: string;
	onSelect: (date: string) => void;
	metric: PeriodMetric;
	seats: Seats;
}) {
	const [hover, setHover] = useState<number | null>(null);
	const totals = days.map((d) =>
		segments(d, metric, seats).reduce((a, s) => a + s.v, 0),
	);
	const max = Math.max(1, ...totals);
	const ticks = max <= 6 ? [0, max] : [0, Math.round(max / 2), max];
	const step = (W - PAD_L) / days.length;
	const bw = Math.max(1, step - 1.5);
	const y = (v: number) => (H - PAD_B) * (1 - v / max) + 4;
	const months = days
		.map((d, i) => ({ i, d }))
		.filter(({ d }) => d.date.endsWith("-01"));
	const h = hover === null ? null : days[hover];

	return (
		<div className="relative">
			<svg
				viewBox={`0 0 ${W} ${H + 4}`}
				className="w-full"
				role="img"
				aria-label="留出期每日提示或座位不多到站次數"
				onMouseLeave={() => setHover(null)}
			>
				{ticks.map((v) => (
					<g key={v}>
						<line
							x1={PAD_L}
							x2={W}
							y1={y(v)}
							y2={y(v)}
							stroke={v === 0 ? "var(--axis)" : "var(--grid)"}
						/>
						<text
							x={PAD_L - 6}
							y={y(v) + 3}
							textAnchor="end"
							fontSize={10}
							fill="var(--muted)"
						>
							{v}
						</text>
					</g>
				))}
				{days.map((d, i) => {
					const x = PAD_L + i * step;
					let acc = 0;
					const sel = d.date === selected;
					return (
						// biome-ignore lint/a11y/noStaticElementInteractions: the date picker offers the keyboard path
						<g
							key={d.date}
							onMouseEnter={() => setHover(i)}
							onClick={() => onSelect(d.date)}
							className="cursor-pointer"
						>
							<rect
								x={x - 0.5}
								y={0}
								width={step}
								height={H - PAD_B + 4}
								fill={sel ? "var(--active-bg)" : "transparent"}
								stroke={sel ? "var(--active-border)" : "none"}
							/>
							{segments(d, metric, seats).map((s) => {
								if (s.v <= 0) return null;
								const y0 = y(acc);
								acc += s.v;
								const y1 = y(acc);
								return (
									<rect
										key={s.label}
										x={x + 0.25}
										y={y1}
										width={bw}
										height={Math.max(0.5, y0 - y1 - 0.75)}
										rx={Math.min(1.5, bw / 2)}
										fill={s.color}
										opacity={hover === null || hover === i ? 1 : 0.55}
									/>
								);
							})}
							{d.rest && (
								<rect
									x={x + 0.25}
									y={H - PAD_B + 7}
									width={bw}
									height={3}
									fill="var(--muted)"
									opacity={0.6}
								/>
							)}
						</g>
					);
				})}
				{months.map(({ i, d }) => (
					<text
						key={d.date}
						x={PAD_L + i * step}
						y={H + 2}
						fontSize={10}
						fill="var(--muted)"
					>
						{Number(d.date.slice(5, 7))} 月
					</text>
				))}
			</svg>
			{h && hover !== null && (
				<div
					className="pointer-events-none absolute top-0 z-10 rounded-lg border border-[var(--line)] bg-[var(--tip-bg)] px-2.5 py-1.5 text-xs shadow"
					style={{
						left: `${Math.min(80, ((PAD_L + hover * step) / W) * 100)}%`,
					}}
				>
					<div className="font-semibold">
						{h.date} {h.rest ? "休息日" : "上班日"}
						{h.note ? ` · ${h.note}` : ""}
					</div>
					{segments(h, metric, seats).map((s) => (
						<div key={s.label} className="flex items-center gap-1.5">
							<span
								className="inline-block size-2 rounded-sm"
								style={{ background: s.color }}
							/>
							{s.label} {s.v}
						</div>
					))}
					<div className="text-[var(--muted)]">點選回放這一天</div>
				</div>
			)}
		</div>
	);
}

export function PeriodLegend({ metric }: { metric: PeriodMetric }) {
	const items =
		metric === "near"
			? [["var(--boarding)", "座位不多到站（12 站）"]]
			: [
					["var(--boarding)", "命中"],
					[REVIEW, "資料異常，交人工核對"],
					[ERR, "錯誤提示"],
				];
	return (
		<div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--fg2)]">
			{items.map(([c, l]) => (
				<span key={l} className="inline-flex items-center gap-1.5">
					<span
						className="inline-block size-2.5 rounded-sm"
						style={{ background: c }}
					/>
					{l}
				</span>
			))}
			<span className="inline-flex items-center gap-1.5">
				<span className="inline-block h-[3px] w-3 bg-[var(--muted)] opacity-60" />
				休息日
			</span>
		</div>
	);
}
