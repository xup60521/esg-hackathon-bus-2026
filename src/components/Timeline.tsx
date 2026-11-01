import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";

import { SUBROUTE_LABELS, SUBROUTES } from "#/lib/palette";

export type DailySeries = {
	dates: string[];
	/** values[subroute][dayIndex] */
	values: Record<string, number[]>;
	totals: number[];
};

type Props = {
	series: DailySeries;
	selectedIndex: number;
	onSelect: (index: number) => void;
};

const H = 150;
const PAD = { top: 10, right: 12, bottom: 22, left: 44 };
const fmt = new Intl.NumberFormat("en-US");
const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function useWidth() {
	const ref = useRef<HTMLDivElement>(null);
	const [w, setW] = useState(800);
	useLayoutEffect(() => {
		if (!ref.current) return;
		const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
		ro.observe(ref.current);
		return () => ro.disconnect();
	}, []);
	return [ref, w] as const;
}

function Timeline({ series, selectedIndex, onSelect }: Props) {
	const [ref, width] = useWidth();
	const [hover, setHover] = useState<number | null>(null);
	const n = series.dates.length;
	const innerW = Math.max(width - PAD.left - PAD.right, 10);
	const innerH = H - PAD.top - PAD.bottom;

	const yMax = useMemo(() => {
		const m = Math.max(...series.totals, 1);
		const step = 10 ** Math.floor(Math.log10(m));
		return Math.ceil(m / step) * step;
	}, [series.totals]);

	const x = (i: number) => PAD.left + (i / Math.max(n - 1, 1)) * innerW;
	const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;

	// biome-ignore lint/correctness/useExhaustiveDependencies: x/y are derived from width & yMax
	const areas = useMemo(() => {
		const base = new Array(n).fill(0);
		return SUBROUTES.map((sub) => {
			const vals = series.values[sub] ?? new Array(n).fill(0);
			const lower = base.slice();
			const upper = base.map((b, i) => b + vals[i]);
			for (let i = 0; i < n; i++) base[i] = upper[i];
			let d = `M${x(0)},${y(upper[0])}`;
			for (let i = 1; i < n; i++) d += `L${x(i)},${y(upper[i])}`;
			for (let i = n - 1; i >= 0; i--) d += `L${x(i)},${y(lower[i])}`;
			return { sub, d: `${d}Z` };
		});
	}, [series, width, yMax]);

	const monthTicks = useMemo(
		() =>
			series.dates
				.map((d, i) => ({ d, i }))
				.filter(({ d }) => d.endsWith("-01")),
		[series.dates],
	);
	const yTicks = [0, yMax / 2, yMax];

	const indexFromEvent = (e: React.PointerEvent<SVGRectElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const fx = (e.clientX - rect.left) / rect.width;
		return Math.min(n - 1, Math.max(0, Math.round(fx * (n - 1))));
	};

	const hi = hover ?? null;
	const tipLeft =
		hi != null ? Math.min(Math.max(x(hi) - 90, 0), width - 200) : 0;

	return (
		<div ref={ref} className="relative w-full select-none">
			<svg
				width={width}
				height={H}
				role="img"
				aria-label="Daily trips by sub-route, 2024–2025"
			>
				{yTicks.map((t) => (
					<g key={t}>
						<line
							x1={PAD.left}
							x2={width - PAD.right}
							y1={y(t)}
							y2={y(t)}
							style={{ stroke: "var(--grid)" }}
						/>
						<text
							x={PAD.left - 8}
							y={y(t)}
							dy="0.32em"
							textAnchor="end"
							className="fill-[var(--muted)] text-[10px]"
						>
							{fmt.format(t)}
						</text>
					</g>
				))}
				{areas.map((a) => (
					<path
						key={a.sub}
						d={a.d}
						style={{
							fill: `var(--s-${a.sub})`,
							stroke: "var(--chart-surface)",
						}}
						fillOpacity={0.9}
						strokeWidth={0.6}
					/>
				))}
				{monthTicks.map(({ d, i }) => (
					<g key={d}>
						<line
							x1={x(i)}
							x2={x(i)}
							y1={PAD.top + innerH}
							y2={PAD.top + innerH + 4}
							style={{ stroke: "var(--axis)" }}
						/>
						{(width > 900 || Number(d.slice(5, 7)) % 3 === 1) && (
							<text
								x={x(i) + 2}
								y={H - 6}
								className="fill-[var(--muted)] text-[10px]"
							>
								{d.slice(5, 7) === "01"
									? d.slice(0, 4)
									: `${Number(d.slice(5, 7))}月`}
							</text>
						)}
					</g>
				))}
				{/* selected day */}
				<line
					x1={x(selectedIndex)}
					x2={x(selectedIndex)}
					y1={PAD.top - 4}
					y2={PAD.top + innerH}
					style={{ stroke: "var(--fg)" }}
					strokeWidth={2}
				/>
				<circle
					cx={x(selectedIndex)}
					cy={PAD.top - 4}
					r={4}
					style={{ fill: "var(--fg)" }}
				/>
				{hi != null && (
					<line
						x1={x(hi)}
						x2={x(hi)}
						y1={PAD.top}
						y2={PAD.top + innerH}
						style={{ stroke: "var(--muted)" }}
						strokeDasharray="3 3"
					/>
				)}
				<rect
					x={PAD.left}
					y={0}
					width={innerW}
					height={H}
					fill="transparent"
					style={{ cursor: "pointer" }}
					onPointerMove={(e) => setHover(indexFromEvent(e))}
					onPointerLeave={() => setHover(null)}
					onPointerDown={(e) => onSelect(indexFromEvent(e))}
				/>
			</svg>
			{hi != null && (
				<div
					className="pointer-events-none absolute bottom-[calc(100%+6px)] z-10 w-[200px] rounded-lg border border-[var(--line)] bg-[var(--tip-bg)] px-3 py-2 text-xs text-[var(--fg)] shadow-xl"
					style={{ left: tipLeft }}
				>
					<div className="mb-1 flex justify-between font-semibold">
						<span>
							{series.dates[hi]} (週
							{
								WEEKDAY[
									new Date(`${series.dates[hi]}T12:00:00+08:00`).getUTCDay()
								]
							}
							)
						</span>
						<span>{fmt.format(series.totals[hi])}</span>
					</div>
					{[...SUBROUTES].reverse().map((s) => (
						<div
							key={s}
							className="flex items-center justify-between text-[var(--fg2)]"
						>
							<span className="flex items-center gap-1.5">
								<span
									className="inline-block size-2 rounded-sm"
									style={{ background: `var(--s-${s})` }}
								/>
								{s}
							</span>
							<span className="tabular-nums text-[var(--fg)]">
								{fmt.format(series.values[s]?.[hi] ?? 0)}
							</span>
						</div>
					))}
					<div className="mt-1 text-[10px] text-[var(--muted)]">
						點擊以檢視當日動畫 · click to open day
					</div>
				</div>
			)}
			<div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pl-11 text-[11px] text-[var(--fg2)]">
				{SUBROUTES.map((s) => (
					<span key={s} className="flex items-center gap-1.5">
						<span
							className="inline-block size-2.5 rounded-sm"
							style={{ background: `var(--s-${s})` }}
						/>
						{SUBROUTE_LABELS[s]}
					</span>
				))}
			</div>
		</div>
	);
}

export default memo(Timeline);
