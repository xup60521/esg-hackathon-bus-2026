import { useState } from "react";
import type { Bin } from "#/lib/midstop";

const fmt1 = (v: number) => v.toFixed(1);
const pct = (v: number | null) =>
	v === null ? "–" : `${Math.round(v * 100)}%`;

const SERIES = [
	{ key: "endBoard", label: "端點上車", color: "var(--boarding)" },
	{ key: "endAlight", label: "端點下車", color: "var(--alighting)" },
	{ key: "mid", label: "中站上車", color: "var(--middle)" },
] as const;

type Profile = Record<(typeof SERIES)[number]["key"], number[]>;

const W = 640;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 24, left: 40 };
const HOURS = Array.from({ length: 20 }, (_, i) => i + 4); // 04–23

function niceMax(v: number) {
	if (v <= 0) return 1;
	const p = 10 ** Math.floor(Math.log10(v));
	return Math.ceil(v / p) * p;
}

export function HourProfile({ profile }: { profile: Profile }) {
	const [hover, setHover] = useState<number | null>(null);
	const max = niceMax(
		Math.max(...SERIES.flatMap((s) => HOURS.map((h) => profile[s.key][h]))),
	);
	const iw = W - PAD.left - PAD.right;
	const ih = H - PAD.top - PAD.bottom;
	const x = (h: number) =>
		PAD.left + ((h - HOURS[0]) / (HOURS.length - 1)) * iw;
	const y = (v: number) => PAD.top + ih - (v / max) * ih;
	const ticks = [0, max / 2, max];
	return (
		<div className="relative">
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="w-full"
				role="img"
				aria-label="每日平均每小時人次 Average riders per day by hour"
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
							{Number.isInteger(t) ? t : fmt1(t)}
						</text>
					</g>
				))}
				{HOURS.filter((h) => h % 2 === 0).map((h) => (
					<text
						key={h}
						x={x(h)}
						y={H - 6}
						textAnchor="middle"
						className="fill-[var(--muted)] text-[10px]"
					>
						{h}
					</text>
				))}
				{hover !== null && (
					<line
						x1={x(hover)}
						x2={x(hover)}
						y1={PAD.top}
						y2={PAD.top + ih}
						style={{ stroke: "var(--axis)" }}
					/>
				)}
				{SERIES.map((s) => (
					<polyline
						key={s.key}
						fill="none"
						strokeWidth={2}
						strokeLinejoin="round"
						style={{ stroke: s.color }}
						points={HOURS.map((h) => `${x(h)},${y(profile[s.key][h])}`).join(
							" ",
						)}
					/>
				))}
				{hover !== null &&
					SERIES.map((s) => (
						<circle
							key={s.key}
							cx={x(hover)}
							cy={y(profile[s.key][hover])}
							r={4}
							strokeWidth={2}
							style={{ fill: s.color, stroke: "var(--chart-surface)" }}
						/>
					))}
				{HOURS.map((h) => (
					<rect
						key={h}
						x={x(h) - iw / (HOURS.length - 1) / 2}
						y={0}
						width={iw / (HOURS.length - 1)}
						height={H}
						fill="transparent"
						onPointerEnter={() => setHover(h)}
					/>
				))}
			</svg>
			{hover !== null && (
				<div
					className="pointer-events-none absolute top-0 rounded-md border border-[var(--line)] bg-[var(--tip-bg)] px-2 py-1 text-[11px] shadow-sm"
					style={{
						left: `${(x(hover) / W) * 100}%`,
						transform: `translateX(${hover > 18 ? "-105%" : "8px"})`,
					}}
				>
					<div className="font-semibold">
						{String(hover).padStart(2, "0")}:00–{String(hover).padStart(2, "0")}
						:59
					</div>
					{SERIES.map((s) => (
						<div key={s.key} className="flex items-center gap-1.5">
							<span
								className="inline-block size-2 rounded-sm"
								style={{ background: s.color }}
							/>
							<span className="text-[var(--fg2)]">{s.label}</span>
							<b className="ml-auto tabular-nums">
								{fmt1(profile[s.key][hover])}
							</b>
						</div>
					))}
				</div>
			)}
			<Legend />
		</div>
	);
}

function Legend() {
	return (
		<div className="mt-1 flex flex-wrap gap-4 text-[11px] text-[var(--fg2)]">
			{SERIES.map((s) => (
				<span key={s.key} className="flex items-center gap-1.5">
					<span
						className="inline-block h-0.5 w-4 rounded"
						style={{ background: s.color }}
					/>
					{s.label}
				</span>
			))}
		</div>
	);
}

const BH = 200;
const BPAD = { top: 22, bottom: 34, left: 40, right: 12 };

/** Pooled middle-stop boardings vs baseline, per endpoint-vs-baseline bin. */
export function RatioBars({ bins }: { bins: Bin[] }) {
	const [hover, setHover] = useState<number | null>(null);
	const max = Math.max(1.5, ...bins.map((b) => b.ratio ?? 0)) * 1.05;
	const iw = W - BPAD.left - BPAD.right;
	const ih = BH - BPAD.top - BPAD.bottom;
	const slot = iw / bins.length;
	const bw = Math.min(64, slot - 24);
	const y = (v: number) => BPAD.top + ih - (v / max) * ih;
	return (
		<div className="relative">
			<svg
				viewBox={`0 0 ${W} ${BH}`}
				className="w-full"
				role="img"
				aria-label="中站上車相對基準，依端點相對基準分組"
			>
				{[0, 0.5, 1, 1.5].map((t) => (
					<g key={t}>
						<line
							x1={BPAD.left}
							x2={W - BPAD.right}
							y1={y(t)}
							y2={y(t)}
							strokeDasharray={t === 1 ? "4 3" : undefined}
							style={{
								stroke: t === 0 || t === 1 ? "var(--axis)" : "var(--grid)",
							}}
						/>
						<text
							x={BPAD.left - 6}
							y={y(t) + 3}
							textAnchor="end"
							className="fill-[var(--muted)] text-[10px]"
						>
							{t * 100}%
						</text>
					</g>
				))}
				{bins.map((b, i) => {
					const cx = BPAD.left + slot * i + slot / 2;
					const v = b.ratio ?? 0;
					const top = y(v);
					const h = BPAD.top + ih - top;
					const r = Math.min(4, h);
					const x0 = cx - bw / 2;
					return (
						<g
							key={b.label}
							onPointerEnter={() => setHover(i)}
							onPointerLeave={() => setHover(null)}
						>
							<rect
								x={cx - slot / 2}
								y={0}
								width={slot}
								height={BH}
								fill="transparent"
							/>
							{b.ratio !== null && (
								<path
									d={`M${x0},${top + h} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${top + h} Z`}
									style={{ fill: "var(--middle)" }}
									fillOpacity={hover === null || hover === i ? 1 : 0.55}
								/>
							)}
							<text
								x={cx}
								y={top - 6}
								textAnchor="middle"
								className="fill-[var(--fg)] text-[11px] font-semibold"
							>
								{pct(b.ratio)}
							</text>
							<text
								x={cx}
								y={BH - 18}
								textAnchor="middle"
								className="fill-[var(--fg2)] text-[10px]"
							>
								{b.label}
							</text>
							<text
								x={cx}
								y={BH - 5}
								textAnchor="middle"
								className="fill-[var(--muted)] text-[9px]"
							>
								n={b.slots.toLocaleString()}
							</text>
						</g>
					);
				})}
			</svg>
			{hover !== null && (
				<div
					className="pointer-events-none absolute top-0 rounded-md border border-[var(--line)] bg-[var(--tip-bg)] px-2 py-1 text-[11px] shadow-sm"
					style={{
						left: `${((BPAD.left + slot * hover + slot / 2) / W) * 100}%`,
						transform: "translateX(-50%)",
					}}
				>
					<div className="font-semibold">端點為基準的 {bins[hover].label}</div>
					<div className="text-[var(--fg2)]">
						中站上車 {Math.round(bins[hover].mid).toLocaleString()} ／ 基準{" "}
						{Math.round(bins[hover].midBase).toLocaleString()}
					</div>
					<div className="text-[var(--fg2)]">
						{bins[hover].slots.toLocaleString()} 個日期×時段
					</div>
				</div>
			)}
		</div>
	);
}
