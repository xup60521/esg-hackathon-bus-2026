import { Fragment, useMemo, useState } from "react";
import { Chip, Segmented, Stat } from "#/components/lab/shared";
import type {
	BehaviorAnalysisSummary,
	OdPairStat,
} from "#/features/lab/behavior";
import {
	CONTROL,
	Labeled,
	orderedClusters,
	TicketTable,
	ticketLabel,
} from "./common";
import {
	aggregate,
	DEFAULT_FILTERS,
	type Filters,
	filterOds,
	fmtInt,
	fmtMin,
	fmtPct,
	isSameStop,
	MIN_SHARE_OPTIONS,
	ratio,
	type SameStopMode,
	type SortKey,
	sortOds,
	ticketShare,
} from "./explore";
import { HourBars } from "./HourBars";
import { TICKET_FIELD, TICKET_GROUPS, type TicketGroupId } from "./model";

const PAGE = 25;

export function OdExplorer({
	summary,
	filters,
	onChange,
}: {
	summary: BehaviorAnalysisSummary;
	filters: Filters;
	onChange: (patch: Partial<Filters>) => void;
}) {
	const [openId, setOpenId] = useState<string | null>(null);
	const clusters = useMemo(() => orderedClusters(summary), [summary]);
	const groupLabel = useMemo(
		() => new Map(clusters.map((c) => [c.clusterId, c.label])),
		[clusters],
	);
	const matched = useMemo(
		() => filterOds(summary.allOdPairs, filters),
		[summary, filters],
	);
	const rows = useMemo(() => sortOds(matched, filters), [matched, filters]);
	const agg = useMemo(() => aggregate(matched), [matched]);
	const all = summary.allOdPairs.length;
	const totalTrips = summary.validOdTripsCount;
	const isDefault =
		filters.group === "all" &&
		filters.query === "" &&
		filters.sameStop === "all" &&
		filters.ticket === "any" &&
		filters.minShare === 0;
	const tickets = [
		["any", "不限票種"],
		...TICKET_GROUPS.map((g) => [g, ticketLabel(summary, g)] as const),
	] as const;

	const sortBy = (key: SortKey) =>
		onChange(
			filters.sort === key
				? { desc: !filters.desc }
				: { sort: key, desc: key !== "name" },
		);

	return (
		<div>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Labeled label="人工規則組">
					<select
						className={CONTROL}
						value={filters.group === "all" ? "all" : String(filters.group)}
						onChange={(e) =>
							onChange({
								group:
									e.target.value === "all" ? "all" : Number(e.target.value),
							})
						}
					>
						<option value="all">全部規則組（{all} 組 OD）</option>
						{clusters.map((c) => (
							<option key={c.clusterId} value={c.clusterId}>
								{c.label}（{c.odPairCount} 組 OD）
							</option>
						))}
					</select>
				</Labeled>
				<Labeled label="站名（上車或下車站，台／臺視為同字）">
					<input
						type="search"
						className={CONTROL}
						value={filters.query}
						placeholder="例：埔里、日月潭"
						onChange={(e) => onChange({ query: e.target.value })}
					/>
				</Labeled>
				<Labeled label="票種名稱分組（占該 OD 自身旅次）">
					<select
						className={CONTROL}
						value={filters.ticket}
						onChange={(e) =>
							onChange({ ticket: e.target.value as TicketGroupId | "any" })
						}
					>
						{tickets.map(([v, text]) => (
							<option key={v} value={v}>
								{text}
							</option>
						))}
					</select>
				</Labeled>
				<Labeled label="該票種至少占">
					<select
						className={CONTROL}
						value={filters.minShare}
						disabled={filters.ticket === "any"}
						onChange={(e) => onChange({ minShare: Number(e.target.value) })}
					>
						{MIN_SHARE_OPTIONS.map((m) => (
							<option key={m} value={m}>
								{m === 0 ? "不設門檻" : `≥ ${m * 100}%`}
							</option>
						))}
					</select>
				</Labeled>
			</div>
			<div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
				<div>
					<div className="mb-1.5 text-[11px] font-medium text-[var(--muted)]">
						同站 OD（上下車站相同）
					</div>
					<Segmented<SameStopMode>
						label="同站 OD"
						value={filters.sameStop}
						onChange={(sameStop) => onChange({ sameStop })}
						options={[
							["all", "全部"],
							["exclude", "排除同站"],
							["only", "只看同站"],
						]}
					/>
				</div>
				<button
					type="button"
					className="btn"
					disabled={isDefault}
					onClick={() =>
						onChange({
							group: DEFAULT_FILTERS.group,
							query: DEFAULT_FILTERS.query,
							sameStop: DEFAULT_FILTERS.sameStop,
							ticket: DEFAULT_FILTERS.ticket,
							minShare: DEFAULT_FILTERS.minShare,
						})
					}
				>
					清除篩選
				</button>
			</div>

			<output className="mt-4 block text-xs leading-relaxed text-[var(--fg2)]">
				<b className="text-[var(--fg)]">
					符合 {fmtInt(matched.length)} / {fmtInt(all)} 組 OD
				</b>
				，旅次 {fmtInt(agg.trips)} / {fmtInt(totalTrips)}（占全部有效 OD 旅次{" "}
				{fmtPct(ratio(agg.trips, totalTrips))}）。下方「占 OD」欄的分母是該 OD
				自己的旅次（旅次很少的
				OD，比例容易極端）；上方彙總的分母是符合條件的旅次合計。
			</output>
			<div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
				<Stat
					label="符合條件的旅次"
					value={fmtInt(agg.trips)}
					sub={`${fmtInt(agg.odCount)} 組 OD`}
				/>
				<Stat
					label="平均單程時長"
					value={fmtMin(agg.avgDurationMin)}
					sub={
						agg.durationSampleCount === 0
							? "沒有有效樣本，不補 0"
							: `有效樣本 ${fmtInt(agg.durationSampleCount)} / ${fmtInt(agg.trips)} 筆`
					}
				/>
				<Stat
					label="週六、日占比"
					value={fmtPct(ratio(agg.weekendTrips, agg.trips))}
					sub="僅週六日，未套用政府假日"
				/>
				<Stat
					label="AM（06–09 時）／PM（16–19 時）窗口"
					value={`${fmtPct(ratio(agg.amTrips, agg.trips))}／${fmtPct(ratio(agg.pmTrips, agg.trips))}`}
					sub="預先指定窗口，非已驗證尖峰"
				/>
			</div>
			<details className="mt-2 text-xs">
				<summary className="cursor-pointer text-[var(--fg2)]">
					此篩選結果的票種名稱分組（五組合計＝符合旅次）
				</summary>
				<div className="mt-2 max-w-xl">
					<TicketTable
						summary={summary}
						counts={agg.tickets}
						total={agg.trips}
						scope="符合條件旅次"
					/>
				</div>
			</details>

			<ResultTable
				key={`${filters.group}|${filters.query}|${filters.sameStop}|${filters.ticket}|${filters.minShare}|${filters.sort}|${filters.desc}`}
				summary={summary}
				rows={rows}
				filters={filters}
				groupLabel={groupLabel}
				openId={openId}
				setOpenId={setOpenId}
				sortBy={sortBy}
			/>
		</div>
	);
}

function ResultTable({
	summary,
	rows,
	filters,
	groupLabel,
	openId,
	setOpenId,
	sortBy,
}: {
	summary: BehaviorAnalysisSummary;
	rows: OdPairStat[];
	filters: Filters;
	groupLabel: Map<number, string>;
	openId: string | null;
	setOpenId: (id: string | null) => void;
	sortBy: (k: SortKey) => void;
}) {
	const [limit, setLimit] = useState(PAGE);
	const shown = rows.slice(0, limit);
	const showTicket = filters.ticket !== "any";
	const cols = showTicket ? 9 : 8;
	const ariaSort = (k: SortKey) =>
		filters.sort === k ? (filters.desc ? "descending" : "ascending") : "none";

	if (rows.length === 0)
		return (
			<p className="mt-4 rounded-lg border border-[var(--line)] px-3 py-4 text-sm text-[var(--fg2)]">
				沒有符合條件的 OD。放寬篩選，或按「清除篩選」。
			</p>
		);

	return (
		<div className="mt-4">
			<div className="overflow-x-auto rounded-lg border border-[var(--line)]">
				<table className="w-full min-w-[860px] border-collapse text-xs tabular-nums">
					<caption className="sr-only">
						OD 列表，共 {rows.length} 組，目前顯示 {shown.length} 組
					</caption>
					<thead className="bg-[var(--chip)] text-left text-[var(--muted)]">
						<tr>
							<SortTh
								label="OD（上車站 → 下車站）"
								sortKey="name"
								aria={ariaSort("name")}
								onSort={sortBy}
								left
							/>
							<th scope="col" className="px-2 py-1.5 font-medium">
								人工規則組
							</th>
							<SortTh
								label="旅次"
								sortKey="trips"
								aria={ariaSort("trips")}
								onSort={sortBy}
							/>
							<th scope="col" className="px-2 py-1.5 text-right font-medium">
								占全部
							</th>
							<SortTh
								label="平均時長（有效樣本）"
								sortKey="avgDuration"
								aria={ariaSort("avgDuration")}
								onSort={sortBy}
							/>
							<SortTh
								label="六日占 OD"
								sortKey="weekendRatio"
								aria={ariaSort("weekendRatio")}
								onSort={sortBy}
							/>
							<SortTh
								label="AM 窗口占 OD"
								sortKey="amRatio"
								aria={ariaSort("amRatio")}
								onSort={sortBy}
							/>
							<SortTh
								label="PM 窗口占 OD"
								sortKey="pmRatio"
								aria={ariaSort("pmRatio")}
								onSort={sortBy}
							/>
							{showTicket && (
								<SortTh
									label={`${ticketLabel(summary, filters.ticket as TicketGroupId)}占 OD`}
									sortKey="ticketShare"
									aria={ariaSort("ticketShare")}
									onSort={sortBy}
								/>
							)}
						</tr>
					</thead>
					<tbody>
						{shown.map((o) => {
							const open = openId === o.id;
							return (
								<Fragment key={o.id}>
									<tr className="border-t border-[var(--line)] align-top">
										<td className="px-2 py-1.5">
											<button
												type="button"
												className="text-left font-semibold underline decoration-[var(--axis)] underline-offset-2"
												aria-expanded={open}
												aria-controls={`od-detail-${o.id}`}
												onClick={() => setOpenId(open ? null : o.id)}
											>
												{o.boardStop} → {o.alightStop}
											</button>
											{isSameStop(o) && (
												<span className="ml-1.5">
													<Chip
														tone="--k-unverified"
														title="上下車站相同；原因未知，不能推測誤刷或測試"
													>
														同站・待查
													</Chip>
												</span>
											)}
										</td>
										<td className="px-2 py-1.5">
											{groupLabel.get(o.clusterId) ?? "未知"}
										</td>
										<td className="px-2 py-1.5 text-right">
											{fmtInt(o.trips)}
										</td>
										<td className="px-2 py-1.5 text-right">
											{fmtPct(ratio(o.trips, summary.validOdTripsCount))}
										</td>
										<td className="px-2 py-1.5 text-right">
											{fmtMin(o.avgDurationMin)}
											<span className="text-[var(--muted)]">
												{" "}
												（{fmtInt(o.durationSampleCount)}）
											</span>
										</td>
										<td className="px-2 py-1.5 text-right">
											{fmtPct(ratio(o.weekendTrips, o.trips))}
										</td>
										<td className="px-2 py-1.5 text-right">
											{fmtPct(ratio(o.amPeakTrips, o.trips))}
										</td>
										<td className="px-2 py-1.5 text-right">
											{fmtPct(ratio(o.pmPeakTrips, o.trips))}
										</td>
										{showTicket && (
											<td className="px-2 py-1.5 text-right">
												{fmtPct(
													ticketShare(o, filters.ticket as TicketGroupId),
												)}
											</td>
										)}
									</tr>
									{open && (
										<tr
											id={`od-detail-${o.id}`}
											className="border-t border-[var(--line)] bg-[var(--chip)]"
										>
											<td colSpan={cols} className="px-3 py-3">
												<OdDetail
													summary={summary}
													od={o}
													group={groupLabel.get(o.clusterId) ?? "未知"}
												/>
											</td>
										</tr>
									)}
								</Fragment>
							);
						})}
					</tbody>
				</table>
			</div>
			<div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--fg2)]">
				<span>
					顯示 {fmtInt(shown.length)} / {fmtInt(rows.length)} 組 OD
				</span>
				{shown.length < rows.length && (
					<button
						type="button"
						className="btn"
						onClick={() => setLimit((n) => n + PAGE)}
					>
						再顯示 {Math.min(PAGE, rows.length - shown.length)} 組
					</button>
				)}
				{shown.length > PAGE && (
					<button type="button" className="btn" onClick={() => setLimit(PAGE)}>
						收合到前 {PAGE} 組
					</button>
				)}
			</div>
		</div>
	);
}

function SortTh({
	label,
	sortKey,
	aria,
	onSort,
	left,
}: {
	label: string;
	sortKey: SortKey;
	aria: "ascending" | "descending" | "none";
	onSort: (k: SortKey) => void;
	left?: boolean;
}) {
	return (
		<th
			scope="col"
			aria-sort={aria}
			className={`px-2 py-1.5 font-medium ${left ? "" : "text-right"}`}
		>
			<button
				type="button"
				className="font-medium hover:text-[var(--fg)]"
				onClick={() => onSort(sortKey)}
			>
				{label}
				{aria === "none" ? "" : aria === "descending" ? " ↓" : " ↑"}
			</button>
		</th>
	);
}

function OdDetail({
	summary,
	od,
	group,
}: {
	summary: BehaviorAnalysisSummary;
	od: OdPairStat;
	group: string;
}) {
	const counts = Object.fromEntries(
		TICKET_GROUPS.map((g) => [g, od[TICKET_FIELD[g]]]),
	) as Record<TicketGroupId, number>;
	const subs = Object.entries(od.subroutes).sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	);
	const unused = od.trips - od.durationSampleCount;
	return (
		<div className="grid gap-4 lg:grid-cols-2">
			<div className="min-w-0">
				<h3 className="text-xs font-semibold">
					{od.boardStop} → {od.alightStop}：上車小時分布
				</h3>
				<p className="mb-1 text-[11px] text-[var(--muted)]">
					此 OD 共 {fmtInt(od.trips)} 筆旅次，規則組：{group}。
				</p>
				<HourBars
					values={od.hourly}
					window={null}
					what={`${od.boardStop}到${od.alightStop}`}
				/>
			</div>
			<div className="min-w-0 space-y-3">
				<TicketTable
					summary={summary}
					counts={counts}
					total={od.trips}
					scope="此 OD 旅次"
				/>
				<div className="text-xs leading-relaxed text-[var(--fg2)]">
					<div>
						平均時長{" "}
						<b className="text-[var(--fg)]">{fmtMin(od.avgDurationMin)}</b>，
						{od.durationSampleCount === 0
							? "這個 OD 沒有符合 3 分至 6 小時窗口的有效樣本，所以平均未知（不是 0）。"
							: `由 ${fmtInt(od.durationSampleCount)} / ${fmtInt(od.trips)} 筆有效樣本算出。`}
						{unused > 0 &&
							` 另 ${fmtInt(unused)} 筆落在分析排除窗口（短於 3 分、超過 6 小時等，本頁未再細分），不代表誤刷。`}
					</div>
					{isSameStop(od) && (
						<div className="mt-1">
							上下車站相同；原因未知（未查票價或驗票機事件），不能推測誤刷、測試或解卡。
						</div>
					)}
					<div className="mt-1">
						週六日 {fmtInt(od.weekendTrips)} 筆、週一至五{" "}
						{fmtInt(od.weekdayTrips)} 筆（僅依星期，不是政府假日）。
					</div>
				</div>
				<div className="text-xs">
					<div className="mb-1 font-medium text-[var(--muted)]">
						紀錄的支線標示（旅次數）
					</div>
					<ul className="flex flex-wrap gap-1.5">
						{subs.map(([name, n]) => (
							<li
								key={name}
								className="rounded-md border border-[var(--line)] px-1.5 py-0.5 tabular-nums"
							>
								{name}：{fmtInt(n)}（{fmtPct(ratio(n, od.trips))}）
							</li>
						))}
					</ul>
				</div>
			</div>
		</div>
	);
}
