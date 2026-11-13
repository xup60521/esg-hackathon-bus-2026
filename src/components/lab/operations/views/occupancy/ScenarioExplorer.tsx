import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Field, Segmented } from "#/components/lab/shared";
import type { Scenario } from "./types";

const nf = new Intl.NumberFormat("en-US");
const nf2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const POLICY_LABEL: Record<string, string> = {
	"all-origins": "全起點分流",
	"middle-only": "中段起點分流",
};
const policyLabel = (p: string) => POLICY_LABEL[p] ?? p;

type SortKey =
	| "policy"
	| "capacity"
	| "extraVehicles"
	| "transferred"
	| "retained"
	| "beforePeak"
	| "afterPeak"
	| "afterPeakRatio";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
	{ key: "policy", label: "政策", numeric: false },
	{ key: "capacity", label: "容量（參數）", numeric: true },
	{ key: "extraVehicles", label: "額外車數上限", numeric: true },
	{ key: "transferred", label: "移轉旅次", numeric: true },
	{ key: "retained", label: "留在原車旅次", numeric: true },
	{ key: "beforePeak", label: "原峰值", numeric: true },
	{ key: "afterPeak", label: "搬移後原車峰值", numeric: true },
	{ key: "afterPeakRatio", label: "峰值 ÷ 參數容量", numeric: true },
];

function compare(a: Scenario, b: Scenario, key: SortKey): number {
	if (key === "policy") return a.policy.localeCompare(b.policy);
	return a[key] - b[key];
}

const ALL = "all";

function uniqueSorted(values: number[]): number[] {
	return [...new Set(values)].sort((a, b) => a - b);
}

function ScenarioBars({ rows }: { rows: Scenario[] }) {
	const W = 640;
	const ROW = 26;
	const LABEL_W = 190;
	const X0 = 196;
	const BAR_W = 260;
	const TOP = 4;
	const max = Math.max(...rows.flatMap((r) => [r.beforePeak, r.capacity]), 1);
	const x = (v: number) => X0 + (v / max) * BAR_W;
	const h = TOP + rows.length * ROW + 4;
	const aria = `原峰值與搬移後峰值對照，容量為參數：${rows
		.map(
			(r) =>
				`${policyLabel(r.policy)} 容量 ${r.capacity} 額外車上限 ${r.extraVehicles}，${r.beforePeak} 到 ${r.afterPeak}`,
		)
		.join("；")}`;
	return (
		<div>
			<div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--fg2)]">
				<span className="inline-flex items-center gap-1.5">
					<svg width="18" height="10" aria-hidden="true">
						<rect
							x="0.5"
							y="0.5"
							width="17"
							height="9"
							fill="none"
							style={{ stroke: "var(--muted)" }}
						/>
					</svg>
					外框：原候選峰值
				</span>
				<span className="inline-flex items-center gap-1.5">
					<svg width="18" height="10" aria-hidden="true">
						<rect width="18" height="10" style={{ fill: "var(--accent)" }} />
					</svg>
					實心：搬移後原車峰值
				</span>
				<span className="inline-flex items-center gap-1.5">
					<svg width="18" height="10" aria-hidden="true">
						<line
							x1="9"
							x2="9"
							y1="0"
							y2="10"
							strokeDasharray="2 2"
							strokeWidth="1.5"
							style={{ stroke: "var(--fg)" }}
						/>
					</svg>
					虛線：參數容量
				</span>
			</div>
			<svg
				viewBox={`0 0 ${W} ${h}`}
				className="w-full"
				role="img"
				aria-label={aria}
			>
				{rows.map((r, i) => {
					const y = TOP + i * ROW;
					return (
						<g key={`${r.policy}-${r.capacity}-${r.extraVehicles}`}>
							<text
								x={LABEL_W}
								y={y + 15}
								textAnchor="end"
								className="fill-[var(--fg2)] text-[10px]"
							>
								{policyLabel(r.policy)} · 容量 {r.capacity} · 車≤
								{r.extraVehicles}
							</text>
							<rect
								x={X0}
								y={y + 2}
								width={x(r.beforePeak) - X0}
								height={ROW - 6}
								fill="none"
								style={{ stroke: "var(--muted)" }}
							/>
							<rect
								x={X0}
								y={y + 6}
								width={x(r.afterPeak) - X0}
								height={ROW - 14}
								style={{ fill: "var(--accent)" }}
							/>
							<line
								x1={x(r.capacity)}
								x2={x(r.capacity)}
								y1={y}
								y2={y + ROW - 2}
								strokeDasharray="2 2"
								strokeWidth="1.5"
								style={{ stroke: "var(--fg)" }}
							/>
							<text
								x={X0 + BAR_W + 14}
								y={y + 15}
								className="fill-[var(--fg)] text-[10px] font-semibold"
							>
								{r.beforePeak} → {r.afterPeak}
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
}

export function ScenarioExplorer({ scenarios }: { scenarios: Scenario[] }) {
	const [policy, setPolicy] = useState<string>(ALL);
	const [capacity, setCapacity] = useState<string>(ALL);
	const [extra, setExtra] = useState<string>(ALL);
	const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

	const policies = useMemo(
		() => [...new Set(scenarios.map((s) => s.policy))],
		[scenarios],
	);
	const capacities = useMemo(
		() => uniqueSorted(scenarios.map((s) => s.capacity)),
		[scenarios],
	);
	const extras = useMemo(
		() => uniqueSorted(scenarios.map((s) => s.extraVehicles)),
		[scenarios],
	);

	const rows = useMemo(() => {
		const filtered = scenarios.filter(
			(s) =>
				(policy === ALL || s.policy === policy) &&
				(capacity === ALL || String(s.capacity) === capacity) &&
				(extra === ALL || String(s.extraVehicles) === extra),
		);
		if (!sort) return filtered;
		const sign = sort.dir === "asc" ? 1 : -1;
		return [...filtered].sort((a, b) => sign * compare(a, b, sort.key));
	}, [scenarios, policy, capacity, extra, sort]);

	const toggleSort = (key: SortKey) =>
		setSort((cur) =>
			cur?.key === key
				? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
				: { key, dir: "asc" },
		);

	return (
		<div className="grid gap-4">
			<div className="flex flex-wrap gap-x-6 gap-y-3">
				<Field label="政策">
					<Segmented<string>
						label="政策篩選"
						value={policy}
						onChange={setPolicy}
						options={[
							[ALL, "全部"],
							...policies.map((p): [string, string] => [p, policyLabel(p)]),
						]}
					/>
				</Field>
				<Field label="容量參數（非車隊規格）">
					<Segmented<string>
						label="容量篩選"
						value={capacity}
						onChange={setCapacity}
						options={[
							[ALL, "全部"],
							...capacities.map((c): [string, string] => [
								String(c),
								String(c),
							]),
						]}
					/>
				</Field>
				<Field label="額外車數上限">
					<Segmented<string>
						label="額外車數篩選"
						value={extra}
						onChange={setExtra}
						options={[
							[ALL, "全部"],
							...extras.map((c): [string, string] => [String(c), String(c)]),
						]}
					/>
				</Field>
			</div>

			{rows.length === 0 ? (
				<p className="text-xs text-[var(--muted)]">此篩選條件下沒有情境。</p>
			) : (
				<ScenarioBars rows={rows} />
			)}

			<div className="overflow-x-auto">
				<table className="w-full min-w-[720px] border-collapse text-xs tabular-nums">
					<caption className="pb-1.5 text-left text-[11px] text-[var(--muted)]">
						顯示 {rows.length} / {scenarios.length}{" "}
						個情境；點欄位標題排序。額外車數為「上限」，不代表實際動用。
					</caption>
					<thead>
						<tr className="border-b border-[var(--line)] text-[var(--muted)]">
							{COLUMNS.map((c) => {
								const active = sort?.key === c.key;
								const Icon = !active
									? ArrowUpDown
									: sort.dir === "asc"
										? ArrowUp
										: ArrowDown;
								return (
									<th
										key={c.key}
										scope="col"
										aria-sort={
											!active
												? "none"
												: sort.dir === "asc"
													? "ascending"
													: "descending"
										}
										className={`px-2 py-1.5 font-medium ${c.numeric ? "text-right" : "text-left"}`}
									>
										<button
											type="button"
											onClick={() => toggleSort(c.key)}
											className="inline-flex items-center gap-1 font-medium hover:text-[var(--fg)]"
										>
											{c.label}
											<Icon className="size-3" aria-hidden="true" />
										</button>
									</th>
								);
							})}
							<th scope="col" className="px-2 py-1.5 text-right font-medium">
								額外車峰值
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr
								key={`${r.policy}-${r.capacity}-${r.extraVehicles}`}
								className="border-b border-[var(--line)] last:border-0"
							>
								<td className="px-2 py-1.5 text-left">
									{policyLabel(r.policy)}
								</td>
								<td className="px-2 py-1.5 text-right">
									{nf.format(r.capacity)}
								</td>
								<td className="px-2 py-1.5 text-right">{r.extraVehicles}</td>
								<td className="px-2 py-1.5 text-right">
									{nf.format(r.transferred)}
								</td>
								<td className="px-2 py-1.5 text-right">
									{nf.format(r.retained)}
								</td>
								<td className="px-2 py-1.5 text-right">
									{nf.format(r.beforePeak)}
								</td>
								<td className="px-2 py-1.5 text-right font-semibold">
									{nf.format(r.afterPeak)}
								</td>
								<td className="px-2 py-1.5 text-right">
									{nf2.format(r.afterPeakRatio)}
								</td>
								<td className="px-2 py-1.5 text-right">
									{r.reliefPeaks.length === 0 ? "無" : r.reliefPeaks.join("、")}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="text-[11px] leading-relaxed text-[var(--muted)]">
				「峰值 ÷
				參數容量」是同步配對票證峰值與假設容量的情境算術比值，不是實測載客率；數值大於
				1
				只表示與該容量參數不相容，不能判定超載。表中沒有算出任何「改善百分比」。
			</p>
		</div>
	);
}
