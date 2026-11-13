import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import {
	Chip,
	FreshnessBanner,
	KindBadge,
	LimitationList,
	Provenance,
	Section,
	Segmented,
	SeverityTag,
	type Source,
	SourceList,
	Stat,
} from "#/components/lab/shared";
import {
	type ForecastGroupSummary,
	type ForecastModel,
	type ForecastResults,
	type ForecastSummary,
	forecastDataPaths,
} from "#/features/lab/forecast/data";
import { BacktestChart } from "./forecast/BacktestChart";
import { DailyTable } from "./forecast/DailyTable";
import {
	fmt,
	fmt1,
	groupLabel,
	MODEL_LABEL,
	MODELS,
	num2,
	pct2,
	signedBias,
	weekday,
} from "./forecast/format";
import { isResults, isSummary } from "./forecast/guards";
import { MlExperiment } from "./forecast/MlExperiment";
import {
	LOW_DAYS,
	type MonthBar,
	MonthlyWapeChart,
} from "./forecast/MonthlyWapeChart";
import { type Load, useJson } from "./forecast/useJson";

const DEMO_STATUS = "historical_demo_not_current_forecast";
/** Groups with fewer common validation days than this are flagged as weak evidence for model selection. */
const WEAK_VALIDATION_DAYS = 60;
/** WAPE at or above this is flagged as high error. */
const HIGH_WAPE = 0.3;

const SOURCES: Source[] = [
	{
		label: "README.md、scripts/analysis/export-midstop.ts（本地檔案）",
		accessed: "2026-11-04",
		evidence:
			"刷卡來源、欄位、站序方向推定、各自事件時間及跨月合併。未重查原始 Excel 或資料庫，不能驗證彙總前的漏刷或清洗。",
	},
	{
		label: ".agentflow/artifacts/A-007/feasibility.zh-TW.md（本地檔案）",
		accessed: "2026-11-04",
		evidence: "沿用季節基準與時間回測，以及刷卡不能視為完整需求的界線。",
	},
	{
		label:
			"Hyndman 與 Athanasopoulos，Forecasting: Principles and Practice，5.2、5.8、5.10",
		url: "https://otexts.com/fpp3/toolbox.html",
		accessed: "2026-11-04",
		evidence:
			"季節天真法與向前時間驗證的方法說明。窗口長度與保留年份是本案設定，教材沒有替本資料的表現背書。",
	},
	{
		label: "scikit-learn TimeSeriesSplit 官方文件",
		url: "https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html",
		accessed: "2026-11-04",
		evidence:
			"依時間順序切分與擴張訓練集的概念。本案未安裝或呼叫 sklearn，以標準函式庫實作嚴格日曆落後值。",
	},
];

const LIMITATIONS = [
	"刷卡只記錄成功搭乘；不是完整需求，也不含候車、拒載、容量或載客率。沒有班表與票證涵蓋率，無法排除模型學到的是供給限制或資料收集差異。",
	"目標是每日成功刷卡上車人次的總量序列；不能推出應加開幾班。",
	"回測假設前一日彙總在預測前即可取得；實際資料延遲未知，延遲超過一天須重做回測。",
	"沒有預測區間、節慶與天氣特徵，也沒有近期資料；只有兩年資料，未建模年度季節、春節移動或活動效應。",
	"沒有做統計顯著性檢定，不能宣稱跨年度穩定；單一保留年度的結果也可能因個別日期而改變。",
	"缺日原因未查證，不能視為停駛、颱風或零需求；有紀錄的日子也可能不完整。",
	"2025 年回測只代表已發生的歷史，不得直接用於現行排班或備車決策。",
];

function Panel({ children }: { children: React.ReactNode }) {
	return (
		<div className="panel mt-4 p-4 text-sm text-[var(--fg2)]">{children}</div>
	);
}

function LoadMessage<T>({
	load,
	what,
	retry,
}: {
	load: Load<T>;
	what: string;
	retry: () => void;
}) {
	if (load.state === "loading")
		return <p className="text-sm text-[var(--fg2)]">正在載入{what}…</p>;
	if (load.state === "error")
		return (
			<div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
				<span>
					{what}無法顯示：{load.message}
				</span>
				<button type="button" className="btn" onClick={retry}>
					重試
				</button>
			</div>
		);
	return null;
}

export default function ForecastView() {
	const [summary, retry] = useJson(forecastDataPaths.summary, isSummary, true);
	return (
		<div className="pb-4">
			<header>
				<div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
					6670 研究實驗室 · 方向 1
				</div>
				<h1 className="mt-1 text-2xl font-bold">
					旅運需求預測：每日刷卡上車量回測
				</h1>
				<p className="mt-2 max-w-[80ch] text-sm leading-relaxed text-[var(--fg2)]">
					用 2024–2025
					年的歷史刷卡彙總，檢驗四種簡單的週季節統計基準（上週同日、前 4
					週同日平均、前 4 週同日中位數、前 28
					日平均）在「隔天預測」上的誤差。這些是統計基準，不是 AI
					或機器學習模型， 也不是現行預報；結果只說明過去哪種規則誤差較小。
				</p>
				<div className="mt-3 flex flex-wrap gap-1.5">
					<KindBadge kind="history" />
					<KindBadge kind="forecast" />
				</div>
			</header>
			{summary.state === "ready" ? (
				<Body data={summary.data} />
			) : (
				<Panel>
					<LoadMessage
						load={summary}
						what="預測摘要（summary.json）"
						retry={retry}
					/>
					{summary.state === "idle" && "準備載入…"}
				</Panel>
			)}
			<Section
				title="來源"
				subtitle="外部請求只有方法文件網址，沒有附帶本地資料。"
				className="mt-4"
			>
				<SourceList sources={SOURCES} />
			</Section>
			<Section title="限制與使用界線" className="mt-4">
				<LimitationList items={LIMITATIONS} />
			</Section>
		</div>
	);
}

function Body({ data }: { data: ForecastSummary }) {
	const total = data.groups.find((g) => g.id === "total");
	const [from, to] = data.observationWindow;
	return (
		<>
			<div className="mt-4">
				<FreshnessBanner
					dataThrough={to}
					what="觀測窗終點"
					note={`回測資料為 ${from} 至 ${to} 的歷史彙總；2025 年回測不得用於現行排班或即時決策。`}
				/>
			</div>
			{total ? (
				<Headline total={total} />
			) : (
				<Panel>資料中找不到「總量」分組，無法顯示重點數字。</Panel>
			)}
			<Method data={data} />
			{total && <ModelTable total={total} />}
			<MlExperiment />
			<GroupTable groups={data.groups} />
			{total && <Monthly total={total} />}
			<DailyBacktest groups={data.groups} />
			{total && <HistoricalDemo total={total} />}
			<Scope data={data} />
			<Section title="資料溯源" className="mt-4">
				<Provenance
					source="public/data/lab/forecast/summary.json"
					dataThrough={to}
					command="PYTHONDONTWRITEBYTECODE=1 python3 scripts/lab/forecast/build.py"
				/>
				<p className="mt-2 break-all text-[11px] text-[var(--muted)]">
					參考彙總 sha256：{data.referenceSha256}　輸入{" "}
					{fmt.format(data.quality.inputRows)} 列，
					{data.quality.referenceReconciled
						? "已與公開彙總逐鍵對帳"
						: "未與公開彙總對帳"}
					。
				</p>
				<details className="mt-2 text-[11px] text-[var(--fg2)]">
					<summary className="cursor-pointer">
						輸入檔 sha256（{data.sources.length} 份）
					</summary>
					<ul className="mt-1 space-y-0.5">
						{data.sources.map((s) => (
							<li key={s.path} className="break-all">
								{s.path}　{fmt.format(s.rows)} 列　{s.sha256}
							</li>
						))}
					</ul>
				</details>
			</Section>
		</>
	);
}

function Headline({ total }: { total: ForecastGroupSummary }) {
	const model = total.selectedModel;
	if (!model) return <Panel>總量沒有選出模型，無法顯示重點數字。</Panel>;
	const sel = total.testMetrics[model];
	const base = total.testMetrics.seasonal7;
	const compare = model !== "seasonal7";
	const maeDrop =
		compare && sel.mae !== null && base.mae ? 1 - sel.mae / base.mae : null;
	const ownTest = total.individualSupportMetrics?.test?.[model];
	const peakWorse =
		compare &&
		sel.peakUnderforecastShare !== null &&
		base.peakUnderforecastShare !== null &&
		sel.peakUnderforecastShare > base.peakUnderforecastShare;
	return (
		<Section
			title="重點結果（總量）"
			subtitle="選模只看 2024 下半年驗證期；以下為 2025 年保留測試，所有模型都能預測的共同日期。"
			badges={<KindBadge kind="forecast" />}
			className="mt-4"
		>
			<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
				<Stat
					label="驗證期選出的模型"
					value={MODEL_LABEL[model]}
					sub={`${model}；驗證期 MAE 最低`}
				/>
				<Stat
					label="共同測試日"
					value={fmt.format(sel.n)}
					sub="2025 年，各模型皆可預測且有實際值的日數"
				/>
				<Stat
					label="MAE（人次／日）"
					value={num2(sel.mae)}
					sub={
						maeDrop !== null
							? `上週同日 ${num2(base.mae)}，選出模型低約 ${pct2(maeDrop)}（同一批日期）`
							: undefined
					}
				/>
				<Stat
					label="WAPE"
					value={pct2(sel.wape)}
					sub="絕對誤差總和 ÷ 實際人次總和，是誤差比例，不是準確率"
				/>
				<Stat
					label="平均偏差 bias"
					value={num2(sel.bias)}
					sub="預測減實際的平均；負值表示平均低估"
				/>
			</div>
			{ownTest && ownTest.n !== sel.n && (
				<p className="mt-2 text-[11px] text-[var(--muted)]">
					選出模型本身可評估 {fmt.format(ownTest.n)}{" "}
					日（含其他模型無法預測的日子）：MAE {num2(ownTest.mae)}、WAPE{" "}
					{pct2(ownTest.wape)}。因日期不同，不與上列共同日期結果並排比較。
				</p>
			)}
			{compare && (
				<div
					role="note"
					className="mt-3 flex items-start gap-3 rounded-xl border p-3 text-sm"
					style={{
						borderColor: peakWorse
							? "color-mix(in srgb, var(--k-unverified) 55%, transparent)"
							: "var(--line)",
						background: peakWorse
							? "color-mix(in srgb, var(--k-unverified) 10%, transparent)"
							: "var(--chip)",
					}}
				>
					<TriangleAlert
						className="mt-0.5 size-4 shrink-0"
						style={{ color: "var(--k-unverified)" }}
					/>
					<div className="leading-relaxed">
						<div className="flex flex-wrap items-center gap-2 font-semibold">
							{peakWorse
								? "平均誤差較小，但尖峰日低估較多"
								: "尖峰日低估量占比"}
							{peakWorse && <SeverityTag severity="review" />}
						</div>
						<p className="mt-1 text-xs text-[var(--fg2)]">
							尖峰日（實際人次達訓練期第 90 百分位門檻{" "}
							{fmt.format(total.peakThresholdTrainingP90 ?? 0)}，共同測試樣本{" "}
							{fmt.format(sel.peakN)} 日）上，選出模型的低估量占尖峰實際人次{" "}
							<b className="text-[var(--fg)]">
								{pct2(sel.peakUnderforecastShare)}
							</b>
							，上週同日基準為{" "}
							<b className="text-[var(--fg)]">
								{pct2(base.peakUnderforecastShare)}
							</b>
							{peakWorse ? "，選出模型反而更高" : ""}。若用於尖峰備車，不能只按
							MAE 或 WAPE 選模型。 低估量占比＝尖峰日 max(實際−預測, 0) 總和 ÷
							尖峰實際總和，不是拒載比例。
						</p>
					</div>
				</div>
			)}
		</Section>
	);
}

function Method({ data }: { data: ForecastSummary }) {
	const p = data.protocol;
	return (
		<Section
			title="方法：四個週季節統計基準"
			subtitle="只用過去已揭露的實際值做隔天預測；缺任一必要歷史就不出預測，不補零、不向前填值。沒有訓練任何 AI 或機器學習模型。"
			badges={<KindBadge kind="forecast" />}
			className="mt-4"
		>
			<dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[auto_auto_1fr]">
				{MODELS.map((m) => (
					<div key={m} className="contents">
						<dt className="font-semibold">{MODEL_LABEL[m]}</dt>
						<dd className="text-[var(--muted)]">{m}</dd>
						<dd>
							<code className="rounded bg-[var(--chip)] px-1.5 py-0.5">
								{p.models[m]}
							</code>
						</dd>
					</div>
				))}
			</dl>
			<ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-[var(--fg2)]">
				<li>
					模型選擇期 {p.validationWindow[0]} 至 {p.validationWindow[1]}
					：各分組以驗證期 MAE 最低者為準，選擇後凍結。
				</li>
				<li>
					保留測試期 {p.testWindow[0]} 至 {p.testWindow[1]}
					：每天先預測、再揭露實際值，隔天可使用前一天的實際值；不是年初一次預測全年。
				</li>
				<li>回測假設前一日彙總在預測前即可取得，實際資料延遲未知。</li>
				<li>
					尖峰門檻為各分組 {data.observationWindow[0].slice(0, 4)} 年有紀錄日第
					90 百分位並固定。
				</li>
			</ul>
		</Section>
	);
}

function ModelTable({ total }: { total: ForecastGroupSummary }) {
	return (
		<Section
			title="模型比較（總量）"
			subtitle={`僅比較四個模型皆可預測的共同日期：驗證 ${fmt.format(total.validationCommonDays)} 日、測試 ${fmt.format(total.testCommonDays)} 日。bias＝預測減實際，負值表示低估。`}
			badges={<KindBadge kind="forecast" />}
			className="mt-4"
		>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[720px] text-xs tabular-nums">
					<thead>
						<tr className="border-b border-[var(--line)] text-left text-[11px] font-medium text-[var(--muted)]">
							<th className="py-1.5 pr-3 font-medium">模型</th>
							<th className="px-2 text-right font-medium">驗證 MAE</th>
							<th className="px-2 text-right font-medium">測試 MAE</th>
							<th className="px-2 text-right font-medium">RMSE</th>
							<th className="px-2 text-right font-medium">WAPE</th>
							<th className="px-2 text-right font-medium">bias</th>
							<th className="pl-2 text-right font-medium">尖峰低估量占比</th>
						</tr>
					</thead>
					<tbody>
						{MODELS.map((m) => {
							const t = total.testMetrics[m];
							const selected = total.selectedModel === m;
							return (
								<tr
									key={m}
									className="border-b border-[var(--line)] last:border-0"
								>
									<td className="py-1.5 pr-3">
										<div className="flex flex-wrap items-center gap-1.5">
											<span className={selected ? "font-bold" : "font-medium"}>
												{MODEL_LABEL[m]}
											</span>
											<span className="text-[var(--muted)]">{m}</span>
											{selected && <Chip tone="--k-forecast">驗證期選出</Chip>}
											{m === "seasonal7" && (
												<Chip tone="--k-history">比較基準</Chip>
											)}
										</div>
									</td>
									<td className="px-2 text-right">
										{num2(total.validationMetrics[m].mae)}
									</td>
									<td
										className={`px-2 text-right ${selected ? "font-bold" : ""}`}
									>
										{num2(t.mae)}
									</td>
									<td className="px-2 text-right">{num2(t.rmse)}</td>
									<td className="px-2 text-right">{pct2(t.wape)}</td>
									<td className="px-2 text-right">{signedBias(t.bias)}</td>
									<td className="pl-2 text-right">
										{pct2(t.peakUnderforecastShare)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			<p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
				MAE 為平均絕對誤差（人次／日），RMSE 對大誤差較敏感。前 28
				日平均遇缺日後連續 28 日無法預測，共同樣本因此較少。
				單一年度、未做顯著性檢定，模型間的小差距不宜過度解讀。
			</p>
		</Section>
	);
}

function groupNotes(
	g: ForecastGroupSummary,
	maxValidationDays: number,
): string[] {
	const notes: string[] = [];
	if (g.validationCommonDays < WEAK_VALIDATION_DAYS)
		notes.push(
			`共同驗證日僅 ${g.validationCommonDays} 日（最多 ${maxValidationDays} 日），選模證據較弱`,
		);
	const wape = g.selectedModel ? g.testMetrics[g.selectedModel].wape : null;
	if (g.id === "direction:unknown")
		notes.push("低量、高誤差，僅供資料品質觀察，不宜作營運量能依據");
	else if (wape !== null && wape >= HIGH_WAPE) notes.push("WAPE 偏高");
	return notes;
}

function GroupTable({ groups }: { groups: ForecastGroupSummary[] }) {
	const ordered = [
		...groups.filter((g) => g.id === "total"),
		...groups.filter((g) => g.id !== "total"),
	];
	const maxValidationDays = Math.max(
		0,
		...groups.map((g) => g.validationCommonDays),
	);
	return (
		<Section
			title="各分組（方向與支線）"
			subtitle="每個分組獨立預測，沒有做階層一致化：支線或方向的預測加總不保證等於總量預測。方向與支線是兩套邊際分組，不可一起加總。方向由站序推定，unknown 為無法推定者。"
			badges={<KindBadge kind="forecast" />}
			className="mt-4"
		>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[760px] text-xs tabular-nums">
					<thead>
						<tr className="border-b border-[var(--line)] text-left text-[11px] font-medium text-[var(--muted)]">
							<th className="py-1.5 pr-3 font-medium">分組</th>
							<th className="px-2 font-medium">驗證期選出模型</th>
							<th className="px-2 text-right font-medium">共同驗證日</th>
							<th className="px-2 text-right font-medium">共同測試日</th>
							<th className="px-2 text-right font-medium">MAE</th>
							<th className="px-2 text-right font-medium">WAPE</th>
							<th className="pl-2 font-medium">註記</th>
						</tr>
					</thead>
					<tbody>
						{ordered.map((g) => {
							const m = g.selectedModel ? g.testMetrics[g.selectedModel] : null;
							const notes = groupNotes(g, maxValidationDays);
							return (
								<tr
									key={g.id}
									className="border-b border-[var(--line)] align-top last:border-0"
								>
									<td className="py-1.5 pr-3 font-semibold">
										{groupLabel(g.id)}
									</td>
									<td className="px-2">
										{g.selectedModel ? (
											<>
												{MODEL_LABEL[g.selectedModel]}
												<span className="ml-1 text-[var(--muted)]">
													{g.selectedModel}
												</span>
											</>
										) : (
											"未選出"
										)}
									</td>
									<td className="px-2 text-right">
										{fmt.format(g.validationCommonDays)}
									</td>
									<td className="px-2 text-right">
										{fmt.format(g.testCommonDays)}
									</td>
									<td className="px-2 text-right">{num2(m?.mae ?? null)}</td>
									<td className="px-2 text-right">{pct2(m?.wape ?? null)}</td>
									<td className="pl-2">
										<div className="flex flex-col items-start gap-1">
											{notes.map((t) => (
												<Chip
													key={t}
													tone="--k-unverified"
													icon={<TriangleAlert className="size-3" />}
												>
													{t}
												</Chip>
											))}
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			<p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
				MAE 以人次計，不同規模的分組不能直接比較；跨分組請看 WAPE。
			</p>
		</Section>
	);
}

function Monthly({ total }: { total: ForecastGroupSummary }) {
	const model = total.selectedModel;
	if (!model) return null;
	const bars: MonthBar[] = total.monthlyTest.map((m) => ({
		month: m.month,
		wape: m.metrics[model].wape,
		n: m.metrics[model].n,
	}));
	const low = bars.filter((b) => b.n < LOW_DAYS);
	return (
		<Section
			title="逐月 WAPE（總量，驗證期選出的模型）"
			subtitle={`每月只計共同測試日，日數標在月份下方。共同日少於 ${LOW_DAYS} 日的月份以斜線與「僅 N 日」標示，不能當成完整月份的表現。`}
			badges={<KindBadge kind="forecast" />}
			className="mt-4"
		>
			<MonthlyWapeChart
				bars={bars}
				label={`總量逐月 WAPE：${MODEL_LABEL[model]}。${bars.map((b) => `${b.month} ${pct2(b.wape)}（${b.n} 日）`).join("、")}`}
			/>
			{low.length > 0 && (
				<p className="mt-2 text-xs leading-relaxed text-[var(--fg2)]">
					{low.map((b) => `${b.month} 只有 ${b.n} 個共同有效日`).join("；")}，
					{low.map((b) => pct2(b.wape)).join("、")} 不是完整月份的表現。
				</p>
			)}
		</Section>
	);
}

function DailyBacktest({ groups }: { groups: ForecastGroupSummary[] }) {
	const [results, load] = useJson(forecastDataPaths.results, isResults, false);
	const [groupId, setGroupId] = useState("total");
	const options: [string, string][] = groups.map((g) => [
		g.id,
		groupLabel(g.id),
	]);
	return (
		<Section
			title="逐日回測：實際 vs 預測"
			subtitle="2025 年保留測試期，只畫驗證期選出的模型。逐日資料約 1.1 MB，按下按鈕才載入。"
			badges={
				<>
					<KindBadge kind="history" />
					<KindBadge kind="forecast" />
				</>
			}
			className="mt-4"
		>
			{results.state === "ready" ? (
				<>
					<Segmented
						options={options}
						value={groupId}
						onChange={setGroupId}
						label="選擇分組"
					/>
					<DailyChart data={results.data} groupId={groupId} />
				</>
			) : results.state === "idle" ? (
				<button type="button" className="btn" onClick={load}>
					載入逐日回測
				</button>
			) : (
				<LoadMessage
					load={results}
					what="逐日回測（results.json）"
					retry={load}
				/>
			)}
		</Section>
	);
}

function DailyChart({
	data,
	groupId,
}: {
	data: ForecastResults;
	groupId: string;
}) {
	const g = data.groups.find((x) => x.id === groupId);
	if (!g)
		return (
			<p className="mt-3 text-sm text-[var(--fg2)]">逐日資料中沒有這個分組。</p>
		);
	const model: ForecastModel | null = g.selectedModel;
	if (!model)
		return (
			<p className="mt-3 text-sm text-[var(--fg2)]">這個分組沒有選出模型。</p>
		);
	const [t0, t1] = data.protocol.testWindow;
	const rows = g.backtest.filter((r) => r.date >= t0 && r.date <= t1);
	if (rows.length === 0)
		return (
			<p className="mt-3 text-sm text-[var(--fg2)]">測試期沒有逐日資料。</p>
		);
	const label = `${groupLabel(g.id)} ${t0} 至 ${t1} 實際每日上車人次與 ${MODEL_LABEL[model]} 預測；缺值處線段中斷。`;
	return (
		<div className="mt-3">
			<div className="mb-2 text-xs text-[var(--fg2)]">
				{groupLabel(g.id)}：預測模型 {MODEL_LABEL[model]}（{model}），共{" "}
				{fmt.format(rows.length)} 日，其中{" "}
				{fmt.format(rows.filter((r) => r.commonSupport).length)}{" "}
				日計入共同比較。
			</div>
			<BacktestChart
				rows={rows}
				model={model}
				modelLabel={MODEL_LABEL[model]}
				threshold={g.peakThresholdTrainingP90}
				label={label}
			/>
			<DailyTable rows={rows} model={model} />
		</div>
	);
}

function HistoricalDemo({ total }: { total: ForecastGroupSummary }) {
	const d = total.historicalNextDay;
	if (!d || d.status !== DEMO_STATUS || d.prediction === null || !d.model)
		return null;
	return (
		<div
			className="mt-4 rounded-2xl border-2 border-dashed p-1"
			style={{
				borderColor: "color-mix(in srgb, var(--k-unverified) 60%, transparent)",
			}}
		>
			<Section
				title="歷史示範，不是現行預測"
				badges={
					<>
						<Chip
							tone="--k-unverified"
							icon={<TriangleAlert className="size-3" />}
						>
							歷史示範
						</Chip>
						<code className="rounded bg-[var(--chip)] px-1.5 py-0.5 text-[11px]">
							{d.status}
						</code>
					</>
				}
				subtitle="以資料窗結束日當起點，示範模型對下一天會給出什麼數字；這是技術示範，不是今天或明天的預測，也不能當作排班依據。"
			>
				<div className="grid gap-2 sm:grid-cols-3">
					<Stat label="起算日（最後一個已知實際日）" value={d.origin} />
					<Stat label="目標日" value={`${d.date}（${weekday(d.date)}）`} />
					<Stat
						label="點估（人次）"
						value={fmt1.format(d.prediction)}
						sub={`${MODEL_LABEL[d.model]}（${d.model}），總量，沒有預測區間`}
					/>
				</div>
				<p className="mt-3 text-xs leading-relaxed text-[var(--fg2)]">
					沒有真值驗證、沒有元旦特徵：資料止於 {d.origin}
					，目標日的實際值不在資料內，模型也不知道該日是節日。
					僅供示範流程，不能視為今天或明天的預測。
				</p>
			</Section>
		</div>
	);
}

function Scope({ data }: { data: ForecastSummary }) {
	const q = data.quality;
	const missing = q.missingBoardingDates;
	return (
		<Section
			title="資料範圍與缺日"
			subtitle="目標是每日成功刷卡上車人次；沒有班表、容量、候車或拒載資料。"
			badges={<KindBadge kind="history" />}
			className="mt-4"
		>
			<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
				<Stat
					label="觀測窗"
					value={`${data.observationWindow[0].slice(0, 4)}–${data.observationWindow[1].slice(0, 4)}`}
					sub={`${data.observationWindow[0]} 至 ${data.observationWindow[1]}（${data.timezone}）`}
				/>
				<Stat label="日曆日" value={fmt.format(q.calendarDays)} />
				<Stat
					label="有上車紀錄的日數"
					value={fmt.format(q.boardingObservedDays)}
					sub="有紀錄日也可能不完整"
				/>
				<Stat
					label="無上車紀錄的日數"
					value={fmt.format(missing.length)}
					sub={`方向 unknown 占上車 ${pct2(q.unknownDirectionShare)}`}
				/>
			</div>
			<div className="mt-3 text-xs leading-relaxed text-[var(--fg2)]">
				<div className="font-semibold text-[var(--fg)]">
					無上車紀錄的日期（{missing.length} 日）
				</div>
				<div className="mt-1.5 flex flex-wrap gap-1.5">
					{missing.map((d) => (
						<Chip key={d} tone="--k-unverified">
							{d}（{weekday(d)}）
						</Chip>
					))}
				</div>
				<p className="mt-2">
					這些日子在序列中保留為
					null，不補零、不向前填值，預測與誤差都不含這些日子。缺日原因未查證，不能判定為停駛、颱風、封閉或零需求。
				</p>
			</div>
		</Section>
	);
}
