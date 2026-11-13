import { describe, expect, it } from "bun:test";
import calendarJson from "../../../../public/data/lab/visualization/calendar.json";
import { classifyDate, classifyStopRole } from "./classifier";
import { buildCalendar, buildProfile } from "./analysis";
import {
	calculateDirectionalAsymmetry,
	calculateGini,
	calculatePeakMetrics,
	observedMean,
	safeRatio,
} from "./metrics";
import type { GovernmentCalendar, SourceRow } from "./types";
const calendar: GovernmentCalendar = calendarJson;
const sample: SourceRow[] = [
	["2025-05-01", "6670A", "outbound", "埔里站", 5, 9, 3],
	["2025-05-02", "6670A", "unknown", "埔里站", 12, 3, 9],
];

describe("government calendar proxy", () => {
	it("2025-05-02 and 2024-05-01 are workdays, not invented labor holidays", () => {
		expect(classifyDate("2025-05-02", calendar).dayType).toBe(
			"government_workday",
		);
		expect(classifyDate("2024-05-01", calendar).governmentRest).toBe(false);
	});
	it("preserves makeup working Saturday and official restday", () => {
		expect(classifyDate("2024-02-17", calendar).governmentRest).toBe(false);
		expect(classifyDate("2025-10-24", calendar).governmentRest).toBe(true);
	});
	it("does not infer typhoon service suspension", () =>
		expect(classifyDate("2024-07-24", calendar).dayType).toBe(
			"government_workday",
		));
	it("rejects calendar coverage gaps", () =>
		expect(() => classifyDate("2026-01-01", calendar)).toThrow());
	it("uses explicit candidate roles, with no universal branch position", () => {
		expect(classifyStopRole("埔里站")).toBe("transport_hub_candidate");
		expect(classifyStopRole("崎下")).toBe("unknown");
		expect(classifyStopRole("未知站")).toBe("unknown");
	});
});
describe("missing data and denominator", () => {
	it("keeps missing days null and excludes them from observed means", () => {
		const days = buildCalendar(sample, calendar);
		expect(days.find((d) => d.date === "2025-05-03")!.boardings).toBeNull();
		expect(days.find((d) => d.date === "2025-05-03")!.status).toBe(
			"missing_unknown",
		);
		const p = buildProfile(sample, days);
		expect(p.observedDays).toBe(2);
		expect(p.missingGroupDays).toBe(729);
		expect(p.avgObservedDayHourlyBoardings[5]).toBe(4.5);
		expect(observedMean([9, 3])).toBe(6);
	});
	it("does not treat a direction absent on a network day as an observed zero day", () => {
		const days = buildCalendar(sample, calendar);
		const p = buildProfile(
			sample.filter((r) => r[2] === "outbound"),
			days,
		);
		expect(p.observedDays).toBe(1);
		expect(p.networkObservedDays).toBe(2);
		expect(p.avgObservedDayHourlyBoardings[5]).toBe(9);
		expect(p.sampleStatus).toBe("incomplete_coverage");
	});
	it("handles a branch direction with no records as no sample", () => {
		const p = buildProfile([], buildCalendar(sample, calendar));
		expect(p.sampleStatus).toBe("no_records");
		expect(p.avgObservedDayHourlyBoardings).toEqual(Array(24).fill(null));
		expect(p.peakMetrics.peakHour).toBeNull();
	});
	it("has null ratios for zero denominators", () => {
		expect(safeRatio(10, 0)).toBeNull();
		expect(safeRatio(null, 10)).toBeNull();
		expect(safeRatio(10, null)).toBeNull();
		expect(observedMean([])).toBeNull();
		expect(calculateDirectionalAsymmetry(0, 0)).toEqual({
			dominantDirection: null,
			ratio: null,
		});
	});
	it("retains unknown direction in conservation", () => {
		const days = buildCalendar(sample, calendar),
			all = buildProfile(sample, days);
		const groups = ["outbound", "inbound", "unknown"].map((dir) =>
			buildProfile(
				sample.filter((r) => r[2] === dir),
				days,
			),
		);
		expect(groups.reduce((s, p) => s + p.totalBoardings, 0)).toBe(
			all.totalBoardings,
		);
		expect(groups.reduce((s, p) => s + p.totalAlightings, 0)).toBe(
			all.totalAlightings,
		);
	});
	it("keeps observed zero days distinct from missing days", () => {
		const days = buildCalendar(
			[["2025-05-02", "A", "unknown", "x", 0, 0, 0]],
			calendar,
		);
		expect(days.find((d) => d.date === "2025-05-02")!.boardings).toBe(0);
		expect(days.find((d) => d.date === "2025-05-03")!.boardings).toBeNull();
	});
});
describe("analysis window and metrics", () => {
	it("defaults to 24h and includes 05:00", () => {
		const hours = Array(24).fill(0);
		hours[5] = 100;
		hours[14] = 20;
		const m = calculatePeakMetrics(hours);
		expect(m.peakHour).toBe(5);
		expect(m.includedVolume).toBe(120);
		expect(m.excludedVolume).toBe(0);
		expect(m.baseVolume).toBe(5);
	});
	it("reports excluded volume for custom windows and respects AM/PM boundaries", () => {
		const hours = Array(24).fill(0);
		hours[5] = 100;
		hours[14] = 20;
		const m = calculatePeakMetrics(hours, [14]);
		expect(m.peakHour).toBe(14);
		expect(m.amPeakHour).toBeNull();
		expect(m.includedVolume + m.excludedVolume).toBe(120);
		expect(m.excludedVolume).toBe(100);
	});
	it("zero volumes have no invented peak or undefined ratios", () => {
		const m = calculatePeakMetrics(Array(24).fill(0));
		expect(m.peakHour).toBeNull();
		expect(m.amPeakHour).toBeNull();
		expect(m.pmPeakHour).toBeNull();
		expect(m.peakToBaseRatio).toBeNull();
		expect(m.cr3).toBeNull();
		expect(m.gini).toBeNull();
	});
	it("empty window has no base or peak", () => {
		const m = calculatePeakMetrics(Array(24).fill(1), []);
		expect(m.baseVolume).toBeNull();
		expect(m.peakHour).toBeNull();
		expect(m.excludedVolume).toBe(24);
	});
	it("ties choose earliest included hour", () =>
		expect(calculatePeakMetrics(Array(24).fill(1)).peakHour).toBe(0));
	it("validates arrays and window indexes", () => {
		expect(() => calculatePeakMetrics([1])).toThrow();
		expect(() => calculatePeakMetrics(Array(24).fill(-1))).toThrow();
		expect(() => calculatePeakMetrics(Array(24).fill(0), [6, 6])).toThrow();
		expect(() => calculatePeakMetrics(Array(24).fill(0), [24])).toThrow();
	});
	it("computes known Gini and concentration", () => {
		expect(calculateGini([10, 20, 30, 40])).toBe(0.25);
		expect(calculateGini([0, 0, 0, 100])).toBe(0.75);
		const m = calculatePeakMetrics(Array(24).fill(1));
		expect(m.cr3).toBe(3 / 24);
		expect(m.cr4).toBe(4 / 24);
		expect(m.gini).toBe(0);
	});
});
