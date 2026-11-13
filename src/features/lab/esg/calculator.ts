import {
	DEFAULT_EMISSION_FACTORS,
	DEFAULT_VEHICLE_PARAMETERS,
	DEFAULT_COUNTERFACTUAL_SPLIT,
	SPECIFIED_ENDPOINTS,
	KNOWN_STOPS,
} from "./constants";
import type {
	EmissionFactors,
	VehicleEfficiencyParameters,
	CounterfactualModalSplit,
	TripODRecord,
} from "./types";
export function nonnegative(name: string, value: number): number {
	if (!Number.isFinite(value) || value < 0)
		throw new RangeError(`${name} must be finite and >= 0`);
	return value;
}
export function proportion(name: string, value: number): number {
	nonnegative(name, value);
	if (value > 1) throw new RangeError(`${name} must be <= 1`);
	return value;
}
export function validateFactors(factors: EmissionFactors) {
	for (const [key, factor] of Object.entries(factors)) {
		nonnegative(key, factor.value);
		const expected = key.endsWith("PerLiter")
			? "kg CO2e / L"
			: key.endsWith("PerKwh")
				? "kg CO2e / kWh"
				: "kg CO2e / pkm";
		if (factor.unit !== expected)
			throw new TypeError(`${key} unit must be ${expected}`);
	}
}
export function validateSplit(split: CounterfactualModalSplit) {
	const values = Object.entries(split);
	for (const [key, value] of values) proportion(key, value);
	if (Math.abs(values.reduce((sum, [, v]) => sum + v, 0) - 1) > 1e-9)
		throw new RangeError(
			"modal shares must sum to 1; no automatic normalization",
		);
}
// Also reject finite inputs whose products overflow before serialization.
export function finiteResult<T>(result: T): T {
	function check(v: unknown): void {
		if (typeof v === "number" && !Number.isFinite(v))
			throw new RangeError("calculation overflow");
		if (v && typeof v === "object") Object.values(v).forEach(check);
	}
	check(result);
	return result;
}
export function calculateOperationalEmissions(
	totalVehicleKm: number,
	totalPassengerKm: number | null = null,
	params: Partial<VehicleEfficiencyParameters> = {},
	factors = DEFAULT_EMISSION_FACTORS,
) {
	nonnegative("totalVehicleKm", totalVehicleKm);
	if (totalPassengerKm !== null)
		nonnegative("totalPassengerKm", totalPassengerKm);
	validateFactors(factors);
	const p = { ...DEFAULT_VEHICLE_PARAMETERS, ...params };
	nonnegative("dieselKmPerLiter", p.dieselKmPerLiter);
	if (p.dieselKmPerLiter === 0)
		throw new RangeError("dieselKmPerLiter must be > 0");
	nonnegative("electricKwhPerKm", p.electricKwhPerKm);
	nonnegative("deadheadRatio", p.deadheadRatio);
	if (p.deadheadRatio < 1) throw new RangeError("deadheadRatio must be >= 1");
	proportion("electrificationRate", p.electrificationRate);
	const adjustedVehicleKm = totalVehicleKm * p.deadheadRatio;
	const dieselLiters =
		(adjustedVehicleKm * (1 - p.electrificationRate)) / p.dieselKmPerLiter;
	const electricityKwh =
		adjustedVehicleKm * p.electrificationRate * p.electricKwhPerKm;
	const fuelCombustionKgCo2e =
		dieselLiters * factors.dieselKgCo2ePerLiter.value;
	const purchasedElectricityKgCo2e =
		electricityKwh * factors.electricityKgCo2ePerKwh.value;
	const totalOperationalKgCo2e =
		fuelCombustionKgCo2e + purchasedElectricityKgCo2e;
	return finiteResult({
		inputVehicleKm: totalVehicleKm,
		adjustedVehicleKm,
		dieselLiters,
		electricityKwh,
		fuelCombustionKgCo2e,
		purchasedElectricityKgCo2e,
		totalOperationalKgCo2e,
		intensityKgCo2ePerVkm:
			adjustedVehicleKm > 0 ? totalOperationalKgCo2e / adjustedVehicleKm : null,
		intensityKgCo2ePerPkm:
			totalPassengerKm !== null && totalPassengerKm > 0
				? totalOperationalKgCo2e / totalPassengerKm
				: null,
	});
}
/** Comparative scenario only. Never included in or netted against an inventory. */
export function calculateAvoidedEmissions(
	totalPassengerKm: number,
	operationalEmissionsKgCo2e: number,
	split: Partial<CounterfactualModalSplit> = {},
	factors = DEFAULT_EMISSION_FACTORS,
) {
	nonnegative("totalPassengerKm", totalPassengerKm);
	nonnegative("operationalEmissionsKgCo2e", operationalEmissionsKgCo2e);
	const s = { ...DEFAULT_COUNTERFACTUAL_SPLIT, ...split };
	validateSplit(s);
	validateFactors(factors);
	const carBaselineKgCo2e =
		totalPassengerKm * s.privateCarShare * factors.privateCarKgCo2ePerPkm.value;
	const motorcycleBaselineKgCo2e =
		totalPassengerKm * s.motorcycleShare * factors.motorcycleKgCo2ePerPkm.value;
	const otherTransitBaselineKgCo2e =
		totalPassengerKm *
		s.otherTransitShare *
		factors.publicTransitKgCo2ePerPkm.value;
	const counterfactualBaselineKgCo2e =
		carBaselineKgCo2e + motorcycleBaselineKgCo2e + otherTransitBaselineKgCo2e;
	return finiteResult({
		totalPassengerKm,
		counterfactualBaselineKgCo2e,
		operationalEmissionsKgCo2e,
		scenarioDifferenceKgCo2e:
			counterfactualBaselineKgCo2e - operationalEmissionsKgCo2e,
		baselineToOperationalRatio:
			operationalEmissionsKgCo2e > 0
				? counterfactualBaselineKgCo2e / operationalEmissionsKgCo2e
				: null,
		breakdown: {
			carBaselineKgCo2e,
			motorcycleBaselineKgCo2e,
			otherTransitBaselineKgCo2e,
		},
	});
}
export function classifySpecifiedEndpointTrip(
	board: string,
	alight: string,
): "bothSpecifiedEndpoints" | "outsideSpecifiedEndpointSet" | "unknownStop" {
	if (!KNOWN_STOPS.includes(board) || !KNOWN_STOPS.includes(alight))
		return "unknownStop";
	return SPECIFIED_ENDPOINTS.includes(board) &&
		SPECIFIED_ENDPOINTS.includes(alight)
		? "bothSpecifiedEndpoints"
		: "outsideSpecifiedEndpointSet";
}
export function summarizeServiceStructure(records: TripODRecord[]) {
	let totalTrips = 0,
		coveredTrips = 0,
		knownDistancePkm = 0;
	const groups = {
		bothSpecifiedEndpoints: 0,
		outsideSpecifiedEndpointSet: 0,
		unknownStop: 0,
	};
	const knownDistancePkmByGroup = {
		bothSpecifiedEndpoints: 0,
		outsideSpecifiedEndpointSet: 0,
		unknownStop: 0,
	};
	for (const r of records) {
		nonnegative("tripCount", r.tripCount);
		if (!Number.isInteger(r.tripCount))
			throw new RangeError("tripCount must be an integer");
		totalTrips += r.tripCount;
		groups[classifySpecifiedEndpointTrip(r.boardStop, r.alightStop)] +=
			r.tripCount;
		if (r.distanceKm !== null) {
			nonnegative("distanceKm", r.distanceKm);
			coveredTrips += r.tripCount;
			knownDistancePkm += r.tripCount * r.distanceKm;
			knownDistancePkmByGroup[
				classifySpecifiedEndpointTrip(r.boardStop, r.alightStop)
			] += r.tripCount * r.distanceKm;
		}
	}
	return finiteResult({
		totalTrips,
		coveredTrips,
		unknownDistanceTrips: totalTrips - coveredTrips,
		knownDistancePkm,
		totalPassengerKm: totalTrips === coveredTrips ? knownDistancePkm : null,
		groups,
		knownDistancePkmByGroup,
	});
}
