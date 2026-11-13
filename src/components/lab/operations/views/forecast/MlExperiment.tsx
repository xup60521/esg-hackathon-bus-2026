import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Chip, Provenance, Section, Stat } from "#/components/lab/shared";
import {
	type Availability,
	type Evaluation,
	type ForecastMlSummary,
	forecastMlPaths,
	type Metrics,
} from "#/features/lab/forecast/ml/data";
import { BacktestChart } from "./BacktestChart";
import { DailyTable } from "./DailyTable";
import { fmt, modelLabel, num2, pct2, signedBias } from "./format";
import { isMlResults, isMlSummary } from "./guards";
import { LOW_DAYS } from "./MonthlyWapeChart";
import { useJson } from "./useJson";

const drop = (a: number | null | undefined, b: number | null | undefined) =>
	a == null || b == null || b === 0 ? null : 1 - a / b;

/** "lower than" / "higher than" in words, so the comparison never relies on a number alone. */
const versus = (a: number | null | undefined, b: number | null | undefined) =>
	a == null || b == null ? "" : a < b ? "低於" : a > b ? "高於" : "等於";

function Callout({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div
			role="note"
			className="mt-3 flex items-start gap-3 rounded-xl border p-3 text-sm"
			style={{
				borderColor: "color-mix(in srgb, var(--k-unverified) 55%, transparent)",
				background: "color-mix(in srgb, var(--k-unverified) 10%, transparent)",
			}}
		>
			<TriangleAlert
				className="mt-0.5 size-4 shrink-0"
				style={{ color: "var(--k-unverified)" }}
			/>
			<div className="leading-relaxed">
				<div className="font-semibold">{title}</div>
				<div className="mt-1 text-xs text-[var(--fg2)]">{children}</div>
			</div>
		</div>
	);
}

function Th({
	children,
	right = true,
}: {
	children?: ReactNode;
	right?: boolean;
}) {
	return (
		<th className={`px-2 font-medium ${right ? "text-right" : "text-left"}`}>
			{children}
		</th>
	);
}

const TABLE = "w-full text-xs tabular-nums";
const THEAD_ROW =
	"border-b border-[var(--line)] text-left text-[11px] font-medium text-[var(--muted)]";
const NOTE = "mt-2 text-[11px] leading-relaxed text-[var(--muted)]";

export function MlExperiment() {
	const [load, retry] = useJson(forecastMlPaths.summary, isMlSummary, true);
	const s = load.state === "ready" ? load.data : undefined;
	const residual = s ? s.model.candidates[s.selectedModel]?.residual : true;
	return (
		<Section
			title={`機器學習實驗（梯度提升${residual ? "，殘差" : ""}）`}
			subtitle="與上方統計基準分開的獨立實驗，只做總量。這是歷史回測，不是現行預測，也不是營運準確率。"
			badges={
				<>
					<Chip tone="--k-forecast">機器學習</Chip>
					<Chip tone="--k-forecast">2025 逐月重訓、一步回測</Chip>
					<Chip
						tone="--k-unverified"
						icon={<TriangleAlert className="size-3" />}
					>
						未穩定勝出
					</Chip>
				</>
			}
			className="mt-4"
		>
			{s ? (
				<Content s={s} />
			) : load.state === "error" ? (
				<div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
					<span>機器學習實驗無法顯示：{load.message}</span>
					<button type="button" className="btn" onClick={retry}>
						重試
					</button>
				</div>
			) : (
				<p className="text-sm text-[var(--fg2)]">正在載入機器學習實驗摘要…</p>
			)}
		</Section>
	);
}

function Content({ s }: { s: ForecastMlSummary }) {
	const ml = s.selectedModel;
	const base = s.baselineSelectedModel;
	// the ML model first, then the statistical selection, then last-week-same-day (deduplicated)
	const keys = [...new Set<string>([ml, base, "seasonal7"])];
	const mlT = s.test.metrics[ml];
	const baseT = s.test.metrics[base];
	const s7T = s.test.metrics.seasonal7;
	const baseV = s.validation.metrics[base];
	const candidates = Object.entries(s.validationCandidateMetrics);
	const mlV = s.validationCandidateMetrics[ml];
	const losesValidation =
		baseV?.mae != null &&
		candidates.every(([, m]) => m.mae != null && m.mae > (baseV.mae ?? 0));
	const maeDrop = drop(mlT?.mae, baseT?.mae);
	const months = s.monthlyTest.filter((m) => m.metrics[ml] && m.metrics[base]);
	const worse = months.filter(
		(m) => (m.metrics[ml]?.wape ?? 0) > (m.metrics[base]?.wape ?? 0),
	);
	const audits = s.trainingAudits.filter((a) => a.model === ml);
	const p = s.model.parameters;
	return (
		<>
			<p className="text-xs leading-relaxed text-[var(--fg2)]">
				狀態：
				<code className="rounded bg-[var(--chip)] px-1.5 py-0.5">
					{s.status}
				</code>
				。 模型在每個月 1
				日以過去已揭露的實際值重新訓練，之後逐日預測隔天；沒有訓練 2025
				年之後的任何資料。
			</p>

			{losesValidation && mlV?.mae != null && baseV?.mae != null && (
				<Callout title="2024 驗證期，機器學習仍輸給統計中位數">
					四個機器學習候選在 {s.validation.commonDays} 個共同驗證日的 MAE 都高於
					{modelLabel(base)}。 選出的 {modelLabel(ml)} 為 {num2(mlV.mae)}，
					{modelLabel(base)} 為 {num2(baseV.mae)}。 即使 2025
					年保留測試略低，驗證結果並不支持以機器學習取代統計基準。
				</Callout>
			)}
			{months.length > 0 && worse.length > 0 && (
				<Callout title="2025 年的改善並不一致">
					在 {months.length} 個月中，有 {worse.length} 個月機器學習的 WAPE 高於
					{modelLabel(base)}（{worse.map((m) => m.month).join("、")}
					）。總體差距來自其他月份的累積，沒有統計顯著性檢定，也沒有跨年度驗證。
				</Callout>
			)}

			<h3 className="mt-5 text-xs font-semibold">
				2025 共同測試日比較（總量）
			</h3>
			{mlT && (
				<div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
					<Stat
						label="共同測試日"
						value={fmt.format(mlT.n)}
						sub="四個統計基準與機器學習都能預測、且有實際值的日數"
					/>
					<Stat
						label="機器學習 MAE（人次／日）"
						value={num2(mlT.mae)}
						sub={
							maeDrop !== null && baseT
								? `${modelLabel(base)} ${num2(baseT.mae)}；${maeDrop >= 0 ? "低" : "高"}約 ${pct2(Math.abs(maeDrop))}（同一批日期）`
								: undefined
						}
					/>
					<Stat
						label="機器學習 WAPE"
						value={pct2(mlT.wape)}
						sub={
							baseT
								? `${modelLabel(base)} ${pct2(baseT.wape)}；是誤差比例，不是準確率`
								: "是誤差比例，不是準確率"
						}
					/>
					<Stat
						label="尖峰低估量占比"
						value={pct2(mlT.peakUnderforecastShare)}
						sub={`${versus(mlT.peakUnderforecastShare, baseT?.peakUnderforecastShare)}${modelLabel(base)} ${pct2(baseT?.peakUnderforecastShare ?? null)}，${versus(mlT.peakUnderforecastShare, s7T?.peakUnderforecastShare)}上週同日 ${pct2(s7T?.peakUnderforecastShare ?? null)}`}
					/>
				</div>
			)}
			<div className="mt-3 overflow-x-auto">
				<table className={`${TABLE} min-w-[680px]`}>
					<thead>
						<tr className={THEAD_ROW}>
							<th className="py-1.5 pr-3 font-medium">模型</th>
							<Th>共同日</Th>
							<Th>MAE</Th>
							<Th>RMSE</Th>
							<Th>WAPE</Th>
							<Th>bias</Th>
							<Th>尖峰低估量占比</Th>
						</tr>
					</thead>
					<tbody>
						{keys.map((k) => {
							const m: Metrics | undefined =
								s.test.metrics[k as keyof typeof s.test.metrics];
							if (!m) return null;
							return (
								<tr
									key={k}
									className="border-b border-[var(--line)] last:border-0"
								>
									<td className="py-1.5 pr-3">
										<div className="flex flex-wrap items-center gap-1.5">
											<span className={k === ml ? "font-bold" : "font-medium"}>
												{modelLabel(k)}
											</span>
											<span className="text-[var(--muted)]">{k}</span>
											<Chip tone={k === ml ? "--k-forecast" : "--k-history"}>
												{k === ml ? "機器學習" : "統計基準"}
											</Chip>
										</div>
									</td>
									<td className="px-2 text-right">{fmt.format(m.n)}</td>
									<td className="px-2 text-right">{num2(m.mae)}</td>
									<td className="px-2 text-right">{num2(m.rmse)}</td>
									<td className="px-2 text-right">{pct2(m.wape)}</td>
									<td className="px-2 text-right">{signedBias(m.bias)}</td>
									<td className="px-2 text-right">
										{pct2(m.peakUnderforecastShare)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			<p className={NOTE}>
				MAE
				差距只是此資料與協定下的誤差差異，沒有顯著性檢定，也不是營運改善幅度。尖峰門檻為
				2024 年有紀錄日第 90 百分位 {fmt.format(s.peakThreshold2024P90)}{" "}
				人次（共同測試日中 {fmt.format(mlT?.peakN ?? 0)}{" "}
				日達門檻）；低估量占比不是拒載比例。bias 為預測減實際，負值表示低估。
			</p>

			<h3 className="mt-5 text-xs font-semibold">2024 驗證期：選模時的分數</h3>
			<div className="mt-2 overflow-x-auto">
				<table className={`${TABLE} min-w-[520px]`}>
					<thead>
						<tr className={THEAD_ROW}>
							<th className="py-1.5 pr-3 font-medium">模型</th>
							<Th>共同驗證日</Th>
							<Th>驗證 MAE</Th>
							<Th>WAPE</Th>
						</tr>
					</thead>
					<tbody>
						{candidates.map(([k, m]) => (
							<tr key={k} className="border-b border-[var(--line)]">
								<td className="py-1.5 pr-3">
									<div className="flex flex-wrap items-center gap-1.5">
										<span className={k === ml ? "font-bold" : "font-medium"}>
											{modelLabel(k)}
										</span>
										<span className="text-[var(--muted)]">{k}</span>
										<Chip tone="--k-forecast">機器學習候選</Chip>
										{k === ml && <Chip tone="--k-forecast">驗證期選出</Chip>}
									</div>
								</td>
								<td className="px-2 text-right">{fmt.format(m.n)}</td>
								<td className="px-2 text-right">{num2(m.mae)}</td>
								<td className="px-2 text-right">{pct2(m.wape)}</td>
							</tr>
						))}
						{[base, "seasonal7"]
							.filter((k, i, a) => a.indexOf(k) === i)
							.map((k) => {
								const m =
									s.validation.metrics[k as keyof typeof s.validation.metrics];
								if (!m) return null;
								return (
									<tr
										key={k}
										className="border-b border-[var(--line)] last:border-0"
									>
										<td className="py-1.5 pr-3">
											<div className="flex flex-wrap items-center gap-1.5">
												<span className="font-medium">{modelLabel(k)}</span>
												<span className="text-[var(--muted)]">{k}</span>
												<Chip tone="--k-history">統計基準</Chip>
											</div>
										</td>
										<td className="px-2 text-right">{fmt.format(m.n)}</td>
										<td className="px-2 text-right">{num2(m.mae)}</td>
										<td className="px-2 text-right">{pct2(m.wape)}</td>
									</tr>
								);
							})}
					</tbody>
				</table>
			</div>
			<p className={NOTE}>
				「驗證期選出」只代表四個機器學習候選之間的選擇，不表示勝過統計基準。
				只有 {s.validation.commonDays} 個共同驗證日，且未涵蓋整年季節。
			</p>

			<h3 className="mt-5 text-xs font-semibold">
				逐月 WAPE：機器學習 vs {modelLabel(base)}
			</h3>
			<MonthlyTable months={months} ml={ml} base={base} />

			<h3 className="mt-5 text-xs font-semibold">
				可出預測的日數比例（不是預測區間涵蓋率）
			</h3>
			<div className="mt-2 overflow-x-auto">
				<table className={`${TABLE} min-w-[560px]`}>
					<thead>
						<tr className={THEAD_ROW}>
							<th className="py-1.5 pr-3 font-medium">模型</th>
							<Th>可評估日數</Th>
							<Th>有紀錄日數</Th>
							<Th>有紀錄日覆蓋率</Th>
							<Th>個別日期 MAE</Th>
						</tr>
					</thead>
					<tbody>
						{keys.map((k) => {
							const a: Availability | undefined =
								s.test.availability[k as keyof typeof s.test.availability];
							if (!a) return null;
							return (
								<tr
									key={k}
									className="border-b border-[var(--line)] last:border-0"
								>
									<td className="py-1.5 pr-3 font-medium">
										{modelLabel(k)}{" "}
										<span className="font-normal text-[var(--muted)]">{k}</span>
									</td>
									<td className="px-2 text-right">
										{fmt.format(a.evaluatedObservedDays)}
									</td>
									<td className="px-2 text-right">
										{fmt.format(s.test.observedDays)}
									</td>
									<td className="px-2 text-right">
										{pct2(a.observedDayCoverage)}
									</td>
									<td className="px-2 text-right">
										{num2(a.individualSupportMetrics.mae)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			<p className={NOTE}>
				覆蓋率＝有實際紀錄的日子中，模型能出預測的比例（前 28
				日有缺值就不出預測）；它不是預測區間涵蓋率。 本實驗沒有預測區間，也沒有
				90% 或 95% 可信範圍。各模型可評估的日期不同，個別日期 MAE 不能直接排名。
			</p>

			<h3 className="mt-5 text-xs font-semibold">方法與協定</h3>
			<ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-[var(--fg2)]">
				<li>
					估計器{" "}
					<code className="rounded bg-[var(--chip)] px-1">
						{s.model.estimator}
					</code>
					（
					{Object.entries(p)
						.map(([k, v]) => `${k}=${v}`)
						.join("、")}
					）；預測值下限為 {s.model.predictionFloor}。{s.model.features.length}{" "}
					個特徵為落後實際值、滾動平均與標準差、同星期中位數及日曆週期；沒有假日、天氣、班表或容量特徵。
				</li>
				<li>
					候選共 {Object.keys(s.model.candidates).length}{" "}
					個（直接預測或預測相對同星期中位數的殘差，各配平方或絕對誤差損失）。
					2024 選模：{s.protocol.validationWindow[0]} 至{" "}
					{s.protocol.validationWindow[1]}，以共同驗證日 MAE 最低者為準， 2025
					年不參與選模。
				</li>
				<li>
					2025 測試：{s.protocol.testWindow[0]} 至 {s.protocol.testWindow[1]}，
					每月 1 日重新訓練（訓練標籤自 {audits[0]?.trainingFirstTarget ?? "–"}
					起擴張至前一日，模型規格不變），之後逐日一步預測。這不是年初一次預測全年。
				</li>
				<li>回測假設前一日彙總在預測前即可取得，實際資料延遲未知。</li>
				<li>
					缺值保留為 null：前 28
					日有缺值或非正值時不出預測，不補零、不回退到統計基準；缺實際值的日子不計入誤差。
				</li>
			</ul>
			{audits.length > 0 && (
				<details className="mt-2 text-[11px] text-[var(--fg2)]">
					<summary className="cursor-pointer">
						逐月訓練稽核（{audits.length} 次）
					</summary>
					<div className="mt-1 overflow-x-auto">
						<table className={`${TABLE} min-w-[480px]`}>
							<thead>
								<tr className={THEAD_ROW}>
									<th className="py-1 pr-3 font-medium">訓練截止（不含）</th>
									<th className="px-2 font-medium">最後標籤日</th>
									<Th>訓練筆數</Th>
									<Th>訓練 MAE</Th>
								</tr>
							</thead>
							<tbody>
								{audits.map((a) => (
									<tr
										key={a.cutoffExclusive}
										className="border-t border-[var(--line)]"
									>
										<td className="py-0.5 pr-3">{a.cutoffExclusive}</td>
										<td className="px-2">{a.trainingLastTarget}</td>
										<td className="px-2 text-right">
											{fmt.format(a.trainingRows)}
										</td>
										<td className="px-2 text-right">{num2(a.trainingMae)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<p className="mt-1">
						訓練 MAE 不能代替保留測試，特徵重要度也不是因果解釋。
					</p>
				</details>
			)}

			<MlDaily s={s} keys={keys} />

			<details className="mt-4 text-[11px] text-[var(--fg2)]">
				<summary className="cursor-pointer">實驗資料警告與溯源</summary>
				{s.warnings.length > 0 && (
					<ul className="mt-2 list-disc space-y-0.5 pl-5">
						{s.warnings.map((w) => (
							<li key={w}>{w}</li>
						))}
					</ul>
				)}
				<div className="mt-2">
					<Provenance
						source="public/data/lab/forecast/ml/summary.json"
						dataThrough={s.protocol.testWindow[1]}
						command="bash scripts/lab/forecast/ml/run.sh"
					/>
					<p className="mt-1 break-all text-[var(--muted)]">
						環境：
						{Object.entries(s.runtime)
							.map(([k, v]) => `${k} ${v}`)
							.join("、")}
						。參考彙總 sha256：
						{s.referenceSha256}
					</p>
				</div>
			</details>
		</>
	);
}

function MonthlyTable({
	months,
	ml,
	base,
}: {
	months: Array<Evaluation & { month: string }>;
	ml: string;
	base: string;
}) {
	return (
		<div className="mt-2 overflow-x-auto">
			<table className={`${TABLE} min-w-[520px]`}>
				<thead>
					<tr className={THEAD_ROW}>
						<th className="py-1.5 pr-3 font-medium">月份</th>
						<Th>共同日</Th>
						<Th>機器學習 WAPE</Th>
						<Th>統計中位數 WAPE</Th>
						<th className="px-2 font-medium">機器學習相對統計</th>
					</tr>
				</thead>
				<tbody>
					{months.map((m) => {
						const a = m.metrics[ml as keyof typeof m.metrics];
						const b = m.metrics[base as keyof typeof m.metrics];
						const low = m.commonDays < LOW_DAYS;
						const diff =
							a?.wape != null && b?.wape != null
								? (a.wape - b.wape) * 100
								: null;
						return (
							<tr
								key={m.month}
								className="border-b border-[var(--line)] last:border-0"
							>
								<td className="py-1.5 pr-3 font-medium">{m.month}</td>
								<td className="px-2 text-right">
									{m.commonDays}
									{low && (
										<span className="ml-1 font-bold">
											（僅 {m.commonDays} 日）
										</span>
									)}
								</td>
								<td className="px-2 text-right">{pct2(a?.wape ?? null)}</td>
								<td className="px-2 text-right">{pct2(b?.wape ?? null)}</td>
								<td className="px-2">
									{diff === null ? (
										"–"
									) : diff > 0 ? (
										<Chip tone="--k-unverified">
											較高 +{num2(diff)} 個百分點
										</Chip>
									) : (
										<span className="text-[var(--fg2)]">
											較低 {num2(diff)} 個百分點
										</span>
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
			<p className={NOTE}>
				共同日少於 {LOW_DAYS}{" "}
				日的月份樣本太少，不能當成完整月份的表現。「個百分點」是 WAPE 數值相減。
			</p>
		</div>
	);
}

function MlDaily({ s, keys }: { s: ForecastMlSummary; keys: string[] }) {
	const [results, start] = useJson(forecastMlPaths.results, isMlResults, false);
	const ml = s.selectedModel;
	const others = keys
		.filter((k) => k !== ml)
		.map((k) => ({ key: k, label: modelLabel(k) }));
	return (
		<>
			<h3 className="mt-5 text-xs font-semibold">
				逐日回測：實際 vs 機器學習預測
			</h3>
			<p className={NOTE}>2025 全年逐日資料約 150 KB，按下按鈕才載入。</p>
			<div className="mt-2">
				{results.state === "idle" ? (
					<button type="button" className="btn" onClick={start}>
						載入機器學習逐日回測
					</button>
				) : results.state === "loading" ? (
					<p className="text-sm text-[var(--fg2)]">正在載入逐日回測…</p>
				) : results.state === "error" ? (
					<div
						role="alert"
						className="flex flex-wrap items-center gap-3 text-sm"
					>
						<span>逐日回測無法顯示：{results.message}</span>
						<button type="button" className="btn" onClick={start}>
							重試
						</button>
					</div>
				) : (
					<>
						<BacktestChart
							rows={results.data.test}
							model={ml}
							modelLabel={`機器學習（${modelLabel(ml)}）`}
							threshold={s.peakThreshold2024P90}
							label={`總量 ${s.protocol.testWindow[0]} 至 ${s.protocol.testWindow[1]} 實際每日上車人次與機器學習預測；缺值處線段中斷。`}
						/>
						<DailyTable
							rows={results.data.test}
							model={ml}
							others={others}
							showCutoff
						/>
					</>
				)}
			</div>
		</>
	);
}
