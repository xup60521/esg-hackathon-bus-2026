import {
	fmtInt,
	fmtPct,
	HOURS,
	hourLabel,
	inWindow,
	peakHours,
	ratio,
} from "./explore";

const W = 720;
const H = 200;
const L = 52;
const B = 24;
const T = 26;

/**
 * 24 hourly buckets of recorded trips. Bars inside the chosen analysis window are drawn in the
 * accent data colour AND sit under a labelled bracket, so the window never relies on colour alone.
 * The largest bucket is outlined and its value printed. Every value is also readable in the table
 * below the chart.
 */
export function HourBars({
	values,
	window: win,
	what,
}: {
	values: readonly number[];
	/** inclusive hour window to highlight, or null for none */
	window: { from: number; to: number } | null;
	what: string;
}) {
	const total = values.reduce((a, b) => a + b, 0);
	const max = Math.max(1, ...values);
	const peaks = peakHours(values);
	const bw = (W - L) / 24;
	const y = (v: number) => H - B - (v / max) * (H - B - T);
	const aria = `${what}，24 小時旅次：${HOURS.map((h) => `${hourLabel(h)} ${fmtInt(values[h] ?? 0)}`).join("、")}；${
		peaks.length === 0
			? "全部為 0，沒有最大桶"
			: `最大桶為 ${peaks.map(hourLabel).join("、")}`
	}`;
	const winHours = win
		? HOURS.filter((h) => inWindow(h, win.from, win.to))
		: [];
	return (
		<div>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="w-full"
				role="img"
				aria-label={aria}
			>
				<line
					x1={L}
					x2={W}
					y1={H - B}
					y2={H - B}
					style={{ stroke: "var(--axis)" }}
				/>
				<line x1={L} x2={W} y1={T} y2={T} style={{ stroke: "var(--grid)" }} />
				<text
					x={L - 6}
					y={T + 4}
					textAnchor="end"
					className="fill-[var(--muted)] text-[10px]"
				>
					{fmtInt(max === 1 && total === 0 ? 0 : max)}
				</text>
				<text
					x={L - 6}
					y={H - B + 4}
					textAnchor="end"
					className="fill-[var(--muted)] text-[10px]"
				>
					0
				</text>
				{HOURS.map((h) => {
					const v = values[h] ?? 0;
					const x = L + h * bw;
					const inside = win ? inWindow(h, win.from, win.to) : false;
					const isPeak = peaks.includes(h);
					return (
						<g key={h}>
							<rect
								x={x + 1.5}
								y={y(v)}
								width={bw - 3}
								height={H - B - y(v)}
								rx={1.5}
								style={{
									fill: inside ? "var(--boarding)" : "var(--middle)",
									opacity: win && !inside ? 0.55 : 1,
									stroke: isPeak ? "var(--fg)" : "none",
									strokeWidth: isPeak ? 1.5 : 0,
								}}
							/>
							{h % 3 === 0 && (
								<text
									x={x + bw / 2}
									y={H - B + 14}
									textAnchor="middle"
									className="fill-[var(--muted)] text-[10px]"
								>
									{String(h).padStart(2, "0")}
								</text>
							)}
						</g>
					);
				})}
				{peaks.length === 1 && (
					<text
						x={L + peaks[0] * bw + bw / 2}
						y={y(values[peaks[0]] ?? 0) - 4}
						textAnchor="middle"
						className="fill-[var(--fg)] text-[10px] font-semibold"
					>
						{fmtInt(values[peaks[0]] ?? 0)}
					</text>
				)}
				{winHours.length > 0 && win && (
					<g>
						{win.from <= win.to ? (
							<WindowBracket from={win.from} to={win.to} bw={bw} />
						) : (
							<>
								<WindowBracket from={win.from} to={23} bw={bw} />
								<WindowBracket from={0} to={win.to} bw={bw} />
							</>
						)}
					</g>
				)}
			</svg>
			<details className="mt-2 text-xs">
				<summary className="cursor-pointer text-[var(--fg2)]">
					用表格讀取 24 小時數值
				</summary>
				<div className="mt-2 max-h-72 overflow-auto rounded-lg border border-[var(--line)]">
					<table className="w-full border-collapse text-xs tabular-nums">
						<thead className="sticky top-0 bg-[var(--chip)] text-left text-[var(--muted)]">
							<tr>
								<th scope="col" className="px-2 py-1 font-medium">
									時段（上車小時）
								</th>
								<th scope="col" className="px-2 py-1 text-right font-medium">
									旅次
								</th>
								<th scope="col" className="px-2 py-1 text-right font-medium">
									占此範圍旅次
								</th>
							</tr>
						</thead>
						<tbody>
							{HOURS.map((h) => (
								<tr key={h} className="border-t border-[var(--line)]">
									<td className="px-2 py-1">
										{hourLabel(h)}–{String(h).padStart(2, "0")}:59
										{win && inWindow(h, win.from, win.to) ? "（窗口內）" : ""}
									</td>
									<td className="px-2 py-1 text-right">
										{fmtInt(values[h] ?? 0)}
									</td>
									<td className="px-2 py-1 text-right">
										{fmtPct(ratio(values[h] ?? 0, total))}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</details>
		</div>
	);
}

function WindowBracket({
	from,
	to,
	bw,
}: {
	from: number;
	to: number;
	bw: number;
}) {
	const x1 = L + from * bw + 1.5;
	const x2 = L + (to + 1) * bw - 1.5;
	return (
		<g>
			<path
				d={`M${x1} ${T - 6} V${T - 12} H${x2} V${T - 6}`}
				fill="none"
				style={{ stroke: "var(--boarding)", strokeWidth: 1.5 }}
			/>
			<text
				x={(x1 + x2) / 2}
				y={T - 15}
				textAnchor="middle"
				className="fill-[var(--fg2)] text-[10px]"
			>
				窗口 {String(from).padStart(2, "0")}–{String(to).padStart(2, "0")} 時
			</text>
		</g>
	);
}
