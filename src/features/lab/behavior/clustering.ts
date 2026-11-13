import { meanDurationMinutes } from "./duration";
import type { ArchetypeId, BehaviorCluster, OdPairStat } from "./types";

export interface ClusterArchetypeMeta {
	archetype: ArchetypeId;
	label: string;
	description: string;
}

export const ARCHETYPE_METAS: Record<ArchetypeId, ClusterArchetypeMeta> = {
	regional_commute: {
		archetype: "regional_commute",
		label: "臺中端至埔里走廊",
		description: "臺中或高鐵臺中站與埔里站連接，依序套用規則後歸入本組。",
	},
	tourism_intercity: {
		archetype: "tourism_intercity",
		label: "臺中端至日月潭／九族走廊",
		description: "臺中或高鐵臺中站連接日月潭或九族文化村，不推論搭乘目的。",
	},
	campus_student: {
		archetype: "campus_student",
		label: "校名站點或學生票占比組",
		description:
			"端點含暨南大學或為崎下，或學生票占比至少25%，不代表旅客身分或就學目的。",
	},
	local_shuttle: {
		archetype: "local_shuttle",
		label: "平均時長不逾50分鐘且千筆以上組",
		description: "前述規則未命中、有效樣本平均時長不逾50分鐘且旅次至少1000筆。",
	},
	intermediate_minor: {
		archetype: "intermediate_minor",
		label: "其餘 OD 組",
		description: "未命中前述條件的 OD，包含無有效時長樣本者，不推定需求目的。",
	},
	abnormal_tap: {
		archetype: "abnormal_tap",
		label: "同站 OD 待查組",
		description:
			"上下車站相同的紀錄，原因未知；與短於3分鐘的分析排除條件分開。",
	},
};

/**
 * Aggregate ordered manual rule groups; no model fitting or feature clustering.
 */
export function clusterOdPairs(odPairs: OdPairStat[]): BehaviorCluster[] {
	const clusterMap = new Map<ArchetypeId, OdPairStat[]>();

	for (const od of odPairs) {
		const list = clusterMap.get(od.archetype) ?? [];
		list.push(od);
		clusterMap.set(od.archetype, list);
	}

	const archetypeOrder: ArchetypeId[] = [
		"regional_commute",
		"tourism_intercity",
		"campus_student",
		"local_shuttle",
		"intermediate_minor",
		"abnormal_tap",
	];

	const totalTripsAll = odPairs.reduce((s, od) => s + od.trips, 0);

	const clusters: BehaviorCluster[] = archetypeOrder.map((archetype, idx) => {
		const members = clusterMap.get(archetype) ?? [];
		const meta = ARCHETYPE_METAS[archetype];
		const clusterTrips = members.reduce((s, m) => s + m.trips, 0);
		const clusterTripShare =
			totalTripsAll > 0 ? clusterTrips / totalTripsAll : 0;

		// Duration weights use valid samples; other ratios use all trips.
		let weightedDuration = 0;
		let durationWeightSum = 0;
		let weightedWeekend = 0;
		let weightedAmPeak = 0;
		let weightedPmPeak = 0;
		let weightedStudent = 0;
		let weightedConcession = 0;
		let weightedGeneral = 0;

		for (const m of members) {
			if (m.durationSampleCount > 0) {
				weightedDuration += m.durationSumSec;
				durationWeightSum += m.durationSampleCount;
			}
			weightedWeekend += m.weekendTrips;
			weightedAmPeak += m.amPeakTrips;
			weightedPmPeak += m.pmPeakTrips;
			weightedStudent += m.studentTrips;
			weightedConcession += m.concessionTrips;
			weightedGeneral += m.generalTrips;
		}

		const avgDurationMin =
			durationWeightSum > 0
				? meanDurationMinutes(weightedDuration, durationWeightSum)
				: null;
		const weekendRatio =
			clusterTrips > 0
				? Number((weightedWeekend / clusterTrips).toFixed(4))
				: 0;
		const amPeakRatio =
			clusterTrips > 0 ? Number((weightedAmPeak / clusterTrips).toFixed(4)) : 0;
		const pmPeakRatio =
			clusterTrips > 0 ? Number((weightedPmPeak / clusterTrips).toFixed(4)) : 0;
		const studentRatio =
			clusterTrips > 0
				? Number((weightedStudent / clusterTrips).toFixed(4))
				: 0;
		const concessionRatio =
			clusterTrips > 0
				? Number((weightedConcession / clusterTrips).toFixed(4))
				: 0;
		const generalRatio =
			clusterTrips > 0
				? Number((weightedGeneral / clusterTrips).toFixed(4))
				: 0;

		// Top OD pairs in this cluster
		const sortedMembers = [...members].sort((a, b) => b.trips - a.trips);
		const topOdPairs = sortedMembers.slice(0, 5).map((m) => ({
			boardStop: m.boardStop,
			alightStop: m.alightStop,
			trips: m.trips,
			shareInCluster:
				clusterTrips > 0 ? Number((m.trips / clusterTrips).toFixed(4)) : 0,
			avgDurationMin: m.avgDurationMin,
		}));

		return {
			clusterId: idx + 1,
			archetype,
			label: meta.label,
			description: meta.description,
			odPairCount: members.length,
			totalTrips: clusterTrips,
			totalTripShare: Number(clusterTripShare.toFixed(4)),
			avgDurationMin,
			durationSumSec: weightedDuration,
			durationSampleCount: durationWeightSum,
			weekendRatio,
			amPeakRatio,
			pmPeakRatio,
			studentRatio,
			concessionRatio,
			generalRatio,
			topOdPairs,
		};
	});

	return clusters;
}
