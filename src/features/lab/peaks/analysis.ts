import { classifyDate } from "./classifier";
import { calculatePeakMetrics, safeRatio } from "./metrics";
import type {
	CalendarAuditDay,
	GovernmentCalendar,
	HourlyProfile,
	SourceRow,
} from "./types";

export function buildCalendar(
	rows: SourceRow[],
	calendar: GovernmentCalendar,
): CalendarAuditDay[] {
	const dates = new Map<string, SourceRow[]>();
	for (const row of rows) {
		const list = dates.get(row[0]) ?? [];
		list.push(row);
		dates.set(row[0], list);
	}
	return Object.keys(calendar.days)
		.sort()
		.map((date) => {
			const records = dates.get(date);
			return {
				date,
				...classifyDate(date, calendar),
				boardings: records ? records.reduce((s, r) => s + r[5], 0) : null,
				alightings: records ? records.reduce((s, r) => s + r[6], 0) : null,
				recordCount: records?.length ?? 0,
				status: records ? "observed" : "missing_unknown",
			};
		});
}

/** Missing group-days are unknown. Means condition only on observed group-days. */
export function buildProfile(
	rows: SourceRow[],
	days: CalendarAuditDay[],
): HourlyProfile {
	const boardings = Array<number>(24).fill(0),
		alightings = Array<number>(24).fill(0);
	const observedDays = new Set(rows.map((r) => r[0])).size;
	for (const r of rows) {
		boardings[r[4]] += r[5];
		alightings[r[4]] += r[6];
	}
	const networkObservedDays = days.filter(
		(d) => d.status === "observed",
	).length;
	return {
		totalBoardings: boardings.reduce((s, v) => s + v, 0),
		totalAlightings: alightings.reduce((s, v) => s + v, 0),
		hourlyBoardings: boardings,
		hourlyAlightings: alightings,
		calendarDays: days.length,
		networkObservedDays,
		observedDays,
		missingGroupDays: days.length - observedDays,
		sampleStatus: !observedDays
			? "no_records"
			: observedDays < days.length
				? "incomplete_coverage"
				: "observed_network_days",
		avgObservedDayHourlyBoardings: boardings.map((v) =>
			safeRatio(v, observedDays),
		),
		avgObservedDayHourlyAlightings: alightings.map((v) =>
			safeRatio(v, observedDays),
		),
		peakMetrics: calculatePeakMetrics(boardings),
	};
}
