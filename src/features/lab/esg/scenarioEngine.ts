import {
	calculateOperationalEmissions,
	calculateAvoidedEmissions,
	summarizeServiceStructure,
	validateSplit,
} from "./calculator";
import {
	DEFAULT_EMISSION_FACTORS,
	DEFAULT_VEHICLE_PARAMETERS,
	DEFAULT_COUNTERFACTUAL_SPLIT,
} from "./constants";
import type { ScenarioDefinition, TripODRecord } from "./types";
export const PRESET_SCENARIOS: ScenarioDefinition[] = [0, 0.5, 1].map(
	(rate) => ({
		...DEFAULT_VEHICLE_PARAMETERS,
		electrificationRate: rate,
		id: `illustrative_electric_${rate * 100}`,
		name: `假設電動化 ${rate * 100}%`,
		description:
			"固定車公里及未校準參數之獨立展示；非歷史績效、非政策最優、非淨零。",
		modalSplit: { ...DEFAULT_COUNTERFACTUAL_SPLIT },
	}),
);
export function evaluateScenario(
	scenario: ScenarioDefinition,
	records: TripODRecord[],
	inputVehicleKm: number,
	factors = DEFAULT_EMISSION_FACTORS,
) {
	validateSplit(scenario.modalSplit);
	const structure = summarizeServiceStructure(records);
	const operational = calculateOperationalEmissions(
		inputVehicleKm,
		structure.totalPassengerKm,
		scenario,
		factors,
	);
	// Incomplete distances cannot support a full-dataset comparison.
	const comparison =
		structure.totalPassengerKm === null
			? null
			: calculateAvoidedEmissions(
					structure.totalPassengerKm,
					operational.totalOperationalKgCo2e,
					scenario.modalSplit,
					factors,
				);
	return { scenario, operational, comparison, structure };
}
export function evaluateAllPresets(
	records: TripODRecord[],
	inputVehicleKm: number,
	factors = DEFAULT_EMISSION_FACTORS,
) {
	return PRESET_SCENARIOS.map((s) =>
		evaluateScenario(s, records, inputVehicleKm, factors),
	);
}
