import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
	analyze,
	type CalendarFile,
	type Cube,
	dailyCsv,
	dateRange,
	decodeCube,
	encodeCube,
	fullFilter,
	movingAverage,
	peakHour,
	restWorkRatio,
	type SourceData,
	type SourceRow,
	top3HourShare,
	weekdayOf,
} from "./model";

// Fixture: Mon 2024-01-01 (holiday, 開國紀念日), Tue 01-02 (work), 01-03 has NO record (missing),
// Thu 01-04 (work), Sat 01-06 (rest). 6670E only runs on 01-02.
const rows: SourceRow[] = [
	["2024-01-01", "6670A", "outbound", "臺中", 8, 10, 0],
	["2024-01-01", "6670A", "outbound", "埔里站", 9, 4, 6],
	["2024-01-01", "6670A", "unknown", "臺中", 8, 3, 0],
	["2024-01-02", "6670A", "outbound", "臺中", 8, 5, 0],
	["2024-01-02", "6670A", "inbound", "埔里站", 15, 2, 7],
	["2024-01-02", "6670E", "outbound", "臺中", 8, 1, 0],
	["2024-01-04", "6670A", "outbound", "臺中", 8, 7, 0],
	["2024-01-06", "6670A", "inbound", "埔里站", 15, 6, 6],
];
const src: SourceData = {
	generatedAt: "test",
	stops: [
		{ name: "臺中", order: 2 },
		{ name: "埔里站", order: 6 },
	],
	rows,
	notes: [],
};
const cal: CalendarFile = {
	retrievedAt: "test",
	dataset: "",
	provider: "",
	sources: [],
	days: {
		"2024-01-01": { rest: true, note: "開國紀念日" },
		"2024-01-02": { rest: false },
		"2024-01-03": { rest: false },
		"2024-01-04": { rest: false },
		"2024-01-05": { rest: false },
		"2024-01-06": { rest: true },
	},
};
const cube = encodeCube(src, "fixture");
const t = decodeCube(cube);
const all = fullFilter(t);
const A = cube.subs.indexOf("6670A");
const E = cube.subs.indexOf("6670E");

describe("dates", () => {
	test("dateRange is inclusive and crosses month/leap boundaries", () => {
		expect(dateRange("2024-02-28", "2024-03-01")).toEqual([
			"2024-02-28",
			"2024-02-29",
			"2024-03-01",
		]);
	});
	test("weekday is Monday=0", () => {
		expect(weekdayOf("2024-01-01")).toBe(0);
		expect(weekdayOf("2024-01-07")).toBe(6);
	});
});

describe("cube encode/decode", () => {
	test("round trip keeps every bucket", () => {
		const seen = new Set<string>();
		for (let di = 0; di < cube.dates.length; di++) {
			for (let i = cube.dateOffsets[di]; i < cube.dateOffsets[di + 1]; i++) {
				const dir = ["outbound", "inbound", "unknown"][t.dir[i]];
				seen.add(
					[
						cube.dates[di],
						cube.subs[t.sub[i]],
						dir,
						cube.stops[t.stop[i]].name,
						t.hour[i],
						t.b[i],
						t.a[i],
					].join("|"),
				);
			}
		}
		expect(seen).toEqual(new Set(rows.map((r) => r.join("|"))));
	});
	test("totals are preserved", () => {
		expect(cube.meta.totalBoardings).toBe(38);
		expect(cube.meta.totalAlightings).toBe(19);
	});
	test("unknown stop is rejected", () => {
		expect(() =>
			encodeCube(
				{ ...src, rows: [["2024-01-01", "6670A", "outbound", "??", 1, 1, 1]] },
				"x",
			),
		).toThrow();
	});
});

describe("analyze", () => {
	const a = analyze(t, cal, { ...all, from: "2024-01-01", to: "2024-01-06" });
	test("all-open filter reproduces source totals", () => {
		expect(a.totalB).toBe(38);
		expect(a.totalA).toBe(19);
	});
	test("a date without any record is missing, not zero", () => {
		expect(a.missingDays).toEqual(["2024-01-03", "2024-01-05"]);
		const d = a.days.find((x) => x.date === "2024-01-03");
		expect(d?.status).toBe("missing");
		expect(a.activeDays).toBe(4);
	});
	test("day-type groups use the official calendar", () => {
		expect(a.hours.rest.days).toBe(2); // 01-01 holiday + Saturday
		expect(a.hours.work.days).toBe(2);
		expect(a.hours.rest.b[8]).toBe(13);
	});
	test("direction filter drops unknown and reports it", () => {
		const o = analyze(t, cal, { ...all, direction: "outbound" });
		expect(o.totalB).toBe(10 + 4 + 5 + 1 + 7);
		expect(o.unknownDropped).toEqual({ b: 3, a: 0 });
		const i = analyze(t, cal, { ...all, direction: "inbound" });
		expect(o.totalB + i.totalB + o.unknownDropped.b).toBe(38);
	});
	test("stop filter changes the totals but not the stop chart", () => {
		const s = analyze(t, cal, {
			...all,
			stops: [cube.stops.findIndex((x) => x.name === "埔里站")],
		});
		expect(s.totalB).toBe(4 + 2 + 6);
		expect(s.stopTotals.reduce((x, y) => x + y.b, 0)).toBe(38);
	});
	test("sub-route filter: dates the sub-route never ran are inactive", () => {
		const e = analyze(t, cal, { ...all, subs: [E] });
		expect(e.activeDays).toBe(1);
		expect(e.inactiveDays).toBe(3);
		expect(e.totalB).toBe(1);
		// zero-fill only on active dates: 6670A has records on 4 dates
		expect(analyze(t, cal, { ...all, subs: [A] }).hours.all.days).toBe(4);
	});
	test("day-type filter excludes days and counts only matching ones", () => {
		const w = analyze(t, cal, { ...all, dayType: "work" });
		expect(w.activeDays).toBe(2);
		expect(w.days.find((d) => d.date === "2024-01-01")?.status).toBe(
			"excluded",
		);
		expect(w.days.find((d) => d.date === "2024-01-03")?.status).toBe("missing");
		expect(w.totalB).toBe(5 + 2 + 1 + 7);
	});
	test("a missing date of an excluded day type is not reported as missing", () => {
		const r = analyze(t, cal, {
			...all,
			dayType: "rest",
			from: "2024-01-01",
			to: "2024-01-06",
		});
		expect(r.missingDays).toEqual([]);
		expect(r.days.find((d) => d.date === "2024-01-03")?.status).toBe(
			"excluded",
		);
	});
	test("a date range of one day works and weekday matrix lines up", () => {
		const d = analyze(t, cal, { ...all, from: "2024-01-02", to: "2024-01-02" });
		expect(d.days).toHaveLength(1);
		expect(d.weekdayHour.days[1]).toBe(1); // Tuesday
		expect(d.weekdayHour.b[1][8]).toBe(6);
	});
	test("monthly rows add up", () => {
		expect(a.months).toEqual([
			{
				month: "2024-01",
				calendarDays: 6,
				activeDays: 4,
				missingDays: 2,
				b: 38,
				a: 19,
			},
		]);
	});
});

describe("indicators", () => {
	const a = analyze(t, cal, { ...all, from: "2024-01-01", to: "2024-01-06" });
	test("rest/work ratio is null when a group has too few days", () => {
		expect(restWorkRatio(a, "b")).toBeNull();
		expect(restWorkRatio(a, "b", 2)).toBeCloseTo(
			a.hours.rest.b.reduce((x, y) => x + y, 0) /
				2 /
				(a.hours.work.b.reduce((x, y) => x + y, 0) / 2),
		);
	});
	test("peak hour and top3 share", () => {
		expect(peakHour(a, "b")?.hour).toBe(8);
		expect(top3HourShare(a, "b")).toBe(1);
		const none = analyze(t, cal, { ...all, stops: [] });
		expect(peakHour(none, "b")).toBeNull();
		expect(top3HourShare(none, "b")).toBeNull();
	});
	test("moving average ignores non-active days and needs enough data", () => {
		const ma = movingAverage(a.days, "b", 3, 3);
		expect(ma[0]).toBeCloseTo((17 + 8 + 7) / 3); // window 01-01..01-04: 3 active days, the missing 01-03 is skipped
		expect(movingAverage(a.days, "b", 3, 4)[0]).toBeNull(); // fewer than minDays active days
	});
	test("daily CSV leaves missing days empty instead of 0", () => {
		const lines = dailyCsv(a, cal).trim().split("\n");
		expect(lines).toHaveLength(7);
		expect(lines.find((l) => l.startsWith("2024-01-03"))).toBe(
			'2024-01-03,2,work,"",資料集無紀錄,,',
		);
	});
});

// Real data: only when the build script has produced the cube (bun scripts/lab/visualization/build.ts).
const CUBE = "public/data/lab/visualization/cube.json";
const CAL = "public/data/lab/visualization/calendar.json";
describe.skipIf(!existsSync(CUBE) || !existsSync(CAL))("real data", () => {
	const real = decodeCube(JSON.parse(readFileSync(CUBE, "utf8")) as Cube);
	const calendar = JSON.parse(readFileSync(CAL, "utf8")) as CalendarFile;
	const full = analyze(real, calendar, fullFilter(real));
	test("totals match the published 1,800,910 trips", () => {
		expect(full.totalB).toBe(1_800_910);
		expect(full.totalA).toBe(1_800_910);
	});
	test("six dates in 2024–2025 have no record at all", () => {
		expect(full.missingDays).toEqual([
			"2024-07-24",
			"2024-07-25",
			"2024-10-02",
			"2024-10-03",
			"2024-10-31",
			"2025-07-07",
		]);
		expect(full.activeDays).toBe(725);
	});
	test("official calendar marks 233 rest days over the 731-day range", () => {
		expect(full.days.filter((d) => d.rest)).toHaveLength(233);
	});
});
