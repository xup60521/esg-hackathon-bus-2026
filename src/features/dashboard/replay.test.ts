import { describe, expect, test } from "bun:test";
import day from "../../../public/data/dashboard/days/2025-07-12.json";
import index from "../../../public/data/dashboard/index.json";
import {
	alertState,
	arrivalOutlook,
	buildDay,
	clock,
	type DayFile,
	type IndexFile,
	loadAt,
	makeLookup,
	seatStatus,
} from "./replay";

const idx = index as unknown as IndexFile;
const d = buildDay(day as unknown as DayFile, idx.card);
const name = new Map(idx.stops);

describe("2025-07-12 replay (proposal §2.1 worked example)", () => {
	test("three alerts, all hits", () => {
		expect(d.alerts.map((a) => clock(a.t))).toEqual([
			"08:08",
			"10:52",
			"16:39",
		]);
		expect(d.alerts.every((a) => a.hit)).toBe(true);
	});

	test("08:08 6670D alert matches the card row in the proposal", () => {
		const a = d.alerts[0];
		expect(a.run.sub).toBe("6670D");
		expect(name.get(a.from)).toBe("埔里站");
		expect(a.load).toBe(39);
		expect(a.card).toMatchObject({
			to: "崎下",
			band: "39–41",
			ratio: 0.991,
			n: 511,
		});
		expect(loadAt(a.run, a.t)).toBe(39);
		expect(alertState(a, a.t)).toBe("pending");
		expect(alertState(a, a.resolveAt)).toBe("hit");
	});

	test("16:39 load 53 is flagged for manual review, not counted", () => {
		const a = d.alerts[2];
		expect(a.load).toBe(53);
		expect(alertState(a, a.t)).toBe("review");
		expect(seatStatus(53, 41)).toBe("unknown");
	});
});

test("seat thresholds follow seats − 5", () => {
	expect(seatStatus(35, 41)).toBe("ok");
	expect(seatStatus(36, 41)).toBe("few");
	expect(seatStatus(41, 41)).toBe("full");
	expect(seatStatus(32, 37)).toBe("few");
});

test("period totals match the proposal ledger", () => {
	const s = idx.days.reduce(
		(a, x) => ({
			alerts: a.alerts + x.alerts,
			hits: a.hits + x.hits,
			anom: a.anom + x.anom,
			near41: a.near41 + x.near41,
		}),
		{ alerts: 0, hits: 0, anom: 0, near41: 0 },
	);
	expect(s).toEqual({ alerts: 585, hits: 577, anom: 6, near41: 620 });
});

test("arrival outlook at 崎下 uses the full lookup table", () => {
	const a = d.alerts[0];
	const lookup = makeLookup(idx.lookup);
	const o = arrivalOutlook(a.run, a.t, 5, 41, lookup, (x) => name.get(x) ?? "");
	expect(o).toMatchObject({ status: "few", short: "座位不多", p: 0.991 });
	expect(o.basis).toContain("埔里站 離站載客 39 人");
});
