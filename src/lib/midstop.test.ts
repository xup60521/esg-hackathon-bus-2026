import { describe, expect, test } from "bun:test";
import {
	analyze,
	groupKey,
	type Params,
	pearson,
	quality,
	type Row,
	shiftHour,
	slotsToCsv,
} from "./midstop";

const roles = {
	臺中: "endpoint",
	埔里站: "middle",
	日月潭: "endpoint",
} as const;
const base: Params = {
	subroutes: ["6670A"],
	direction: "outbound",
	from: "2024-01-01",
	to: "2024-12-31",
	roles: { ...roles },
	reference: "board",
	lag: 1,
};

// Four Mondays in Jan 2024 (1, 8, 15, 22) share a baseline group.
const mondays = ["2024-01-01", "2024-01-08", "2024-01-15", "2024-01-22"];
function normalWeek(date: string): Row[] {
	return [
		[date, "6670A", "outbound", "臺中", 8, 10, 0],
		[date, "6670A", "outbound", "埔里站", 9, 6, 0],
		[date, "6670A", "outbound", "日月潭", 10, 0, 16],
	];
}

describe("helpers", () => {
	test("shiftHour crosses date boundaries", () => {
		expect(shiftHour("2024-12-31", 23, 1)).toEqual({
			date: "2025-01-01",
			hour: 0,
		});
		expect(shiftHour("2024-03-01", 0, -1)).toEqual({
			date: "2024-02-29",
			hour: 23,
		});
	});
	test("groupKey uses month and weekday", () => {
		expect(groupKey("2024-01-01")).toBe("2024-01|1");
	});
	test("pearson returns null for constant or short series", () => {
		expect(pearson([1, 2], [2, 4])).toBeNull();
		expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
		expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
	});
});

describe("analyze", () => {
	test("flags a high-endpoint / low-middle slot against a baseline that excludes the day", () => {
		const rows: Row[] = mondays.flatMap(normalWeek);
		// 2024-01-22: endpoint surge at 08, middle collapses at 09
		rows[9] = ["2024-01-22", "6670A", "outbound", "臺中", 8, 40, 0];
		rows[10] = ["2024-01-22", "6670A", "outbound", "埔里站", 9, 1, 0];
		const a = analyze(rows, base);
		const s = a.slots.find((x) => x.date === "2024-01-22" && x.hour === 8);
		expect(s?.refBase).toBe(10); // other three Mondays only
		expect(s?.midBase).toBe(6);
		expect(s?.mid).toBe(1);
		expect(s?.high).toBe(true);
		expect(s?.candidate).toBe(true);
		expect(a.candidates).toHaveLength(1);
	});

	test("missing whole dates are not zero-filled and give no baseline", () => {
		const rows: Row[] = normalWeek("2024-01-01"); // only one Monday exists
		const a = analyze(rows, base);
		expect(a.activeDates).toBe(1);
		expect(a.slots.every((s) => s.refBase === null && s.midBase === null)).toBe(
			true,
		);
		expect(a.verdict).toBe("insufficient");
	});

	test("zero slots exist only on dates where the sub-route has records", () => {
		const rows: Row[] = mondays.flatMap(normalWeek);
		rows.splice(9, 1); // 2024-01-22 has no endpoint boarding at 08 → real zero
		const a = analyze(rows, base);
		const s = a.slots.find((x) => x.date === "2024-01-22" && x.hour === 8);
		expect(s?.ref).toBe(0);
		expect(s?.refBase).toBe(10);
	});

	test("middle value is null when lag lands on a date without records", () => {
		const rows: Row[] = [["2024-01-01", "6670A", "outbound", "臺中", 23, 5, 0]];
		const s = analyze(rows, base).slots[0];
		expect(s.midDate).toBe("2024-01-02");
		expect(s.mid).toBeNull();
	});

	test("ignores other directions, sub-routes and off stops", () => {
		const rows: Row[] = [
			...normalWeek("2024-01-01"),
			["2024-01-01", "6670A", "inbound", "臺中", 8, 99, 0],
			["2024-01-01", "6670H", "outbound", "臺中", 8, 99, 0],
			["2024-01-01", "6670A", "unknown", "臺中", 8, 99, 0],
			["2024-01-01", "6670A", "outbound", "魚池", 9, 99, 0],
		];
		const a = analyze(rows, base);
		expect(a.slots.find((s) => s.hour === 8)?.ref).toBe(10);
		expect(a.slots.find((s) => s.hour === 8)?.mid).toBe(6);
	});

	test("alighting reference uses endpoint alightings", () => {
		const a = analyze(mondays.flatMap(normalWeek), {
			...base,
			reference: "alight",
			lag: -1,
		});
		const s = a.slots.find((x) => x.date === "2024-01-08" && x.hour === 10);
		expect(s?.ref).toBe(16);
		expect(s?.mid).toBe(6);
	});
});

test("quality totals and validity", () => {
	const rows: Row[] = [
		["2024-01-01", "6670A", "unknown", "臺中", 8, 2, 1],
		["2024-01-01", "6670A", "outbound", "臺中", 8, 3, 4],
		["bad", "6670A", "outbound", "臺中", 25, 1, 0],
	];
	const q = quality(rows, ["6670A"]);
	expect(q.boardings).toBe(6);
	expect(q.alightings).toBe(5);
	expect(q.unknown).toBe(2);
	expect(q.invalid).toBe(1);
});

test("csv has metadata, header and one line per slot", () => {
	const a = analyze(mondays.flatMap(normalWeek), base);
	const csv = slotsToCsv(a.slots, base).split("\n");
	expect(csv[0]).toStartWith("# direction=outbound");
	expect(csv[1]).toStartWith("date,hour,");
	expect(csv).toHaveLength(a.slots.length + 2);
});
