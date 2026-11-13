import { BadgeCheck, CircleSlash } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
	Chip,
	Field,
	FreshnessBanner,
	KindBadge,
	LimitationList,
	Provenance,
	Section,
	Segmented,
	type Source,
	SourceList,
	Stat,
} from "#/components/lab/shared";
import { verifySolution } from "#/features/lab/optimization/solver";
import {
	type Data,
	diffLimits,
	hhmm,
	isData,
	KIND_LABEL,
	labelOf,
	limitSummary,
	nf,
	REJECT_LABEL,
	type Result,
	SCENARIO_LABEL,
	seatsOf,
	sumObserved,
	sumPassengers,
	sumSupplied,
} from "./optimization/model";
import { Timeline, TimelineLegend } from "./optimization/Timeline";

const DATA_URL = "/data/lab/optimization/scenarios.json";
const REFERENCE_ID = "mixed-feasible";
const DEFAULT_ID = "mixed-feasible";

const SOURCES: Source[] = [
	{
		label:
			"本機 README.md、scripts/analysis/export-midstop.ts、public/data/midstop.json",
		accessed: "2026-11-04",
		evidence:
			"旅次與 ETL 邊界、站時聚合與方向推定；本研究另行重算事件數並與 24 個月檔逐鍵對帳，不只引用 README。",
	},
	{
		label:
			"本機 .agentflow/artifacts/A-007/feasibility.zh-TW.md（研究日期 2026-11-03）",
		accessed: "2026-11-04",
		evidence:
			"方向 2 需要車數、容量、周轉與最低服務約束，且缺少班表、空駛、車型與司機班段；本頁沿用此問題邊界。",
	},
	{
		label: "Google OR-Tools：Job shop 文件",
		url: "https://developers.google.com/optimization/scheduling/job_shop",
		accessed: "2026-11-04",
		evidence:
			"支持把每個車輛占用區間視為資源上不可重疊任務的建模方式。本案自行實作小規模精確枚舉，未安裝或執行 OR-Tools，也不作工時法規依據。",
	},
	{
		label: "南投客運 6670 官方頁",
		url: "https://ntbus.com.tw/hsr6.html",
		accessed: "2026-11-04",
		evidence:
			"直接開啟原站與 www 站均回 HTTP 502，未能查證頁面與班表，因此沒有擷取任何發車時間；現行頁面也不能證明 2025-03-02 的歷史班表。",
	},
];

const LIMITATIONS = [
	"候選班次與服務時刻（全程加班 6 班、中間站起駛 4 班，14:05 起每 5 分鐘）由研究者自行設定，不是官方發車時刻，也不是業者提案。",
	"「有限候選內最優」只表示在這份候選與假設下窮舉得到的最優；「此候選與限制下無解」不表示現實不可能改善。",
	"保留席位在不同目標間不重用，是保守配置；沒有 OD 與逐班資料，不宣稱全線區間容量最佳化。",
	"中間站起駛車在假設中成本較低、保留席位較多，因此在此模型中占優勢是設定的結果，不是發現。",
	"成本是假設比較單位，不是新臺幣；本頁不發布節省百分比，也不主張應加開幾班或營運已改善。",
	"沒有真實班表與剩餘座位資料，無法驗收為可執行班表。",
];

const NOT_MODELLED = [
	"真實班表（沒有取得任何發車或到站時刻）",
	"停靠時間與行車時間的變異",
	"車庫位置、空駛與跨車庫調度（假設回到同一共同車庫）",
	"司機勞動法令（休息、換班、交接）；12:00–18:00、占用上限 300 分鐘只是假設",
	"車型與無障礙車（一律假設容量 40）",
	"非票證乘客",
	"排隊順序、放棄候車與拒載（沒有資料，也不推算）",
];

type Load =
	| { kind: "loading" }
	| { kind: "error"; message: string }
	| { kind: "ready"; data: Data };

function useScenarios(): Load {
	const [state, setState] = useState<Load>({ kind: "loading" });
	useEffect(() => {
		const ctrl = new AbortController();
		fetch(DATA_URL, { signal: ctrl.signal })
			.then(async (res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const json: unknown = await res.json().catch(() => {
					throw new Error("JSON 解析失敗");
				});
				if (!isData(json)) throw new Error("資料格式不符預期");
				setState({ kind: "ready", data: json });
			})
			.catch((e: unknown) => {
				if (ctrl.signal.aborted) return;
				setState({
					kind: "error",
					message: e instanceof Error ? e.message : "未知錯誤",
				});
			});
		return () => ctrl.abort();
	}, []);
	return state;
}

export default function OptimizationView() {
	const load = useScenarios();
	return (
		<div>
			<header>
				<div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
					6670 研究實驗室 · 方向 2
				</div>
				<h1 className="mt-1 text-2xl font-bold">
					車輛與班次最佳化：假設情境求解
				</h1>
				<p className="mt-2 max-w-[80ch] text-sm leading-relaxed text-[var(--fg2)]">
					<b className="text-[var(--fg)]">假設情境，非營運班表。</b>
					在研究者自行設定的有限候選班次與假設限制下，窮舉所有組合，檢查車輛與司機配對、回庫占用、可用時段、預算與保留席位。
					以下 8
					組情境皆為預先計算，瀏覽器不重新求解。結果不是實際班表，不能推論當日應加開幾班，也不是營運改善或實際成本節省的證據。
				</p>
				<div className="mt-3 flex flex-wrap items-center gap-1.5">
					<KindBadge kind="scenario" />
					<KindBadge kind="history" />
					<Chip
						tone="--sev-review"
						title="所有供給、成本、候選與時間皆為研究者假設"
					>
						假設情境，非營運班表
					</Chip>
				</div>
			</header>
			{load.kind === "ready" ? (
				<Content data={load.data} />
			) : (
				<>
					<div className="mt-4">
						<StatusPanel load={load} />
					</div>
					<Footer />
				</>
			)}
		</div>
	);
}

function StatusPanel({ load }: { load: Exclude<Load, { kind: "ready" }> }) {
	if (load.kind === "loading")
		return (
			<output className="panel block p-4 text-sm text-[var(--fg2)]">
				載入預先計算的情境資料中……
			</output>
		);
	return (
		<div className="panel p-4 text-sm" role="alert">
			<div className="font-semibold">無法載入情境資料</div>
			<div className="mt-1 text-xs text-[var(--fg2)]">
				{DATA_URL}：{load.message}
				。此頁不會以其他資料代替，也不在瀏覽器內重新求解。
			</div>
		</div>
	);
}

function Content({ data }: { data: Data }) {
	const { results, inventory } = data;
	const [id, setId] = useState(
		results.some((r) => r.scenario.id === DEFAULT_ID)
			? DEFAULT_ID
			: (results[0]?.scenario.id ?? ""),
	);
	const selected = results.find((r) => r.scenario.id === id);
	const reference = results.find((r) => r.scenario.id === REFERENCE_ID);
	if (!selected) {
		return (
			<div className="mt-4">
				<StatusPanel load={{ kind: "error", message: "資料中沒有任何情境" }} />
			</div>
		);
	}
	const obs = inventory.selectedObservation;
	const first = results[0];
	const observed = first ? sumObserved(first) : obs.boardings;
	const assumed = first ? sumPassengers(first) : obs.boardings;

	return (
		<>
			<div className="mt-4">
				<FreshnessBanner
					dataThrough={inventory.lastDate}
					what="刷卡彙總"
					note="本頁只用歷史資料中的單一觀測做事後壓力測試；結果是假設情境的求解，不是即時資料，也不能當作即時營運判斷。"
				/>
			</div>

			<Section
				className="mt-4"
				title="先分清楚：觀測人次 與 情境乘客數"
				badges={
					<>
						<KindBadge kind="history" />
						<KindBadge kind="scenario" />
					</>
				}
			>
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="rounded-lg border border-[var(--line)] p-3">
						<div className="flex items-center gap-2 text-[11px] font-medium text-[var(--muted)]">
							觀測人次 <KindBadge kind="history" />
						</div>
						<div className="mt-1 text-2xl font-bold tabular-nums">
							{nf.format(observed)}
						</div>
						<p className="mt-1 text-xs leading-relaxed text-[var(--fg2)]">
							歷史成功刷卡量：{obs.date} {obs.subroute} 回程{obs.stop}{" "}
							{obs.hour} 時，事後壓力測試。 這是從 {nf.format(inventory.rows)}{" "}
							列彙總中依規則挑出的極端案例，已成功上車者，不等於完整需求。
						</p>
					</div>
					<div className="rounded-lg border border-[var(--line)] p-3">
						<div className="flex items-center gap-2 text-[11px] font-medium text-[var(--muted)]">
							情境乘客數 <KindBadge kind="scenario" />
						</div>
						<div className="mt-1 text-2xl font-bold tabular-nums">
							{nf.format(assumed)}
						</div>
						<p className="mt-1 text-xs leading-relaxed text-[var(--fg2)]">
							假設 {obs.hour}:00 已在站，目標是 {obs.hour}:59
							前取得保留席位；不是實測到站，也與刷卡分鐘無關，不估計真實候車。
						</p>
					</div>
				</div>
				<p className="mt-3 max-w-[80ch] text-xs leading-relaxed text-[var(--muted)]">
					基準供給 20
					席是假設，不是真實班表；下方「模型缺口」是假設供給不足的座位數，不是當日被拒載或沒搭上的人數。
				</p>
			</Section>

			<Section
				className="mt-4"
				title="情境瀏覽"
				subtitle="8 組預先計算的情境，每組只改變指定限制。切換後下方所有內容隨之更新。"
				badges={<KindBadge kind="scenario" />}
			>
				<Field label="選擇情境">
					<Segmented
						label="選擇情境"
						value={id}
						onChange={setId}
						options={results.map((r): [string, string] => [
							r.scenario.id,
							labelOf(r.scenario.id),
						])}
					/>
				</Field>
				<ScenarioSummary result={selected} reference={reference} />
			</Section>

			<Section
				className="mt-4"
				title="假設清單"
				subtitle={`情境 ${selected.scenario.id} 隨資料保留的完整假設，全部是研究者設定，不取自業者。`}
				badges={<KindBadge kind="scenario" />}
			>
				<LimitationList items={selected.scenario.assumptions} />
				<p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
					候選班次摘要：{limitSummary(selected.scenario).候選班次}；
					本情境限制：
					{Object.entries(limitSummary(selected.scenario))
						.filter(([k]) => k !== "候選班次")
						.map(([k, v]) => `${k} ${v}`)
						.join("；")}
					。
				</p>
			</Section>

			<Section
				className="mt-4"
				title="資源占用時間軸"
				subtitle="橫軸為時刻；每列是一組假設的「車輛＋司機」固定配對。方塊是該班完整占用區間（含定位、行駛、返庫與恢復），不是乘客搭乘時間，也不是實際班表。"
				badges={<KindBadge kind="scenario" />}
			>
				<Timeline scenario={selected.scenario} solution={selected.solution} />
				<TimelineLegend />
				{selected.solution.status === "optimal" ? (
					<TripTable result={selected} />
				) : (
					<p className="mt-3 text-xs leading-relaxed text-[var(--fg2)]">
						此情境在候選與限制下無解，沒有任何班次被指派，因此只畫出資源可用時段與目標時窗，沒有班次明細。
					</p>
				)}
			</Section>

			<Section
				className="mt-4"
				title="枚舉結果與淘汰統計"
				subtitle="求解器列舉候選班次的全部子集，並依固定順序檢查限制。"
				badges={<KindBadge kind="scenario" />}
			>
				<RejectedPanel result={selected} />
			</Section>

			<Sensitivity results={results} />

			<Section
				className="mt-4"
				title="8 組情境比較"
				subtitle="按列名稱可切換上方情境。成本單位為假設比較單位，不是新臺幣；各情境的資源與預算不同，不可由此表算出節省百分比。"
				badges={<KindBadge kind="scenario" />}
			>
				<ComparisonTable results={results} selectedId={id} onSelect={setId} />
			</Section>

			<Section
				className="mt-4"
				title="模型沒有處理的狀態"
				badges={<KindBadge kind="unverified" />}
			>
				<LimitationList items={NOT_MODELLED} />
			</Section>

			<Footer inventory={data.inventory} />
		</>
	);
}

function ResultChip({ result }: { result: Result }) {
	return result.solution.status === "optimal" ? (
		<Chip tone="--sev-info" icon={<BadgeCheck className="size-3" />}>
			有限候選內最優
		</Chip>
	) : (
		<Chip tone="--sev-review" icon={<CircleSlash className="size-3" />}>
			此候選與限制下無解
		</Chip>
	);
}

function ScenarioSummary({
	result,
	reference,
}: {
	result: Result;
	reference?: Result;
}) {
	const { scenario, solution, certificateErrors } = result;
	const ev = solution.evaluation;
	const supplied = sumSupplied(result);
	const verified = useMemo(() => {
		// verifySolution only re-evaluates selected trips; skip anything larger than the reviewed 10-candidate scale.
		if (solution.status !== "optimal" || scenario.candidates.length > 10)
			return null;
		try {
			return verifySolution(scenario, solution);
		} catch {
			return "failed" as const;
		}
	}, [scenario, solution]);
	const diff =
		reference && reference !== result
			? diffLimits(reference.scenario, scenario)
			: [];
	const none = "—";
	return (
		<div className="mt-4">
			<div className="flex flex-wrap items-center gap-2">
				<h3 className="text-base font-bold">
					{SCENARIO_LABEL[scenario.id] ?? scenario.id}
				</h3>
				<code className="text-[11px] text-[var(--muted)]">{scenario.id}</code>
				<ResultChip result={result} />
				{!scenario.requireFullCoverage && (
					<Chip
						tone="--sev-watch"
						title="允許保留席位低於情境乘客數，輸出模型缺口"
					>
						軟覆蓋模式
					</Chip>
				)}
			</div>
			<div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
				<Stat
					label="加班班數"
					value={ev ? nf.format(ev.extraTrips) : none}
					sub={`上限 ${nf.format(scenario.maxExtraTrips)} 班`}
				/>
				<Stat
					label="加班成本"
					value={ev ? nf.format(ev.extraCost) : none}
					sub={`假設比較單位，非 NT$；預算 ${nf.format(scenario.extraBudget)}`}
				/>
				<Stat
					label="保留席位 / 情境乘客數"
					value={
						supplied === null
							? none
							: `${nf.format(supplied)} / ${nf.format(sumPassengers(result))}`
					}
					sub="假設保留的席位，不是實測供給"
				/>
				<Stat
					label="模型缺口"
					value={ev ? nf.format(ev.shortfall) : "無可行解"}
					sub="假設供給不足的座位數，不是拒載或沒搭上的人數"
				/>
				<Stat
					label="枚舉子集數"
					value={nf.format(solution.searchedSubsets)}
					sub={`${scenario.candidates.length} 個候選 → 2^${scenario.candidates.length}`}
				/>
			</div>
			{solution.status === "optimal" && (
				<p className="mt-3 text-xs leading-relaxed text-[var(--fg2)]">
					{certificateErrors
						? `產製時獨立驗證器：${nf.format(certificateErrors.length)} 項錯誤。`
						: "產製時未儲存驗證結果。"}
					{verified === "failed"
						? "瀏覽器內重算驗證時發生例外，未顯示結果。"
						: verified &&
							`瀏覽器內獨立驗證器重算：${nf.format(verified.length)} 項錯誤。`}
					驗證器只查核可行證明（選取班次、座位、預算、資源時間），最優性來自窮舉。
				</p>
			)}
			<div className="mt-3 text-xs leading-relaxed text-[var(--fg2)]">
				{reference === result ? (
					<>本情境是其他情境對照的基準（改動的限制都以此情境為比較對象）。</>
				) : diff.length ? (
					<>
						<div className="font-semibold text-[var(--fg)]">
							與「{labelOf(REFERENCE_ID)}」情境相比，改動的限制
						</div>
						<ul className="mt-1 list-disc space-y-0.5 pl-5">
							{diff.map((d) => (
								<li key={d.key}>
									{d.key}：{d.from} → <b className="text-[var(--fg)]">{d.to}</b>
								</li>
							))}
						</ul>
					</>
				) : (
					<>與混合情境相比沒有可比較的限制差異。</>
				)}
			</div>
		</div>
	);
}

function TripTable({ result }: { result: Result }) {
	const { scenario, solution } = result;
	const byId = new Map(
		[...scenario.baseline, ...scenario.candidates].map((t) => [t.id, t]),
	);
	const rows = solution.assignments
		.flatMap((a) => {
			const trip = byId.get(a.tripId);
			return trip ? [{ trip, resourceId: a.resourceId }] : [];
		})
		.sort(
			(a, b) =>
				a.trip.startMinute - b.trip.startMinute ||
				a.trip.id.localeCompare(b.trip.id),
		);
	return (
		<div className="mt-3 overflow-x-auto">
			<table className="w-full text-left text-xs">
				<caption className="mb-1 text-left text-[11px] text-[var(--muted)]">
					班次明細（時間軸的文字版）
				</caption>
				<thead className="text-[var(--muted)]">
					<tr className="border-b border-[var(--line)]">
						<Th>班次</Th>
						<Th>類型</Th>
						<Th>資源</Th>
						<Th>完整占用區間</Th>
						<Th right>保留席位</Th>
						<Th>服務時刻</Th>
						<Th right>成本（假設單位）</Th>
					</tr>
				</thead>
				<tbody>
					{rows.map(({ trip, resourceId }) => (
						<tr
							key={trip.id}
							className="border-b border-[var(--line)] last:border-0"
						>
							<Td>{trip.id}</Td>
							<Td>{KIND_LABEL[trip.kind]}</Td>
							<Td>{resourceId}</Td>
							<Td>
								{hhmm(trip.startMinute)}–{hhmm(trip.endMinute)}
							</Td>
							<Td right>{nf.format(seatsOf(trip))}</Td>
							<Td>
								{trip.reservations.map((r) => hhmm(r.serviceMinute)).join("、")}
							</Td>
							<Td right>{nf.format(trip.cost)}</Td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function Th({
	children,
	right = false,
}: {
	children: ReactNode;
	right?: boolean;
}) {
	return (
		<th
			scope="col"
			className={`px-2 py-1.5 font-medium ${right ? "text-right" : ""}`}
		>
			{children}
		</th>
	);
}
function Td({
	children,
	right = false,
}: {
	children: ReactNode;
	right?: boolean;
}) {
	return (
		<td className={`px-2 py-1.5 tabular-nums ${right ? "text-right" : ""}`}>
			{children}
		</td>
	);
}

function RejectedPanel({ result }: { result: Result }) {
	const { solution } = result;
	const entries = Object.entries(solution.rejected).sort((a, b) => b[1] - a[1]);
	const rejectedTotal = entries.reduce((n, [, v]) => n + v, 0);
	const feasible = solution.searchedSubsets - rejectedTotal;
	return (
		<div>
			<p className="text-xs leading-relaxed text-[var(--fg2)]">
				共枚舉 <b>{nf.format(solution.searchedSubsets)}</b> 個子集，其中被淘汰{" "}
				<b>{nf.format(rejectedTotal)}</b> 個，通過全部限制{" "}
				<b>{nf.format(feasible)}</b> 個
				{solution.status === "infeasible" ? "（所以無解）" : ""}。
			</p>
			{entries.length > 0 && (
				<table className="mt-2 w-full max-w-[560px] text-left text-xs">
					<thead className="text-[var(--muted)]">
						<tr className="border-b border-[var(--line)]">
							<Th>首個未通過的檢查</Th>
							<Th right>被淘汰子集數</Th>
						</tr>
					</thead>
					<tbody>
						{entries.map(([k, v]) => (
							<tr
								key={k}
								className="border-b border-[var(--line)] last:border-0"
							>
								<Td>{REJECT_LABEL[k] ?? k}</Td>
								<Td right>{nf.format(v)}</Td>
							</tr>
						))}
					</tbody>
				</table>
			)}
			<p className="mt-2 max-w-[80ch] text-[11px] leading-relaxed text-[var(--muted)]">
				每個子集只算在依檢查順序（班數上限、預算、最低服務、保留席位、資源配對）第一個未通過的項目，
				所以這是「依順序歸類的淘汰數」，不是最小不可行原因集，也不代表某項限制單獨造成無解。
			</p>
		</div>
	);
}

function Sensitivity({ results }: { results: Result[] }) {
	const find = (id: string) => results.find((r) => r.scenario.id === id);
	const base = find("mixed-feasible");
	const low = find("midstop-seats30-infeasible");
	const expanded = find("midstop-seats30-expanded-feasible");
	if (!base || !low || !expanded) return null;
	const rows = [base, low, expanded].map((r) => {
		const s = limitSummary(r.scenario);
		return {
			id: r.scenario.id,
			seats: s.中間站候選每班保留席位,
			resources: s.資源組數,
			budget: s.加班預算,
			result: r,
		};
	});
	return (
		<Section
			className="mt-4"
			title="敏感度：中間站保留席位 40 → 30"
			subtitle="中間站起駛車每班保留席位從 40 降到 30，原本可行的混合情境立即無解；要再增加資源與預算才恢復可行。這顯示真實剩餘座位資料是最關鍵的缺少輸入。"
			badges={<KindBadge kind="scenario" />}
		>
			<div className="overflow-x-auto">
				<table className="w-full text-left text-xs">
					<thead className="text-[var(--muted)]">
						<tr className="border-b border-[var(--line)]">
							<Th>情境</Th>
							<Th>中間站每班保留席位</Th>
							<Th right>資源組數</Th>
							<Th>加班預算</Th>
							<Th>結果</Th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr
								key={r.id}
								className="border-b border-[var(--line)] last:border-0"
							>
								<Td>{labelOf(r.id)}</Td>
								<Td>{r.seats}</Td>
								<Td right>{r.resources}</Td>
								<Td>{r.budget}</Td>
								<Td>
									<ResultChip result={r.result} />
								</Td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
				座位數、預算與資源都是假設；這是模型對假設的敏感度，不是對真實營運的預測。
			</p>
		</Section>
	);
}

function ComparisonTable({
	results,
	selectedId,
	onSelect,
}: {
	results: Result[];
	selectedId: string;
	onSelect: (id: string) => void;
}) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[760px] text-left text-xs">
				<thead className="text-[var(--muted)]">
					<tr className="border-b border-[var(--line)]">
						<Th>情境</Th>
						<Th>結果</Th>
						<Th right>資源組數</Th>
						<Th right>預算</Th>
						<Th right>加班班數</Th>
						<Th right>加班成本</Th>
						<Th right>保留席位</Th>
						<Th right>模型缺口</Th>
						<Th right>枚舉子集</Th>
					</tr>
				</thead>
				<tbody>
					{results.map((r) => {
						const ev = r.solution.evaluation;
						const active = r.scenario.id === selectedId;
						return (
							<tr
								key={r.scenario.id}
								className="border-b border-[var(--line)] last:border-0"
								style={active ? { background: "var(--active-bg)" } : undefined}
							>
								<td className="px-2 py-1.5">
									<button
										type="button"
										className="text-left font-semibold underline decoration-[var(--axis)] underline-offset-2"
										aria-current={active ? "true" : undefined}
										onClick={() => onSelect(r.scenario.id)}
									>
										{labelOf(r.scenario.id)}
									</button>
								</td>
								<Td>
									<ResultChip result={r} />
								</Td>
								<Td right>{nf.format(r.scenario.resources.length)}</Td>
								<Td right>{nf.format(r.scenario.extraBudget)}</Td>
								<Td right>{ev ? nf.format(ev.extraTrips) : "—"}</Td>
								<Td right>{ev ? nf.format(ev.extraCost) : "—"}</Td>
								<Td right>{ev ? nf.format(sumSupplied(r) ?? 0) : "—"}</Td>
								<Td right>{ev ? nf.format(ev.shortfall) : "無可行解"}</Td>
								<Td right>{nf.format(r.solution.searchedSubsets)}</Td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

function Footer({ inventory }: { inventory?: Data["inventory"] }) {
	return (
		<>
			<Section
				className="mt-4"
				title="來源"
				badges={<KindBadge kind="official" />}
			>
				<SourceList sources={SOURCES} />
			</Section>
			<Section className="mt-4" title="限制">
				<LimitationList items={LIMITATIONS} />
			</Section>
			{inventory && (
				<Section className="mt-4" title="資料出處與重現">
					<Provenance
						source={`${inventory.source}（SHA-256 ${inventory.sha256}）`}
						dataThrough={inventory.lastDate}
						generatedAt={inventory.generatedAt}
						command="bun scripts/lab/optimization/build.ts"
					/>
				</Section>
			)}
		</>
	);
}
