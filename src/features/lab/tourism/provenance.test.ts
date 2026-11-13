import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import catalog from "../../../../public/data/lab/tourism/attractions.json";
import timetableJson from "../../../../public/data/lab/tourism/timetable.json";
import { getDayType, verifyTripReachability } from "./engine";
import { generateSampleScenarios } from "./sampleScenarios";
import type {
	Attraction,
	DayType,
	ItineraryRequest,
	TimetableData,
} from "./types";

const attractions = catalog.attractions as Attraction[];
const timetable = timetableJson as unknown as TimetableData;
const request: ItineraryRequest = {
	originStopId: "thsr",
	attractionId: attractions[0].id,
	departureDate: "2026-11-05",
	departureTime: "08:30",
	customDwellMinutes: 90,
};

describe("Bounded source evidence", () => {
	test("keeps only the three host-read sources and no unsupported numeric prices", () => {
		expect(attractions.map((a) => a.id)).toEqual([
			"xiangshan_visitor_center",
			"paper_dome",
			"formosan_village",
		]);
		for (const a of attractions) {
			expect(a.provenance.exactSourceUrl).toMatch(
				/Attractions\?A=20&Id=(78|4|13)$/,
			);
			expect(a.ticketInfo).not.toMatch(/\d/);
			expect(a.ticketStatus).toBe("UNKNOWN");
			expect(a.provenance.verifiedFields).not.toContain("ticketInfo");
			expect(a.provenance.assumedFields).toContain("recommendedDwellMinutes");
			expect(a.provenance.assumedFields).toContain("walkTimeMinutes");
			expect(a.highlights).toEqual([]);
			expect(
				a.provenance.verifiedFields.filter((field) =>
					a.provenance.assumedFields.includes(field),
				),
			).toEqual([]);
		}
	});
	test("Formosan last entry is unknown and 17:00 is a conservative assumption", () => {
		const a = attractions[2];
		expect(a.lastEntryTime).toBeNull();
		expect(a.lastEntryStatus).toBe("UNKNOWN");
		expect(a.provenance.unknownFields).toContain("lastEntryTime");
		expect(a.provenance.assumedFields).toContain("closeTime");
		expect(a.provenance.verifiedFields).not.toContain("closeTime");
		expect(a.scheduleNote).toContain("17:30");
	});
	test("Paper Dome includes exceptions and never asserts absolute closure", () => {
		const res = verifyTripReachability(
			{ ...request, attractionId: "paper_dome", departureDate: "2026-11-04" },
			timetable,
			attractions,
		);
		expect(res.isValid).toBe(false);
		expect(res.invalidReason).toContain("例外");
		for (const text of ["國定假日", "寒暑假", "預約團", "除夕", "夜景"])
			expect(res.warnings.join(" ")).toContain(text);
	});
	test("snapshot hash matches the recorded HTML", async () => {
		const raw = await Bun.file(
			"public/data/lab/tourism/raw_timetable_snapshot.html",
		).arrayBuffer();
		expect(createHash("sha256").update(new Uint8Array(raw)).digest("hex")).toBe(
			timetable.metadata.snapshotSha256,
		);
	});
});

describe("Conditional simulation boundary", () => {
	test("every scenario has conditional status and persistent assumptions", () => {
		for (const { result } of generateSampleScenarios(timetable, attractions)) {
			expect(result.status).toBe("conditional_snapshot_simulation");
			for (const text of [
				"isValid不代表旅行有效",
				"步行",
				"停留",
				"臨時休園",
				"有效範圍未知",
			])
				expect(result.warnings.join(" ")).toContain(text);
		}
		const res = verifyTripReachability(request, timetable, attractions);
		expect(res.warnings.join(" ")).toContain("最後入園時間未知");
		const future = verifyTripReachability(
			{ ...request, departureDate: "2099-11-05" },
			timetable,
			attractions,
		);
		expect(future.status).toBe("conditional_snapshot_simulation");
		expect(future.warnings.join(" ")).toContain("任意未來日期不保證仍現行");
	});
	test("reads dates from supplied data and fails closed on missing snapshot date", () => {
		const newer = structuredClone(timetable);
		newer.metadata.retrievedDate = "2026-11-06";
		const res = verifyTripReachability(request, newer, attractions);
		expect(res.isValid).toBe(false);
		expect(res.invalidReason).toContain("2026-11-06");
		newer.metadata.retrievedDate = "";
		expect(verifyTripReachability(request, newer, attractions).isValid).toBe(
			false,
		);
		const laterAttraction = structuredClone(attractions);
		laterAttraction[0].provenance.retrievedDate = "2026-11-07";
		expect(
			verifyTripReachability(request, timetable, laterAttraction).isValid,
		).toBe(false);
	});
	test("rejects invalid runtime day overrides including falsy values", () => {
		for (const override of ["", null, 0, "weekend"]) {
			expect(
				getDayType(request.departureDate, override as DayType).isValidDate,
			).toBe(false);
			expect(
				verifyTripReachability(
					{ ...request, dayTypeOverride: override as DayType },
					timetable,
					attractions,
				).isValid,
			).toBe(false);
		}
	});
	test("rejects negative walking and illegal or reversed opening/entry times", () => {
		const corruptions = [
			{ walkTimeMinutes: -1 },
			{ walkTimeMinutes: NaN },
			{ walkTimeMinutes: 1.5 },
			{ openTime: "25:00" },
			{ openTime: "17:30" },
			{ closeTime: "bad" },
			{ lastEntryTime: "bad" },
			{ lastEntryTime: "08:00" },
			{ lastEntryTime: "18:00" },
			{ recommendedDwellMinutes: -1 },
		];
		for (const patch of corruptions) {
			const res = verifyTripReachability(request, timetable, [
				{ ...attractions[0], ...patch },
			]);
			expect(res.isValid).toBe(false);
			expect(res.invalidReason).toContain("景點資料無效");
			expect(res.outbound).toBeNull();
		}
	});
	test("no-return wording is limited to route 6670 snapshot", () => {
		const res = generateSampleScenarios(timetable, attractions).find(
			(s) => s.scenarioId === "scenario_stranded_xiangshan",
		)?.result;
		if (!res) throw new Error("missing no-return example");
		expect(res.invalidReason).toContain("6670快照");
		expect(res.lastBusRisk?.backupPlan).toContain("此6670快照");
		expect(res.warnings.join(" ")).toContain("其他公車與服務未查證");
	});
});

describe("independent review regressions", () => {
	test("lake origin can travel on inbound table and return on outbound table", () => {
		const result = verifyTripReachability(
			{
				originStopId: "sunmoonlake",
				attractionId: "paper_dome",
				departureDate: "2026-11-06",
				departureTime: "09:00",
				customDwellMinutes: 60,
			},
			timetable,
			attractions,
		);
		expect(result.isValid).toBe(true);
		expect(result.outbound?.departureTime).toBe("09:10");
		expect(result.outbound?.arrivalTime).toBe("09:40");
		expect(result.inbound).not.toBeNull();
		expect(result.lastBusRisk?.riskLevel).not.toBe("INVALID");
	});
	test("unmatched return does not expose midnight sentinel or claim last bus passed", () => {
		const result = verifyTripReachability(
			{
				originStopId: "minxing_park",
				attractionId: "paper_dome",
				departureDate: "2026-11-06",
				departureTime: "05:00",
				customDwellMinutes: 15,
			},
			timetable,
			attractions,
		);
		expect(result.isValid).toBe(false);
		expect(result.lastBusRisk?.riskLevel).toBe("INVALID");
		expect(result.invalidReason).not.toContain("00:00");
		expect(result.warnings.join("")).not.toContain("末班車已過");
	});
});
