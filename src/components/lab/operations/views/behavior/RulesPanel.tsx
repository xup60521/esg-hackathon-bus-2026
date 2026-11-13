import { useMemo } from "react";
import { Chip } from "#/components/lab/shared";
import type { BehaviorAnalysisSummary } from "#/features/lab/behavior";
import { orderedClusters } from "./common";
import { aggregate, fmtInt, fmtMin, fmtPct, ratio } from "./explore";
import type { RULE_ORDER } from "./model";

/** Rule conditions as documented in docs/lab/behavior/report.zh-TW.md; thresholds are manual. */
const CONDITION: Record<(typeof RULE_ORDER)[number], string> = {
	abnormal_tap: "上車站與下車站相同（不論時長）",
	campus_student: "站名為暨南大學名稱站／崎下端點，或學生票名稱占比 ≥ 25%",
	tourism_intercity: "臺中端（臺中、高鐵臺中站）與日月潭／九族端點連接",
	regional_commute: "臺中端（臺中、高鐵臺中站）與埔里端點連接",
	local_shuttle: "有效平均時長不逾 50 分鐘，且旅次至少 1,000 筆",
	intermediate_minor: "以上皆不符合的其餘 OD",
};

export function RulesPanel({
	summary,
	onOpenGroup,
}: {
	summary: BehaviorAnalysisSummary;
	onOpenGroup: (clusterId: number) => void;
}) {
	const rows = useMemo(
		() =>
			orderedClusters(summary).map((c, i) => ({
				step: i + 1,
				c,
				agg: aggregate(
					summary.allOdPairs.filter((o) => o.clusterId === c.clusterId),
				),
			})),
		[summary],
	);
	const total = summary.validOdTripsCount;
	return (
		<div>
			<p className="text-xs leading-relaxed text-[var(--fg2)]">
				六條<b className="text-[var(--fg)]">人工、依序</b>規則：一組 OD 由上而下
				<b className="text-[var(--fg)]">只落入第一個符合的規則組</b>
				，所以各組旅次互斥、合計等於全部 OD 旅次（{fmtInt(total)}
				）。沒有訓練、沒有 ML 聚類；門檻是人工設定，未用外部標註驗證。週末與
				AM／PM 比率不參與分組。
			</p>
			<ol className="mt-3 grid gap-3">
				{rows.map(({ step, c, agg }) => (
					<li
						key={c.clusterId}
						className="rounded-lg border border-[var(--line)] p-3"
					>
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span className="inline-flex size-5 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--chip)] text-[11px] font-bold tabular-nums">
								{step}
							</span>
							<h3 className="text-sm font-semibold">{c.label}</h3>
							{step === 1 && (
								<Chip
									tone="--k-unverified"
									title="上下車站相同；原因未知，不能推測誤刷"
								>
									待查，原因未知
								</Chip>
							)}
						</div>
						<div className="mt-1 text-xs text-[var(--fg2)]">
							<b className="text-[var(--fg)]">條件：</b>
							{CONDITION[c.archetype]}
						</div>
						<div className="mt-0.5 text-[11px] text-[var(--muted)]">
							{c.description}
						</div>
						<dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs tabular-nums sm:grid-cols-3 lg:grid-cols-6">
							<Metric label="OD 組數" value={fmtInt(agg.odCount)} />
							<Metric
								label="旅次"
								value={fmtInt(agg.trips)}
								sub={`占全部 ${fmtPct(ratio(agg.trips, total))}`}
							/>
							<Metric
								label="平均單程時長"
								value={fmtMin(agg.avgDurationMin)}
								sub={`有效樣本 ${fmtInt(agg.durationSampleCount)}`}
							/>
							<Metric
								label="六日占比"
								value={fmtPct(ratio(agg.weekendTrips, agg.trips))}
								sub="非政府假日"
							/>
							<Metric
								label="AM 窗口占比"
								value={fmtPct(ratio(agg.amTrips, agg.trips))}
								sub="06–09 時"
							/>
							<Metric
								label="PM 窗口占比"
								value={fmtPct(ratio(agg.pmTrips, agg.trips))}
								sub="16–19 時"
							/>
						</dl>
						<div className="mt-2" aria-hidden="true">
							<div className="h-2 rounded-sm bg-[var(--grid)]">
								<div
									className="h-2 rounded-sm"
									style={{
										width: `${(ratio(agg.trips, total) ?? 0) * 100}%`,
										background: "var(--boarding)",
									}}
								/>
							</div>
						</div>
						<details className="mt-2 text-xs">
							<summary className="cursor-pointer text-[var(--fg2)]">
								{c.topOdPairs.length >= agg.odCount
									? `此組全部 ${agg.odCount} 組 OD`
									: `代表 OD（此組前 ${c.topOdPairs.length} 組，不是完整列表）`}
							</summary>
							<ul className="mt-1.5 grid gap-1 tabular-nums">
								{c.topOdPairs.map((p) => (
									<li key={`${p.boardStop}->${p.alightStop}`}>
										{p.boardStop} → {p.alightStop}：{fmtInt(p.trips)} 筆（占本組{" "}
										{fmtPct(ratio(p.trips, agg.trips))}），平均{" "}
										{fmtMin(p.avgDurationMin)}
									</li>
								))}
							</ul>
						</details>
						<div className="mt-2">
							<button
								type="button"
								className="btn"
								onClick={() => onOpenGroup(c.clusterId)}
							>
								在 OD 探索看此組全部 {agg.odCount} 組 OD
							</button>
						</div>
					</li>
				))}
			</ol>
		</div>
	);
}

function Metric({
	label,
	value,
	sub,
}: {
	label: string;
	value: string;
	sub?: string;
}) {
	return (
		<div>
			<dt className="text-[11px] text-[var(--muted)]">{label}</dt>
			<dd className="text-sm font-semibold">{value}</dd>
			{sub && <dd className="text-[11px] text-[var(--muted)]">{sub}</dd>}
		</div>
	);
}
