import { OctagonAlert } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
	Chip,
	FreshnessBanner,
	KindBadge,
	LimitationList,
	Provenance,
	Section,
	Segmented,
	SourceList,
	Stat,
} from "#/components/lab/shared";
import { Calculator } from "./esg/Calculator";
import {
	GroupLegend,
	MonthlyChart,
	type MonthMetric,
	SHARE_COLORS,
	ShareBar,
} from "./esg/Charts";
import { LIMITATIONS, SOURCES } from "./esg/content";
import {
	BOUNDARY_LABEL,
	type EsgData,
	FACTOR_KEYS,
	FILES,
	loadEsg,
	METHOD_LABEL,
	nf0,
	nf1,
	nf3,
	orNone,
	pct1,
	signed0,
} from "./esg/model";

type Load =
	| { kind: "loading" }
	| { kind: "error"; message: string }
	| { kind: "ready"; data: EsgData };

function useEsg(): Load {
	const [state, setState] = useState<Load>({ kind: "loading" });
	useEffect(() => {
		const ctrl = new AbortController();
		loadEsg(ctrl.signal)
			.then((data) => setState({ kind: "ready", data }))
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

export default function EsgView() {
	const load = useEsg();
	return (
		<div>
			<header>
				<div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
					6670 研究實驗室 · 方向 10
				</div>
				<h1 className="mt-1 text-2xl font-bold">
					ESG 與低碳：獨立假設情境展示
				</h1>
				<p className="mt-2 max-w-[80ch] text-sm leading-relaxed text-[var(--fg2)]">
					把已成功刷卡的旅次聚合、路網近似的人公里，與可自行輸入的車公里、電動化率等假設放在一起，看排放數字如何隨假設改變。
					<b className="text-[var(--fg)]"> 這是試算工具，不是排放盤查。</b>
				</p>
				<div className="mt-3 flex flex-wrap items-center gap-1.5">
					<KindBadge kind="history" />
					<KindBadge kind="scenario" />
					<KindBadge kind="official" />
					<Chip
						tone="--sev-review"
						title="所有排放皆為獨立假設展示；係數與效率未校準"
					>
						獨立假設展示
					</Chip>
					<Chip tone="--k-unverified" title="尚未通過最終獨立 review">
						待獨立 review
					</Chip>
				</div>
			</header>

			<NotClaims />

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

function NotClaims() {
	return (
		<aside
			className="panel mt-4 flex gap-3 p-3 text-xs leading-relaxed"
			style={{
				borderColor: "color-mix(in srgb, var(--sev-review) 45%, var(--line))",
			}}
			aria-label="本頁不主張的事"
		>
			<OctagonAlert
				className="mt-0.5 size-4 shrink-0"
				style={{ color: "var(--sev-review)" }}
				aria-hidden
			/>
			<div className="text-[var(--fg2)]">
				<div className="font-semibold text-[var(--fg)]">本頁不是什麼</div>
				<ul className="mt-1 list-disc space-y-0.5 pl-5">
					<li>
						不是 Scope 1/2/3
						盤查，也不是淨零、最優或公平改善的結論；情境比較差額獨立於 Scope
						1/2/3，不歸入 Scope 3，不抵扣任何盤查。
					</li>
					<li>
						柴油 CO2e 係數、各運具強度、分流與效率全是未校準假設；只有電力 2024
						年 0.474 kg CO2e/kWh 標為官方，且不是最新年度。
					</li>
					<li>
						觀測的只有成功刷卡旅次；人公里是路網近似；沒有實際能源、營運里程或拒載資料。
					</li>
				</ul>
			</div>
		</aside>
	);
}

function StatusPanel({ load }: { load: Exclude<Load, { kind: "ready" }> }) {
	if (load.kind === "loading")
		return (
			<output className="panel block p-4 text-sm text-[var(--fg2)]">
				載入四份 ESG 資料（schemaVersion 2）中……
			</output>
		);
	return (
		<div className="panel p-4 text-sm" role="alert">
			<div className="font-semibold">無法載入 ESG 資料</div>
			<div className="mt-1 break-words text-xs text-[var(--fg2)]">
				{load.message}
			</div>
			<div className="mt-1 text-xs text-[var(--muted)]">
				來源：{Object.values(FILES).join("、")}
				。此頁不會以預設值或其他資料代替，所有數字都不顯示。
			</div>
		</div>
	);
}

function Content({ data }: { data: EsgData }) {
	const { summary, months, presets, od } = data;
	const ds = summary.dataset;
	return (
		<>
			<div className="mt-4">
				<FreshnessBanner
					dataThrough={ds.lastRecordedDate}
					what="成功刷卡聚合"
					note="歷史刷卡聚合，不是即時資料；排放數字皆為假設，與資料新舊無關。"
				/>
			</div>

			<Observed summary={summary} />
			<Monthly months={months} />
			<Structure summary={summary} />
			<DistanceMethod summary={summary} od={od} />
			<Calculator data={data} />
			<Presets data={data} presets={presets} />
			<Factors summary={summary} />
			<Footer summary={summary} />
		</>
	);
}

function Observed({ summary }: { summary: EsgData["summary"] }) {
	const ds = summary.dataset;
	const cov = summary.coverage;
	const pkm = ds.totalPassengerKm;
	return (
		<Section
			className="mt-4"
			title="觀測到的：成功刷卡旅次與路網近似人公里"
			subtitle={`${ds.source}。${ds.firstRecordedDate} 至 ${ds.lastRecordedDate}。刷卡只代表已成功搭乘者，不是需求、候車或拒載。`}
			badges={
				<>
					<KindBadge kind="history" />
					<Chip tone="--k-unverified" title={cov.caveat}>
						距離為 OSRM 近似
					</Chip>
				</>
			}
		>
			<div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
				<Stat
					label="成功刷卡旅次"
					value={nf0.format(ds.totalTrips)}
					sub="彙總的旅次，不是人數"
				/>
				<Stat
					label="有刷卡紀錄日"
					value={nf0.format(ds.recordedDates)}
					sub="不是營運日；營運日數為無"
				/>
				<Stat
					label="路網近似人公里"
					value={orNone(pkm, nf0.format)}
					sub={
						pkm === null
							? `有旅次缺距離，只能報已知部分 ${nf0.format(ds.knownDistancePkm)}`
							: "旅次 × OSRM 兩站距離，不是實際搭乘距離"
					}
				/>
				<Stat
					label="缺距離旅次"
					value={nf0.format(ds.unknownDistanceTrips)}
					sub={
						ds.unknownDistanceTrips === 0
							? `${cov.missingDistanceCount} 個缺對 OD；沒有補 0`
							: "缺距離以無呈現，不補 0"
					}
				/>
				<Stat
					label="OSRM 配對涵蓋旅次"
					value={nf0.format(cov.matchedNetworkTrips)}
					sub={`${nf0.format(cov.observedOdSubrouteGroups)} 組 OD/支線；距離涵蓋率 ${pct1(cov.distanceCoverageRatio)}`}
				/>
				<Stat
					label="同站 0 km（假設）旅次"
					value={nf0.format(cov.sameStopTrips)}
					sub="上下車同站以 0 km 計入，不代表沒有行駛"
				/>
			</div>
			<p className="mt-3 max-w-[80ch] text-xs leading-relaxed text-[var(--muted)]">
				{cov.caveat}
			</p>
		</Section>
	);
}

function Monthly({ months }: { months: EsgData["months"] }) {
	const [metric, setMetric] = useState<MonthMetric>("trips");
	const hasUnknown = months.some((m) => m.groups.unknownStop > 0);
	const emissionKnown = months.filter(
		(m) => m.operationalKgCo2e !== null || m.scenarioDifferenceKgCo2e !== null,
	).length;
	const partial = months.some((m) => m.unknownDistanceTrips > 0);
	const reasons = [...new Set(months.map((m) => m.reason))];
	return (
		<Section
			className="mt-4"
			title="每月觀測量與月度排放"
			subtitle="只有旅次與人公里是觀測；月度排放需要月度車公里或能源資料，目前沒有。"
			badges={<KindBadge kind="history" />}
		>
			<Segmented
				label="月度指標"
				value={metric}
				onChange={setMetric}
				options={[
					["trips", "旅次"],
					["pkm", "路網近似人公里"],
				]}
			/>
			<div className="mt-3">
				<MonthlyChart months={months} metric={metric} />
				<GroupLegend unknown={hasUnknown} />
				{metric === "pkm" && partial && (
					<p className="mt-1 text-[11px] text-[var(--sev-watch)]">
						部分月份有缺距離旅次，圖中只含已知距離的部分。
					</p>
				)}
			</div>
			<div
				className="mt-3 rounded-lg border border-[var(--line)] p-3 text-xs leading-relaxed"
				role="note"
			>
				<b>月度排放：</b>
				{emissionKnown === 0 ? (
					<>
						{months.length} 個月全部為 <b>無</b>（null）。{reasons.join("；")}。
					</>
				) : (
					<>{emissionKnown} 個月有值，其餘為無。</>
				)}
				未補值、未分攤。
			</div>
			<details className="mt-3 text-xs">
				<summary className="cursor-pointer text-[var(--fg2)]">
					展開 {months.length} 個月的數字表
				</summary>
				<div className="mt-2 overflow-x-auto">
					<table className="w-full min-w-[720px] text-left">
						<thead className="text-[var(--muted)]">
							<tr className="border-b border-[var(--line)]">
								<Th>月份</Th>
								<Th right>旅次</Th>
								<Th right>雙端在集合</Th>
								<Th right>至少一端在集合外</Th>
								<Th right>人公里（近似）</Th>
								<Th right>缺距離旅次</Th>
								<Th right>展示營運排放</Th>
								<Th right>情境差額</Th>
							</tr>
						</thead>
						<tbody>
							{months.map((m) => (
								<tr
									key={m.month}
									className="border-b border-[var(--line)] last:border-0"
								>
									<Td>{m.month}</Td>
									<Td right>{nf0.format(m.totalTrips)}</Td>
									<Td right>{nf0.format(m.groups.bothSpecifiedEndpoints)}</Td>
									<Td right>
										{nf0.format(m.groups.outsideSpecifiedEndpointSet)}
									</Td>
									<Td right>{orNone(m.totalPassengerKm, nf0.format)}</Td>
									<Td right>{nf0.format(m.unknownDistanceTrips)}</Td>
									<Td right>{orNone(m.operationalKgCo2e, nf0.format)}</Td>
									<Td right>{orNone(m.scenarioDifferenceKgCo2e, signed0)}</Td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</details>
		</Section>
	);
}

function Structure({ summary }: { summary: EsgData["summary"] }) {
	const ds = summary.dataset;
	const g = ds.groups;
	const p = ds.knownDistancePkmByGroup;
	const rows = [
		{
			label: "雙端均在指定端點集合",
			trips: g.bothSpecifiedEndpoints,
			pkm: p.bothSpecifiedEndpoints,
			color: SHARE_COLORS.both,
		},
		{
			label: "至少一端在集合外",
			trips: g.outsideSpecifiedEndpointSet,
			pkm: p.outsideSpecifiedEndpointSet,
			color: SHARE_COLORS.out,
		},
		{
			label: "未知站",
			trips: g.unknownStop,
			pkm: p.unknownStop,
			color: SHARE_COLORS.unknown,
		},
	];
	return (
		<Section
			className="mt-4"
			title="服務結構：指定端點集合"
			subtitle={`固定指定集合：${summary.specifiedEndpointSet.join("、")}。`}
			badges={<KindBadge kind="history" />}
		>
			<ShareBar
				parts={rows.map((r) => ({
					label: r.label,
					value: r.trips,
					color: r.color,
				}))}
			/>
			<div className="mt-2 overflow-x-auto">
				<table className="w-full min-w-[560px] text-left text-xs">
					<thead className="text-[var(--muted)]">
						<tr className="border-b border-[var(--line)]">
							<Th>分組</Th>
							<Th right>旅次</Th>
							<Th right>佔旅次</Th>
							<Th right>人公里（近似，已知部分）</Th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr
								key={r.label}
								className="border-b border-[var(--line)] last:border-0"
							>
								<td className="px-2 py-1.5">
									<span
										className="mr-1.5 inline-block size-2.5 rounded-sm align-middle"
										style={{ background: r.color }}
									/>
									{r.label}
								</td>
								<Td right>{nf0.format(r.trips)}</Td>
								<Td right>
									{ds.totalTrips > 0 ? pct1(r.trips / ds.totalTrips) : "無"}
								</Td>
								<Td right>{nf0.format(r.pkm)}</Td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="mt-2 max-w-[80ch] text-[11px] leading-relaxed text-[var(--muted)]">
				{summary.classificationCaveat}{" "}
				這只描述旅次的兩端是否落在這個指定集合，不是各支線的中間站分類，也不是公平性認證；不能由
				OD 推定通學、就業或觀光目的，也不能推論拒載或公平改善。
			</p>
		</Section>
	);
}

function DistanceMethod({
	summary,
	od,
}: {
	summary: EsgData["summary"];
	od: EsgData["od"];
}) {
	const methods = useMemo(() => {
		const m = new Map<string, { groups: number; trips: number }>();
		for (const o of od) {
			const e = m.get(o.method) ?? { groups: 0, trips: 0 };
			e.groups += 1;
			e.trips += o.tripCount;
			m.set(o.method, e);
		}
		return [...m.entries()].sort((a, b) => b[1].trips - a[1].trips);
	}, [od]);
	const top = useMemo(
		() => [...od].sort((a, b) => b.tripCount - a.tripCount).slice(0, 10),
		[od],
	);
	return (
		<Section
			className="mt-4"
			title="距離怎麼來的"
			subtitle={`${od.length} 組 OD + 支線聚合（${summary.coverage.observedDirectedPairs} 組有向站對）。距離缺失時為「無」，絕不當成 0。`}
			badges={
				<>
					<KindBadge kind="history" />
					<Chip tone="--k-unverified">近似，未核實繞行</Chip>
				</>
			}
		>
			<table className="w-full max-w-[720px] text-left text-xs">
				<thead className="text-[var(--muted)]">
					<tr className="border-b border-[var(--line)]">
						<Th>距離方法</Th>
						<Th right>OD/支線組數</Th>
						<Th right>旅次</Th>
					</tr>
				</thead>
				<tbody>
					{methods.map(([k, v]) => (
						<tr key={k} className="border-b border-[var(--line)] last:border-0">
							<Td>{METHOD_LABEL[k] ?? k}</Td>
							<Td right>{nf0.format(v.groups)}</Td>
							<Td right>{nf0.format(v.trips)}</Td>
						</tr>
					))}
				</tbody>
			</table>
			<details className="mt-3 text-xs">
				<summary className="cursor-pointer text-[var(--fg2)]">
					旅次最多的 10 組 OD/支線（核對用）
				</summary>
				<div className="mt-2 overflow-x-auto">
					<table className="w-full min-w-[560px] text-left">
						<thead className="text-[var(--muted)]">
							<tr className="border-b border-[var(--line)]">
								<Th>上車站</Th>
								<Th>下車站</Th>
								<Th>支線</Th>
								<Th right>旅次</Th>
								<Th right>距離 km（近似）</Th>
							</tr>
						</thead>
						<tbody>
							{top.map((o) => (
								<tr
									key={`${o.boardStop}|${o.alightStop}|${o.subroute}`}
									className="border-b border-[var(--line)] last:border-0"
								>
									<Td>{o.boardStop}</Td>
									<Td>{o.alightStop}</Td>
									<Td>{o.subroute}</Td>
									<Td right>{nf0.format(o.tripCount)}</Td>
									<Td right>{orNone(o.distanceKm, nf3.format)}</Td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</details>
		</Section>
	);
}

function Presets({
	data,
	presets,
}: {
	data: EsgData;
	presets: EsgData["presets"];
}) {
	return (
		<Section
			className="mt-4"
			title="預先計算的三個展示點"
			subtitle={`以預設假設與獨立輸入 ${nf0.format(data.inputVehicleKm)} 車公里計算（${data.summary.demonstrationSource}）。與上方計算工具同一組函式；載入時已與重算結果交叉核對。`}
			badges={
				<>
					<KindBadge kind="scenario" />
					<Chip tone="--sev-review">獨立假設展示</Chip>
				</>
			}
		>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[680px] text-left text-xs">
					<thead className="text-[var(--muted)]">
						<tr className="border-b border-[var(--line)]">
							<Th>展示點</Th>
							<Th right>柴油燃燒 kg</Th>
							<Th right>購電 kg</Th>
							<Th right>展示營運合計 kg</Th>
							<Th right>情境差額 kg</Th>
							<Th right>基線 ÷ 營運</Th>
						</tr>
					</thead>
					<tbody>
						{presets.map((p) => (
							<tr
								key={p.id}
								className="border-b border-[var(--line)] last:border-0"
							>
								<Td>{p.name}</Td>
								<Td right>{nf0.format(p.fuelCombustionKgCo2e)}</Td>
								<Td right>{nf0.format(p.purchasedElectricityKgCo2e)}</Td>
								<Td right>{nf0.format(p.totalOperationalKgCo2e)}</Td>
								<Td right>{orNone(p.scenarioDifferenceKgCo2e, signed0)}</Td>
								<Td right>
									{orNone(
										p.baselineToOperationalRatio,
										(n) => `${nf1.format(n)} 倍`,
									)}
								</Td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="mt-2 max-w-[80ch] text-[11px] leading-relaxed text-[var(--muted)]">
				三列只是電動化率不同的展示；不是政策比較、不是最優、不是減量成果。差額與倍數取決於未校準的運具強度與分流，且獨立於
				Scope 1/2/3，不抵扣盤查。
			</p>
		</Section>
	);
}

function Factors({ summary }: { summary: EsgData["summary"] }) {
	const entries = FACTOR_KEYS.map((k) => [k, summary.factors[k]] as const);
	return (
		<Section
			className="mt-4"
			title="係數與假設逐項標註"
			subtitle={summary.statusNote}
			badges={
				<>
					<KindBadge kind="official" />
					<KindBadge kind="scenario" />
				</>
			}
		>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[820px] text-left text-xs">
					<thead className="text-[var(--muted)]">
						<tr className="border-b border-[var(--line)]">
							<Th>項目</Th>
							<Th right>數值</Th>
							<Th>單位</Th>
							<Th>身分</Th>
							<Th>年度</Th>
							<Th>邊界</Th>
							<Th>說明與來源</Th>
						</tr>
					</thead>
					<tbody>
						{entries.map(([key, f]) => (
							<tr
								key={key}
								className="border-b border-[var(--line)] align-top last:border-0"
							>
								<Td>{f.name}</Td>
								<Td right>{nf3.format(f.value)}</Td>
								<Td>{f.unit}</Td>
								<td className="px-2 py-1.5">
									{f.status === "official" ? (
										<Chip tone="--k-official">官方</Chip>
									) : (
										<Chip tone="--k-unverified">假設</Chip>
									)}
								</td>
								<Td>{f.year ?? "無"}</Td>
								<td className="px-2 py-1.5">
									{BOUNDARY_LABEL[f.boundary] ?? f.boundary}
								</td>
								<td className="px-2 py-1.5 leading-relaxed text-[var(--fg2)]">
									{f.notes}
									{f.status === "official" && f.sourceUrl && (
										<>
											{" "}
											<a
												href={f.sourceUrl}
												target="_blank"
												rel="noreferrer"
												className="underline decoration-[var(--axis)] underline-offset-2"
											>
												官方來源
											</a>
										</>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="mt-2 max-w-[80ch] text-[11px] leading-relaxed text-[var(--muted)]">
				其他設定：柴油 3.2 km/L、電耗 0.95 kWh/km、空駛倍率 1.08、分流
				48/24/16/12（小客車/機車/其他公運/新增需求）全部是未校準的可調假設；汽油係數目前未參與計算。
			</p>
		</Section>
	);
}

function Footer({ summary }: { summary?: EsgData["summary"] }): ReactNode {
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
			{summary && (
				<Section className="mt-4" title="資料出處與重現">
					<Provenance
						source={`${summary.dataset.source}；四份 JSON：${Object.values(FILES).join("、")}（schemaVersion 2）`}
						dataThrough={summary.dataset.lastRecordedDate}
						generatedAt={summary.generatedAt}
						command="bun scripts/lab/esg/run-analysis.ts（需 DATABASE_URL/DATABASE_TOKEN，只做 SELECT 聚合）；驗證：bun scripts/lab/esg/verify-artifacts.ts"
					/>
				</Section>
			)}
		</>
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
