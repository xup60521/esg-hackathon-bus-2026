import { describe, test, expect } from "bun:test";
import {
	calculateOperationalEmissions as op,
	calculateAvoidedEmissions as comparison,
	summarizeServiceStructure,
	classifySpecifiedEndpointTrip,
	resolveDistance,
	evaluateAllPresets,
	evaluateScenario,
	PRESET_SCENARIOS,
	DEFAULT_EMISSION_FACTORS,
	DEFAULT_COUNTERFACTUAL_SPLIT,
} from "./index";
describe("ESG v2 scenario contract", () => {
	test("units: liters, kWh and kg; no hidden deadhead clamp", () => {
		const diesel = op(320, 1000, { deadheadRatio: 1, dieselKmPerLiter: 3.2 });
		expect(diesel.dieselLiters).toBe(100);
		expect(diesel.totalOperationalKgCo2e).toBeCloseTo(269.74);
		expect(diesel.intensityKgCo2ePerPkm).toBeCloseTo(0.26974);
		const electric = op(100, 1000, {
			electrificationRate: 1,
			deadheadRatio: 1,
			electricKwhPerKm: 0.95,
		});
		expect(electric.electricityKwh).toBe(95);
		expect(electric.fuelCombustionKgCo2e).toBe(0);
		expect(electric.totalOperationalKgCo2e).toBeCloseTo(45.03);
	});
	test("invalid parameters reject even with zero activity", () => {
		for (const value of [-1, NaN, Infinity, -Infinity]) {
			expect(() => op(value)).toThrow();
			expect(() => op(0, value)).toThrow();
			expect(() => op(0, 0, { electricKwhPerKm: value })).toThrow();
			expect(() => comparison(0, value)).toThrow();
		}
		for (const params of [
			{ dieselKmPerLiter: 0 },
			{ dieselKmPerLiter: -1 },
			{ deadheadRatio: 0.9 },
			{ electrificationRate: 1.1 },
			{ electrificationRate: -0.1 },
		])
			expect(() => op(0, 0, params)).toThrow();
	});
	test("modal shares reject nonfinite, negative, incomplete or excessive sum", () => {
		for (const share of [NaN, Infinity, -0.1, 1.1, 0.49, 0.47])
			expect(() => comparison(0, 0, { privateCarShare: share })).toThrow();
		expect(() => comparison(-1, 0)).toThrow();
		expect(() => comparison(Infinity, 0)).toThrow();
	});
	test("comparison components are baseline, difference deducts operations once", () => {
		const r = comparison(1000, 20);
		expect(r.counterfactualBaselineKgCo2e).toBeCloseTo(88.88);
		expect(r.scenarioDifferenceKgCo2e).toBeCloseTo(68.88);
		expect(r.baselineToOperationalRatio).toBeCloseTo(4.444);
		expect(comparison(0, 20).scenarioDifferenceKgCo2e).toBe(-20);
	});
	test("zero denominator is explicit null and JSON safe", () => {
		expect(comparison(100, 0).baselineToOperationalRatio).toBeNull();
		expect(comparison(0, 0).baselineToOperationalRatio).toBeNull();
		expect(op(0, 0).intensityKgCo2ePerPkm).toBeNull();
		expect(
			JSON.parse(JSON.stringify(comparison(100, 0))).baselineToOperationalRatio,
		).toBeNull();
	});
	test("missing distance never silently becomes zero", () => {
		expect(resolveDistance("a", "b", { pairs: {} }).distanceKm).toBeNull();
		expect(resolveDistance("a", "a", { pairs: {} }).method).toBe(
			"same-stop-zero-assumption",
		);
		expect(
			resolveDistance("a", "b", { pairs: { "a|b": { distance: 1500 } } })
				.distanceKm,
		).toBe(1.5);
		expect(() =>
			resolveDistance("a", "b", { pairs: { "a|b": { distance: -1 } } }),
		).toThrow();
		const r = summarizeServiceStructure([
			{ boardStop: "臺中", alightStop: "日月潭", tripCount: 10, distanceKm: 2 },
			{
				boardStop: "埔里站",
				alightStop: "unknown",
				tripCount: 3,
				distanceKm: null,
			},
		]);
		expect(r.totalPassengerKm).toBeNull();
		expect(r.knownDistancePkm).toBe(20);
		expect(r.unknownDistanceTrips).toBe(3);
		expect(Object.values(r.groups).reduce((a, b) => a + b, 0)).toBe(13);
	});
	test("fixed endpoint set does not assert subroute fairness or unknown midstop", () => {
		expect(classifySpecifiedEndpointTrip("埔里站", "高鐵臺中站")).toBe(
			"outsideSpecifiedEndpointSet",
		);
		expect(classifySpecifiedEndpointTrip("不存在", "臺中")).toBe("unknownStop");
		expect(classifySpecifiedEndpointTrip("臺中", "日月潭")).toBe(
			"bothSpecifiedEndpoints",
		);
	});
	test("invalid records and overflowing arithmetic reject", () => {
		for (const rec of [
			{ tripCount: -1, distanceKm: 2 },
			{ tripCount: 1.1, distanceKm: 2 },
			{ tripCount: 1, distanceKm: Infinity },
			{ tripCount: 1, distanceKm: -1 },
		])
			expect(() =>
				summarizeServiceStructure([
					{ boardStop: "臺中", alightStop: "日月潭", ...rec },
				]),
			).toThrow();
		expect(() => op(Number.MAX_VALUE, 1)).toThrow();
	});
	test("factor units and finite values are enforced", () => {
		const f = structuredClone(DEFAULT_EMISSION_FACTORS);
		f.dieselKgCo2ePerLiter.value = -1;
		expect(() => op(10, 1, {}, f)).toThrow();
		f.dieselKgCo2ePerLiter.value = 2;
		f.dieselKgCo2ePerLiter.unit = "kg CO2e / pkm";
		expect(() => op(10, 1, {}, f)).toThrow();
	});
	test("scenario with unknown distance suppresses comparison, full electric still emits", () => {
		const r = evaluateAllPresets(
			[
				{
					boardStop: "臺中",
					alightStop: "日月潭",
					tripCount: 1,
					distanceKm: null,
				},
			],
			100,
		);
		expect(r).toHaveLength(3);
		expect(r.every((s) => s.comparison === null)).toBe(true);
		expect(r[2].operational.totalOperationalKgCo2e).toBeGreaterThan(0);
		expect(DEFAULT_EMISSION_FACTORS.privateCarKgCo2ePerPkm.status).toBe(
			"assumption",
		);
		expect(DEFAULT_COUNTERFACTUAL_SPLIT.privateCarShare).toBe(0.48);
	});
	test("invalid split still rejects when distance is unknown", () => {
		expect(() =>
			evaluateScenario(
				{
					...PRESET_SCENARIOS[0],
					modalSplit: {
						...DEFAULT_COUNTERFACTUAL_SPLIT,
						inducedDemandShare: 0.5,
					},
				},
				[
					{
						boardStop: "臺中",
						alightStop: "日月潭",
						tripCount: 2,
						distanceKm: null,
					},
				],
				0,
			),
		).toThrow();
	});
	test("known pkm group structure conserves subtotal without inventing missing pkm", () => {
		const r = summarizeServiceStructure([
			{ boardStop: "臺中", alightStop: "日月潭", tripCount: 2, distanceKm: 10 },
			{
				boardStop: "埔里站",
				alightStop: "高鐵臺中站",
				subroute: "6670H",
				tripCount: 3,
				distanceKm: 5,
			},
			{ boardStop: "未知", alightStop: "臺中", tripCount: 4, distanceKm: null },
		]);
		expect(r.knownDistancePkmByGroup.bothSpecifiedEndpoints).toBe(20);
		expect(r.knownDistancePkmByGroup.outsideSpecifiedEndpointSet).toBe(15);
		expect(r.knownDistancePkmByGroup.unknownStop).toBe(0);
		expect(r.totalPassengerKm).toBeNull();
		expect(r.knownDistancePkm).toBe(35);
	});
});
