import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
	backtest,
	baselineFor,
	buildDays,
	type Calendar,
	calendarTag,
	type Day,
	type Days,
	decisionsAt,
	highlights,
	isHoliday,
	lastDeliveredHour,
	middleStopNames,
	outlookAfter,
	packDays,
	unpackDays,
} from "./replay";

const z = () => new Array<number>(24).fill(0);
function day(
	o: Partial<Record<number, number>>,
	i: Partial<Record<number, number>> = {},
): Day {
	const mk = (p: Partial<Record<number, number>>) => {
		const b = z();
		for (const [h, v] of Object.entries(p)) b[Number(h)] = v as number;
		return { b, a: z(), m: z() };
	};
	return { outbound: mk(o), inbound: mk(i), unknown: 0 };
}
/** Mondays: 2025-03-03, 10, 17, 24, 31 */
const MON = [
	"2025-03-03",
	"2025-03-10",
	"2025-03-17",
	"2025-03-24",
	"2025-03-31",
];
const flat = (v: number): Partial<Record<number, number>> => ({
	8: v,
	9: v,
	10: v,
});

describe("baselineFor", () => {
	const days: Days = new Map(MON.map((d) => [d, day(flat(20))]));
	test("uses only earlier same-weekday dates, never the day itself or the future", () => {
		const b = baselineFor(days, {}, "2025-03-24", "outbound", "b");
		expect(b?.peers).toEqual(["2025-03-17", "2025-03-10", "2025-03-03"]);
		expect(b?.mean[9]).toBe(20);
	});
	test("future data cannot change a past baseline", () => {
		const before = baselineFor(days, {}, "2025-03-17", "outbound", "b");
		const changed = new Map(days);
		changed.set("2025-03-31", day(flat(999)));
		changed.set("2025-03-24", day(flat(999)));
		expect(baselineFor(changed, {}, "2025-03-17", "outbound", "b")).toEqual(
			before,
		);
	});
	test("fewer than two peers → null", () => {
		expect(baselineFor(days, {}, "2025-03-10", "outbound", "b")).toBeNull();
	});
	test("missing dates are skipped, not treated as zero", () => {
		const d = new Map(days);
		d.delete("2025-03-17");
		const b = baselineFor(d, {}, "2025-03-31", "outbound", "b");
		expect(b?.peers).toEqual(["2025-03-24", "2025-03-10", "2025-03-03"]);
		expect(b?.mean[9]).toBe(20);
	});
	test("lookback limited to 56 days", () => {
		const old: Days = new Map([
			["2025-01-06", day(flat(20))],
			["2025-01-13", day(flat(20))],
		]);
		expect(baselineFor(old, {}, "2025-03-31", "outbound", "b")).toBeNull();
	});
	test("holiday weekday does not borrow ordinary weekdays; calendar can be disabled", () => {
		const cal: Calendar = { "2025-03-31": { holiday: true, name: "測試假日" } };
		expect(isHoliday("2025-03-31", cal)).toBe(true);
		expect(baselineFor(days, cal, "2025-03-31", "outbound", "b")).toBeNull();
		expect(
			baselineFor(days, cal, "2025-03-31", "outbound", "b", {
				useCalendar: false,
			}),
		).not.toBeNull();
		// a make-up workday on Saturday is not a weekend
		expect(
			isHoliday("2025-03-29", {
				"2025-03-29": { holiday: false, name: "補班" },
			}),
		).toBe(false);
	});
	test("lo/hi are the min/max of peers", () => {
		const d: Days = new Map([
			["2025-03-03", day({ 9: 10 })],
			["2025-03-10", day({ 9: 30 })],
			["2025-03-17", day({ 9: 20 })],
		]);
		const b = baselineFor(d, {}, "2025-03-24", "outbound", "b");
		expect([b?.lo[9], b?.mean[9], b?.hi[9]]).toEqual([10, 20, 30]);
	});
});

describe("decisionsAt", () => {
	const hist = MON.slice(0, 3).map(
		(d) => [d, day(flat(20), flat(20))] as const,
	);
	const mk = (today: Day) =>
		new Map<string, Day>([...hist, ["2025-03-24", today]]);
	test("delivered hour respects clock and feed lag", () => {
		expect(lastDeliveredHour(10, 0)).toBe(9);
		expect(lastDeliveredHour(10, 1)).toBe(8);
	});
	test("surge needs both ratio and absolute excess; lag hides the newest hour", () => {
		const d = mk(day({ 8: 20, 9: 31 }, flat(20))); // 31 ≥ 1.5×20 and +11
		const at10 = decisionsAt(d, {}, "2025-03-24", 10, 0);
		expect(
			at10.some(
				(a) => a.kind === "surge" && a.dir === "outbound" && a.hour === 9,
			),
		).toBe(true);
		// with 1h lag the evidence hour is 8, which is normal
		expect(
			decisionsAt(d, {}, "2025-03-24", 10, 1).some((a) => a.kind === "surge"),
		).toBe(false);
		// ratio met but excess too small
		const small = new Map<string, Day>(
			MON.slice(0, 3).map((x) => [x, day({ 9: 4 })]),
		);
		small.set("2025-03-24", day({ 9: 7 }));
		expect(
			decisionsAt(small, {}, "2025-03-24", 10, 0).some(
				(a) => a.kind === "surge",
			),
		).toBe(false);
	});
	test("two consecutive surge hours escalate to review", () => {
		const d = mk(day({ 8: 35, 9: 35 }));
		const a = decisionsAt(d, {}, "2025-03-24", 10, 0).find(
			(x) => x.dir === "outbound",
		);
		expect(a?.kind).toBe("sustained-surge");
		expect(a?.severity).toBe("review");
		expect(a?.missing.length).toBeGreaterThan(0);
	});
	test("zero is 'silent' (unknown cause), not an ordinary drop", () => {
		const d = mk(day({ 8: 20, 9: 0 }, flat(20)));
		const a = decisionsAt(d, {}, "2025-03-24", 10, 0).filter(
			(x) => x.dir === "outbound",
		);
		expect(a.map((x) => x.kind)).toEqual(["silent"]);
		const d2 = mk(day({ 8: 20, 9: 8 }, flat(20)));
		expect(
			decisionsAt(d2, {}, "2025-03-24", 10, 0).some((x) => x.kind === "drop"),
		).toBe(true);
	});
	test("no baseline → explicit baseline-missing, never an action", () => {
		const d = new Map<string, Day>([["2025-03-24", day({ 9: 99 })]]);
		const a = decisionsAt(d, {}, "2025-03-24", 10, 0);
		expect(a.every((x) => x.kind === "baseline-missing")).toBe(true);
	});
	test("before service hours or unknown date → nothing", () => {
		expect(decisionsAt(mk(day({})), {}, "2025-03-24", 5, 0)).toEqual([]);
		expect(decisionsAt(mk(day({})), {}, "2030-01-01", 12, 0)).toEqual([]);
	});
	test("mid-dip lead only when the endpoint was busy first", () => {
		const hist2 = MON.slice(0, 3).map((d) => {
			const x = day({ 8: 40, 9: 40 });
			x.outbound.m[9] = 20; // 20 of 40 are middle boardings
			return [d, x] as const;
		});
		const today = day({ 8: 40, 9: 40 });
		today.outbound.b[8] = 90; // endpoint 90 vs 40 baseline → busy
		today.outbound.b[9] = 22;
		today.outbound.m[9] = 2; // middle 2 vs 20 baseline
		const d = new Map<string, Day>([...hist2, ["2025-03-24", today]]);
		const a = decisionsAt(d, {}, "2025-03-24", 10, 0);
		const lead = a.find((x) => x.kind === "mid-dip-lead");
		expect(lead?.severity).toBe("info");
		expect(lead?.action).toContain("不能視為拒載");
	});
	test("outlook lists top future baseline hours only", () => {
		const d = mk(day({}));
		const o = outlookAfter(d, {}, "2025-03-24", 9, 0);
		expect(o.every((x) => x.hour >= 8)).toBe(true);
		expect(o.length).toBe(6);
	});
});

describe("backtest", () => {
	test("perfectly periodic data has zero error; scoring is on identical cells", () => {
		const d: Days = new Map(MON.map((x) => [x, day(flat(20), flat(10))]));
		const bt = backtest(d, {});
		expect(bt.methods["mean4-calendar"].hourly.abs).toBe(0);
		expect(bt.methods["nearest-peer-calendar"].hourly.cells).toBe(
			bt.methods["mean4-calendar"].hourly.cells,
		);
		expect(bt.evaluatedDays).toBe(3); // MON[2..4] have ≥2 peers
	});
	test("error is measured against realised values", () => {
		const d: Days = new Map(MON.slice(0, 3).map((x) => [x, day({ 9: 20 })]));
		d.set("2025-03-24", day({ 9: 30 }));
		const m = backtest(d, {}).methods["mean4-calendar"];
		// MON[2]: peers 20,20 → predicted 20, actual 20 (err 0); 03-24: pred 20, actual 30 (err 10)
		expect(m.hourly.abs).toBe(10);
	});
	test("highlights rank by actual / baseline", () => {
		const d: Days = new Map(
			MON.slice(0, 3).map((x) => [x, day(flat(40), flat(40))]),
		);
		d.set("2025-03-24", day(flat(80), flat(80)));
		d.set("2025-03-31", day(flat(10), flat(10)));
		const h = highlights(d, {}, 100, 1);
		expect(h.surge[0].date).toBe("2025-03-24");
		expect(h.drop[0].date).toBe("2025-03-31");
	});
});

describe("aggregation", () => {
	test("buildDays splits direction, middle stops and unknown; pack/unpack round-trips", () => {
		const rows = [
			["2025-03-03", "6670A", "outbound", "埔里站", 9, 5, 0],
			["2025-03-03", "6670A", "outbound", "臺中", 9, 3, 1],
			["2025-03-03", "6670A", "inbound", "埔里站", 15, 2, 4],
			["2025-03-03", "6670A", "unknown", "埔里站", 15, 7, 0],
		] as never;
		const mid = middleStopNames([
			{ name: "臺中", order: 2 },
			{ name: "埔里站", order: 6 },
		]);
		const d = buildDays(rows, mid);
		const x = d.get("2025-03-03") as Day;
		expect(x.outbound.b[9]).toBe(8);
		expect(x.outbound.m[9]).toBe(5);
		expect(x.outbound.a[9]).toBe(1);
		expect(x.inbound.a[15]).toBe(4);
		expect(x.unknown).toBe(7);
		expect(unpackDays(JSON.parse(JSON.stringify(packDays(d))))).toEqual(d);
	});
});

const REPLAY = "public/data/lab/operations/replay.json";
describe.skipIf(!existsSync(REPLAY))("published replay.json", () => {
	const j = JSON.parse(readFileSync(REPLAY, "utf8"));
	test("reconciles with the source card totals", () => {
		const days = unpackDays(j.days);
		let known = 0;
		for (const d of days.values())
			for (const dir of ["outbound", "inbound"] as const)
				known += d[dir].b.reduce((a, b) => a + b, 0);
		expect(known + j.unknownDirectionBoardings).toBe(j.source.boardings);
		expect(j.source.boardings).toBe(1_800_910);
		expect(days.size + j.missingDates.length).toBe(731); // 2024 (366) + 2025 (365)
	});
});

describe("calendarTag", () => {
	const cal: Calendar = {
		"2025-04-03": { holiday: true, name: "兒童節" },
		"2025-04-04": { holiday: true, name: "清明節" },
	};
	test("own name, adjacent holiday, or null", () => {
		expect(calendarTag("2025-04-04", cal)).toBe("清明節");
		expect(calendarTag("2025-04-02", cal)).toBe("放假日前一日（兒童節）");
		expect(calendarTag("2025-04-05", cal)).toBe("放假日後一日（清明節）");
		expect(calendarTag("2025-04-09", cal)).toBeNull();
	});
});
