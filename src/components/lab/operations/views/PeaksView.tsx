import { useEffect, useState } from "react";
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
import type {
	Artifact,
	CalendarAuditDay,
	DayGroup,
	Direction,
	DirectionWithAll,
	HourlyOutput,
	HourlyProfile,
	PeakSummary,
	StationPeakProfile,
} from "#/features/lab/peaks/types";
import { HourChart, HourTable } from "./peaks/HourChart";

const BASE = "/data/lab/peaks";
const nf = new Intl.NumberFormat("en-US");
const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("en-US", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

/** null means "no sample / undefined ratio" — shown as 無, never as 0. */
const orNone = (v: number | null, f: (n: number) => string) =>
	v === null ? "無" : f(v);
const hourText = (h: number | null) =>
	h === null ? "無" : `${String(h).padStart(2, "0")}:00 桶`;
const pct1 = (n: number) => `${nf1.format(n * 100)}%`;
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const weekdayOf = (date: string) =>
	WEEK[new Date(`${date}T00:00:00Z`).getUTCDay()];

const DIR_LABEL: Record<DirectionWithAll, string> = {
	all: "全部方向",
	outbound: "去程",
	inbound: "回程",
	unknown: "方向不明",
};
const DAY_LABEL: Record<DayGroup, string> = {
	all: "全部日期",
	government_workday: "政府工作日",
	government_restday: "政府休息日",
};
const STATUS_LABEL: Record<HourlyProfile["sampleStatus"], string> = {
	no_records: "無任何紀錄",
	incomplete_coverage: "覆蓋不完整（有缺日）",
	observed_network_days: "與全網有紀錄日數一致",
};
const ROLE_LABEL: Record<StationPeakProfile["role"], string> = {
	transport_hub_candidate: "交通樞紐候選",
	campus_candidate: "校園候選",
	airport_candidate: "機場候選",
	unknown: "未分類",
};

type Data = {
	summary: PeakSummary;
	hourly: HourlyOutput;
	stations: StationPeakProfile[];
	audit: CalendarAuditDay[];
};

/** Schema v2 envelope check; a mismatch is an error, never silently accepted. */
async function load<T>(file: string, signal: AbortSignal): Promise<T> {
	const url = `${BASE}/${file}`;
	const res = await fetch(url, { signal });
	if (!res.ok) throw new Error(`HTTP ${res.status}（${url}）`);
	const json = (await res.json()) as Partial<Artifact<T>> | null;
	if (!json || json.schemaVersion !== 2 || json.data === undefined)
		throw new Error(`${file} 不是 schemaVersion 2 的資料`);
	return json.data;
}

type State =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; data: Data };

function useData(): State {
	const [state, setState] = useState<State>({ status: "loading" });
	useEffect(() => {
		const ctrl = new AbortController();
		const s = ctrl.signal;
		Promise.all([
			load<PeakSummary>("summary.json", s),
			load<HourlyOutput>("hourly-peaks.json", s),
			load<StationPeakProfile[]>("station-peaks.json", s),
			load<CalendarAuditDay[]>("calendar-audit.json", s),
		])
			.then(([summary, hourly, stations, audit]) =>
				setState({
					status: "ready",
					data: { summary, hourly, stations, audit },
				}),
			)
			.catch((e) => {
				if (s.aborted) return;
				setState({
					status: "error",
					message: e instanceof Error ? e.message : String(e),
				});
			});
		return () => ctrl.abort();
	}, []);
	return state;
}

export default function PeaksView() {
	const state = useData();
	return (
		<div>
			<header>
				<div className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
					6670 研究實驗室 · 方向 3
				</div>
				<h1 className="mt-1 text-2xl font-bold">尖峰與離峰運量</h1>
				<p className="mt-2 max-w-[80ch] text-sm leading-relaxed text-[var(--fg2)]">
					什麼時候、哪個方向最集中？政府休息日與工作日差多少？這裡只描述已成功刷卡的上下車聚合量，不是完整需求，也不解釋原因。
				</p>
				<div className="mt-3 flex flex-wrap items-center gap-1.5">
					<KindBadge kind="history" />
					<Chip tone="--k-unverified">日類型＝政府機關日曆，非班表營運日</Chip>
					<Chip tone="--k-unverified">缺日原因未知</Chip>
				</div>
			</header>
			{state.status === "loading" && (
				<div className="panel mt-4 p-4 text-sm" aria-live="polite">
					正在讀取 {BASE}/…
				</div>
			)}
			{state.status === "error" && (
				<div className="panel mt-4 p-4 text-sm" role="alert">
					<div className="font-semibold">無法顯示本方向資料</div>
					<div className="mt-1 text-xs text-[var(--fg2)]">{state.message}</div>
				</div>
			)}
			{state.status === "ready" && <Loaded d={state.data} />}
		</div>
	);
}

function Loaded({ d }: { d: Data }) {
	const { summary } = d;
	return (
		<>
			<div className="mt-4">
				<FreshnessBanner
					dataThrough={summary.dataSpan.endDate}
					what="資料窗口最後一天"
					note="歷史聚合，不是即時資料；「尖峰」只是已刷卡上下車量最大的小時桶，不是需求高峰或滿載。"
				/>
			</div>
			<div className="mt-4">
				<Overview s={summary} />
			</div>
			<div className="mt-4">
				<Explorer d={d} />
			</div>
			<div className="mt-4">
				<Comparison s={summary} />
			</div>
			<div className="mt-4">
				<Stations
					stations={d.stations}
					calendarDays={summary.dataSpan.totalCalendarDays}
				/>
			</div>
			<div className="mt-4">
				<MissingDays audit={d.audit} s={summary} />
			</div>
			<Section
				className="mt-4"
				title="來源"
				badges={<KindBadge kind="official" />}
			>
				<SourceList sources={sourcesOf(summary)} />
			</Section>
			<Section className="mt-4" title="限制">
				<LimitationList items={LIMITS} />
			</Section>
			<Section className="mt-4" title="資料出處與重現">
				<Provenance
					source="public/data/lab/peaks/{summary,hourly-peaks,station-peaks,calendar-audit}.json（schemaVersion 2；輸入為 public/data/midstop.json，已逐鍵核對 24 個月檔）"
					dataThrough={summary.dataSpan.endDate}
					generatedAt={summary.generatedAt}
					command="bun scripts/lab/peaks/analyze-peaks.ts && bun scripts/lab/peaks/verify-peaks.ts"
				/>
			</Section>
		</>
	);
}

function Overview({ s }: { s: PeakSummary }) {
	const b = s.directionBreakdown;
	const q = s.dataQuality;
	return (
		<Section
			title="全期間概況"
			subtitle={`${s.dataSpan.startDate} 至 ${s.dataSpan.endDate}；分析窗口為 00:00–23:59 的 24 個小時桶（不是官方營業時間），排除量 ${nf.format(s.overallMetrics.all.excludedVolume)}。`}
			badges={<KindBadge kind="history" />}
		>
			<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
				<Stat
					label="上車總量（成功刷卡）"
					value={nf.format(s.totalBoardings)}
					sub={`下車 ${nf.format(s.totalAlightings)}`}
				/>
				<Stat
					label="有紀錄日 / 日曆日"
					value={`${nf.format(s.dataSpan.observedDays)} / ${nf.format(s.dataSpan.totalCalendarDays)}`}
					sub={`${s.dataSpan.missingDays} 日沒有任何列，原因 ${q.missingCause === "unknown" ? "未知" : q.missingCause}`}
				/>
				<Stat
					label="全體最大上車小時桶"
					value={hourText(s.overallMetrics.all.peakHour)}
					sub={`${nf.format(s.overallMetrics.all.peakVolume)} 人次；尖峰÷基準 ${orNone(s.overallMetrics.all.peakToBaseRatio, nf2.format)}`}
				/>
				<Stat
					label="方向不明上車"
					value={nf.format(b.unknown.boardings)}
					sub={`占 ${orNone(b.unknown.share, pct1)}；不分攤到去程或回程`}
				/>
			</div>
			<div className="mt-3 grid gap-2 sm:grid-cols-3">
				{(["outbound", "inbound", "unknown"] as Direction[]).map((k) => (
					<Stat
						key={k}
						label={`${DIR_LABEL[k]}上車`}
						value={nf.format(b[k].boardings)}
						sub={`占全部 ${orNone(b[k].share, pct1)}`}
					/>
				))}
			</div>
			<p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
				基準量＝全期間量 ÷ 24 個小時桶，不是每日或每班的量；CR3／CR4 是量最大的
				3／4 個小時桶占比，Gini 衡量小時間集中程度。比例與 Gini
				在分母為零時為「無」。資料列與逐鍵核對：
				{nf.format(q.reconciliation.keys)} 鍵、{q.reconciliation.months}{" "}
				個月完全一致（只證明本地兩份聚合相符，不證明原始旅次完整）。
			</p>
		</Section>
	);
}

type Scope = "network" | string;

function pickProfile(
	h: HourlyOutput,
	scope: Scope,
	dir: DirectionWithAll,
	day: DayGroup,
): HourlyProfile | null {
	if (scope === "network") return h.dimensions[dir]?.[day] ?? null;
	const sub = h.subroutes[scope];
	if (!sub) return null;
	return dir === "all" ? sub : (sub.directions[dir] ?? null);
}

function argmax(values: (number | null)[]): number | null {
	let best: number | null = null;
	let bv = 0;
	values.forEach((v, h) => {
		if (v !== null && v > bv) {
			bv = v;
			best = h;
		}
	});
	return best;
}

function Explorer({ d }: { d: Data }) {
	const [scope, setScope] = useState<Scope>("network");
	const [dir, setDir] = useState<DirectionWithAll>("all");
	const [day, setDay] = useState<DayGroup>("all");
	const [metric, setMetric] = useState<"boardings" | "alightings">("boardings");
	const [mode, setMode] = useState<"avg" | "total">("avg");
	const subroutes = Object.keys(d.hourly.subroutes).sort();
	const isSub = scope !== "network";
	const p = pickProfile(d.hourly, scope, dir, isSub ? "all" : day);
	const none = !p || p.sampleStatus === "no_records";
	const values: (number | null)[] = !p
		? []
		: mode === "avg"
			? metric === "boardings"
				? p.avgObservedDayHourlyBoardings
				: p.avgObservedDayHourlyAlightings
			: metric === "boardings"
				? p.hourlyBoardings
				: p.hourlyAlightings;
	const m = p?.peakMetrics;
	const unit = mode === "avg" ? "人次／有紀錄日" : "人次（期間總量）";
	const what = `${isSub ? `支線 ${scope}` : "全網"}・${DIR_LABEL[dir]}・${isSub ? "全部日期" : DAY_LABEL[day]}・${metric === "boardings" ? "上車" : "下車"}`;
	return (
		<Section
			title="選擇範圍：時段分布"
			subtitle="日類型取自行政院人事行政總處辦公日曆（休息日含週休、國定假日、補假；工作日含補班日），是分析代理，不是 6670 班表。支線資料沒有按日類型切分。"
			badges={<KindBadge kind="history" />}
		>
			<div className="grid gap-3 md:grid-cols-2">
				<Field label="範圍">
					<select
						className="btn w-full"
						value={scope}
						onChange={(e) => setScope(e.target.value)}
						aria-label="範圍"
					>
						<option value="network">全網</option>
						{subroutes.map((s) => (
							<option key={s} value={s}>
								支線 {s}
							</option>
						))}
					</select>
				</Field>
				<Field label="方向">
					<Segmented<DirectionWithAll>
						label="方向"
						value={dir}
						onChange={setDir}
						options={(["all", "outbound", "inbound", "unknown"] as const).map(
							(k) => [k, DIR_LABEL[k]],
						)}
					/>
				</Field>
				<Field
					label={isSub ? "日類型（支線不分日類型）" : "日類型（政府日曆）"}
				>
					<div className={isSub ? "pointer-events-none opacity-50" : ""}>
						<Segmented<DayGroup>
							label="日類型"
							value={isSub ? "all" : day}
							onChange={setDay}
							options={(
								["all", "government_workday", "government_restday"] as const
							).map((k) => [k, DAY_LABEL[k]])}
						/>
					</div>
				</Field>
				<Field label="數值">
					<div className="flex flex-wrap gap-2">
						<Segmented
							label="上下車"
							value={metric}
							onChange={setMetric}
							options={[
								["boardings", "上車"],
								["alightings", "下車"],
							]}
						/>
						<Segmented
							label="統計方式"
							value={mode}
							onChange={setMode}
							options={[
								["avg", "有紀錄日均"],
								["total", "期間總量"],
							]}
						/>
					</div>
				</Field>
			</div>

			{!p || none ? (
				<div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--chip)] p-3 text-sm">
					<b>此選擇沒有任何紀錄。</b>
					<span className="text-[var(--fg2)]">
						沒有列不等於零需求或停駛；缺方向、缺支線的日期不補零。
					</span>
				</div>
			) : (
				<>
					<div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
						<Stat
							label="期間上車總量"
							value={nf.format(p.totalBoardings)}
							sub={`下車 ${nf.format(p.totalAlightings)}`}
						/>
						<Stat
							label="有紀錄日 / 日曆日"
							value={`${nf.format(p.observedDays)} / ${nf.format(p.calendarDays)}`}
							sub={`全網有列 ${nf.format(p.networkObservedDays)} 日；此組缺 ${nf.format(p.missingGroupDays)} 日（${STATUS_LABEL[p.sampleStatus]}）`}
						/>
						<Stat
							label="最大上車小時桶"
							value={hourText(m?.peakHour ?? null)}
							sub={`${nf.format(m?.peakVolume ?? 0)} 人次；AM ${hourText(m?.amPeakHour ?? null)}、PM ${hourText(m?.pmPeakHour ?? null)}`}
						/>
						<Stat
							label="尖峰÷基準／CR3／Gini"
							value={orNone(m?.peakToBaseRatio ?? null, nf2.format)}
							sub={`CR3 ${orNone(m?.cr3 ?? null, nf2.format)}・CR4 ${orNone(m?.cr4 ?? null, nf2.format)}・Gini ${orNone(m?.gini ?? null, nf2.format)}`}
						/>
					</div>
					<div className="mt-4 rounded-lg border border-[var(--line)] p-2">
						<div className="px-1 text-[11px] font-semibold text-[var(--fg2)]">
							{what}（{unit}）
						</div>
						<HourChart
							values={values}
							peakHour={argmax(values)}
							color={metric === "boardings" ? "--boarding" : "--alighting"}
							unit={unit}
							what={what}
						/>
						<details className="mt-1 text-xs">
							<summary className="cursor-pointer text-[var(--muted)]">
								以表格讀取 24 個小時桶
							</summary>
							<div className="mt-1 overflow-x-auto">
								<HourTable values={values} unit={unit} />
							</div>
						</details>
					</div>
					<p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
						{mode === "avg"
							? `有紀錄日均＝總量 ÷ 此組有紀錄的 ${nf.format(p.observedDays)} 日，只是條件平均，不是服務日均量；缺日不進分母、不補零。`
							: "期間總量＝此組所有有紀錄日的合計。"}{" "}
						指標（最大小時桶、比值、CR、Gini）一律以上車量、全期間總量計算；圖中標「最大」的是目前顯示數列的最大桶，兩者在「有紀錄日均」時可能不同。
						{dir === "unknown" &&
							" 方向不明的量很小且只在部分日期出現，不能解讀為任一方向。"}
					</p>
				</>
			)}
		</Section>
	);
}

function Comparison({ s }: { s: PeakSummary }) {
	const c = s.comparisonSamples;
	const rows: [string, string][] = [
		["workday", "政府工作日"],
		["restday", "政府休息日"],
		["monThu", "週一至週四（含政府休息日）"],
		["friday", "週五（含政府休息日）"],
	];
	return (
		<Section
			title="休息日與工作日、週五與週一至四"
			subtitle="比的是『有紀錄日』的條件日均，樣本日數不同，沒有控制季節與假日。"
			badges={<KindBadge kind="history" />}
		>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[420px] border-collapse text-xs tabular-nums">
					<thead>
						<tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
							<th className="py-1.5 pr-3 font-medium">分組</th>
							<th className="px-2 text-right font-medium">有紀錄日數</th>
							<th className="px-2 text-right font-medium">上車總量</th>
							<th className="pl-2 text-right font-medium">有紀錄日均</th>
						</tr>
					</thead>
					<tbody>
						{rows.map(([k, label]) => (
							<tr
								key={k}
								className="border-b border-[var(--line)] last:border-0"
							>
								<th className="py-1.5 pr-3 text-left font-medium">{label}</th>
								<td className="px-2 text-right">
									{nf.format(c[k]?.observedDays ?? 0)}
								</td>
								<td className="px-2 text-right">
									{nf.format(c[k]?.totalBoardings ?? 0)}
								</td>
								<td className="pl-2 text-right">
									{orNone(c[k]?.mean ?? null, nf1.format)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className="mt-3 grid gap-2 sm:grid-cols-2">
				<Stat
					label="休息日 ÷ 工作日（有紀錄日均）"
					value={orNone(
						s.overallMetrics.restVsWorkdayObservedMeanRatio,
						nf2.format,
					)}
				/>
				<Stat
					label="週五 ÷ 週一至四（有紀錄日均）"
					value={orNone(
						s.overallMetrics.fridayVsMonThuObservedMeanRatio,
						nf2.format,
					)}
					sub="描述性比值；不提供週五變化或旅次目的的原因解釋"
				/>
			</div>
		</Section>
	);
}

function Stations({
	stations,
	calendarDays,
}: {
	stations: StationPeakProfile[];
	calendarDays: number;
}) {
	const [dir, setDir] = useState<DirectionWithAll>("all");
	const rows = [...stations].sort((a, b) => a.order - b.order);
	return (
		<Section
			title="站點上車時段"
			subtitle="站角色是分析者的候選分類，不是官方站點功能，也不代表在所有支線中的位置。站點沒有按日類型切分。方向不對稱比只用去程＋回程為分母，不含方向不明，須搭配「方向不明」一併看。"
			badges={<KindBadge kind="history" />}
		>
			<Field label="方向">
				<Segmented<DirectionWithAll>
					label="站點方向"
					value={dir}
					onChange={setDir}
					options={(["all", "outbound", "inbound", "unknown"] as const).map(
						(k) => [k, DIR_LABEL[k]],
					)}
				/>
			</Field>
			<div className="mt-3 overflow-x-auto">
				<table className="w-full min-w-[720px] border-collapse text-xs tabular-nums">
					<thead>
						<tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
							<th className="py-1.5 pr-2 font-medium">站</th>
							<th className="px-2 font-medium">角色（候選）</th>
							<th className="px-2 text-right font-medium">上車總量</th>
							<th className="px-2 text-right font-medium">
								有紀錄日／{calendarDays}
							</th>
							<th className="px-2 text-right font-medium">最大上車桶</th>
							<th className="px-2 text-right font-medium">尖峰÷基準</th>
							<th className="pl-2 font-medium">主要方向（排除不明）</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((s) => {
							const p: HourlyProfile = dir === "all" ? s : s.directions[dir];
							const empty = p.sampleStatus === "no_records";
							return (
								<tr
									key={s.stop}
									className="border-b border-[var(--line)] last:border-0"
								>
									<th className="py-1.5 pr-2 text-left font-medium">
										{s.order}. {s.stop}
									</th>
									<td className="px-2">{ROLE_LABEL[s.role]}</td>
									<td className="px-2 text-right">
										{empty ? "無紀錄" : nf.format(p.totalBoardings)}
									</td>
									<td className="px-2 text-right">
										{nf.format(p.observedDays)}
									</td>
									<td className="px-2 text-right">
										{empty ? "無" : hourText(p.peakMetrics.peakHour)}
									</td>
									<td className="px-2 text-right">
										{empty
											? "無"
											: orNone(p.peakMetrics.peakToBaseRatio, nf2.format)}
									</td>
									<td className="pl-2">
										{s.dominantDirection === null
											? "無"
											: s.dominantDirection === "balanced"
												? "接近均衡"
												: `${DIR_LABEL[s.dominantDirection]} ${orNone(s.directionalAsymmetryRatio, pct1)}`}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</Section>
	);
}

function MissingDays({
	audit,
	s,
}: {
	audit: CalendarAuditDay[];
	s: PeakSummary;
}) {
	const missing = audit.filter((a) => a.status !== "observed");
	return (
		<Section
			title="缺日（日曆有、聚合資料沒有）"
			subtitle={`${s.dataSpan.totalCalendarDays} 個日曆日中 ${missing.length} 日完全沒有列。沒有業者停駛或班表證據，原因為「未知」，不能當作零需求、停駛或颱風。`}
			badges={<Chip tone="--k-unverified">原因未知</Chip>}
		>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[480px] border-collapse text-xs">
					<thead>
						<tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
							<th className="py-1.5 pr-3 font-medium">日期</th>
							<th className="px-2 font-medium">政府日曆</th>
							<th className="px-2 text-right font-medium">上車／下車</th>
							<th className="pl-2 font-medium">原因</th>
						</tr>
					</thead>
					<tbody>
						{missing.map((a) => (
							<tr
								key={a.date}
								className="border-b border-[var(--line)] last:border-0"
							>
								<th className="py-1.5 pr-3 text-left font-medium tabular-nums">
									{a.date}（{weekdayOf(a.date)}）
								</th>
								<td className="px-2">
									{a.governmentRest ? "政府休息日" : "政府工作日"}
									{a.calendarNote ? `・${a.calendarNote}` : ""}
								</td>
								<td className="px-2 text-right">
									{a.boardings === null ? "無" : nf.format(a.boardings)} /{" "}
									{a.alightings === null ? "無" : nf.format(a.alightings)}
								</td>
								<td className="pl-2">未知</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Section>
	);
}

function sourcesOf(s: PeakSummary): Source[] {
	const got = s.calendar.retrievedAt.slice(0, 10);
	const list: Source[] = [
		{
			label: "政府資料開放平臺：中華民國政府行政機關辦公日曆表",
			url: s.calendar.dataset,
			accessed: `${got}（UTC）`,
			evidence: `${s.calendar.provider}；${s.calendar.field}。只當作分析用日類型，不是 6670 班表，也不能推及所有勞工休假。`,
		},
		...s.calendar.sources.map(
			(c): Source => ({
				label: `${c.label}（${c.year} 年，${c.days} 日）`,
				url: c.url,
				accessed: `${got}（UTC）`,
				evidence: `官方 CSV，SHA-256 ${c.sha256}。`,
			}),
		),
		{
			label: "docs/lab/peaks/report.zh-TW.md",
			accessed: "2026-11-04",
			evidence:
				"修正版報告：schema v2 遷移契約、缺日與分母定義、驗證結果（本機檔案）。",
		},
	];
	return list;
}

const LIMITS: string[] = [
	"只有已成功刷卡的上下車聚合量；沒有候車、未上車、拒載、容量、班表或停駛紀錄，不能證明營運時段、滿載或潛在需求。",
	"分析窗口是 00:00–23:59 的 24 個小時桶，不宣稱官方營業時間。",
	"政府工作日／休息日是政府機關辦公日曆，僅為分析代理，不是公車班表規則。",
	"有紀錄日均是條件平均（分母為此組有紀錄的日數），缺日不補零，不是完整服務日均量；不同組的覆蓋日數不同，不宜直接當同一樣本比較。",
	"六個缺日（2024-07-24、07-25、10-02、10-03、10-31、2025-07-07）的原因未知；沒有列不能當成零需求或停駛。",
	"方向不明的上車 6,281 人次保留為獨立分組，不分攤到去程或回程；站點方向不對稱比不含方向不明。",
	"站角色是分析者候選分類，不是官方認證。比較與比值是描述性的，沒有因果解釋（例如週五、假日或景點效應）。",
	"本地聚合資料逐鍵一致只證明兩份聚合相符，不排除共同上游漏資料。",
];
