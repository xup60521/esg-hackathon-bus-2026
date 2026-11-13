import { CircleCheck, CircleX } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
	Chip,
	FreshnessBanner,
	KindBadge,
	LimitationList,
	Provenance,
	Section,
	type Source,
	SourceList,
	Stat,
} from "#/components/lab/shared";
import { GapChart } from "./occupancy/GapChart";
import { ScenarioExplorer } from "./occupancy/ScenarioExplorer";
import {
	type OccupancySummary,
	parseSummary,
	windowLastDate,
} from "./occupancy/types";

const DATA_URL = "/data/lab/occupancy/summary.json";
const nf = new Intl.NumberFormat("en-US");
const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/**
 * Whole-database read-only audit, copied from docs/lab/occupancy/database-audit.json
 * (queriedAt 2026-11-03T16:56:53Z). It is not part of summary.json.
 */
const DB_AUDIT = {
	vehicleValues: 122,
	secondPrecisionRows: 1_770_855,
	firstDate: "2024-01-01",
	lastDate: "2025-12-31",
};

const MISSING = [
	"正式服務班次識別（service / trip id）",
	"逐班車型與合法可用座位容量",
	"站點排隊、候車人數",
	"拒載、客滿未上車紀錄",
	"非電子票證乘客（現金、免票等）與訂位保留席",
	"車輛欄位值與實體車輛的唯一對應",
];

const NEXT_DATA = [
	"營運方歷史班表與 GPS 軌跡：先驗證「候選群組 → 實際班次」的對應與誤配率。",
	"逐班實際車型與合法可用座位（含訂位保留席）：取代 30／40／50 這組參數容量。",
	"非票證乘客數：目前只看得到成功刷卡者，無法估全車人數。",
	"排隊、拒載或人工抽樣：要談中間站服務缺口，必須有未上車需求的證據。",
	"車輛欄位值與實體車輛的唯一對應表，以及更長期間（不只 2025 年 1 月）的樣本。",
];

const SOURCES: Source[] = [
	{
		label: "觀光署台灣好行日月潭線介紹",
		url: "https://www.taiwantrip.com.tw/Frontend/Route/Select_p?RouteID=R0005",
		accessed: "2026-11-04",
		evidence:
			"說明各支線停靠差異、多種付款方式，以及客滿或訂位保留席影響中間站載客。支持補非票證與訂位資料的必要，不能量化歷史拒載。",
	},
	{
		label: "觀光署台灣好行票價與時刻表",
		url: "https://www.taiwantrip.com.tw/Frontend/Bustime/TimeTable/R0005",
		accessed: "2026-11-04",
		evidence:
			"現行逐站時刻表與 2026-11-01 異動資訊；6670E 註記九人座車輛。不能將現行容量或時刻回填歷史；30／40／50 情境也不適用所有支線。",
	},
	{
		label: "TDX 公車動態資料注意事項",
		url: "https://motc-ptx.gitbook.io/tdx-zi-liao-shi-yong-kui-hua-bao-dian/data_notice/public_transportation_data/bus_dynamic_data",
		accessed: "2026-11-04",
		evidence:
			"更新模式與資料傳遞延遲須另行處理。GPS 是可補的歸班證據，不是直接載客計數；本次未驗證 6670 API 歷史覆蓋。",
	},
	{
		label: "docs/lab/occupancy/report.zh-TW.md",
		accessed: "2026-11-04",
		evidence: "本方向研究報告：資料盤點、方法、結果與限制（本機檔案）。",
	},
	{
		label: "docs/lab/occupancy/database-audit.json",
		accessed: "2026-11-04",
		evidence:
			"全庫唯讀彙總查驗結果與完整 SQL（本機檔案）；不含車輛值與逐筆紀錄。",
	},
	{
		label: "docs/lab/occupancy/local-audit.json",
		accessed: "2026-11-04",
		evidence: "本機小時彙總的列數、人次與來源 SHA-256 記錄（本機檔案）。",
	},
	{
		label: "public/data/lab/occupancy/summary.json",
		accessed: "2026-11-04",
		evidence: "本頁所有候選診斷與 18 個分流情境數字的直接來源（本機檔案）。",
	},
];

const LIMITATIONS = [
	"只有 2025 年 1 月一個月，不代表全年或其他月份。",
	"vehicle 欄位值未經驗證為唯一實體車輛；同車輛值跨支線或方向的時間重疊確實存在。",
	"站序回退與跨群重疊同時存在，所以「候選群組」不是官方班次，也不能當作班次數。",
	"合併間隔改變會改變切分結果，顯示逐班認定本身有不確定性；無旗標不等於驗證通過。",
	"同步配對票證峰值只計成功刷卡且配對到上下車的旅次，不含非票證乘客、未上車者與排隊，不是全車人數或載客率。",
	"示範候選是從零間隔、無旗標、至少 20 筆的候選中刻意挑出的最高值個案，不代表整月或平均。",
	"30／40／50 為可調整的情境參數，不是車隊規格；容量缺失。",
	"分流情境假設平行車在同時間、同路段、同站間提供相同服務；沒有距離、空駛、車庫、司機工時、成本與排放資料。",
	"額外車數是上限，不代表已動用；不增加成功搭乘數，不模擬未上車需求，不證明效益。",
	"南投客運官方班表頁本次開啟回傳 502，未取得完整班表，也未匯入營運班表。",
];

/** Copied verbatim from the 「驗證與重現」 section of docs/lab/occupancy/report.zh-TW.md. */
const REPRO_COMMANDS = [
	"bun scripts/lab/occupancy/probe.ts",
	"bun scripts/lab/occupancy/analyze.ts",
	"bun test src/features/lab/occupancy/model.test.ts",
	"bun scripts/lab/occupancy/verify.ts",
	"bun node_modules/typescript/bin/tsc --ignoreConfig --noEmit --skipLibCheck --module esnext --moduleResolution bundler --target es2022 --types bun src/features/lab/occupancy/model.ts src/features/lab/occupancy/model.test.ts scripts/lab/occupancy/analyze.ts scripts/lab/occupancy/probe.ts scripts/lab/occupancy/verify.ts",
].join("\n");

type LoadState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; data: OccupancySummary };

function useSummary(): LoadState {
	const [state, setState] = useState<LoadState>({ status: "loading" });
	useEffect(() => {
		const ctrl = new AbortController();
		(async () => {
			try {
				const res = await fetch(DATA_URL, { signal: ctrl.signal });
				if (!res.ok) throw new Error(`HTTP ${res.status}（${DATA_URL}）`);
				let json: unknown;
				try {
					json = await res.json();
				} catch {
					throw new Error("資料不是有效的 JSON");
				}
				setState({ status: "ready", data: parseSummary(json) });
			} catch (e) {
				if (ctrl.signal.aborted) return;
				setState({
					status: "error",
					message: e instanceof Error ? e.message : String(e),
				});
			}
		})();
		return () => ctrl.abort();
	}, []);
	return state;
}

function directionLabel(d: string): string {
	if (d === "inbound") return "回程（inbound）";
	if (d === "outbound") return "去程（outbound）";
	return d;
}

function Header() {
	return (
		<header>
			<div className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
				6670 研究實驗室 · 方向 5
			</div>
			<h1 className="mt-1 text-2xl font-bold">
				車輛載客率：逐班重建可行性與分流情境
			</h1>
			<p className="mt-2 max-w-[80ch] text-sm leading-relaxed text-[var(--fg2)]">
				現有資料可以做「同車輛值的同步配對票證峰值」診斷，但沒有班次識別、容量與非票證乘客，無法重建真正的載客率。
				本頁先盤點資料能與不能支撐什麼，再呈現 2025 年 1
				月的候選群組品質，最後以參數容量展示有界的旅次搬移情境。
			</p>
			<div className="mt-3 flex flex-wrap items-center gap-1.5">
				<KindBadge kind="history" />
				<KindBadge kind="unverified" />
				<KindBadge kind="scenario" />
			</div>
			<div className="mt-2 flex flex-wrap items-center gap-1.5">
				<Chip tone="--k-unverified">未驗證候選</Chip>
				<Chip tone="--k-history">2025 年 1 月資料</Chip>
				<Chip tone="--k-scenario">容量假設</Chip>
				<Chip tone="--k-unverified">同步配對票證峰值非全車人數</Chip>
			</div>
		</header>
	);
}

function StatusBox({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="panel mt-4 p-4 text-sm" aria-live="polite">
			<div className="font-semibold">{title}</div>
			<div className="mt-1 text-xs leading-relaxed text-[var(--fg2)]">
				{children}
			</div>
		</div>
	);
}

function FeasibilitySection({ d }: { d: OccupancySummary }) {
	return (
		<Section
			title="(a) 資料可行性盤點：有什麼、沒有什麼"
			subtitle="全庫數字來自唯讀彙總查驗；欄位存在不等於可以還原載客率。"
			badges={<KindBadge kind="history" />}
		>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<Stat
					label="全庫旅次"
					value={nf.format(d.local.boardings)}
					sub="2024-01-01 至 2025-12-31"
				/>
				<Stat
					label="車輛欄位不同值"
					value={nf.format(DB_AUDIT.vehicleValues)}
					sub={`2025 年 1 月窗口內 ${nf.format(d.vehicleValues)} 個；未驗證為實體車輛`}
				/>
				<Stat
					label="秒級上車時間旅次"
					value={nf.format(DB_AUDIT.secondPrecisionRows)}
					sub="上車秒數非整分鐘；僅證明儲存精度，不證明刷卡機時鐘準確"
				/>
				<Stat
					label="有旅次日期"
					value={nf.format(d.local.activeDates)}
					sub="其餘日期不代表停駛或零需求"
				/>
			</div>
			<div className="mt-3 grid gap-3 md:grid-cols-2">
				<div className="rounded-lg border border-[var(--line)] p-3">
					<h3 className="flex items-center gap-1.5 text-xs font-semibold">
						<CircleCheck className="size-3.5" aria-hidden="true" />
						資料庫「有」的欄位
					</h3>
					<ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-[var(--fg2)]">
						<li>
							車輛欄位（{nf.format(DB_AUDIT.vehicleValues)}{" "}
							個不同值，無空白、無常見占位值）。
						</li>
						<li>
							配對的上車與下車時間，秒級儲存，無缺失、無倒序、無零秒旅次。
						</li>
						<li>
							上車站與下車站、支線；共 {nf.format(d.local.boardings)} 筆旅次。
						</li>
					</ul>
				</div>
				<div className="rounded-lg border border-[var(--line)] p-3">
					<h3 className="flex items-center gap-1.5 text-xs font-semibold">
						<CircleX className="size-3.5" aria-hidden="true" />
						資料庫「沒有」的資訊
					</h3>
					<ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-[var(--fg2)]">
						{MISSING.map((m) => (
							<li key={m}>沒有：{m}</li>
						))}
					</ul>
				</div>
			</div>
			<p className="mt-3 max-w-[80ch] text-xs leading-relaxed text-[var(--fg2)]">
				公開的小時彙總（{nf.format(d.local.rows)} 列）
				{d.local.reconstructable ? "可" : "不能"}
				用來重建逐班載客：{d.local.reason}
				不得把同小時上車數當成一班乘客數，也不能把不同支線合成單一服務。
			</p>
		</Section>
	);
}

function CandidateSection({ d }: { d: OccupancySummary }) {
	const ex = d.exclusions;
	return (
		<Section
			title="(b) 2025 年 1 月候選群組診斷"
			subtitle="以車輛值、支線、推定方向，依合併間隔把旅次切成候選群組。"
			badges={
				<>
					<KindBadge kind="history" />
					<KindBadge kind="unverified" />
				</>
			}
		>
			<div
				className="rounded-lg border p-3 text-xs leading-relaxed"
				style={{
					borderColor:
						"color-mix(in srgb, var(--k-unverified) 55%, transparent)",
					background:
						"color-mix(in srgb, var(--k-unverified) 10%, transparent)",
				}}
			>
				<b>候選群組，不是實際班次。</b>
				車輛欄位值未驗證為唯一實體車輛；站序回退與同車輛值跨支線或方向的時間重疊都確實存在；合併間隔不同，切出的數量也不同。
				下表的數字是資料品質診斷，不能當作班次數。
			</div>

			<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
				<Stat
					label="1 月原始旅次"
					value={nf.format(d.window.records)}
					sub={`${d.window.from} 起、${d.window.to} 前（上車日期）`}
				/>
				<Stat
					label="排除"
					value={nf.format(ex.invalidOrOverSixHourTime + ex.sameStop)}
					sub={`超過六小時或時間異常 ${nf.format(ex.invalidOrOverSixHourTime)}；同站 ${nf.format(ex.sameStop)}`}
				/>
				<Stat
					label="保留旅次"
					value={nf.format(d.retainedTaps)}
					sub="進入候選分群"
				/>
				<Stat
					label="跨支線或方向重疊旅次"
					value={nf.format(d.conflictingTaps)}
					sub={`${nf.format(d.conflictingCrossGroupIntervalPairs)} 對區間重疊；成因未辨別`}
				/>
			</div>

			<div className="mt-3 overflow-x-auto">
				<table className="w-full min-w-[760px] border-collapse text-xs tabular-nums">
					<caption className="pb-1.5 text-left text-[11px] text-[var(--muted)]">
						旗標可互相重疊，各欄不可直接相加；無旗標不等於驗證通過。
					</caption>
					<thead>
						<tr className="border-b border-[var(--line)] text-[var(--muted)]">
							{[
								"合併間隔（分鐘）",
								"候選群組",
								"站序回退",
								"跨群重疊",
								"超過 4 小時",
								"單筆群組",
								"無旗標候選",
								"無旗標內旅次",
								"峰值中位數",
								"峰值 P95",
								"峰值最大",
							].map((h, i) => (
								<th
									key={h}
									scope="col"
									className={`px-2 py-1.5 font-medium ${i === 0 ? "text-left" : "text-right"}`}
								>
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{d.sensitivity.map((r) => (
							<tr
								key={r.gapMinutes}
								className="border-b border-[var(--line)] last:border-0"
							>
								<th scope="row" className="px-2 py-1.5 text-left font-semibold">
									{r.gapMinutes}
								</th>
								<td className="px-2 py-1.5 text-right">
									{nf.format(r.candidates)}
								</td>
								<td className="px-2 py-1.5 text-right">
									{nf.format(r.stationRegressionCandidates)}
								</td>
								<td className="px-2 py-1.5 text-right">
									{nf.format(r.crossGroupConflictCandidates)}
								</td>
								<td className="px-2 py-1.5 text-right">
									{nf.format(r.overFourHourCandidates)}
								</td>
								<td className="px-2 py-1.5 text-right">
									{nf.format(r.singletons)}
								</td>
								<td className="px-2 py-1.5 text-right">
									{nf.format(r.diagnosticEligibleCandidates)}
								</td>
								<td className="px-2 py-1.5 text-right">
									{nf.format(r.diagnosticEligibleTaps)}
								</td>
								<td className="px-2 py-1.5 text-right">
									{nf.format(r.observedPeakP50)}
								</td>
								<td className="px-2 py-1.5 text-right">
									{nf.format(r.observedPeakP95)}
								</td>
								<td className="px-2 py-1.5 text-right">
									{nf.format(r.observedPeakMax)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="mt-1.5 text-[11px] leading-relaxed text-[var(--muted)]">
				峰值欄位是同步配對票證區間峰值的分布，不是容量、載客率或全車乘客數。
			</p>

			<div className="mt-3">
				<GapChart rows={d.sensitivity} />
			</div>
		</Section>
	);
}

function DemoSection({ d }: { d: OccupancySummary }) {
	const c = d.selectedCandidate;
	return (
		<Section
			title="(c) 示範候選：同步配對票證峰值最高的個案"
			subtitle="從零間隔、無診斷旗標、至少 20 筆的候選中，刻意挑出同步配對票證峰值最高者；不代表整月或平均。"
			badges={
				<>
					<KindBadge kind="history" />
					<KindBadge kind="unverified" />
				</>
			}
		>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
				<Stat label="日期" value={c.date} sub="Asia/Taipei" />
				<Stat
					label="支線與方向"
					value={c.route}
					sub={directionLabel(c.direction)}
				/>
				<Stat
					label="配對旅次"
					value={nf.format(c.matchedTaps)}
					sub="成功刷卡且配對的上下車區間"
				/>
				<Stat
					label="候選時間跨度"
					value={`${nf1.format(c.durationMinutes)} 分`}
					sub="首筆上車到末筆下車"
				/>
				<Stat
					label="同步配對票證峰值（非全車人數）"
					value={nf.format(c.peakMatchedIntervals)}
					sub={`站序逆行 ${nf.format(c.stationInversions)} 次`}
				/>
			</div>
			<div className="mt-3 max-w-[80ch] space-y-2 text-xs leading-relaxed text-[var(--fg2)]">
				<p>
					<b className="text-[var(--fg)]">同步配對票證峰值（非全車人數）</b>
					：同一時刻有效的配對上下車區間數，只計成功刷卡者，不含非票證乘客、未上車者與排隊。
				</p>
				<p>
					峰值等於全部 {nf.format(c.matchedTaps)}{" "}
					筆配對旅次，表示這些區間存在共同的重疊時刻；但候選跨度長達{" "}
					{nf1.format(c.durationMinutes)} 分鐘，仍須對照官方班表與
					GPS，才知道它是否為同一輛車的一班車。即使沒有診斷旗標，這個高值也不能據此判定實際超載或載客率。
				</p>
				<p>
					全月零間隔候選的同步票證峰值：中位數{" "}
					{nf.format(d.sensitivity[0].observedPeakP50)}、第 95 百分位{" "}
					{nf.format(d.sensitivity[0].observedPeakP95)}、最大{" "}
					{nf.format(d.sensitivity[0].observedPeakMax)}
					。示範個案落在最大值，是刻意挑出的極端案例。
				</p>
			</div>
		</Section>
	);
}

function ScenarioSection({ d }: { d: OccupancySummary }) {
	return (
		<Section
			title="(d) 分流情境：參數容量下的旅次搬移"
			subtitle="只針對上述示範候選。容量為 30／40／50 的參數，並非車隊規格；把整筆旅次搬到假設的平行車，原上下車站與時間不變。"
			badges={
				<>
					<KindBadge kind="scenario" />
					<KindBadge kind="unverified" />
				</>
			}
		>
			<ul className="mb-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-[var(--fg2)]">
				<li>
					<b className="text-[var(--fg)]">額外車數上限</b>
					：最多可使用的假設平行車，不代表實際動用；
					兩種政策：全起點分流（所有旅次皆可搬移）、中段起點分流（只搬在候選已觀測站點範圍內部上車的旅次；「中段」不是正式全線端點認證）。
				</li>
				<li>
					不含非票證乘客與未上車需求，不增加成功搭乘數；規則是固定排序的
					first-fit 啟發式，未證明全域最優。
				</li>
				<li>
					不計算改善百分比。表中「峰值 ÷ 參數容量」是 JSON
					提供的情境算術比值，不是實測載客率，也不代表拒載或候車改善。
				</li>
			</ul>
			<ScenarioExplorer scenarios={d.scenarios} />
			<p className="mt-3 max-w-[80ch] text-xs leading-relaxed text-[var(--fg2)]">
				容量未知（30／40／50 僅為參數）：
				上述情境只說明「若容量為此參數，需要搬走多少旅次才讓原車峰值不高於參數」，不能證明平行車可以執行，也無法估算營運成本、候車改善或淨減碳。
			</p>
		</Section>
	);
}

export default function OccupancyView() {
	const state = useSummary();
	return (
		<div>
			<Header />
			{state.status === "loading" && (
				<StatusBox title="載入中">正在讀取 {DATA_URL}…</StatusBox>
			)}
			{state.status === "error" && (
				<div className="panel mt-4 p-4 text-sm" role="alert">
					<div className="font-semibold">無法顯示本方向資料</div>
					<div className="mt-1 text-xs leading-relaxed text-[var(--fg2)]">
						讀取或解析 {DATA_URL} 失敗：{state.message}
					</div>
				</div>
			)}
			{state.status === "ready" && <Loaded d={state.data} />}
		</div>
	);
}

function Loaded({ d }: { d: OccupancySummary }) {
	const through = windowLastDate(d.window.to);
	return (
		<>
			<div className="mt-4">
				<FreshnessBanner
					dataThrough={through}
					what="資料窗口"
					note="本頁資料為 2025 年 1 月的歷史樣本，不是即時資料，也不代表全年；所有「峰值」都是歷史配對票證的回放診斷。"
				/>
			</div>
			<div className="mt-4">
				<FeasibilitySection d={d} />
			</div>
			<div className="mt-4">
				<CandidateSection d={d} />
			</div>
			<div className="mt-4">
				<DemoSection d={d} />
			</div>
			<div className="mt-4">
				<ScenarioSection d={d} />
			</div>
			<Section
				className="mt-4"
				title="下一步需要的資料"
				badges={<KindBadge kind="unverified" />}
			>
				<LimitationList items={NEXT_DATA} />
			</Section>
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
			<Section className="mt-4" title="資料出處與重現">
				<Provenance
					source={`public/data/lab/occupancy/summary.json（由小時彙總 ${d.local.path} 與 2025 年 1 月資料庫窗口產生；${d.local.path} 的 SHA-256：${d.local.sha256}，記錄於 docs/lab/occupancy/local-audit.json）`}
					dataThrough={through}
					generatedAt={d.generatedAt}
				/>
				<div className="mt-2 text-xs">
					<div className="mb-1 text-[var(--muted)]">
						重現指令（引自報告「驗證與重現」；兩個資料庫腳本需要既有環境變數，不要貼進命令列）
					</div>
					<pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-[var(--chip)] px-2 py-1.5">
						<code>{REPRO_COMMANDS}</code>
					</pre>
				</div>
			</Section>
		</>
	);
}
