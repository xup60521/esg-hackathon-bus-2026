import type { SensitivityRow } from "./types";

const nf = new Intl.NumberFormat("en-US");

type Metric = { key: keyof SensitivityRow; title: string };

const METRICS: Metric[] = [
	{ key: "candidates", title: "候選群組數" },
	{ key: "stationRegressionCandidates", title: "站序回退候選" },
	{ key: "crossGroupConflictCandidates", title: "跨群重疊候選" },
	{ key: "overFourHourCandidates", title: "跨度超過 4 小時" },
	{ key: "diagnosticEligibleCandidates", title: "無上述旗標候選" },
];

const W = 300;
const ROW = 22;
const LABEL_W = 44;
const BAR_W = 190;
const TOP = 4;

function MetricBars({
	rows,
	metric,
}: {
	rows: SensitivityRow[];
	metric: Metric;
}) {
	const values = rows.map((r) => Number(r[metric.key]));
	const max = Math.max(...values, 1);
	const h = TOP + rows.length * ROW + 2;
	const label = `${metric.title}，依合併間隔：${rows
		.map((r, i) => `${r.gapMinutes} 分鐘 ${nf.format(values[i])}`)
		.join("、")}`;
	return (
		<figure className="rounded-lg border border-[var(--line)] p-2">
			<figcaption className="mb-1 text-[11px] font-semibold text-[var(--fg2)]">
				{metric.title}
			</figcaption>
			<svg
				viewBox={`0 0 ${W} ${h}`}
				className="w-full"
				role="img"
				aria-label={label}
			>
				<line
					x1={LABEL_W}
					x2={LABEL_W}
					y1={TOP}
					y2={h - 2}
					style={{ stroke: "var(--axis)" }}
				/>
				{rows.map((r, i) => {
					const y = TOP + i * ROW;
					const w = (values[i] / max) * BAR_W;
					return (
						<g key={r.gapMinutes}>
							<text
								x={LABEL_W - 6}
								y={y + 14}
								textAnchor="end"
								className="fill-[var(--muted)] text-[10px]"
							>
								{r.gapMinutes} 分
							</text>
							<rect
								x={LABEL_W}
								y={y + 3}
								width={Math.max(w, values[i] > 0 ? 1.5 : 0)}
								height={ROW - 8}
								rx={2}
								style={{ fill: "var(--accent)" }}
							/>
							<text
								x={LABEL_W + w + 6}
								y={y + 14}
								className="fill-[var(--fg)] text-[10px] font-semibold"
							>
								{nf.format(values[i])}
							</text>
						</g>
					);
				})}
			</svg>
		</figure>
	);
}

/** Small multiples: every metric has its own scale, so bars are only comparable within a panel. */
export function GapChart({ rows }: { rows: SensitivityRow[] }) {
	return (
		<div>
			<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{METRICS.map((m) => (
					<MetricBars key={m.key} rows={rows} metric={m} />
				))}
			</div>
			<p className="mt-1.5 text-[11px] text-[var(--muted)]">
				縱軸為合併間隔（分鐘）；各小圖比例尺獨立，不可跨圖比長度。數值直接標於長條旁。
			</p>
		</div>
	);
}
