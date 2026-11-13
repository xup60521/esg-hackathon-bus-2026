import { type ReactNode, useCallback, useState } from "react";
import {
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
import type { BehaviorAnalysisSummary } from "#/features/lab/behavior";
import { StatusBox } from "./behavior/common";
import {
	DEFAULT_FILTERS,
	type Filters,
	fmtInt,
	fmtPct,
	ratio,
} from "./behavior/explore";
import {
	type BehaviorData,
	DATA_URLS,
	type TicketGroupId,
} from "./behavior/model";
import { OdExplorer } from "./behavior/OdExplorer";
import { RulesPanel } from "./behavior/RulesPanel";
import { TicketPanel } from "./behavior/TicketPanel";
import { DEFAULT_TIME, TimePanel, type TimeState } from "./behavior/TimePanel";
import { useBehaviorData } from "./behavior/useBehaviorData";

const SOURCES: Source[] = [
	{
		label: "docs/lab/behavior/report.zh-TW.md（方向 4 分析口徑）",
		accessed: "2026-11-04",
		evidence:
			"資料窗口、時長有效樣本（180 秒至 6 小時）、同站待查、週末、AM／PM 窗口與票種名稱優先序的定義；以及人工依序規則與已執行的對帳結果。",
	},
	{
		label: "docs/lab/behavior/integration.zh-TW.md（整合契約 v2）",
		accessed: "2026-11-04",
		evidence:
			"schemaVersion 2 欄位語義：allOdPairs 才是完整 OD、平均時長可為 null、票種五組互斥且保留 other、legacy 識別碼不代表用途。",
	},
	{
		label: "public/data/lab/behavior/ 三份 JSON（本頁唯一資料來源）",
		accessed: "2026-11-04",
		evidence:
			"od-behavior-summary.json（完整 OD 與規則組）、od-clusters.json（規則組彙總）、temporal-behavior.json（每小時；僅前 10 OD）。載入時逐欄驗證並互相對帳。",
	},
	{
		label: "src/db/schema.ts（trips 表）",
		accessed: "2026-11-04",
		evidence:
			"來源是電子票證旅次表；schema 不存卡號或駕駛識別碼，所以本頁不能追蹤個人、回程或轉乘。",
	},
];

const LIMITATIONS = [
	"每一筆是一次成功完成刷卡的單程旅次，不是完整需求：不含因客滿未上車、放棄候車、現金或紙票乘客；上車刷卡時間也不是開始候車的時間。",
	"沒有卡號，無法跨旅次追蹤同一個人，所以不能算回程率、回訪率、轉乘或一日遊路徑；方向相反的兩個 OD 也不能當成同一批人。",
	"規則組是 ordered_manual_rules 人工依序規則，不是 ML 聚類，沒有訓練或準確率；門檻（25%、50 分鐘、1,000 筆）是人工設定，沒有外部標註驗證。組名只描述站點與門檻，不是搭乘目的、人口或族群。",
	"票種是「票種名稱」的字面分組，不是乘客身分、年齡或法定資格；other 為其餘未分類名稱，保留獨立一列。",
	"「週六日」只計星期六與星期日，沒有套用政府假日日曆，也不是公車的假日班表；AM（06–09 時）與 PM（16–19 時）是預先指定的分析窗口，不代表已驗證的實際尖峰。",
	"平均時長只用 3 分鐘至 6 小時的有效樣本，由精確秒數加總後再四捨五入；沒有有效樣本時顯示「無」，不補 0。短於 3 分可能是真實短途，不代表誤刷。",
	"同站 OD（上下車站相同）列為待查，原因未知；它與「短於 3 分」是兩個不同條件，兩者有重疊，不能相加成互斥總數。",
	"時段檔只有旅次最多的 10 組 OD；規則組代表 OD 只列前 5 組。完整 OD 以 allOdPairs 為準。",
	"全部數字是 2024-01-01 至 2025-12-31 的歷史聚合，非即時；對帳只證明這份快照內的聚合一致，不證明上游沒有漏檔，也不證明每列都是真實搭乘。",
];

type Tab = "od" | "rules" | "tickets" | "time";
const TABS: [Tab, string][] = [
	["od", "OD 探索"],
	["rules", "人工規則組"],
	["tickets", "票種名稱"],
	["time", "時段"],
];

function Header() {
	return (
		<header>
			<div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
				6670 研究實驗室 · 旅客搭乘行為
			</div>
			<h1 className="mt-1 text-2xl font-bold">
				OD、人工規則組、票種與時段探索
			</h1>
			<p className="mt-2 max-w-[80ch] text-sm leading-relaxed text-[var(--fg2)]">
				<b className="text-[var(--fg)]">
					這裡看的是「刷卡留下的單程旅次」，不是完整需求。
				</b>
				可以瀏覽全部
				OD、依人工規則分出的六組、票種名稱組成與上車小時；沒有卡號，所以看不到同一個人的往返或轉乘，也不推論搭乘目的。
			</p>
			<div className="mt-3 flex flex-wrap items-center gap-1.5">
				<KindBadge kind="history" />
			</div>
		</header>
	);
}

function Overview({ s }: { s: BehaviorAnalysisSummary }) {
	const q = s.qualityEvidence;
	const d = s.durationAnomalies;
	const passed = Object.values(s.reconciliation).filter(Boolean).length;
	const checks = Object.keys(s.reconciliation).length;
	return (
		<Section
			className="mt-4"
			title="資料範圍與品質"
			subtitle={`來源是 trips 表的聚合結果（不含逐筆旅次與卡號）。上車日期以 Asia/Taipei 計，窗口 ${s.dateRange.start} 至 ${s.dateRange.end}。`}
			badges={<KindBadge kind="history" />}
		>
			<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
				<Stat
					label="旅次（有上下車站）"
					value={fmtInt(s.validOdTripsCount)}
					sub={`全部 ${fmtInt(s.totalTrips)} 筆；缺上車站 ${fmtInt(q.missing_board_stop ?? 0)}、缺下車站 ${fmtInt(q.missing_alight_stop ?? 0)}`}
				/>
				<Stat
					label="OD 組數"
					value={fmtInt(s.allOdPairs.length)}
					sub="allOdPairs 完整列表，不是前 30"
				/>
				<Stat
					label="有紀錄日數"
					value={fmtInt(s.activeDatesCount)}
					sub={`${s.dateRange.start} 至 ${s.dateRange.end}；不是營運日，也不保證連續`}
				/>
				<Stat
					label="同站 OD（待查）"
					value={fmtInt(s.sameStopOdCount)}
					sub={`占 ${fmtPct(ratio(s.sameStopOdCount, s.validOdTripsCount))}；原因未知`}
				/>
			</div>
			<ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-[var(--fg2)]">
				<li>
					平均時長的有效樣本 {fmtInt(q.valid_dur_count ?? 0)}{" "}
					筆；分析排除窗口：短於 3 分 {fmtInt(d.under3Min)}、超過 6 小時{" "}
					{fmtInt(d.over6Hours)}、零或負值{" "}
					{fmtInt(d.zeroDuration + d.negativeDuration)}
					。排除只影響時長平均，旅次、票種與小時計數都保留。
				</li>
				<li>
					同站 OD {fmtInt(s.sameStopOdCount)} 筆中，有{" "}
					{fmtInt(q.same_stop_under3 ?? 0)} 筆同時短於 3
					分。兩個條件重疊，不能相加。
				</li>
				<li>
					載入時再算一次：OD 合計、規則組、票種、小時、支線、時長總秒數等{" "}
					{checks} 項對帳在資料檔內{" "}
					{passed === checks ? "全部通過" : `只通過 ${passed} 項`}
					，且三個檔案屬同一快照（產生時間 {s.generatedAt}）。
				</li>
			</ul>
		</Section>
	);
}

function Workbench({ data }: { data: BehaviorData }) {
	const { summary: s, temporal } = data;
	const [tab, setTab] = useState<Tab>("od");
	const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
	const [time, setTime] = useState<TimeState>(DEFAULT_TIME);
	const patchFilters = useCallback(
		(p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p })),
		[],
	);
	const patchTime = useCallback(
		(p: Partial<TimeState>) => setTime((t) => ({ ...t, ...p })),
		[],
	);
	const openGroup = (clusterId: number) => {
		setFilters({ ...DEFAULT_FILTERS, group: clusterId });
		setTab("od");
	};
	const openGroupTicket = (clusterId: number, ticket: TicketGroupId) => {
		setFilters({
			...DEFAULT_FILTERS,
			group: clusterId,
			ticket,
		});
		setTab("od");
	};

	const panel: Record<
		Tab,
		{ title: string; subtitle: string; body: ReactNode }
	> = {
		od: {
			title: `OD 探索：完整 ${s.allOdPairs.length} 組`,
			subtitle:
				"列出 allOdPairs 全部 OD，不是前 30 名。點 OD 名稱展開每小時、票種與支線；欄位標題可排序，未知值永遠排最後。",
			body: (
				<OdExplorer summary={s} filters={filters} onChange={patchFilters} />
			),
		},
		rules: {
			title: "人工依序規則組（非 ML）",
			subtitle:
				"ordered_manual_rules：由人工訂的六條規則依序判斷，沒有訓練、形心或準確率。",
			body: <RulesPanel summary={s} onOpenGroup={openGroup} />,
		},
		tickets: {
			title: "票種名稱組成",
			subtitle:
				"五組互斥、合計等於旅次；是票種名稱的字面分組，不是乘客身分或搭乘目的。",
			body: <TicketPanel summary={s} onOpenGroup={openGroupTicket} />,
		},
		time: {
			title: "上車時段分布",
			subtitle:
				"依上車小時合計 2024–2025 全部日期；可標示 AM、PM 或自訂窗口，看窗口內旅次占範圍旅次的比例。",
			body: (
				<TimePanel
					summary={s}
					temporal={temporal}
					state={time}
					onChange={patchTime}
				/>
			),
		},
	};
	const active = panel[tab];

	return (
		<>
			<FreshnessBanner
				dataThrough={s.dateRange.end}
				what="資料涵蓋的最後一個上車日"
				note="資料窗口為 2024-01-01 至 2025-12-31，屬歷史聚合，不是即時。"
			/>
			<Overview s={s} />
			<section className="mt-4">
				<Segmented<Tab>
					label="探索面向"
					value={tab}
					onChange={setTab}
					options={TABS}
				/>
			</section>
			<Section
				className="mt-3"
				title={active.title}
				subtitle={active.subtitle}
				badges={<KindBadge kind="history" />}
			>
				{active.body}
			</Section>

			<Section
				className="mt-4"
				title="不能從這份資料回答的事"
				subtitle="以下三項由資料檔的可行性欄位原文列出。"
			>
				<LimitationList
					items={[
						s.feasibility.reasons.returnTripTracking,
						s.feasibility.reasons.transferChain,
						s.feasibility.reasons.cardTapLimitation,
					]}
				/>
			</Section>
			<Section className="mt-4" title="來源">
				<SourceList sources={SOURCES} />
			</Section>
			<Section className="mt-4" title="限制">
				<LimitationList items={LIMITATIONS} />
			</Section>
			<Section className="mt-4" title="資料出處與重現">
				<Provenance
					source={`${DATA_URLS.summary}、${DATA_URLS.clusters}、${DATA_URLS.temporal}（trips 表聚合）`}
					dataThrough={s.dateRange.end}
					generatedAt={s.generatedAt}
					command="bun scripts/lab/behavior/build-behavior-data.ts"
				/>
			</Section>
		</>
	);
}

export default function BehaviorView() {
	const { loaded, reload } = useBehaviorData();
	let body: ReactNode;
	if (loaded.state === "ready") body = <Workbench data={loaded.data} />;
	else if (loaded.state === "error")
		body = (
			<StatusBox
				title="無法載入或資料未通過驗證，沒有可顯示的數字"
				lines={loaded.lines}
				onRetry={reload}
			/>
		);
	else body = <StatusBox title="載入旅客行為資料中……" lines={[]} />;
	return (
		<div>
			<Header />
			{body}
		</div>
	);
}
