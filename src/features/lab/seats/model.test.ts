import { describe, expect, test } from "bun:test";
import {
	allocate,
	arrivalsForVehicleDay,
	reservations,
	seatLevel,
	type Trip,
} from "./model";

const order = new Map([
	["A", 1],
	["B", 2],
	["C", 3],
]);
const trip = (
	board: number,
	alight: number,
	boardStop = "A",
	alightStop = "C",
): Trip => ({
	vehicle: "v",
	date: "2025-01-01",
	board,
	alight,
	boardStop,
	alightStop,
	subroute: "6670D",
});

describe("stop arrivals", () => {
	test("load is counted before the first boarding and boardings are grouped", () => {
		const trips = [
			trip(0, 3600),
			trip(30, 3600),
			trip(1800, 3600, "B"),
			trip(1830, 3600, "B"),
		];
		const out = arrivalsForVehicleDay(trips, order);
		expect(out.map((a) => [a.stop, a.load, a.boarded, a.direction])).toEqual([
			["A", 0, 2, "outbound"],
			["B", 2, 2, "outbound"],
		]);
	});

	test("alightings at the same second are applied before boardings", () => {
		const trips = [trip(0, 1000, "A", "B"), trip(1000, 2000, "B", "A")];
		const out = arrivalsForVehicleDay(trips, order);
		expect(out[1]).toMatchObject({ stop: "B", load: 0, direction: "inbound" });
	});

	test("unusable records are dropped and a long gap starts a new arrival", () => {
		const trips = [
			trip(0, 60), // < 3 min
			trip(0, 3600, "A", "A"), // same stop
			trip(100, 4000),
			trip(100 + 11 * 60, 4000),
		];
		const out = arrivalsForVehicleDay(trips, order);
		expect(out.map((a) => [a.load, a.boarded])).toEqual([
			[0, 1],
			[1, 1],
		]);
	});
});

describe("seat level", () => {
	test("thresholds", () => {
		expect(seatLevel(30, 43, 5)).toBe("available");
		expect(seatLevel(38, 43, 5)).toBe("few");
		expect(seatLevel(43, 43, 5)).toBe("full");
		expect(seatLevel(50, 43, 5)).toBe("full");
	});
});

describe("reservations", () => {
	test("largest remainder keeps the rounded total", () => {
		const r = reservations(
			[
				{ minute: 0, riders: 3 },
				{ minute: 15, riders: 3 },
				{ minute: 30, riders: 3 },
			],
			0.5,
		);
		expect(r.reduce((s, x) => s + x.riders, 0)).toBe(5);
		expect(() => reservations([], 2)).toThrow();
	});
});

describe("allocation", () => {
	const opts = {
		start: 600,
		end: 660,
		interval: 30,
		seats: 2,
		tolerance: 30,
		minToRun: 2,
	};

	test("fills nearest bus within tolerance and conserves riders", () => {
		const a = allocate([{ minute: 600, riders: 5 }], opts);
		expect(a.buses).toEqual([
			{ departure: 600, riders: 2 },
			{ departure: 630, riders: 2 },
		]);
		expect(a.requested).toBe(5);
		expect(a.carried + a.toRegular).toBe(5);
	});

	test("reservations are consolidated onto the departure that can reach the minimum", () => {
		const a = allocate(
			[
				{ minute: 600, riders: 1 },
				{ minute: 660, riders: 2 },
			],
			{ ...opts, seats: 3 },
		);
		// 10:00 alone would have 1 and 11:00 alone 2; 10:30 reaches all three within ±30 min.
		expect(a.buses).toEqual([{ departure: 630, riders: 3 }]);
		expect(a.toRegular).toBe(0);
	});

	test("riders that cannot reach the minimum go to regular buses", () => {
		const a = allocate([{ minute: 600, riders: 1 }], opts);
		expect(a.buses).toEqual([]);
		expect(a.toRegular).toBe(1);
	});

	test("invalid options throw", () => {
		expect(() => allocate([], { ...opts, minToRun: 3 })).toThrow();
		expect(() => allocate([], { ...opts, interval: 0 })).toThrow();
	});
});
