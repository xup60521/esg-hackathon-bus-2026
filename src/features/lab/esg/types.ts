/** Version 2: scenario estimates, never a verified inventory. */
export interface EmissionFactorReference {
	name: string;
	value: number;
	unit: "kg CO2e / L" | "kg CO2e / kWh" | "kg CO2e / pkm";
	status: "official" | "assumption";
	sourceUrl: string | null;
	year: number | null;
	boundary: "TTW" | "purchased-electricity-combustion" | "scenario-unknown";
	notes: string;
}
export interface EmissionFactors {
	dieselKgCo2ePerLiter: EmissionFactorReference;
	gasolineKgCo2ePerLiter: EmissionFactorReference;
	electricityKgCo2ePerKwh: EmissionFactorReference;
	privateCarKgCo2ePerPkm: EmissionFactorReference;
	motorcycleKgCo2ePerPkm: EmissionFactorReference;
	publicTransitKgCo2ePerPkm: EmissionFactorReference;
}
export interface VehicleEfficiencyParameters {
	dieselKmPerLiter: number;
	electricKwhPerKm: number;
	deadheadRatio: number;
	electrificationRate: number;
}
export interface CounterfactualModalSplit {
	privateCarShare: number;
	motorcycleShare: number;
	otherTransitShare: number;
	inducedDemandShare: number;
}
export interface TripODRecord {
	boardStop: string;
	alightStop: string;
	subroute?: string;
	tripCount: number;
	distanceKm: number | null;
}
export interface ScenarioDefinition extends VehicleEfficiencyParameters {
	id: string;
	name: string;
	description: string;
	modalSplit: CounterfactualModalSplit;
}
