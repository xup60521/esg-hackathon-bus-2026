const W = 720;
const H = 220;
const L = 44;
const B = 22;
const T = 18;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * 24 hourly buckets as bars. A null value (no sample) is drawn as an explicit "無" mark, never a
 * zero-height bar. The peak bucket is outlined and labelled so it does not rely on colour alone.
 */
export function HourChart({
	values,
	peakHour,
	color,
	unit,
	what,
}: {
	values: (number | null)[];
	peakHour: number | null;
	/** CSS variable, e.g. "--boarding" */
	color: string;
	unit: string;
	what: string;
}) {
	const max = Math.max(1, ...values.map((v) => v ?? 0));
	const bw = (W - L) / 24;
	const y = (v: number) => H - B - (v / max) * (H - B - T);
	const label = `${what}，每小時桶（${unit}）：${values
		.map((v, h) => `${hh(h)} ${v === null ? "無" : nf.format(v)}`)
		.join(
			"、",
		)}${peakHour === null ? "；無尖峰（沒有正的量）" : `；最大為 ${hh(peakHour)} 桶`}`;
	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="w-full"
			role="img"
			aria-label={label}
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
				{nf.format(max)}
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
				const v = values[h];
				const x = L + h * bw;
				const isPeak = h === peakHour;
				return (
					<g key={h}>
						{v === null ? (
							<text
								x={x + bw / 2}
								y={H - B - 4}
								textAnchor="middle"
								className="fill-[var(--muted)] text-[9px]"
							>
								無
							</text>
						) : (
							<rect
								x={x + 2}
								y={y(v)}
								width={bw - 4}
								height={Math.max(H - B - y(v), v > 0 ? 1 : 0)}
								rx={2}
								style={{
									fill: `var(${color})`,
									stroke: isPeak ? "var(--fg)" : "none",
									strokeWidth: isPeak ? 2 : 0,
								}}
							/>
						)}
						{isPeak && v !== null && (
							<text
								x={x + bw / 2}
								y={y(v) - 4}
								textAnchor="middle"
								className="fill-[var(--fg)] text-[10px] font-bold"
							>
								最大
							</text>
						)}
						{h % 3 === 0 && (
							<text
								x={x + bw / 2}
								y={H - 6}
								textAnchor="middle"
								className="fill-[var(--muted)] text-[10px]"
							>
								{h}
							</text>
						)}
					</g>
				);
			})}
		</svg>
	);
}

export function HourTable({
	values,
	unit,
}: {
	values: (number | null)[];
	unit: string;
}) {
	return (
		<table className="w-full border-collapse text-xs tabular-nums">
			<caption className="sr-only">
				每小時桶數值（{unit}）；無＝沒有樣本
			</caption>
			<tbody>
				{[0, 12].map((start) => (
					<tr
						key={start}
						className="border-b border-[var(--line)] last:border-0"
					>
						{HOURS.slice(start, start + 12).map((h) => (
							<td key={h} className="px-1 py-1 text-right">
								<div className="text-[10px] text-[var(--muted)]">{h}</div>
								{values[h] === null ? "無" : nf.format(values[h] as number)}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}
