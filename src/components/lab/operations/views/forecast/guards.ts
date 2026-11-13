import type {
	ForecastResults,
	ForecastSummary,
} from "#/features/lab/forecast/data";
import type {
	ForecastMlResults,
	ForecastMlSummary,
} from "#/features/lab/forecast/ml/data";

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

function hasSummaryShape(
	v: unknown,
): v is Record<string, unknown> & { groups: unknown[] } {
	return (
		isRecord(v) &&
		Array.isArray(v.observationWindow) &&
		v.observationWindow.length === 2 &&
		isRecord(v.protocol) &&
		isRecord(v.quality) &&
		Array.isArray(v.groups) &&
		v.groups.every(
			(g) =>
				isRecord(g) &&
				typeof g.id === "string" &&
				isRecord(g.testMetrics) &&
				isRecord(g.validationMetrics) &&
				Array.isArray(g.monthlyTest),
		)
	);
}

/** Shallow runtime check; the TypeScript types are a contract, not a validator. */
export function isSummary(v: unknown): v is ForecastSummary {
	return hasSummaryShape(v);
}

export function isResults(v: unknown): v is ForecastResults {
	return (
		hasSummaryShape(v) &&
		v.groups.every(
			(g) => isRecord(g) && Array.isArray(g.backtest) && Array.isArray(g.daily),
		)
	);
}

/** Contract v1: check schemaVersion, group and the historical-backtest status before showing anything. */
export function isMlSummary(v: unknown): v is ForecastMlSummary {
	return (
		isRecord(v) &&
		v.schemaVersion === 1 &&
		v.group === "total" &&
		v.status === "historical_backtest_not_current_forecast" &&
		typeof v.selectedModel === "string" &&
		typeof v.baselineSelectedModel === "string" &&
		isRecord(v.protocol) &&
		isRecord(v.model) &&
		isRecord(v.model.parameters) &&
		isRecord(v.validationCandidateMetrics) &&
		isRecord(v.validation) &&
		isRecord(v.validation.metrics) &&
		isRecord(v.test) &&
		isRecord(v.test.metrics) &&
		isRecord(v.test.availability) &&
		Array.isArray(v.monthlyTest) &&
		Array.isArray(v.trainingAudits)
	);
}

export function isMlResults(v: unknown): v is ForecastMlResults {
	return (
		isRecord(v) &&
		v.schemaVersion === 1 &&
		Array.isArray(v.test) &&
		Array.isArray(v.validation)
	);
}
