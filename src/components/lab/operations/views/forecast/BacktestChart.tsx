import { useState } from "react";
import { fmt, fmt1, niceMax, weekday } from "./format";

/** One backtest day. Works for both the statistical rows and the ML rows (predictions may be absent). */
export type ChartRow = {
	date: string;
	actual: number | null;
	predictions: Partial<Record<string, number | null>>;
	commonSupport: boolean;
	trainingCutoffExclusive?: string;
};

const W = 960;
const H = 280;
const PAD = { top: 14, right: 16, bottom: 34, left: 48 };

function pathOf(
	vals: (number | null)[],
	x: (i: number) => number,
	y: (v: number) => number,
) {
	let d = "";
	let prev = false;
	vals.forEach((v, i) => {
		if (v === null) {
			prev = false;
			return;
		}
		d += `${prev ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
		// isolated point: zero-length segment renders as a dot with round caps
		if (!prev && vals[i + 1] == null) d += "h0.1";
		prev = true;
	});
	return d;
}

const signed = (v: number) => `${v > 0 ? "+" : ""}${fmt1.format(v)}`;

function Swatch({
	dash,
	width = 2,
	color,
}: {
	dash?: string;
	width?: number;
	color: string;
}) {
	return (
		<svg width="28" height="8" aria-hidden="true" className="shrink-0">
			<line
				x1="1"
				x2="27"
				y1="4"
				y2="4"
				strokeWidth={width}
				strokeDasharray={dash}
				strokeLinecap="round"
				style={{ stroke: color }}
			/>
		</svg>
	);
}

export function BacktestChart({
	rows,
	model,
	modelLabel,
	threshold,
	label,
}: {
	rows: ChartRow[];
	model: string;
	modelLabel: string;
	threshold: number | null;
	label: string;
}) {
	const [cursor, setCursor] = useState<number | null>(null);
	const n = rows.length;
	const actual = rows.map((r) => r.actual);
	const pred = rows.map((r) => r.predictions[model] ?? null);
	const values = [...actual, ...pred].filter((v): v is number => v !== null);
	const max = niceMax(Math.max(1, threshold ?? 0, ...values));
	const iw = W - PAD.left - PAD.right;
	const ih = H - PAD.top - PAD.bottom;
	const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * iw);
	const y = (v: number) => PAD.top + ih - (v / max) * ih;
	const ticks = [0, max / 2, max];
	const row = cursor === null ? null : rows[cursor];
	const rowPred = row ? (row.predictions[model] ?? null) : null;
	const missing = rows
		.map((r, i) => ({ r, i }))
		.filter(({ r }) => r.actual === null);

	const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const px = ((e.clientX - rect.left) / rect.width) * W;
		const i = Math.round(((px - PAD.left) / iw) * (n - 1));
		setCursor(Math.max(0, Math.min(n - 1, i)));
	};

	return (
		<div>
			<div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--fg2)]">
				<span className="inline-flex items-center gap-1.5">
					<Swatch color="var(--fg)" /> 實際（實線）
				</span>
				<span className="inline-flex items-center gap-1.5">
					<Swatch color="var(--boarding)" dash="5 3" /> 預測：{modelLabel}
					（虛線）
				</span>
				{threshold !== null && (
					<span className="inline-flex items-center gap-1.5">
						<Swatch color="var(--muted)" dash="1 4" width={2.5} /> 尖峰門檻{" "}
						{fmt.format(threshold)}（點線）
					</span>
				)}
				<span>× 當日無實際值（缺日，線段中斷）</span>
			</div>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="w-full touch-pan-y"
				role="img"
				aria-label={label}
				onPointerMove={onMove}
				onPointerLeave={() => setCursor(null)}
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
							{fmt.format(t)}
						</text>
					</g>
				))}
				{rows.map((r, i) =>
					r.date.endsWith("-01") ? (
						<g key={r.date}>
							<line
								x1={x(i)}
								x2={x(i)}
								y1={y(0)}
								y2={y(0) + 4}
								style={{ stroke: "var(--axis)" }}
							/>
							<text
								x={x(i)}
								y={H - 14}
								textAnchor="middle"
								className="fill-[var(--muted)] text-[10px]"
							>
								{Number(r.date.slice(5, 7))} 月
							</text>
						</g>
					) : null,
				)}
				{threshold !== null && (
					<g>
						<line
							x1={PAD.left}
							x2={W - PAD.right}
							y1={y(threshold)}
							y2={y(threshold)}
							strokeWidth={1.5}
							strokeDasharray="1 4"
							strokeLinecap="round"
							style={{ stroke: "var(--muted)" }}
						/>
						<text
							x={W - PAD.right - 2}
							y={y(threshold) - 4}
							textAnchor="end"
							className="fill-[var(--fg2)] text-[10px]"
						>
							尖峰門檻（訓練期 P90）{fmt.format(threshold)}
						</text>
					</g>
				)}
				{missing.map(({ r, i }) => (
					<text
						key={r.date}
						x={x(i)}
						y={y(0) - 3}
						textAnchor="middle"
						className="fill-[var(--fg)] text-[11px] font-bold"
					>
						×
					</text>
				))}
				<path
					d={pathOf(pred, x, y)}
					fill="none"
					strokeWidth={1.4}
					strokeDasharray="5 3"
					strokeLinecap="round"
					strokeLinejoin="round"
					style={{ stroke: "var(--boarding)" }}
				/>
				<path
					d={pathOf(actual, x, y)}
					fill="none"
					strokeWidth={1.4}
					strokeLinecap="round"
					strokeLinejoin="round"
					style={{ stroke: "var(--fg)" }}
				/>
				{cursor !== null && row && (
					<g>
						<line
							x1={x(cursor)}
							x2={x(cursor)}
							y1={PAD.top}
							y2={y(0)}
							style={{ stroke: "var(--axis)" }}
						/>
						{row.actual !== null && (
							<circle
								cx={x(cursor)}
								cy={y(row.actual)}
								r={3}
								style={{ fill: "var(--fg)" }}
							/>
						)}
						{rowPred !== null && (
							<circle
								cx={x(cursor)}
								cy={y(rowPred)}
								r={3}
								strokeWidth={1.5}
								style={{ fill: "var(--chip)", stroke: "var(--boarding)" }}
							/>
						)}
					</g>
				)}
			</svg>
			<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
				<label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
					選擇日期
					<input
						type="range"
						min={0}
						max={Math.max(0, n - 1)}
						value={cursor ?? 0}
						onChange={(e) => setCursor(Number(e.target.value))}
						className="w-48 accent-[var(--accent)]"
					/>
				</label>
				<p className="min-h-[1.25rem] text-xs tabular-nums text-[var(--fg2)]">
					{row ? (
						<>
							<b className="text-[var(--fg)]">
								{row.date}（{weekday(row.date)}）
							</b>
							　實際{" "}
							{row.actual === null ? "無（缺日）" : fmt.format(row.actual)}
							　預測{" "}
							{rowPred === null ? "無（歷史不足）" : fmt1.format(rowPred)}
							{row.actual !== null && rowPred !== null && (
								<>
									　誤差（預測−實際）
									{signed(rowPred - row.actual)}
									{rowPred < row.actual ? "（低估）" : "（高估或持平）"}
								</>
							)}
							　{row.commonSupport ? "計入共同比較" : "不計入共同比較"}
						</>
					) : (
						"移動游標或拖曳滑桿查看單日數值；完整數值見下方表格。"
					)}
				</p>
			</div>
		</div>
	);
}
