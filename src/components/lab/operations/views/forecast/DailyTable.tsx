import type { ChartRow } from "./BacktestChart";
import { fmt, fmt1, weekday } from "./format";

const signed = (v: number) => `${v > 0 ? "+" : ""}${fmt1.format(v)}`;

/** Day-by-day numbers so the chart is never hover-only. Missing values stay visible as 無, never 0. */
export function DailyTable({
	rows,
	model,
	others = [],
	showCutoff = false,
}: {
	rows: ChartRow[];
	/** key of the prediction that is charted; its error column is shown */
	model: string;
	/** extra prediction columns for comparison */
	others?: { key: string; label: string }[];
	showCutoff?: boolean;
}) {
	return (
		<details className="mt-3 text-xs">
			<summary className="cursor-pointer text-[var(--fg2)]">
				展開逐日數值表（{fmt.format(rows.length)} 日）
			</summary>
			<div className="mt-2 max-h-80 overflow-auto rounded-lg border border-[var(--line)]">
				<table className="w-full text-xs tabular-nums">
					<thead className="sticky top-0 bg-[var(--chip)] text-left text-[11px] text-[var(--muted)]">
						<tr>
							<th className="px-2 py-1 font-medium">日期</th>
							<th className="px-2 text-right font-medium">實際</th>
							<th className="px-2 text-right font-medium">預測</th>
							<th className="px-2 text-right font-medium">預測−實際</th>
							{others.map((o) => (
								<th key={o.key} className="px-2 text-right font-medium">
									{o.label}
								</th>
							))}
							<th className="px-2 font-medium">共同比較</th>
							{showCutoff && (
								<th className="px-2 font-medium">訓練截止（不含）</th>
							)}
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => {
							const p = r.predictions[model] ?? null;
							return (
								<tr key={r.date} className="border-t border-[var(--line)]">
									<td className="px-2 py-0.5">
										{r.date}（{weekday(r.date)}）
									</td>
									<td className="px-2 text-right">
										{r.actual === null ? "無（缺日）" : fmt.format(r.actual)}
									</td>
									<td className="px-2 text-right">
										{p === null ? "無" : fmt1.format(p)}
									</td>
									<td className="px-2 text-right">
										{r.actual === null || p === null
											? "–"
											: signed(p - r.actual)}
									</td>
									{others.map((o) => {
										const v = r.predictions[o.key] ?? null;
										return (
											<td key={o.key} className="px-2 text-right">
												{v === null ? "無" : fmt1.format(v)}
											</td>
										);
									})}
									<td className="px-2">{r.commonSupport ? "是" : "否"}</td>
									{showCutoff && (
										<td className="px-2">{r.trainingCutoffExclusive ?? "–"}</td>
									)}
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</details>
	);
}
