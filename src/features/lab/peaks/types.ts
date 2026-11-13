/** Schema v2. Counts are observed aggregates, never a complete service census. */
export type Direction = "outbound" | "inbound" | "unknown";
export type DirectionWithAll = Direction | "all";
export type DayType = "government_workday" | "government_restday";
export interface GovernmentCalendar {
	retrievedAt: string;
	dataset: string;
	provider: string;
	field: string;
	sources: {
		year: number;
		label: string;
		days: number;
		sha256: string;
		url: string;
	}[];
	days: Record<string, { rest: boolean; note?: string }>;
}
export type StopRole =
	| "transport_hub_candidate"
	| "campus_candidate"
	| "airport_candidate"
	| "unknown";
export interface PeakMetrics {
	analysisHours: number[];
	includedVolume: number;
	excludedVolume: number;
	peakHour: number | null;
	peakVolume: number;
	baseVolume: number | null;
	peakToBaseRatio: number | null;
	cr3: number | null;
	cr4: number | null;
	gini: number | null;
	amPeakHour: number | null;
	amPeakVolume: number;
	pmPeakHour: number | null;
	pmPeakVolume: number;
}
export interface CalendarAuditDay {
	date: string;
	dayOfWeek: number;
	dayType: DayType;
	governmentRest: boolean;
	calendarNote?: string;
	boardings: number | null;
	alightings: number | null;
	recordCount: number;
	status: "observed" | "missing_unknown";
}
export type SourceRow = [
	string,
	string,
	Direction,
	string,
	number,
	number,
	number,
];
export interface SourcePayload {
	columns: string[];
	rows: SourceRow[];
	stops: { name: string; order: number }[];
}
export interface HourlyProfile {
	totalBoardings: number;
	totalAlightings: number;
	hourlyBoardings: number[];
	hourlyAlightings: number[];
	calendarDays: number;
	networkObservedDays: number;
	observedDays: number;
	missingGroupDays: number;
	sampleStatus: "no_records" | "incomplete_coverage" | "observed_network_days";
	/** Conditional on days containing >=1 row for this group. Not a service-day mean. */
	avgObservedDayHourlyBoardings: (number | null)[];
	avgObservedDayHourlyAlightings: (number | null)[];
	peakMetrics: PeakMetrics;
}
export interface Artifact<T> {
	schemaVersion: 2;
	data: T;
}
export type DayGroup = DayType | "all";
export interface HourlyOutput {
	analysisHours: number[];
	dimensions: Record<DirectionWithAll, Record<DayGroup, HourlyProfile>>;
	subroutes: Record<
		string,
		HourlyProfile & { directions: Record<Direction, HourlyProfile> }
	>;
	months: Record<string, HourlyProfile>;
}
export interface StationPeakProfile extends HourlyProfile {
	stop: string;
	order: number;
	role: StopRole;
	roleBasis: "analyst_candidate_not_route_position";
	directions: Record<Direction, HourlyProfile>;
	dominantDirection: Direction | "balanced" | null;
	directionalAsymmetryRatio: number | null;
}
export interface PeakSummary {
	generatedAt: string;
	calendar: Omit<GovernmentCalendar, "days">;
	analysisHours: number[];
	dataSpan: {
		startDate: string;
		endDate: string;
		totalCalendarDays: number;
		observedDays: number;
		missingDays: number;
	};
	totalBoardings: number;
	totalAlightings: number;
	directionBreakdown: Record<
		Direction,
		{ boardings: number; alightings: number; share: number | null }
	>;
	overallMetrics: {
		all: PeakMetrics;
		restVsWorkdayObservedMeanRatio: number | null;
		fridayVsMonThuObservedMeanRatio: number | null;
	};
	comparisonSamples: Record<
		string,
		{ observedDays: number; totalBoardings: number; mean: number | null }
	>;
	dataQuality: {
		totalRows: number;
		missingDates: string[];
		missingCause: "unknown";
		reconciliation: { months: number; keys: number; status: "exact_key_match" };
	};
}
