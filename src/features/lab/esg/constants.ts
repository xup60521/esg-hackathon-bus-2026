import type {
	EmissionFactorReference,
	EmissionFactors,
	CounterfactualModalSplit,
	VehicleEfficiencyParameters,
} from "./types";
const assumption = (
	name: string,
	value: number,
	unit: EmissionFactorReference["unit"],
): EmissionFactorReference => ({
	name,
	value,
	unit,
	status: "assumption",
	sourceUrl: null,
	year: null,
	boundary: "scenario-unknown",
	notes: "可調展示值；未逐項核實 CO2e/GWP 與系統邊界，不是官方係數。",
});
// Fuel CO2e values are retained only as explicit adjustable assumptions, not official data.
export const DEFAULT_EMISSION_FACTORS: EmissionFactors = {
	dieselKgCo2ePerLiter: assumption("柴油 CO2e 情境參數", 2.6974, "kg CO2e / L"),
	gasolineKgCo2ePerLiter: assumption(
		"汽油 CO2e 情境參數，未直接參與模型",
		2.36,
		"kg CO2e / L",
	),
	electricityKgCo2ePerKwh: {
		name: "2024 公用售電業電力排碳係數",
		value: 0.474,
		unit: "kg CO2e / kWh",
		status: "official",
		year: 2024,
		sourceUrl:
			"https://www.moeaea.gov.tw/ecw/populace/content/wHandMenuFile.ashx?file_id=16728",
		boundary: "purchased-electricity-combustion",
		notes:
			"113 年度；購用公用售電業電力間接承擔燃料燃燒排放。固定年度展示，非最新、非生命週期係數；不代表實際充電契約。官方搜尋索引可讀，直接擷取回覆 403。",
	},
	privateCarKgCo2ePerPkm: assumption(
		"小客車強度情境參數",
		0.145,
		"kg CO2e / pkm",
	),
	motorcycleKgCo2ePerPkm: assumption(
		"機車強度情境參數",
		0.055,
		"kg CO2e / pkm",
	),
	publicTransitKgCo2ePerPkm: assumption(
		"其他公共運具強度情境參數",
		0.038,
		"kg CO2e / pkm",
	),
};
// All efficiencies, deadheading and modal shares below are uncalibrated assumptions.
export const DEFAULT_VEHICLE_PARAMETERS: VehicleEfficiencyParameters = {
	dieselKmPerLiter: 3.2,
	electricKwhPerKm: 0.95,
	deadheadRatio: 1.08,
	electrificationRate: 0,
};
export const DEFAULT_COUNTERFACTUAL_SPLIT: CounterfactualModalSplit = {
	privateCarShare: 0.48,
	motorcycleShare: 0.24,
	otherTransitShare: 0.16,
	inducedDemandShare: 0.12,
};
// This is a specified set, NOT subroute termini or a fairness classification.
export const SPECIFIED_ENDPOINTS = [
	"臺中",
	"高鐵臺中站",
	"台中航空站",
	"日月潭",
	"水社",
	"向山行政中心",
];
export const KNOWN_STOPS = [
	...SPECIFIED_ENDPOINTS,
	"埔里站",
	"崎下",
	"牛耳石雕公園",
	"暨南大學校內",
	"暨南大學",
	"桃米坑",
	"大雁",
	"九族文化村",
	"魚池",
	"日月老茶廠",
];
