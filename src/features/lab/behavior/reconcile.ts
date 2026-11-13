import { classifyOdArchetype } from "./analyzer";
import { meanDurationMinutes } from "./duration";
import type { BehaviorAnalysisSummary } from "./types";

/** Exact integer counts and sums, never rounded ratios, are used for reconciliation. */
export function reconcileBehavior(
	s: BehaviorAnalysisSummary,
): Record<string, boolean> {
	const ods = s.allOdPairs;
	const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
	const e = s.qualityEvidence;
	const ticketFields = {
		general: "generalTrips",
		student: "studentTrips",
		concession: "concessionTrips",
		tpass_commuter: "tpassTrips",
		other: "otherTrips",
	} as const;
	return {
		ruleAssignments: ods.every(
			(o) =>
				classifyOdArchetype({
					...o,
					avgDurationMin: o.durationSampleCount
						? o.durationSumSec / o.durationSampleCount / 60
						: null,
					studentRatio: o.studentTrips / o.trips,
				}).archetype === o.archetype,
		),
		subroutes:
			sum(s.subrouteOverview.map((r) => r.trips)) === s.totalTrips &&
			s.subrouteOverview.every(
				(r) => sum(ods.map((o) => o.subroutes[r.subroute] ?? 0)) === r.trips,
			),
		odCount:
			ods.length === s.distinctOdPairsCount &&
			new Set(ods.map((o) => JSON.stringify([o.boardStop, o.alightStop])))
				.size === ods.length,
		odTrips:
			sum(ods.map((o) => o.trips)) === s.totalTrips &&
			s.validOdTripsCount === s.totalTrips,
		clusterTrips: sum(s.clusters.map((c) => c.totalTrips)) === s.totalTrips,
		clusterMembers: s.clusters.every(
			(c) =>
				c.totalTrips ===
					sum(
						ods.filter((o) => o.archetype === c.archetype).map((o) => o.trips),
					) &&
				c.odPairCount ===
					ods.filter((o) => o.archetype === c.archetype).length &&
				c.durationSampleCount ===
					sum(
						ods
							.filter((o) => o.archetype === c.archetype)
							.map((o) => o.durationSampleCount),
					) &&
				c.durationSumSec ===
					sum(
						ods
							.filter((o) => o.archetype === c.archetype)
							.map((o) => o.durationSumSec),
					),
		),
		hourly:
			s.overallHourly.length === 24 &&
			s.overallHourly.every(
				(h) => sum(ods.map((o) => o.hourly[h.hour])) === h.trips,
			) &&
			sum(s.overallHourly.map((h) => h.trips)) === s.totalTrips,
		perOdCounts: ods.every(
			(o) =>
				o.hourly.length === 24 &&
				sum(o.hourly) === o.trips &&
				o.weekendTrips + o.weekdayTrips === o.trips &&
				o.amPeakTrips + o.pmPeakTrips + o.offPeakTrips === o.trips &&
				sum(Object.values(o.subroutes)) === o.trips &&
				sum(Object.values(ticketFields).map((f) => o[f])) === o.trips,
		),
		tickets:
			sum(s.ticketGroupOverview.map((t) => t.trips)) === s.totalTrips &&
			s.ticketGroupOverview.every(
				(t) => sum(ods.map((o) => o[ticketFields[t.group]])) === t.trips,
			),
		durationSamples:
			sum(ods.map((o) => o.durationSampleCount)) === e.valid_dur_count &&
			sum(s.clusters.map((c) => c.durationSampleCount)) === e.valid_dur_count,
		durationSum:
			sum(ods.map((o) => o.durationSumSec)) === e.duration_sum_sec &&
			sum(s.clusters.map((c) => c.durationSumSec)) === e.duration_sum_sec,
		durationPartition:
			e.valid_dur_count +
				e.under_3min +
				e.zero_dur +
				e.negative_dur +
				e.over_6hr +
				e.missing_duration ===
			s.totalTrips,
		durationMeans:
			ods.every(
				(o) =>
					o.avgDurationMin ===
					(o.durationSampleCount
						? meanDurationMinutes(o.durationSumSec, o.durationSampleCount)
						: null),
			) &&
			s.clusters.every(
				(c) =>
					c.avgDurationMin ===
					(c.durationSampleCount
						? meanDurationMinutes(c.durationSumSec, c.durationSampleCount)
						: null),
			),
		sameStop:
			sum(
				ods.filter((o) => o.boardStop === o.alightStop).map((o) => o.trips),
			) === s.sameStopOdCount,
		dateHour: e.board_date_mismatch === 0 && e.missing_hour === 0,
	};
}
