import { useMemo } from "react";
import { Segmented, Stat } from "#/components/lab/shared";
import type { BehaviorAnalysisSummary } from "#/features/lab/behavior";
import { CONTROL, Labeled, orderedClusters } from "./common";
import {
	AM_WINDOW,
	aggregate,
	fmtInt,
	fmtPct,
	HOURS,
	hourLabel,
	PM_WINDOW,
	peakHours,
	ratio,
	windowTrips,
} from "./explore";
import { HourBars } from "./HourBars";
import type { TemporalFile } from "./model";

export type WindowMode = "none" | "am" | "pm" | "custom";
export type TimeState = {
	scope: number | "all";
	mode: WindowMode;
	from: number;
	to: number;
};
export const DEFAULT_TIME: TimeState = {
	scope: "all",
	mode: "none",
	from: 7,
	to: 9,
};

export function windowOf(t: TimeState): { from: number; to: number } | null {
	if (t.mode === "am") return AM_WINDOW;
	if (t.mode === "pm") return PM_WINDOW;
	if (t.mode === "custom") return { from: t.from, to: t.to };
	return null;
}

const pad = (h: number) => String(h).padStart(2, "0");

export function TimePanel({
	summary,
	temporal,
	state,
	onChange,
}: {
	summary: BehaviorAnalysisSummary;
	temporal: TemporalFile;
	state: TimeState;
	onChange: (patch: Partial<TimeState>) => void;
}) {
	const clusters = useMemo(() => orderedClusters(summary), [summary]);
	const scoped = useMemo(
		() =>
			aggregate(
				state.scope === "all"
					? summary.allOdPairs
					: summary.allOdPairs.filter((o) => o.clusterId === state.scope),
			),
		[summary, state.scope],
	);
	const scopeName =
		state.scope === "all"
			? "全部 OD"
			: (clusters.find((c) => c.clusterId === state.scope)?.label ??
				"未知規則組");
	const win = windowOf(state);
	const inWin = win ? windowTrips(scoped.hourly, win.from, win.to) : null;
	const peaks = peakHours(scoped.hourly);
	const winText = win
		? `${pad(win.from)}:00–${pad(win.to)}:59${win.from > win.to ? "（跨午夜）" : ""}`
		: "";

	return (
		<div>
			<div className="grid gap-3 sm:grid-cols-2">
				<Labeled label="範圍（人工規則組）">
					<select
						className={CONTROL}
						value={state.scope === "all" ? "all" : String(state.scope)}
						onChange={(e) =>
							onChange({
								scope:
									e.target.value === "all" ? "all" : Number(e.target.value),
							})
						}
					>
						<option value="all">
							全部 OD（{summary.allOdPairs.length} 組）
						</option>
						{clusters.map((c) => (
							<option key={c.clusterId} value={c.clusterId}>
								{c.label}（{c.odPairCount} 組 OD）
							</option>
						))}
					</select>
				</Labeled>
				<div>
					<div className="mb-1.5 text-[11px] font-medium text-[var(--muted)]">
						標示時段窗口（上車小時）
					</div>
					<Segmented<WindowMode>
						label="時段窗口"
						value={state.mode}
						onChange={(mode) => onChange({ mode })}
						options={[
							["none", "不標示"],
							["am", "AM 06–09 時"],
							["pm", "PM 16–19 時"],
							["custom", "自訂"],
						]}
					/>
				</div>
			</div>
			{state.mode === "custom" && (
				<div className="mt-3 grid max-w-md grid-cols-2 gap-3">
					<Labeled label="起（含，上車小時）">
						<select
							className={CONTROL}
							value={state.from}
							onChange={(e) => onChange({ from: Number(e.target.value) })}
						>
							{HOURS.map((h) => (
								<option key={h} value={h}>
									{hourLabel(h)}
								</option>
							))}
						</select>
					</Labeled>
					<Labeled label="迄（含，到該小時 59 分）">
						<select
							className={CONTROL}
							value={state.to}
							onChange={(e) => onChange({ to: Number(e.target.value) })}
						>
							{HOURS.map((h) => (
								<option key={h} value={h}>
									{pad(h)}:59
								</option>
							))}
						</select>
					</Labeled>
				</div>
			)}

			<output className="mt-4 block text-xs leading-relaxed text-[var(--fg2)]">
				<b className="text-[var(--fg)]">{scopeName}</b>：
				{fmtInt(scoped.odCount)} 組 OD、{fmtInt(scoped.trips)} 筆旅次（分母）
				{win && inWin !== null && (
					<>
						。窗口 {winText} 內 {fmtInt(inWin)} 筆，占此範圍旅次{" "}
						<b className="text-[var(--fg)]">
							{fmtPct(ratio(inWin, scoped.trips))}
						</b>
					</>
				)}
				。
			</output>

			<div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
				<Stat
					label="最大的小時桶"
					value={
						peaks.length === 0
							? "無"
							: peaks.map((h) => hourLabel(h)).join("、")
					}
					sub={
						peaks.length === 0
							? "此範圍沒有旅次"
							: `${fmtInt(scoped.hourly[peaks[0]] ?? 0)} 筆（${fmtPct(ratio(scoped.hourly[peaks[0]] ?? 0, scoped.trips))}）；只描述刷卡量，非驗證尖峰`
					}
				/>
				<Stat
					label="AM／PM 窗口／其餘"
					value={`${fmtPct(ratio(scoped.amTrips, scoped.trips))}／${fmtPct(ratio(scoped.pmTrips, scoped.trips))}／${fmtPct(ratio(scoped.offTrips, scoped.trips))}`}
					sub="06–09／16–19／其餘小時，三者合計 100%"
				/>
				<Stat
					label="週六日占比"
					value={fmtPct(ratio(scoped.weekendTrips, scoped.trips))}
					sub={`週六日 ${fmtInt(scoped.weekendTrips)}、週一至五 ${fmtInt(scoped.weekdayTrips)}；未套政府假日`}
				/>
				<Stat
					label="全體有紀錄日數"
					value={fmtInt(summary.activeDatesCount)}
					sub="全體不同上車日期數，不隨規則組篩選；不是營運日，也不代表連續"
				/>
			</div>

			<div className="mt-4">
				<HourBars values={scoped.hourly} window={win} what={scopeName} />
			</div>
			<p className="mt-1 text-[11px] text-[var(--muted)]">
				縱軸為上車旅次數，各小時為 2024–2025
				全部日期的合計，不分星期；週六日占比與小時分布是兩個獨立聚合，本頁不能交叉成「週末幾點」。
			</p>

			<TopOdHourly temporal={temporal} win={win} winText={winText} />
		</div>
	);
}

function TopOdHourly({
	temporal,
	win,
	winText,
}: {
	temporal: TemporalFile;
	win: { from: number; to: number } | null;
	winText: string;
}) {
	return (
		<div className="mt-5">
			<h3 className="text-xs font-semibold">
				旅次最多的 {temporal.topOdHourly.length} 組 OD：每小時（時段檔，非完整
				OD）
			</h3>
			<div className="mt-2 overflow-x-auto rounded-lg border border-[var(--line)]">
				<table className="w-full min-w-[560px] border-collapse text-xs tabular-nums">
					<caption className="sr-only">前 10 OD 的最大小時桶與窗口占比</caption>
					<thead className="bg-[var(--chip)] text-left text-[var(--muted)]">
						<tr>
							<th scope="col" className="px-2 py-1.5 font-medium">
								OD
							</th>
							<th scope="col" className="px-2 py-1.5 text-right font-medium">
								旅次
							</th>
							<th scope="col" className="px-2 py-1.5 font-medium">
								最大小時桶
							</th>
							<th scope="col" className="px-2 py-1.5 text-right font-medium">
								{win ? `窗口 ${winText} 占該 OD` : "窗口（未選）"}
							</th>
						</tr>
					</thead>
					<tbody>
						{temporal.topOdHourly.map((t) => {
							const ps = peakHours(t.hourly);
							return (
								<tr key={t.odPair} className="border-t border-[var(--line)]">
									<td className="px-2 py-1.5">{t.odPair}</td>
									<td className="px-2 py-1.5 text-right">{fmtInt(t.trips)}</td>
									<td className="px-2 py-1.5">
										{ps.length === 0 ? "無" : ps.map(hourLabel).join("、")}
									</td>
									<td className="px-2 py-1.5 text-right">
										{win
											? fmtPct(
													ratio(
														windowTrips(t.hourly, win.from, win.to),
														t.trips,
													),
												)
											: "—"}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}
