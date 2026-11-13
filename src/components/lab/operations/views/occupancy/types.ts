/** Shape of public/data/lab/occupancy/summary.json (schemaVersion 1). Read-only. */
export type SensitivityRow = {
	gapMinutes: number;
	candidates: number;
	stationRegressionCandidates: number;
	overFourHourCandidates: number;
	crossGroupConflictCandidates: number;
	singletons: number;
	diagnosticEligibleCandidates: number;
	diagnosticEligibleTaps: number;
	observedPeakP50: number;
	observedPeakP95: number;
	observedPeakMax: number;
};

export type Scenario = {
	policy: string;
	capacity: number;
	extraVehicles: number;
	observedTrips: number;
	transferred: number;
	retained: number;
	beforePeak: number;
	afterPeak: number;
	beforeExcess: number;
	afterExcess: number;
	beforePeakRatio: number;
	afterPeakRatio: number;
	reliefPeaks: number[];
	passengerSecondsBefore: number;
	passengerSecondsAfter: number;
};

export type SelectedCandidate = {
	route: string;
	direction: string;
	date: string;
	matchedTaps: number;
	durationMinutes: number;
	peakMatchedIntervals: number;
	stationInversions: number;
	selection: string;
};

export type OccupancySummary = {
	schemaVersion: number;
	generatedAt: string;
	local: {
		path: string;
		sha256: string;
		rows: number;
		boardings: number;
		alightings: number;
		activeDates: number;
		reconstructable: boolean;
		reason: string;
	};
	window: { from: string; to: string; records: number };
	exclusions: {
		invalidOrOverSixHourTime: number;
		unknownStops: number;
		sameStop: number;
		missingVehicle: number;
	};
	retainedTaps: number;
	vehicleValues: number;
	vehicleRouteDirectionGroups: number;
	conflictingCrossGroupIntervalPairs: number;
	conflictingTaps: number;
	sensitivity: SensitivityRow[];
	selectedCandidate: SelectedCandidate;
	capacityStatus: string;
	scenarios: Scenario[];
	notes: string[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Structural check of the parts the view reads; throws a readable error otherwise. */
export function parseSummary(raw: unknown): OccupancySummary {
	if (!isRecord(raw)) throw new Error("根節點不是物件");
	if (raw.schemaVersion !== 1)
		throw new Error(`不支援的 schemaVersion：${String(raw.schemaVersion)}`);
	for (const key of [
		"local",
		"window",
		"exclusions",
		"selectedCandidate",
	] as const) {
		if (!isRecord(raw[key])) throw new Error(`缺少欄位 ${key}`);
	}
	for (const key of ["sensitivity", "scenarios", "notes"] as const) {
		if (!Array.isArray(raw[key])) throw new Error(`缺少陣列 ${key}`);
	}
	const w = raw.window as Record<string, unknown>;
	if (typeof w.to !== "string" || Number.isNaN(Date.parse(w.to))) {
		throw new Error("window.to 不是有效日期");
	}
	const sensitivity = raw.sensitivity as unknown[];
	const scenarios = raw.scenarios as unknown[];
	if (sensitivity.length === 0 || scenarios.length === 0)
		throw new Error("敏感度或情境列表為空");
	if (
		!sensitivity.every((r) => isRecord(r) && typeof r.candidates === "number")
	) {
		throw new Error("sensitivity 列格式不符");
	}
	if (!scenarios.every((r) => isRecord(r) && typeof r.afterPeak === "number")) {
		throw new Error("scenarios 列格式不符");
	}
	return raw as unknown as OccupancySummary;
}

/** The window is [from, to): the last covered date is the day before `to`. */
export function windowLastDate(to: string): string {
	const d = new Date(`${to}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString().slice(0, 10);
}
