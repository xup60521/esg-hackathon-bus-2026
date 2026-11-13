import { useMemo } from "react";
import type { BehaviorAnalysisSummary } from "#/features/lab/behavior";
import { orderedClusters, TicketTable, ticketLabel } from "./common";
import { aggregate, fmtInt, fmtPct, ratio } from "./explore";
import { TICKET_GROUPS, type TicketGroupId } from "./model";

const NAME_ORDER = [
	"學生、暨南大學、聯合科大等名稱",
	"敬老、愛心、博愛、陪伴、仁愛等名稱",
	"通勤、中彰投苗、境市民等字樣",
	"一般、全票、指定電子錢包名稱、優待票",
	"以上都不符合者歸 other（保留，不併入一般）",
];

export function TicketPanel({
	summary,
	onOpenGroup,
}: {
	summary: BehaviorAnalysisSummary;
	onOpenGroup: (clusterId: number, ticket: TicketGroupId) => void;
}) {
	const all = useMemo(() => aggregate(summary.allOdPairs), [summary]);
	const rows = useMemo(
		() =>
			orderedClusters(summary).map((c) => ({
				c,
				agg: aggregate(
					summary.allOdPairs.filter((o) => o.clusterId === c.clusterId),
				),
			})),
		[summary],
	);
	return (
		<div>
			<div className="rounded-lg border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-xs leading-relaxed text-[var(--fg2)]">
				<b className="text-[var(--fg)]">這是「票種名稱」分組，不是乘客身分。</b>
				依名稱優先序互斥分類（先符合者先歸類），不驗證人口或法定票種資格，也不能推論年齡、就學或通勤目的。
				<ol className="mt-1 list-decimal pl-5">
					{NAME_ORDER.map((t) => (
						<li key={t}>{t}</li>
					))}
				</ol>
			</div>

			<h3 className="mt-4 text-xs font-semibold">
				全部有效 OD 旅次（{fmtInt(all.trips)} 筆）
			</h3>
			<div className="mt-2 max-w-xl">
				<TicketTable
					summary={summary}
					counts={all.tickets}
					total={all.trips}
					scope="全部旅次"
				/>
			</div>

			<h3 className="mt-5 text-xs font-semibold">
				各人工規則組 × 票種名稱分組
			</h3>
			<p className="mt-0.5 text-[11px] text-[var(--muted)]">
				每格是「旅次數（占該規則組旅次的百分比）」，分母是該列的規則組旅次；每列五格合計
				100%。 票種比例是該組內的名稱組成，不是各票種佔全部旅次的比例。
			</p>
			<div className="mt-2 overflow-x-auto rounded-lg border border-[var(--line)]">
				<table className="w-full min-w-[820px] border-collapse text-xs tabular-nums">
					<caption className="sr-only">規則組與票種名稱分組交叉表</caption>
					<thead className="bg-[var(--chip)] text-left text-[var(--muted)]">
						<tr>
							<th scope="col" className="px-2 py-1.5 font-medium">
								規則組（旅次）
							</th>
							{TICKET_GROUPS.map((g) => (
								<th
									key={g}
									scope="col"
									className="px-2 py-1.5 text-right font-medium"
								>
									{ticketLabel(summary, g)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map(({ c, agg }) => (
							<tr key={c.clusterId} className="border-t border-[var(--line)]">
								<th scope="row" className="px-2 py-1.5 text-left font-normal">
									{c.label}
									<div className="text-[11px] text-[var(--muted)]">
										{fmtInt(agg.trips)} 筆
									</div>
								</th>
								{TICKET_GROUPS.map((g) => (
									<td key={g} className="px-2 py-1.5 text-right">
										<button
											type="button"
											className="underline decoration-[var(--axis)] underline-offset-2"
											title={`在 OD 探索篩出「${c.label}」並顯示${ticketLabel(summary, g)}占比欄`}
											onClick={() => onOpenGroup(c.clusterId, g)}
										>
											{fmtInt(agg.tickets[g])}
										</button>
										<div className="text-[11px] text-[var(--muted)]">
											{fmtPct(ratio(agg.tickets[g], agg.trips))}
										</div>
									</td>
								))}
							</tr>
						))}
						<tr className="border-t-2 border-[var(--line)] font-semibold">
							<th scope="row" className="px-2 py-1.5 text-left">
								全部
								<div className="text-[11px] font-normal text-[var(--muted)]">
									{fmtInt(all.trips)} 筆
								</div>
							</th>
							{TICKET_GROUPS.map((g) => (
								<td key={g} className="px-2 py-1.5 text-right">
									{fmtInt(all.tickets[g])}
									<div className="text-[11px] font-normal text-[var(--muted)]">
										{fmtPct(ratio(all.tickets[g], all.trips))}
									</div>
								</td>
							))}
						</tr>
					</tbody>
				</table>
			</div>
			<p className="mt-2 text-[11px] text-[var(--muted)]">
				點旅次數可跳到 OD 探索，篩出該規則組並顯示該票種占 OD
				的欄位；可點欄位標題依占比排序，但旅次很少的 OD
				占比容易極端，宜搭配旅次看。
			</p>
		</div>
	);
}
