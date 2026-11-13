/**
 * Type definitions for Route 6670 passenger trip behavior and OD analysis.
 * Strict write scope: src/features/lab/behavior/
 */

/** Legacy machine identifiers only; labels and ordered rules define their meaning, not trip purpose. */
export type ArchetypeId =
	| "regional_commute"
	| "tourism_intercity"
	| "campus_student"
	| "local_shuttle"
	| "intermediate_minor"
	| "abnormal_tap";

export interface HourlyDistribution {
	/** 0 to 23 hour */
	hour: number;
	trips: number;
	share: number;
}

export interface TicketGroupShare {
	group: "general" | "student" | "concession" | "tpass_commuter" | "other";
	groupLabel: string;
	trips: number;
	share: number;
}

export interface OdPairStat {
	id: string;
	boardStop: string;
	alightStop: string;
	trips: number;
	shareOfTotal: number;
	rank: number;

	// Trip Duration (filtered: 3 min <= duration <= 360 min)
	avgDurationMin: number | null;
	medianDurationMin?: number;
	durationSampleCount: number;
	durationSumSec: number;

	// Temporal profiles
	weekendTrips: number;
	weekendRatio: number;
	weekdayTrips: number;
	weekdayRatio: number;
	amPeakTrips: number; // 06:00 - 09:59
	amPeakRatio: number;
	pmPeakTrips: number; // 16:00 - 19:59
	pmPeakRatio: number;
	offPeakTrips: number;
	hourly: number[]; // length 24

	// Ticket types
	studentTrips: number;
	studentRatio: number;
	concessionTrips: number; // 名稱含敬老、愛心、博愛、陪伴、仁愛
	concessionRatio: number;
	generalTrips: number;
	generalRatio: number;
	tpassTrips: number;
	tpassRatio: number;
	otherTrips: number;
	otherRatio: number;

	// Subroute distribution
	subroutes: Record<string, number>;

	// Assigned archetype & cluster
	archetype: ArchetypeId;
	archetypeLabel: string;
	clusterId: number;
}

export interface BehaviorCluster {
	clusterId: number;
	archetype: ArchetypeId;
	label: string;
	description: string;
	odPairCount: number;
	totalTrips: number;
	totalTripShare: number;

	// Descriptive aggregates, not ML centroids
	durationSampleCount: number;
	durationSumSec: number;
	avgDurationMin: number | null;
	weekendRatio: number;
	amPeakRatio: number;
	pmPeakRatio: number;
	studentRatio: number;
	concessionRatio: number;
	generalRatio: number;

	// Key representative OD pairs
	topOdPairs: Array<{
		boardStop: string;
		alightStop: string;
		trips: number;
		shareInCluster: number;
		avgDurationMin: number | null;
	}>;
}

export interface DataInventoryItem {
	datasetName: string;
	location: string;
	rowCount: number;
	hasOdPairs: boolean;
	canReconstructOd: boolean;
	hasCardId: boolean;
	canTrackReturnTrips: boolean;
	canTrackTransfers: boolean;
	notes: string;
}

export interface OdFeasibilityReport {
	singleTripOdFeasible: boolean;
	returnTripTrackingFeasible: boolean;
	transferChainFeasible: boolean;
	loyaltyAnalysisFeasible: boolean;
	reasons: {
		singleTripOd: string;
		returnTripTracking: string;
		transferChain: string;
		cardTapLimitation: string;
	};
}

export interface BehaviorAnalysisSummary {
	schemaVersion: 2;
	method: "ordered_manual_rules";
	generatedAt: string;
	totalTrips: number;
	/** Distinct recorded boarding dates, not operating or consecutive days. */
	activeDatesCount: number;
	dateRange: { start: string; end: string };
	distinctOdPairsCount: number;
	validOdTripsCount: number;
	sameStopOdCount: number;
	qualityEvidence: Record<string, number>;
	reconciliation: Record<string, boolean>;
	durationAnomalies: {
		under3Min: number;
		over6Hours: number;
		zeroDuration: number;
		negativeDuration: number;
	};
	feasibility: OdFeasibilityReport;
	dataInventory: DataInventoryItem[];
	clusters: BehaviorCluster[];
	allOdPairs: OdPairStat[];
	topOdPairs: OdPairStat[];
	overallHourly: HourlyDistribution[];
	subrouteOverview: Array<{ subroute: string; trips: number; share: number }>;
	ticketGroupOverview: TicketGroupShare[];
	invariantsAudit: {
		totalTripsPreserved: boolean;
		missingAlightStopZero: boolean;
		cardIdExcluded: boolean;
		noCardLinkedInferences: boolean;
	};
}
