import { type ReactNode, useReducer } from "react";
import {
	FreshnessBanner,
	KindBadge,
	LimitationList,
	Provenance,
	Section,
	type Source,
	SourceList,
} from "#/components/lab/shared";
import type { ScenarioExample } from "#/features/lab/tourism";
import { AttractionPanel } from "./tourism/AttractionPanel";
import { InputForm, ScenarioShortcuts } from "./tourism/InputPanel";
import {
	DATA_URLS,
	type Data,
	initialForm,
	initialState,
	reducer,
} from "./tourism/model";
import { ResultPanel } from "./tourism/ResultPanel";
import { type Part, useTourismData } from "./tourism/useTourismData";

const LIMITATIONS = [
	"結果只在這份 6670 班表快照、三個景點的正文摘要與演算法假設下成立：快照有效期未知，任意未來日期都不能保證當日仍照此行駛。",
	"步行分鐘、站牌對應與建議／最短停留是演算法情境假設，未實測路徑與無障礙；長者／親子只是步速倍率。最短停留僅是提示，引擎不強制。",
	"臨時休園、天災、修繕、班表異動都沒有即時查證；本頁沒有任何即時資料來源。",
	"6670A–F 子路線代碼是依停靠模式推論，不是官方車次代碼。",
	"回程只查 6670 快照；找不到回程時，其他公車與服務未查證，不提供替代路徑或步行路線。",
	"不顯示任何票價：收費條件與金額都未核實，請向景點確認。",
	"日型只依班表備註（週一至四平日、週五至日假日）推算，沒有自動推定國定假日或景點的特殊假日。",
	"歷史刷卡資料不能驗證 2026 年的營運、末班、準點、滿載或未登車人數；本頁沒有使用刷卡資料。",
];

const UNKNOWNS = [
	"快照有效期（validityRange: UNKNOWN）：不知道這份班表從何時到何時適用。",
	"九族文化村：17:00 閉館是統一保守假設；最後入園未知；平假日定義未與 6670 班表對齊。",
	"紙教堂：國定假日、寒暑假、預約團、除夕與週六夜景等例外沒有建模；只依一般週三、週四公休拒絕。",
	"向山行政暨遊客中心：天災、修繕例外沒有建模；最後入園與收費條件未知。",
	"各景點座標與步行距離：未知，所以不畫地圖、不給路徑。",
];

function SourcesBlock({ data }: { data: Data }) {
	const m = data.timetable.metadata;
	const s = data.timetable.schedules;
	const sources: Source[] = [
		{
			label: `${m.routeNumber} ${m.routeName}班表（台灣好行官網）`,
			url: m.sourceUrl,
			accessed: m.retrievedDate,
			evidence: `原始 HTML 快照 SHA-256 ${m.snapshotSha256}；四張使用表班次數：平日去程 ${s.weekday_outbound.trips.length}、平日回程 ${s.weekday_inbound.trips.length}、假日去程 ${s.holiday_outbound.trips.length}、假日回程 ${s.holiday_inbound.trips.length}。只表示取得當日頁面內容，不證明現行或適用範圍。備註：${m.scheduleNotes.join("；")}。`,
		},
		...data.attractions.map(
			(a): Source => ({
				label: `${a.name}（日月潭國家風景區官網）`,
				url: a.provenance.exactSourceUrl,
				accessed: a.provenance.retrievedDate,
				evidence: `${a.provenance.evidenceBasis} 有正文摘要支持的欄位：${a.provenance.verifiedFields.join("、")}；其餘為假設或未知，見上方逐欄標示。`,
			}),
		),
	];
	return <SourceList sources={sources} />;
}

function Workbench({
	data,
	scenarios,
}: {
	data: Data;
	scenarios: Part<ScenarioExample[]>;
}) {
	const list = scenarios.state === "ready" ? scenarios.data : null;
	const [state, dispatch] = useReducer(reducer, initialForm(data, list), (f) =>
		initialState(f),
	);
	const attraction = data.attractions.find(
		(a) => a.id === state.form.attractionId,
	);
	const runAttraction = state.run
		? data.attractions.find((a) => a.id === state.run?.request.attractionId)
		: undefined;
	const m = data.timetable.metadata;

	return (
		<>
			<div className="mt-4">
				<FreshnessBanner
					dataThrough={m.retrievedDate}
					what="班表與景點快照"
					note="這是 2026-11-04 抓取的班表快照與景點正文摘要，不是即時資料；快照有效期未知，檢索日期不代表現行。"
				/>
			</div>

			<Section
				className="mt-4"
				title="輸入條件"
				subtitle="選出發站、日期時間、景點與停留；計算在瀏覽器內以快照執行。"
				badges={<KindBadge kind="scenario" />}
			>
				<InputForm
					data={data}
					form={state.form}
					errors={state.errors}
					dispatch={dispatch}
					attraction={attraction}
				/>
				{Object.keys(state.errors).length > 0 && (
					<p
						role="alert"
						className="mt-3 text-xs font-semibold text-[var(--sev-review)]"
					>
						輸入有 {Object.keys(state.errors).length} 處需要修正，尚未執行模擬。
					</p>
				)}
				{state.engineError && (
					<p
						role="alert"
						className="mt-3 text-xs font-semibold text-[var(--sev-review)]"
					>
						模擬引擎發生例外，沒有結果可顯示：{state.engineError}
					</p>
				)}
			</Section>

			<Section
				className="mt-4"
				title="範例輸入"
				badges={<KindBadge kind="scenario" />}
			>
				{scenarios.state === "ready" ? (
					<ScenarioShortcuts
						data={data}
						scenarios={scenarios.data}
						activeId={state.run?.scenarioId ?? null}
						dispatch={dispatch}
					/>
				) : (
					<p
						className="text-xs text-[var(--fg2)]"
						role={scenarios.state === "error" ? "alert" : "status"}
					>
						{scenarios.state === "loading"
							? "載入範例中……"
							: `範例檔 ${DATA_URLS.scenarios} 無法載入（${scenarios.message}）。上方計算器不受影響，只是沒有預設範例。`}
					</p>
				)}
			</Section>

			<Section
				className="mt-4"
				title="模擬結果"
				subtitle="結果狀態一律是條件式快照模擬；「成立」不是旅行有效的保證。"
				badges={<KindBadge kind="scenario" />}
			>
				{state.run ? (
					<ResultPanel
						run={state.run}
						timetable={data.timetable}
						attractionName={
							runAttraction?.name ?? state.run.result.attractionName
						}
						stale={state.stale}
					/>
				) : (
					<p className="text-xs text-[var(--fg2)]">
						尚未執行。填好條件後按「執行快照模擬」，或從範例載入。
					</p>
				)}
			</Section>

			{attraction && (
				<Section
					className="mt-4"
					title="景點資料：來源、假設、未知"
					subtitle="依表單目前選的景點逐欄標示。不把整筆資料稱為官方驗證。"
					badges={<KindBadge kind="unverified" />}
				>
					<AttractionPanel attraction={attraction} />
				</Section>
			)}

			<Section
				className="mt-4"
				title="未知與未建模"
				badges={<KindBadge kind="unverified" />}
			>
				<LimitationList items={UNKNOWNS} />
			</Section>

			<Section
				className="mt-4"
				title="來源"
				badges={<KindBadge kind="official" />}
			>
				<SourcesBlock data={data} />
			</Section>
			<Section className="mt-4" title="限制">
				<LimitationList items={LIMITATIONS} />
			</Section>
			<Section className="mt-4" title="資料出處與重現">
				<Provenance
					source={`${DATA_URLS.timetable}、${DATA_URLS.attractions}、${DATA_URLS.scenarios}`}
					dataThrough={m.retrievedDate}
					command="python3 scripts/lab/tourism/extract_official_data.py && bun run scripts/lab/tourism/export_sample_scenarios.ts"
				/>
			</Section>
		</>
	);
}

function Header() {
	return (
		<header>
			<div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
				6670 研究實驗室 · 旅遊
			</div>
			<h1 className="mt-1 text-2xl font-bold">
				景點往返與末班車：條件式快照模擬
			</h1>
			<p className="mt-2 max-w-[80ch] text-sm leading-relaxed text-[var(--fg2)]">
				<b className="text-[var(--fg)]">快照模擬，不是行程保證。</b>
				輸入出發站、日期時間、景點與停留，用 6670 班表快照與景點摘要算「去程 →
				停留 →
				回程」是否接得上，並標出離快照內末班車還有多少緩衝。只涵蓋向山、紙教堂、九族三個景點。
			</p>
			<div className="mt-3 flex flex-wrap items-center gap-1.5">
				<KindBadge kind="scenario" />
				<KindBadge kind="live-unavailable" />
			</div>
		</header>
	);
}

function StatusBox({
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
						此頁不會以其他資料代替，也不會在缺資料時猜測結果。
					</span>
				</div>
			)}
		</div>
	);
}

export default function TourismView() {
	const { timetable, attractions, scenarios, reload } = useTourismData();

	let body: ReactNode;
	if (timetable.state === "ready" && attractions.state === "ready") {
		body = (
			<Workbench
				data={{ timetable: timetable.data, attractions: attractions.data }}
				scenarios={scenarios}
			/>
		);
	} else if (timetable.state === "error" || attractions.state === "error") {
		const lines: string[] = [];
		if (timetable.state === "error")
			lines.push(`${DATA_URLS.timetable}：${timetable.message}`);
		if (attractions.state === "error")
			lines.push(`${DATA_URLS.attractions}：${attractions.message}`);
		body = (
			<StatusBox
				title="無法載入必要資料，沒有可計算的內容"
				lines={lines}
				onRetry={reload}
			/>
		);
	} else {
		body = <StatusBox title="載入班表與景點快照中……" lines={[]} />;
	}

	return (
		<div>
			<Header />
			{body}
		</div>
	);
}
