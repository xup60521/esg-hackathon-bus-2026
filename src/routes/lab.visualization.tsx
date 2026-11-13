import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
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
import {
	DailyChart,
	HOUR_FROM,
	HOUR_TO,
	HourChart,
	METRIC_COLOR,
	METRIC_LABEL,
	StopBars,
	WeekdayHeat,
} from "#/components/lab/visualization/Charts";
import {
	type Analysis,
	analyze,
	type CalendarFile,
	type Cube,
	type DayType,
	dailyCsv,
	decodeCube,
	type Filter,
	fullFilter,
	monthlyCsv,
	peakHour,
	restWorkRatio,
	type Table,
	top3HourShare,
} from "#/features/lab/visualization/model";
import { SUBROUTE_LABELS } from "#/lib/palette";

/** Content only: the /lab layout route (src/routes/lab.tsx) supplies theme, navigation and footer. */
export const Route = createFileRoute("/lab/visualization")({
	component: VisualizationPage,
	head: () => ({ meta: [{ title: "6670 電子票證資料視覺化 Lab" }] }),
});

const fmt = new Intl.NumberFormat("en-US");
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const DATA_BASE = "/data/lab/visualization";

type Loaded = { table: Table; cal: CalendarFile };
type Metric = "b" | "a";

function VisualizationPage() {
	const [data, setData] = useState<Loaded | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState<Filter | null>(null);
	const [metric, setMetric] = useState<Metric>("b");

	useEffect(() => {
		const get = <T,>(name: string) =>
			fetch(`${DATA_BASE}/${name}`).then((r) => {
				if (!r.ok)
					throw new Error(
						`${name}: HTTP ${r.status}（請先執行 bun scripts/lab/visualization/build.ts）`,
					);
				return r.json() as Promise<T>;
			});
		Promise.all([
			get<Cube>("cube.json"),
			get<CalendarFile>("calendar.json"),
		]).then(
			([cube, cal]) => {
				const table = decodeCube(cube);
				setData({ table, cal });
				setFilter(fullFilter(table));
			},
			(e: Error) => setError(e.message),
		);
	}, []);

	const result = useMemo(
		() => (data && filter ? analyze(data.table, data.cal, filter) : null),
		[data, filter],
	);
	const set = (patch: Partial<Filter>) =>
		setFilter((f) => (f ? { ...f, ...patch } : f));

	return (
		<div className="mt-5 grid gap-4">
			<header>
				<div className="flex flex-wrap items-center gap-2">
					<KindBadge kind="history" />
					<span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
						電子票證資料視覺化
					</span>
				</div>
				<h1 className="mt-1 text-2xl font-bold">
					哪些日子、時段、站點搭的人多？
				</h1>
				<p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--fg2)]">
					2024–2025 年 1,800,910
					筆刷卡旅次的「日×支線×方向×站×小時」彙總，可依支線、方向、站點、日期與日類型篩選。
					數字是成功刷卡上車／下車的人次，不是完整需求、候車或拒載。缺值與來源說明在各圖提示與頁尾。
				</p>
			</header>

			{error && <div className="panel p-4 text-sm text-red-600">⚠ {error}</div>}
			{!error && !result && (
				<div className="text-sm text-[var(--fg2)]">載入資料中… Loading…</div>
			)}

			{data && filter && result && (
				<>
					<FreshnessBanner
						dataThrough={
							data.table.cube.dates[data.table.cube.dates.length - 1]
						}
						what="最後一筆刷卡日期"
					/>
					<Controls
						data={data}
						filter={filter}
						set={set}
						metric={metric}
						setMetric={setMetric}
					/>
					<Kpis result={result} metric={metric} />
					<Notices data={data} filter={filter} result={result} />

					<Section
						title={`每日${METRIC_LABEL[metric]}人次`}
						subtitle="每根長條是一天；斜線區是整個資料集當天沒有任何紀錄（缺資料，不是 0）。點長條可只看那一天。"
					>
						<DailyChart
							days={result.days}
							metric={metric}
							onPick={(date) => set({ from: date, to: date })}
						/>
					</Section>

					<div className="grid gap-4 lg:grid-cols-2">
						<Section
							title="一天中哪個小時最多：上班日 vs 休息日"
							subtitle={`各小時平均每個有紀錄日的${METRIC_LABEL[metric]}人次；只畫 ${HOUR_FROM}–${HOUR_TO} 時${omitted(result, metric)}。`}
						>
							<HourChart a={result} metric={metric} />
						</Section>
						<Section
							title="星期 × 小時"
							subtitle="顏色深淺 = 該星期該小時的平均人次（國定假日落在平日時仍歸該星期，請搭配左圖的日類型）。"
						>
							<WeekdayHeat a={result} metric={metric} />
						</Section>
					</div>

					<Section
						title="各站上、下車人次"
						subtitle="依站點地理順序，套用支線、方向、日期、日類型篩選（不套用站點篩選）。點站名切換是否納入上方統計。上、下車是兩個獨立數字，差值不等於站上留存人數。"
					>
						<StopBars
							stops={data.table.cube.stops}
							totals={result.stopTotals}
							selected={new Set(filter.stops)}
							onToggle={(i) =>
								set({
									stops: filter.stops.includes(i)
										? filter.stops.filter((s) => s !== i)
										: [...filter.stops, i],
								})
							}
						/>
					</Section>

					<MonthTable result={result} cal={data.cal} />
					<Sources data={data} />
				</>
			)}
		</div>
	);
}

const omitted = (a: Analysis, m: Metric) => {
	const n = a.hours.all[m].reduce(
		(s, v, h) => (h < HOUR_FROM || h > HOUR_TO ? s + v : s),
		0,
	);
	return n > 0 ? `；其餘時段共 ${fmt.format(n)} 人次未畫出` : "";
};

function Controls({
	data,
	filter,
	set,
	metric,
	setMetric,
}: {
	data: Loaded;
	filter: Filter;
	set: (p: Partial<Filter>) => void;
	metric: Metric;
	setMetric: (m: Metric) => void;
}) {
	const { cube } = data.table;
	const first = cube.dates[0];
	const last = cube.dates[cube.dates.length - 1];
	const toggle = (list: number[], i: number) =>
		list.includes(i) ? list.filter((x) => x !== i) : [...list, i];
	const stopOrder = cube.stops
		.map((_, i) => i)
		.sort((a, b) => cube.stops[a].order - cube.stops[b].order);
	const range = (from: string, to: string) => set({ from, to });
	return (
		<section
			className="panel grid gap-4 p-4 sm:grid-cols-2"
			aria-label="篩選條件"
		>
			<Field label="指標 Metric">
				<Segmented
					label="指標"
					options={[
						["b", "上車人次"],
						["a", "下車人次"],
					]}
					value={metric}
					onChange={setMetric}
				/>
			</Field>
			<Field label="方向 Direction（去程＝臺中→日月潭；方向依站序推定，「全部」含無法判定方向者）">
				<Segmented<Filter["direction"]>
					label="方向"
					options={[
						["all", "全部"],
						["outbound", "去程"],
						["inbound", "回程"],
					]}
					value={filter.direction}
					onChange={(direction) => set({ direction })}
				/>
			</Field>
			<Field label="支線 Sub-routes（H 只到埔里；E 只在部分日子有紀錄）">
				<fieldset className="flex flex-wrap gap-1">
					<legend className="sr-only">支線</legend>
					{cube.subs.map((s, i) => {
						const on = filter.subs.includes(i);
						return (
							<button
								key={s}
								type="button"
								title={SUBROUTE_LABELS[s]}
								className={`btn ${on ? "btn-active" : ""}`}
								aria-pressed={on}
								onClick={() => {
									const next = toggle(filter.subs, i);
									if (next.length) set({ subs: next });
								}}
							>
								<span
									className="inline-block size-2 rounded-sm"
									style={{ background: `var(--s-${s})` }}
								/>
								{s.replace("6670", "")}
							</button>
						);
					})}
				</fieldset>
				<div className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
					{filter.subs
						.map((i) => SUBROUTE_LABELS[cube.subs[i]])
						.filter(Boolean)
						.join("　")}
				</div>
			</Field>
			<Field label="日類型 Day type（政府行政機關辦公日曆；休息日＝週休、國定假日、補假）">
				<Segmented<DayType>
					label="日類型"
					options={[
						["all", "全部"],
						["work", "上班日"],
						["rest", "休息日"],
					]}
					value={filter.dayType}
					onChange={(dayType) => set({ dayType })}
				/>
			</Field>
			<Field label="日期 Date range">
				<div className="flex flex-wrap items-center gap-2 text-xs">
					<input
						type="date"
						className="btn"
						aria-label="起日"
						min={first}
						max={last}
						value={filter.from}
						onChange={(e) =>
							e.target.value &&
							set({
								from: e.target.value,
								to: e.target.value > filter.to ? e.target.value : filter.to,
							})
						}
					/>
					–
					<input
						type="date"
						className="btn"
						aria-label="迄日"
						min={first}
						max={last}
						value={filter.to}
						onChange={(e) =>
							e.target.value &&
							set({
								to: e.target.value,
								from:
									e.target.value < filter.from ? e.target.value : filter.from,
							})
						}
					/>
				</div>
				<div className="mt-1.5 flex flex-wrap gap-1">
					<button
						type="button"
						className="btn"
						onClick={() => range(first, last)}
					>
						全部
					</button>
					<button
						type="button"
						className="btn"
						onClick={() => range("2024-01-01", "2024-12-31")}
					>
						2024
					</button>
					<button
						type="button"
						className="btn"
						onClick={() => range("2025-01-01", "2025-12-31")}
					>
						2025
					</button>
				</div>
			</Field>
			<Field label="站點 Stops（各統計只計選取站的上、下車；站圖不受此篩選影響）">
				<fieldset className="flex flex-wrap gap-1">
					<legend className="sr-only">站點</legend>
					{stopOrder.map((i) => {
						const on = filter.stops.includes(i);
						return (
							<button
								key={i}
								type="button"
								className={`btn ${on ? "btn-active" : "opacity-60"}`}
								aria-pressed={on}
								onClick={() => set({ stops: toggle(filter.stops, i) })}
							>
								{cube.stops[i].name}
							</button>
						);
					})}
				</fieldset>
				<div className="mt-1.5 flex gap-1">
					<button
						type="button"
						className="btn"
						onClick={() => set({ stops: cube.stops.map((_, i) => i) })}
					>
						全選
					</button>
					<button
						type="button"
						className="btn"
						onClick={() => set({ stops: [] })}
					>
						清除
					</button>
				</div>
			</Field>
		</section>
	);
}

function Kpis({ result, metric }: { result: Analysis; metric: Metric }) {
	const total = metric === "b" ? result.totalB : result.totalA;
	const peak = peakHour(result, metric);
	const top3 = top3HourShare(result, metric);
	const ratio = restWorkRatio(result, metric);
	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<Stat
				label={`${METRIC_LABEL[metric]}人次合計`}
				value={
					<span style={{ color: METRIC_COLOR[metric] }}>
						{fmt.format(total)}
					</span>
				}
				sub={`${fmt.format(result.activeDays)} 個有紀錄日`}
			/>
			<Stat
				label="日均（有紀錄日）"
				value={
					result.activeDays
						? fmt.format(Math.round(total / result.activeDays))
						: "–"
				}
				sub="合計 ÷ 有紀錄日數；缺資料日不在分母"
			/>
			<Stat
				label="最高峰小時"
				value={peak ? hh(peak.hour) : "–"}
				sub={
					peak
						? `佔 ${(peak.share * 100).toFixed(1)}%；前三高小時合計 ${((top3 ?? 0) * 100).toFixed(1)}%`
						: "此篩選無資料"
				}
			/>
			<Stat
				label="休息日 ÷ 上班日 日均"
				value={ratio === null ? "–" : `${ratio.toFixed(2)}×`}
				sub={
					ratio === null
						? result.hours.work.days === 0 || result.hours.rest.days === 0
							? "需同時含上班日與休息日才能比較"
							: "任一類少於 5 個有紀錄日，不計算"
						: `上班日 ${result.hours.work.days} 日、休息日 ${result.hours.rest.days} 日`
				}
			/>
		</div>
	);
}

function Notices({
	data,
	filter,
	result,
}: {
	data: Loaded;
	filter: Filter;
	result: Analysis;
}) {
	const notes: string[] = [];
	if (result.missingDays.length)
		notes.push(
			`所選期間有 ${result.missingDays.length} 天整個資料集沒有任何紀錄（${result.missingDays.join("、")}）：圖上以斜線標示，不補 0、不納入日均。原因未知（可能是停駛、資料缺漏或匯出缺口），本頁無法判斷。`,
		);
	if (result.inactiveDays)
		notes.push(
			`有 ${result.inactiveDays} 天資料集有紀錄、但所選支線沒有紀錄，這些日子不計入日均；沒有紀錄不等於零需求，也不保證沒有班次。`,
		);
	if (filter.direction !== "all" && result.unknownDropped.b)
		notes.push(
			`方向篩選已排除無法判定方向的 ${fmt.format(result.unknownDropped.b)} 人次上車／${fmt.format(result.unknownDropped.a)} 人次下車。`,
		);
	if (
		filter.stops.length > 0 &&
		filter.stops.length < data.table.cube.stops.length
	)
		notes.push(
			`只統計 ${filter.stops.length} 個站的上、下車，這是「這幾站的刷卡次數」，不是這些站之間的旅次數。`,
		);
	if (filter.stops.length === 0) notes.push("尚未選取任何站點，圖表為空。");
	if (result.activeDays === 0) notes.push("此篩選下沒有任何有紀錄日。");
	if (!notes.length) return null;
	return (
		<div
			className="panel border-l-4 p-3 text-xs leading-relaxed text-[var(--fg2)]"
			style={{ borderLeftColor: "var(--accent)" }}
		>
			<div className="mb-1 font-semibold text-[var(--fg)]">
				目前篩選下的缺值與限制
			</div>
			<ul className="list-disc space-y-0.5 pl-4">
				{notes.map((n) => (
					<li key={n}>{n}</li>
				))}
			</ul>
		</div>
	);
}

function download(name: string, text: string) {
	const url = URL.createObjectURL(
		new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" }),
	);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

function MonthTable({ result, cal }: { result: Analysis; cal: CalendarFile }) {
	return (
		<Section
			title="月別明細（可核對圖表）"
			subtitle="與上方篩選一致。日均 = 上車合計 ÷ 有紀錄日數；缺資料日數是整個資料集當天無紀錄。"
		>
			<div className="mb-2 flex gap-2">
				<button
					type="button"
					className="btn"
					onClick={() =>
						download("visualization-daily.csv", dailyCsv(result, cal))
					}
				>
					<Download className="size-3.5" /> 每日 CSV
				</button>
				<button
					type="button"
					className="btn"
					onClick={() =>
						download("visualization-monthly.csv", monthlyCsv(result))
					}
				>
					<Download className="size-3.5" /> 月別 CSV
				</button>
			</div>
			<div className="max-h-[360px] overflow-auto">
				<table className="w-full text-xs tabular-nums">
					<thead className="sticky top-0 bg-[var(--bg)] text-left text-[var(--muted)]">
						<tr>
							<th className="py-1 pr-3 font-medium">月份</th>
							<th className="pr-3 text-right font-medium">有紀錄日</th>
							<th className="pr-3 text-right font-medium">缺資料日</th>
							<th className="pr-3 text-right font-medium">上車</th>
							<th className="pr-3 text-right font-medium">下車</th>
							<th className="text-right font-medium">上車日均</th>
						</tr>
					</thead>
					<tbody>
						{result.months.map((m) => (
							<tr key={m.month} className="border-t border-[var(--line)]">
								<td className="py-1 pr-3">{m.month}</td>
								<td className="pr-3 text-right">{m.activeDays}</td>
								<td className="pr-3 text-right">{m.missingDays || "–"}</td>
								<td className="pr-3 text-right">{fmt.format(m.b)}</td>
								<td className="pr-3 text-right">{fmt.format(m.a)}</td>
								<td className="text-right">
									{m.activeDays
										? fmt.format(Math.round(m.b / m.activeDays))
										: "–"}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Section>
	);
}

function Sources({ data }: { data: Loaded }) {
	const { meta, dates } = data.table.cube;
	const { cal } = data;
	const sources: Source[] = [
		{
			label: "6670 刷卡彙總（public/data/midstop.json）",
			accessed: meta.generatedAt.slice(0, 10),
			evidence: `既有匯出的 ${fmt.format(meta.rowCount)} 筆「日×支線×方向×站×小時」彙總，上車、下車各 ${fmt.format(meta.totalBoardings)} 人次；不含卡號、司機或車牌。`,
		},
		{
			label: "政府行政機關辦公日曆表（行政院人事行政總處）",
			url: cal.dataset,
			accessed: cal.retrievedAt.slice(0, 10),
			evidence:
				"提供上班日／休息日（週休、國定假日、補假）。2024 年用 113 年版，2025 年用 114 年版（1141020 更新）。",
		},
	];
	return (
		<Section
			title="資料來源、缺值與限制"
			badges={<KindBadge kind="official" />}
		>
			<div className="grid gap-5 lg:grid-cols-2">
				<div className="grid content-start gap-3">
					<SourceList sources={sources} />
					<Provenance
						source="public/data/lab/visualization/cube.json（由 build.ts 自上列來源轉出）"
						dataThrough={dates[dates.length - 1]}
						command="bun scripts/lab/visualization/build.ts"
					/>
				</div>
				<LimitationList
					items={[
						"缺值：資料集完全沒有紀錄的日期（2024-07-24、07-25、10-02、10-03、10-31，2025-07-07）不補 0，也不納入平均；原因未知。",
						"只在「所選支線有紀錄的日子」才把沒有人的小時視為 0，這不代表當時有班次。",
						"方向由 OD 站序推定；同站或未知起訖無法判定，只在方向＝全部時計入。",
						"只看到刷卡上車者：看不到候車、未上車、客滿或拒載；高峰人次可能被車輛容量限制。",
						"沒有班次與容量資料，不能由人次推論擁擠；人次也不是旅次數（同一趟的上、下車分屬兩站）。",
						"歷史資料至 2025-12-31，非即時；辦公日曆只近似旅遊需求日（補班日、連假橋接日仍歸上班日）。",
					]}
				/>
			</div>
		</Section>
	);
}
