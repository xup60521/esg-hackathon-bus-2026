import { cloneElement, type ReactElement, useId } from "react";
import type {
	BehaviorAnalysisSummary,
	BehaviorCluster,
} from "#/features/lab/behavior";
import { fmtInt, fmtPct, ratio } from "./explore";
import { RULE_ORDER, TICKET_GROUPS, type TicketGroupId } from "./model";

export const CONTROL =
	"w-full rounded-lg border border-[var(--line)] bg-[var(--chip)] px-2.5 py-1.5 text-sm text-[var(--fg)]";

export function Labeled({
	label,
	children,
}: {
	label: string;
	children: ReactElement<{ id?: string }>;
}) {
	const id = useId();
	return (
		<div className="min-w-0">
			<label
				htmlFor={id}
				className="mb-1.5 block text-[11px] font-medium text-[var(--muted)]"
			>
				{label}
			</label>
			{cloneElement(children, { id })}
		</div>
	);
}

/** Rule groups in the documented rule order (first matching rule wins), not by clusterId. */
export function orderedClusters(s: BehaviorAnalysisSummary): BehaviorCluster[] {
	return [...s.clusters].sort(
		(a, b) => RULE_ORDER.indexOf(a.archetype) - RULE_ORDER.indexOf(b.archetype),
	);
}

export function ticketLabel(
	s: BehaviorAnalysisSummary,
	g: TicketGroupId,
): string {
	return s.ticketGroupOverview.find((t) => t.group === g)?.groupLabel ?? g;
}

/**
 * The five mutually exclusive ticket-name groups of one scope. `total` is that scope's trips, so
 * shares always sum to 100% — `other` is kept as its own row, never folded into 一般.
 */
export function TicketTable({
	summary,
	counts,
	total,
	scope,
}: {
	summary: BehaviorAnalysisSummary;
	counts: Record<TicketGroupId, number>;
	total: number;
	scope: string;
}) {
	return (
		<table className="w-full border-collapse text-xs tabular-nums">
			<caption className="sr-only">{scope}的票種名稱分組</caption>
			<thead className="text-left text-[var(--muted)]">
				<tr>
					<th scope="col" className="py-1 pr-2 font-medium">
						票種名稱分組
					</th>
					<th scope="col" className="px-2 py-1 text-right font-medium">
						旅次
					</th>
					<th scope="col" className="px-2 py-1 text-right font-medium">
						占{scope}
					</th>
					<th scope="col" className="w-1/3 py-1 pl-2 font-medium">
						<span className="sr-only">比例條</span>
					</th>
				</tr>
			</thead>
			<tbody>
				{TICKET_GROUPS.map((g) => {
					const r = ratio(counts[g], total);
					return (
						<tr key={g} className="border-t border-[var(--line)]">
							<th scope="row" className="py-1 pr-2 text-left font-normal">
								{ticketLabel(summary, g)}
							</th>
							<td className="px-2 py-1 text-right">{fmtInt(counts[g])}</td>
							<td className="px-2 py-1 text-right">{fmtPct(r)}</td>
							<td className="py-1 pl-2" aria-hidden="true">
								<div className="h-2 rounded-sm bg-[var(--grid)]">
									<div
										className="h-2 rounded-sm"
										style={{
											width: `${(r ?? 0) * 100}%`,
											background: "var(--boarding)",
										}}
									/>
								</div>
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

export function StatusBox({
	title,
	lines,
	onRetry,
}: {
	title: string;
	lines: string[];
	onRetry?: () => void;
}) {
	return (
		<div className="panel mt-4 p-4 text-sm" role={onRetry ? "alert" : "status"}>
			<div className="font-semibold">{title}</div>
			{lines.length > 0 && (
				<ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-[var(--fg2)]">
					{lines.map((l) => (
						<li key={l}>{l}</li>
					))}
				</ul>
			)}
			{onRetry && (
				<div className="mt-3 flex flex-wrap items-center gap-3">
					<button type="button" className="btn" onClick={onRetry}>
						重新載入
					</button>
					<span className="text-[11px] text-[var(--muted)]">
						此頁不會以其他資料代替，也不會在資料有誤時顯示部分數字。
					</span>
				</div>
			)}
		</div>
	);
}
