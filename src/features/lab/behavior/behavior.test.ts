import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import {
	categorizeTicketType,
	classifyOdArchetype,
	EXPECTED_TOTAL_TRIPS,
	getDataInventoryComparison,
	getOdFeasibilityReport,
	isValidDuration,
} from "./analyzer";
import { clusterOdPairs } from "./clustering";
import type { BehaviorAnalysisSummary, OdPairStat } from "./types";

describe("Traveler Behavior & OD Analyzer", () => {
	it("verifies ticket type classification", () => {
		expect(categorizeTicketType("台北市一般票")).toBe("general");
		expect(categorizeTicketType("一般卡")).toBe("general");
		expect(categorizeTicketType("暨南大學學生卡")).toBe("student");
		expect(categorizeTicketType("台北市學生票")).toBe("student");
		expect(categorizeTicketType("臺中市敬老1票")).toBe("concession");
		expect(categorizeTicketType("南投縣敬老卡")).toBe("concession");
		expect(categorizeTicketType("南投縣愛心票")).toBe("concession");
		expect(categorizeTicketType("中彰投苗(市民)")).toBe("tpass_commuter");
		expect(categorizeTicketType("臺中市區通勤(市民)")).toBe("tpass_commuter");
		expect(categorizeTicketType("未知代碼999")).toBe("other");
	});

	it("filters duration anomalies according to 3min ~ 6hr threshold", () => {
		expect(isValidDuration(0)).toBe(false);
		expect(isValidDuration(120)).toBe(false); // 2 minutes
		expect(isValidDuration(179)).toBe(false);
		expect(isValidDuration(180)).toBe(true); // 3 minutes boundary
		expect(isValidDuration(3600)).toBe(true); // 1 hour
		expect(isValidDuration(21600)).toBe(true); // 6 hours boundary
		expect(isValidDuration(21601)).toBe(false); // > 6 hours
	});

	it("correctly classifies OD ordered rules", () => {
		// 1. Same-stop review group
		const abnormal = classifyOdArchetype({
			boardStop: "埔里站",
			alightStop: "埔里站",
			trips: 100,
			avgDurationMin: 0.5,
			weekendRatio: 0.28,
			amPeakRatio: 0.1,
			pmPeakRatio: 0.1,
			studentRatio: 0.05,
		});
		expect(abnormal.archetype).toBe("abnormal_tap");

		// 2. Campus stop or student ticket threshold
		const campus = classifyOdArchetype({
			boardStop: "高鐵臺中站",
			alightStop: "暨南大學校內",
			trips: 17605,
			avgDurationMin: 52.6,
			weekendRatio: 0.35,
			amPeakRatio: 0.15,
			pmPeakRatio: 0.35,
			studentRatio: 0.65,
		});
		expect(campus.archetype).toBe("campus_student");

		// 3. Named endpoint corridor
		const tourism = classifyOdArchetype({
			boardStop: "高鐵臺中站",
			alightStop: "日月潭",
			trips: 130537,
			avgDurationMin: 83.9,
			weekendRatio: 0.32,
			amPeakRatio: 0.44,
			pmPeakRatio: 0.04,
			studentRatio: 0.03,
		});
		expect(tourism.archetype).toBe("tourism_intercity");

		// 4. Puli endpoint corridor
		const commute = classifyOdArchetype({
			boardStop: "埔里站",
			alightStop: "高鐵臺中站",
			trips: 339042,
			avgDurationMin: 58.0,
			weekendRatio: 0.33,
			amPeakRatio: 0.26,
			pmPeakRatio: 0.27,
			studentRatio: 0.18,
		});
		expect(commute.archetype).toBe("regional_commute");

		// 5. Duration and volume threshold
		const local = classifyOdArchetype({
			boardStop: "埔里站",
			alightStop: "魚池",
			trips: 5000,
			avgDurationMin: 28.5,
			weekendRatio: 0.25,
			amPeakRatio: 0.2,
			pmPeakRatio: 0.2,
			studentRatio: 0.05,
		});
		expect(local.archetype).toBe("local_shuttle");
	});

	it("strictly enforces privacy invariant: no card-level tracking or transfer inference", () => {
		const report = getOdFeasibilityReport();
		expect(report.singleTripOdFeasible).toBe(true);
		expect(report.returnTripTrackingFeasible).toBe(false);
		expect(report.transferChainFeasible).toBe(false);
		expect(report.loyaltyAnalysisFeasible).toBe(false);
		expect(report.reasons.returnTripTracking).toContain("移除電子票證卡號");
		expect(report.reasons.cardTapLimitation).toContain("拒載");
	});

	it("differentiates database trips table and midstop.json aggregate", () => {
		const inventory = getDataInventoryComparison();
		expect(inventory.length).toBe(2);

		const tripsTable = inventory.find((i) => i.datasetName.includes("trips"));
		expect(tripsTable?.hasOdPairs).toBe(true);
		expect(tripsTable?.canReconstructOd).toBe(true);
		expect(tripsTable?.hasCardId).toBe(false);

		const midstopJson = inventory.find((i) =>
			i.datasetName.includes("midstop.json"),
		);
		expect(midstopJson?.hasOdPairs).toBe(false);
		expect(midstopJson?.canReconstructOd).toBe(false);
	});

	it("preserves trip volume conservation in rule groups", () => {
		const sampleOdPairs: OdPairStat[] = [
			{
				id: "1",
				boardStop: "埔里站",
				alightStop: "高鐵臺中站",
				trips: 1000,
				shareOfTotal: 0.5,
				rank: 1,
				avgDurationMin: 58,
				durationSampleCount: 1000,
				durationSumSec: 58 * 60 * 1000,
				weekendTrips: 300,
				weekendRatio: 0.3,
				weekdayTrips: 700,
				weekdayRatio: 0.7,
				amPeakTrips: 250,
				amPeakRatio: 0.25,
				pmPeakTrips: 250,
				pmPeakRatio: 0.25,
				offPeakTrips: 500,
				hourly: new Array(24).fill(0),
				studentTrips: 200,
				studentRatio: 0.2,
				concessionTrips: 200,
				concessionRatio: 0.2,
				generalTrips: 600,
				generalRatio: 0.6,
				tpassTrips: 0,
				tpassRatio: 0,
				otherTrips: 0,
				otherRatio: 0,
				subroutes: { "6670D": 1000 },
				archetype: "regional_commute",
				archetypeLabel: "臺中端至埔里走廊",
				clusterId: 1,
			},
			{
				id: "2",
				boardStop: "高鐵臺中站",
				alightStop: "日月潭",
				trips: 1000,
				shareOfTotal: 0.5,
				rank: 2,
				avgDurationMin: 85,
				durationSampleCount: 1000,
				durationSumSec: 85 * 60 * 1000,
				weekendTrips: 400,
				weekendRatio: 0.4,
				weekdayTrips: 600,
				weekdayRatio: 0.6,
				amPeakTrips: 450,
				amPeakRatio: 0.45,
				pmPeakTrips: 50,
				pmPeakRatio: 0.05,
				offPeakTrips: 500,
				hourly: new Array(24).fill(0),
				studentTrips: 50,
				studentRatio: 0.05,
				concessionTrips: 150,
				concessionRatio: 0.15,
				generalTrips: 800,
				generalRatio: 0.8,
				tpassTrips: 0,
				tpassRatio: 0,
				otherTrips: 0,
				otherRatio: 0,
				subroutes: { "6670": 1000 },
				archetype: "tourism_intercity",
				archetypeLabel: "臺中端至日月潭／九族走廊",
				clusterId: 2,
			},
		];

		const clusters = clusterOdPairs(sampleOdPairs);
		const sumTripsInClusters = clusters.reduce((s, c) => s + c.totalTrips, 0);
		expect(sumTripsInClusters).toBe(2000);

		const regionalCluster = clusters.find(
			(c) => c.archetype === "regional_commute",
		);
		expect(regionalCluster?.totalTrips).toBe(1000);
		expect(regionalCluster?.avgDurationMin).toBe(58);

		const tourismCluster = clusters.find(
			(c) => c.archetype === "tourism_intercity",
		);
		expect(tourismCluster?.totalTrips).toBe(1000);
		expect(tourismCluster?.avgDurationMin).toBe(85);
	});

	it("validates produced artifacts in public/data/lab/behavior/", async () => {
		const summaryRaw = await readFile(
			"public/data/lab/behavior/od-behavior-summary.json",
			"utf8",
		);
		const summary: BehaviorAnalysisSummary = JSON.parse(summaryRaw);

		expect(summary.totalTrips).toBe(EXPECTED_TOTAL_TRIPS);
		expect(summary.distinctOdPairsCount).toBe(206);
		expect(summary.validOdTripsCount).toBe(EXPECTED_TOTAL_TRIPS);
		expect(summary.sameStopOdCount).toBe(6281);

		// Sum of trips in clusters equals expected total
		const clusterTripSum = summary.clusters.reduce(
			(s, c) => s + c.totalTrips,
			0,
		);
		expect(clusterTripSum).toBe(EXPECTED_TOTAL_TRIPS);

		// Hourly distribution check
		expect(summary.overallHourly.length).toBe(24);
		const hourlySum = summary.overallHourly.reduce((s, h) => s + h.trips, 0);
		expect(hourlySum).toBe(EXPECTED_TOTAL_TRIPS);

		// Check invariantsAudit
		expect(summary.invariantsAudit.totalTripsPreserved).toBe(true);
		expect(summary.invariantsAudit.missingAlightStopZero).toBe(true);
		expect(summary.invariantsAudit.cardIdExcluded).toBe(true);
		expect(summary.invariantsAudit.noCardLinkedInferences).toBe(true);

		// Ensure raw text has no card identifier leaks
		expect(summaryRaw).not.toContain("card_number");
		expect(summaryRaw).not.toContain("driver_id");
	});
});

describe("v2 regression checks", () => {
	it("uses valid duration samples and exact seconds, not trip weights or rounded OD means", async () => {
		const summary: BehaviorAnalysisSummary = await Bun.file(
			"public/data/lab/behavior/od-behavior-summary.json",
		).json();
		const base = summary.topOdPairs[0];
		const members: OdPairStat[] = [
			{
				...base,
				trips: 1000,
				durationSampleCount: 1,
				durationSumSec: 600,
				avgDurationMin: 10,
			},
			{
				...base,
				trips: 10,
				durationSampleCount: 9,
				durationSumSec: 10827,
				avgDurationMin: 20.1,
			},
			{
				...base,
				trips: 5000,
				durationSampleCount: 0,
				durationSumSec: 0,
				avgDurationMin: null,
			},
		];
		const c = clusterOdPairs(members).find(
			(c) => c.archetype === base.archetype,
		);
		if (!c) throw new Error("Expected sample rule group");
		expect(c.durationSampleCount).toBe(10);
		expect(c.durationSumSec).toBe(11427);
		expect(c.avgDurationMin).toBe(19);
		expect(
			clusterOdPairs([members[2]]).every((c) => c.avgDurationMin === null),
		).toBe(true);
	});

	it("keeps unknown tickets separate and resolves overlapping names once", () => {
		expect(categorizeTicketType(null)).toBe("other");
		expect(categorizeTicketType(" ")).toBe("other");
		expect(categorizeTicketType("聯合科大一般卡")).toBe("student");
		expect(categorizeTicketType("愛心陪伴一般卡")).toBe("concession");
		expect(categorizeTicketType("學生通勤敬老一般")).toBe("student");
		expect(categorizeTicketType("通勤一般")).toBe("tpass_commuter");
		expect(categorizeTicketType("未知票種")).toBe("other");
	});

	it("does not label absent duration or real short trips as same-stop anomalies", () => {
		const base = {
			boardStop: "甲",
			alightStop: "乙",
			trips: 50,
			avgDurationMin: null,
			weekendRatio: 0,
			amPeakRatio: 0,
			pmPeakRatio: 0,
			studentRatio: 0,
		};
		expect(classifyOdArchetype(base).archetype).toBe("intermediate_minor");
		expect(classifyOdArchetype({ ...base, avgDurationMin: 1 }).archetype).toBe(
			"intermediate_minor",
		);
		expect(classifyOdArchetype({ ...base, alightStop: "甲" }).archetype).toBe(
			"abnormal_tap",
		);
		expect(
			classifyOdArchetype({ ...base, weekendRatio: 1, amPeakRatio: 1 })
				.archetype,
		).toBe(classifyOdArchetype(base).archetype);
	});

	it("reconciles all 206 ODs, five ticket groups, hourly and duration evidence; detects corruption", async () => {
		const { reconcileBehavior } = await import("./reconcile");
		const summary: BehaviorAnalysisSummary = await Bun.file(
			"public/data/lab/behavior/od-behavior-summary.json",
		).json();
		expect(summary.schemaVersion).toBe(2);
		expect(summary.allOdPairs.length).toBe(206);
		expect(Object.values(reconcileBehavior(summary)).every(Boolean)).toBe(true);
		expect(
			reconcileBehavior({ ...summary, allOdPairs: summary.topOdPairs }).odTrips,
		).toBe(false);
		const broken = structuredClone(summary);
		broken.allOdPairs[0].otherTrips++;
		expect(reconcileBehavior(broken).tickets).toBe(false);
		expect(reconcileBehavior(broken).perOdCounts).toBe(false);
		broken.allOdPairs[0].durationSumSec++;
		expect(reconcileBehavior(broken).durationSum).toBe(false);
		expect(summary.qualityEvidence.missing_alight_stop).toBe(0);
	});
});

it("queries NULL/blank stop names independently of absent timestamps", async () => {
	const { Database } = await import("bun:sqlite");
	const { metadataSql } = await import(
		"../../../../scripts/lab/behavior/queries"
	);
	const db = new Database(":memory:");
	try {
		db.run(
			"CREATE TABLE trips (board_date TEXT, board_stop TEXT, alight_stop TEXT, board_ts INTEGER, alight_ts INTEGER)",
		);
		const insert = db.prepare(
			"INSERT INTO trips VALUES ('1970-01-01', 'A', ?, 0, ?)",
		);
		insert.run("B", 60);
		insert.run("", 600);
		insert.run("   ", null);
		insert.run(null, 300);
		insert.run("B", null);
		const r = db.query(metadataSql).get() as Record<string, number>;
		expect(r.missing_alight_stop).toBe(3);
		expect(r.missing_alight_ts).toBe(2);
		expect(r.valid_od_trips).toBe(2);
		expect(r.valid_dur_count).toBe(2);
		expect(r.duration_sum_sec).toBe(900);
		expect(r.under_3min).toBe(1);
		expect(r.missing_duration).toBe(2);
	} finally {
		db.close();
	}
});
