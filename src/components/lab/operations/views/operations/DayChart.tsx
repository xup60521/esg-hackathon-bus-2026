import { useState } from "react";
import {
	type Baseline,
	DIR_LABEL,
	type Dir,
	RULES,
} from "#/features/lab/operations/replay";

const W = 720;
const H = 230;
const PAD = { top: 14, right: 12, bottom: 26, left: 40 };
const HOURS = Array.from(
	{ length: RULES.lastHour - RULES.firstHour + 1 },
	(_, i) => i + RULES.firstHour,
);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

function niceMax(v: number) {
	if (v <= 0) return 10;
	const p = 10 ** Math.floor(Math.log10(v));
	return Math.ceil(v / p) * p;
}

/**
 * Hourly boardings for one direction. Solid bars = data already delivered at the replay clock;
 * outlined bars = hindsight (only when the reader asks); the line and band are the causal baseline
 * (mean and min–max of the previous same-type weekdays), known before the day starts.
 */
export function DayChart({
	dir,
	observed,
	baseline,
	lastDelivered,
	showHindsight,
	alertHours,
}: {
	dir: Dir;
	observed: number[];
	baseline: Baseline | null;
	lastDelivered: number;
	showHindsight: boolean;
	alertHours: number[];
}) {
	const [hover, setHover] = useState<number | null>(null);
	const visible = HOURS.filter((h) => h <= lastDelivered || showHindsight);
	const max = niceMax(
		Math.max(
			...visible.map((h) => observed[h]),
			...(baseline ? HOURS.map((h) => baseline.hi[h]) : [0]),
		),
	);
	const iw = W - PAD.left - PAD.right;
	const ih = H - PAD.top - PAD.bottom;
	const slot = iw / HOURS.length;
	const x = (h: number) => PAD.left + (h - RULES.firstHour) * slot;
	const y = (v: number) => PAD.top + ih - (v / max) * ih;
	const ticks = [0, max / 2, max];
	const mid = (h: number) => x(h) + slot / 2;
	const line = baseline
		? HOURS.map(
				(h, i) => `${i === 0 ? "M" : "L"}${mid(h)},${y(baseline.mean[h])}`,
			).join(" ")
		: "";
	const band = baseline
		? `${HOURS.map((h, i) => `${i === 0 ? "M" : "L"}${mid(h)},${y(baseline.hi[h])}`).join(" ")} ${[
				...HOURS,
			]
				.reverse()
				.map((h) => `L${mid(h)},${y(baseline.lo[h])}`)
				.join(" ")} Z`
		: "";
	const cursorX = x(Math.min(lastDelivered + 1, RULES.lastHour + 1));
	return (
		<div className="relative">
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="w-full"
				role="img"
				aria-label={`${DIR_LABEL[dir]} 每小時上車人次與基準`}
				onPointerLeave={() => setHover(null)}
			>
				{ticks.map((t) => (
					<g key={t}>
						<line
							x1={PAD.left}
							x2={W - PAD.right}
							y1={y(t)}
							y2={y(t)}
							style={{ stroke: t === 0 ? "var(--axis)" : "var(--grid)" }}
						/>
						<text
							x={PAD.left - 6}
							y={y(t) + 3}
							textAnchor="end"
							className="fill-[var(--muted)] text-[10px]"
						>
							{Math.round(t)}
						</text>
					</g>
				))}
				{band && <path d={band} style={{ fill: "var(--grid)" }} />}
				{HOURS.map((h) => {
					const delivered = h <= lastDelivered;
					if (!delivered && !showHindsight) return null;
					const v = observed[h];
					const bh = Math.max((v / max) * ih, v > 0 ? 1.5 : 0);
					return (
						<rect
							key={h}
							x={x(h) + 2}
							y={y(0) - bh}
							width={slot - 4}
							height={bh}
							rx={2}
							style={
								delivered
									? { fill: "var(--boarding)" }
									: {
											fill: "none",
											stroke: "var(--boarding)",
											strokeDasharray: "3 2",
										}
							}
							fillOpacity={hover === null || hover === h ? 1 : 0.55}
						/>
					);
				})}
				{alertHours.map((h) => (
					<text
						key={h}
						x={mid(h)}
						y={PAD.top + 2}
						textAnchor="middle"
						className="fill-[var(--sev-watch)] text-[11px] font-bold"
					>
						▲
					</text>
				))}
				{baseline && (
					<path
						d={line}
						fill="none"
						strokeWidth={2}
						strokeDasharray="5 3"
						style={{ stroke: "var(--fg)" }}
					/>
				)}
				<line
					x1={cursorX}
					x2={cursorX}
					y1={PAD.top}
					y2={PAD.top + ih}
					strokeWidth={1.5}
					style={{ stroke: "var(--accent)" }}
				/>
				<text
					x={cursorX + 4}
					y={PAD.top + 10}
					className="fill-[var(--accent)] text-[10px] font-semibold"
				>
					資料截止
				</text>
				{HOURS.map((h) => (
					<g key={h}>
						{h % 2 === 1 && (
							<text
								x={mid(h)}
								y={H - 8}
								textAnchor="middle"
								className="fill-[var(--muted)] text-[10px]"
							>
								{h}
							</text>
						)}
						{/* biome-ignore lint/a11y/noStaticElementInteractions: SVG hover/focus hit-area; values are also in the aria-label */}
						<rect
							x={x(h)}
							y={PAD.top}
							width={slot}
							height={ih}
							fill="transparent"
							tabIndex={0}
							aria-label={`${hh(h)}：${h <= lastDelivered || showHindsight ? `${observed[h]} 人${h > lastDelivered ? "（事後）" : ""}` : "尚未送達"}${baseline ? `，基準 ${baseline.mean[h].toFixed(1)}` : ""}`}
							onPointerEnter={() => setHover(h)}
							onFocus={() => setHover(h)}
							onBlur={() => setHover(null)}
						/>
					</g>
				))}
			</svg>
			{hover !== null && (
				<output className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border border-[var(--line)] bg-[var(--tip-bg)] px-2.5 py-1.5 text-xs shadow-md">
					<b>
						{hh(hover)}–{hh(hover + 1)}
					</b>{" "}
					{hover <= lastDelivered || showHindsight
						? `${observed[hover]} 人${hover > lastDelivered ? "（事後）" : ""}`
						: "尚未送達"}
					{baseline && (
						<span className="text-[var(--muted)]">
							{" "}
							· 基準 {baseline.mean[hover].toFixed(1)}（{baseline.lo[hover]}–
							{baseline.hi[hover]}）
						</span>
					)}
				</output>
			)}
			<div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
				<span className="inline-flex items-center gap-1.5">
					<i
						className="inline-block size-2.5 rounded-sm"
						style={{ background: "var(--boarding)" }}
					/>
					已送達的上車人次
				</span>
				{showHindsight && (
					<span className="inline-flex items-center gap-1.5">
						<i
							className="inline-block size-2.5 rounded-sm border border-dashed"
							style={{ borderColor: "var(--boarding)" }}
						/>
						事後實際（回放當下看不到）
					</span>
				)}
				<span className="inline-flex items-center gap-1.5">
					<i
						className="inline-block h-0 w-4 border-t-2 border-dashed"
						style={{ borderColor: "var(--fg)" }}
					/>
					基準（前 {baseline?.n ?? 0} 個同型日平均）
				</span>
				<span className="inline-flex items-center gap-1.5">
					<i
						className="inline-block size-2.5 rounded-sm"
						style={{ background: "var(--grid)" }}
					/>
					同型日最小–最大
				</span>
				<span className="text-[var(--sev-watch)]">▲ 有建議</span>
			</div>
		</div>
	);
}
