/** 歷史刷卡統計查詢（純函式）。數值是「成功上車刷卡」的平均，不是候車、座位或即時人數。 */
import type { Direction, HistoryData } from "./types";

export type Profile = {
	direction: Direction;
	/** 每小時平均上車刷卡次數／每個有紀錄日（索引 0..23） */
	hourly: number[];
	/** 全天平均／每個有紀錄日 */
	dailyAvg: number;
	totalBoardings: number;
	days: number;
};

export function profile(
	h: HistoryData,
	histNames: string[],
	direction: Direction,
	weekdays: number[],
): Profile {
	const days = weekdays.reduce((s, w) => s + h.daysPerWeekday[w], 0);
	const sums = new Array(24).fill(0) as number[];
	for (const [stop, dir, wd, hour, v] of h.cells)
		if (dir === direction && histNames.includes(stop) && weekdays.includes(wd))
			sums[hour] += v;
	const total = sums.reduce((a, b) => a + b, 0);
	return {
		direction,
		hourly: sums.map((v) => (days ? v / days : 0)),
		dailyAvg: days ? total / days : 0,
		totalBoardings: total,
		days,
	};
}

/** 兩個方向合計的各星期（0=日）每日平均上車刷卡量 */
export function weekdayAverages(h: HistoryData, histNames: string[]) {
	const sums = new Array(7).fill(0) as number[];
	for (const [stop, dir, wd, , v] of h.cells)
		if (histNames.includes(stop) && (dir === "outbound" || dir === "inbound"))
			sums[wd] += v;
	return sums.map((v, wd) =>
		h.daysPerWeekday[wd] ? v / h.daysPerWeekday[wd] : 0,
	);
}

export const topHours = (hourly: number[], n: number) =>
	hourly
		.map((v, hour) => ({ hour, v }))
		.filter((x) => x.v > 0)
		.sort((a, b) => b.v - a.v)
		.slice(0, n);
