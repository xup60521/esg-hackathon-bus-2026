import {
	type CounterfactualModalSplit,
	calculateOperationalEmissions,
	DEFAULT_COUNTERFACTUAL_SPLIT,
	DEFAULT_EMISSION_FACTORS,
	DEFAULT_VEHICLE_PARAMETERS,
	type EmissionFactorReference,
	type EmissionFactors,
	evaluateScenario,
	PRESET_SCENARIOS,
	type ScenarioDefinition,
	type TripODRecord,
} from "#/features/lab/esg";

/** Everything here is schemaVersion 2. A mismatch is an error, never silently accepted. */
const BASE = "/data/lab/esg";
export const FILES = {
	summary: `${BASE}/summary.json`,
	monthly: `${BASE}/monthly.json`,
	scenarios: `${BASE}/scenarios.json`,
	od: `${BASE}/od-carbon.json`,
} as const;

export const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
export const nf3 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
export const nf4 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const sign0 = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 0,
	signDisplay: "exceptZero",
});

/** null means "unknown / undefined", shown as 無 and never as 0. */
export const orNone = (
	v: number | null,
	f: (n: number) => string = nf0.format,
) => (v === null ? "無" : f(v));
export const signed0 = (n: number) => sign0.format(n);
export const pct1 = (n: number) => `${nf1.format(n * 100)}%`;

/* ---------------------------------------------------------------- types */

export type Groups = {
	bothSpecifiedEndpoints: number;
	outsideSpecifiedEndpointSet: number;
	unknownStop: number;
};
export type Structure = {
	totalTrips: number;
	coveredTrips: number;
	unknownDistanceTrips: number;
	knownDistancePkm: number;
	/** null whenever any positive trip lacks a distance */
	totalPassengerKm: number | null;
	groups: Groups;
	knownDistancePkmByGroup: Groups;
};
export type Summary = {
	generatedAt: string;
	dataset: Structure & {
		source: string;
		firstRecordedDate: string;
		lastRecordedDate: string;
		recordedDates: number;
		distanceLabel: string;
		operatingDays: null;
	};
	coverage: {
		cacheDirectedPairs: number;
		observedOdSubrouteGroups: number;
		observedDirectedPairs: number;
		matchedNetworkTrips: number;
		sameStopTrips: number;
		unknownDistanceTrips: number;
		unknownOdSubrouteGroups: number;
		distanceCoverageRatio: number;
		missingDistanceCount: number;
		caveat: string;
	};
	specifiedEndpointSet: string[];
	classificationCaveat: string;
	factors: EmissionFactors;
	statusNote: string;
	demonstrationSource: string;
};
export type Month = Structure & {
	month: string;
	operationalKgCo2e: number | null;
	scenarioDifferenceKgCo2e: number | null;
	reason: string;
};
export type PresetResult = {
	id: string;
	name: string;
	electrificationRate: number;
	totalOperationalKgCo2e: number;
	fuelCombustionKgCo2e: number;
	purchasedElectricityKgCo2e: number;
	scenarioDifferenceKgCo2e: number | null;
	baselineToOperationalRatio: number | null;
};
export type OdRow = TripODRecord & { method: string };
export type EsgData = {
	summary: Summary;
	months: Month[];
	inputVehicleKm: number;
	presets: PresetResult[];
	od: OdRow[];
};

/* --------------------------------------------------------------- guards */

type Rec = Record<string, unknown>;
class Reader {
	constructor(private file: string) {}
	private fail(path: string, want: string): never {
		throw new Error(`${this.file}：${path} 應為${want}`);
	}
	rec(v: unknown, path: string): Rec {
		if (typeof v !== "object" || v === null || Array.isArray(v))
			this.fail(path, "物件");
		return v as Rec;
	}
	list(v: unknown, path: string): unknown[] {
		if (!Array.isArray(v)) this.fail(path, "陣列");
		return v as unknown[];
	}
	num(v: unknown, path: string): number {
		if (typeof v !== "number" || !Number.isFinite(v))
			this.fail(path, "有限數字");
		return v as number;
	}
	nonneg(v: unknown, path: string): number {
		const n = this.num(v, path);
		if (n < 0) this.fail(path, "非負數");
		return n;
	}
	int(v: unknown, path: string): number {
		const n = this.nonneg(v, path);
		if (!Number.isInteger(n)) this.fail(path, "非負整數");
		return n;
	}
	nullNum(v: unknown, path: string): number | null {
		return v === null ? null : this.nonneg(v, path);
	}
	str(v: unknown, path: string): string {
		if (typeof v !== "string" || v === "") this.fail(path, "非空字串");
		return v as string;
	}
	version(r: Rec) {
		if (r.schemaVersion !== 2) this.fail("schemaVersion", "數字 2");
	}
	groups(v: unknown, path: string): Groups {
		const r = this.rec(v, path);
		return {
			bothSpecifiedEndpoints: this.nonneg(
				r.bothSpecifiedEndpoints,
				`${path}.bothSpecifiedEndpoints`,
			),
			outsideSpecifiedEndpointSet: this.nonneg(
				r.outsideSpecifiedEndpointSet,
				`${path}.outsideSpecifiedEndpointSet`,
			),
			unknownStop: this.nonneg(r.unknownStop, `${path}.unknownStop`),
		};
	}
	structure(r: Rec, path: string): Structure {
		return {
			totalTrips: this.int(r.totalTrips, `${path}.totalTrips`),
			coveredTrips: this.int(r.coveredTrips, `${path}.coveredTrips`),
			unknownDistanceTrips: this.int(
				r.unknownDistanceTrips,
				`${path}.unknownDistanceTrips`,
			),
			knownDistancePkm: this.nonneg(
				r.knownDistancePkm,
				`${path}.knownDistancePkm`,
			),
			totalPassengerKm: this.nullNum(
				r.totalPassengerKm,
				`${path}.totalPassengerKm`,
			),
			groups: this.groups(r.groups, `${path}.groups`),
			knownDistancePkmByGroup: this.groups(
				r.knownDistancePkmByGroup,
				`${path}.knownDistancePkmByGroup`,
			),
		};
	}
	factor(v: unknown, path: string): EmissionFactorReference {
		const r = this.rec(v, path);
		const status = r.status;
		if (status !== "official" && status !== "assumption")
			this.fail(`${path}.status`, "official 或 assumption");
		const url = r.sourceUrl;
		if (url !== null && typeof url !== "string")
			this.fail(`${path}.sourceUrl`, "字串或 null");
		if (status === "official" && !url)
			this.fail(`${path}.sourceUrl`, "官方係數必備的來源網址");
		return {
			name: this.str(r.name, `${path}.name`),
			value: this.nonneg(r.value, `${path}.value`),
			unit: this.str(r.unit, `${path}.unit`) as EmissionFactorReference["unit"],
			status: status as "official" | "assumption",
			sourceUrl: url as string | null,
			year: r.year === null ? null : this.int(r.year, `${path}.year`),
			boundary: this.str(
				r.boundary,
				`${path}.boundary`,
			) as EmissionFactorReference["boundary"],
			notes: this.str(r.notes, `${path}.notes`),
		};
	}
}

export const FACTOR_KEYS = [
	"dieselKgCo2ePerLiter",
	"gasolineKgCo2ePerLiter",
	"electricityKgCo2ePerKwh",
	"privateCarKgCo2ePerPkm",
	"motorcycleKgCo2ePerPkm",
	"publicTransitKgCo2ePerPkm",
] as const;

function parseSummary(json: unknown): Summary {
	const R = new Reader(FILES.summary);
	const r = R.rec(json, "根");
	R.version(r);
	const d = R.rec(r.dataset, "dataset");
	const c = R.rec(r.coverage, "coverage");
	const p = R.rec(r.parameters, "parameters");
	const f = R.rec(p.factors, "parameters.factors");
	const demo = R.rec(r.demonstration, "demonstration");
	if (d.operatingDays !== null)
		throw new Error(
			`${FILES.summary}：operatingDays 必須為 null（不可由紀錄日推定營運日）`,
		);
	return {
		generatedAt: R.str(r.generatedAt, "generatedAt"),
		dataset: {
			...R.structure(d, "dataset"),
			source: R.str(d.source, "dataset.source"),
			firstRecordedDate: R.str(
				d.firstRecordedDate,
				"dataset.firstRecordedDate",
			),
			lastRecordedDate: R.str(d.lastRecordedDate, "dataset.lastRecordedDate"),
			recordedDates: R.int(d.recordedDates, "dataset.recordedDates"),
			distanceLabel: R.str(d.distanceLabel, "dataset.distanceLabel"),
			operatingDays: null,
		},
		coverage: {
			cacheDirectedPairs: R.int(
				c.cacheDirectedPairs,
				"coverage.cacheDirectedPairs",
			),
			observedOdSubrouteGroups: R.int(
				c.observedOdSubrouteGroups,
				"coverage.observedOdSubrouteGroups",
			),
			observedDirectedPairs: R.int(
				c.observedDirectedPairs,
				"coverage.observedDirectedPairs",
			),
			matchedNetworkTrips: R.int(
				c.matchedNetworkTrips,
				"coverage.matchedNetworkTrips",
			),
			sameStopTrips: R.int(c.sameStopTrips, "coverage.sameStopTrips"),
			unknownDistanceTrips: R.int(
				c.unknownDistanceTrips,
				"coverage.unknownDistanceTrips",
			),
			unknownOdSubrouteGroups: R.int(
				c.unknownOdSubrouteGroups,
				"coverage.unknownOdSubrouteGroups",
			),
			distanceCoverageRatio: R.nonneg(
				c.distanceCoverageRatio,
				"coverage.distanceCoverageRatio",
			),
			missingDistanceCount: R.list(
				c.missingDistances,
				"coverage.missingDistances",
			).length,
			caveat: R.str(c.caveat, "coverage.caveat"),
		},
		specifiedEndpointSet: R.list(
			r.specifiedEndpointSet,
			"specifiedEndpointSet",
		).map((s, i) => R.str(s, `specifiedEndpointSet[${i}]`)),
		classificationCaveat: R.str(r.classificationCaveat, "classificationCaveat"),
		factors: Object.fromEntries(
			FACTOR_KEYS.map((k) => [k, R.factor(f[k], `parameters.factors.${k}`)]),
		) as unknown as EmissionFactors,
		statusNote: R.str(p.status, "parameters.status"),
		demonstrationSource: R.str(demo.source, "demonstration.source"),
	};
}

function parseMonthly(json: unknown): Month[] {
	const R = new Reader(FILES.monthly);
	const r = R.rec(json, "根");
	R.version(r);
	return R.list(r.months, "months").map((v, i) => {
		const path = `months[${i}]`;
		const m = R.rec(v, path);
		const month = R.str(m.month, `${path}.month`);
		if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
			throw new Error(
				`${FILES.monthly}：${path}.month「${month}」不是 YYYY-MM`,
			);
		return {
			...R.structure(m, path),
			month,
			operationalKgCo2e: R.nullNum(
				m.operationalKgCo2e,
				`${path}.operationalKgCo2e`,
			),
			scenarioDifferenceKgCo2e: (() => {
				// a difference may legitimately be negative, but never undefined
				const x = m.scenarioDifferenceKgCo2e;
				return x === null ? null : R.num(x, `${path}.scenarioDifferenceKgCo2e`);
			})(),
			reason: R.str(m.reason, `${path}.reason`),
		};
	});
}

function parsePresets(json: unknown): {
	inputVehicleKm: number;
	presets: PresetResult[];
} {
	const R = new Reader(FILES.scenarios);
	const r = R.rec(json, "根");
	R.version(r);
	if (r.status !== "illustrative-only")
		throw new Error(`${FILES.scenarios}：status 必須為 illustrative-only`);
	return {
		inputVehicleKm: R.nonneg(r.inputVehicleKm, "inputVehicleKm"),
		presets: R.list(r.scenarios, "scenarios").map((v, i) => {
			const path = `scenarios[${i}]`;
			const s = R.rec(v, path);
			const sc = R.rec(s.scenario, `${path}.scenario`);
			const op = R.rec(s.operational, `${path}.operational`);
			const cmp =
				s.comparison === null
					? null
					: R.rec(s.comparison, `${path}.comparison`);
			return {
				id: R.str(sc.id, `${path}.scenario.id`),
				name: R.str(sc.name, `${path}.scenario.name`),
				electrificationRate: R.nonneg(
					sc.electrificationRate,
					`${path}.scenario.electrificationRate`,
				),
				totalOperationalKgCo2e: R.nonneg(
					op.totalOperationalKgCo2e,
					`${path}.operational.totalOperationalKgCo2e`,
				),
				fuelCombustionKgCo2e: R.nonneg(
					op.fuelCombustionKgCo2e,
					`${path}.operational.fuelCombustionKgCo2e`,
				),
				purchasedElectricityKgCo2e: R.nonneg(
					op.purchasedElectricityKgCo2e,
					`${path}.operational.purchasedElectricityKgCo2e`,
				),
				scenarioDifferenceKgCo2e: cmp
					? R.num(
							cmp.scenarioDifferenceKgCo2e,
							`${path}.comparison.scenarioDifferenceKgCo2e`,
						)
					: null,
				baselineToOperationalRatio: cmp
					? R.nullNum(
							cmp.baselineToOperationalRatio,
							`${path}.comparison.baselineToOperationalRatio`,
						)
					: null,
			};
		}),
	};
}

function parseOd(json: unknown): OdRow[] {
	const R = new Reader(FILES.od);
	const r = R.rec(json, "根");
	R.version(r);
	return R.list(r.od, "od").map((v, i) => {
		const path = `od[${i}]`;
		const o = R.rec(v, path);
		return {
			boardStop: R.str(o.boardStop, `${path}.boardStop`),
			alightStop: R.str(o.alightStop, `${path}.alightStop`),
			subroute: R.str(o.subroute, `${path}.subroute`),
			tripCount: R.int(o.tripCount, `${path}.tripCount`),
			// null is "unknown" and must stay null; the calculators reject anything else invalid
			distanceKm: R.nullNum(o.distanceKm, `${path}.distanceKm`),
			method: R.str(o.method, `${path}.method`),
		};
	});
}

const close = (a: number, b: number) =>
	Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** The four files are produced together; if they disagree the page must not guess which is right. */
function crossCheck(
	summary: Summary,
	months: Month[],
	od: OdRow[],
	presets: PresetResult[],
	inputVehicleKm: number,
): string[] {
	const bad: string[] = [];
	const ds = summary.dataset;
	const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
	if (months.length === 0) bad.push("monthly.json 沒有任何月份");
	if (sum(months.map((m) => m.totalTrips)) !== ds.totalTrips)
		bad.push("monthly.json 旅次合計與 summary.json 不一致");
	if (sum(od.map((o) => o.tripCount)) !== ds.totalTrips)
		bad.push("od-carbon.json 旅次合計與 summary.json 不一致");
	if (!close(sum(months.map((m) => m.knownDistancePkm)), ds.knownDistancePkm))
		bad.push("monthly.json 已知人公里合計與 summary.json 不一致");
	for (const m of months) {
		const g = m.groups;
		if (
			g.bothSpecifiedEndpoints +
				g.outsideSpecifiedEndpointSet +
				g.unknownStop !==
			m.totalTrips
		)
			bad.push(`${m.month} 的分組旅次合計不等於該月旅次`);
	}
	const g = ds.groups;
	if (
		g.bothSpecifiedEndpoints + g.outsideSpecifiedEndpointSet + g.unknownStop !==
		ds.totalTrips
	)
		bad.push("summary.json 分組旅次合計不等於全期旅次");
	if (ds.coveredTrips + ds.unknownDistanceTrips !== ds.totalTrips)
		bad.push("summary.json 已覆蓋與缺距離旅次合計不等於全期旅次");
	if ((ds.unknownDistanceTrips === 0) !== (ds.totalPassengerKm !== null))
		bad.push("summary.json totalPassengerKm 與缺距離旅次狀態矛盾");
	// recompute presets with the exported pure functions; drift between code and JSON is an error
	try {
		const fresh = PRESET_SCENARIOS.map((s) =>
			evaluateScenario(s, od, inputVehicleKm, summary.factors),
		);
		if (fresh.length !== presets.length)
			bad.push("展示情境數量與程式預設不一致");
		fresh.forEach((e, i) => {
			const p = presets[i];
			if (
				!p ||
				p.id !== e.scenario.id ||
				!close(
					p.totalOperationalKgCo2e,
					e.operational.totalOperationalKgCo2e,
				) ||
				!close(
					p.scenarioDifferenceKgCo2e ?? Number.NaN,
					e.comparison?.scenarioDifferenceKgCo2e ?? Number.NaN,
				)
			)
				bad.push(`展示情境 ${e.scenario.id} 與以匯出函式重算的結果不一致`);
		});
	} catch (e) {
		bad.push(
			`以匯出函式重算展示情境失敗：${e instanceof Error ? e.message : String(e)}`,
		);
	}
	return bad;
}

export async function loadEsg(signal: AbortSignal): Promise<EsgData> {
	const get = async (url: string): Promise<unknown> => {
		const res = await fetch(url, { signal });
		if (!res.ok) throw new Error(`HTTP ${res.status}（${url}）`);
		return res.json().catch(() => {
			throw new Error(`JSON 解析失敗（${url}）`);
		});
	};
	const [s, m, sc, o] = await Promise.all([
		get(FILES.summary),
		get(FILES.monthly),
		get(FILES.scenarios),
		get(FILES.od),
	]);
	const summary = parseSummary(s);
	const months = parseMonthly(m);
	const { inputVehicleKm, presets } = parsePresets(sc);
	const od = parseOd(o);
	const bad = crossCheck(summary, months, od, presets, inputVehicleKm);
	if (bad.length)
		throw new Error(`四份 JSON 交叉檢查未通過：${bad.join("；")}`);
	return { summary, months, inputVehicleKm, presets, od };
}

/* ------------------------------------------------------------ calculator */

export type InputKey =
	| "vehicleKm"
	| "electrification"
	| "dieselKmPerLiter"
	| "electricKwhPerKm"
	| "deadheadRatio"
	| "privateCar"
	| "motorcycle"
	| "otherTransit"
	| "induced"
	| "fDiesel"
	| "fElectricity"
	| "fCar"
	| "fMotorcycle"
	| "fTransit";
export type Raw = Record<InputKey, string>;

export type FieldSpec = {
	key: InputKey;
	label: string;
	unit: string;
	/** inclusive lower bound */
	min?: number;
	/** exclusive lower bound */
	above?: number;
	max?: number;
	hint?: string;
};

export const VEHICLE_FIELDS: FieldSpec[] = [
	{
		key: "vehicleKm",
		label: "輸入車公里",
		unit: "km",
		min: 0,
		hint: "獨立假設，與紀錄日或班次無推導關係",
	},
	{
		key: "electrification",
		label: "電動化率",
		unit: "%",
		min: 0,
		max: 100,
		hint: "電動車公里佔調整後車公里的比例",
	},
	{
		key: "dieselKmPerLiter",
		label: "柴油車油耗",
		unit: "km/L",
		above: 0,
		hint: "未校準假設",
	},
	{
		key: "electricKwhPerKm",
		label: "電動車電耗",
		unit: "kWh/km",
		min: 0,
		hint: "未校準假設",
	},
	{
		key: "deadheadRatio",
		label: "空駛倍率",
		unit: "倍",
		min: 1,
		hint: "調整後車公里 = 輸入 × 倍率；不得小於 1",
	},
];
export const SPLIT_FIELDS: FieldSpec[] = [
	{ key: "privateCar", label: "小客車", unit: "%", min: 0, max: 100 },
	{ key: "motorcycle", label: "機車", unit: "%", min: 0, max: 100 },
	{ key: "otherTransit", label: "其他公共運具", unit: "%", min: 0, max: 100 },
	{
		key: "induced",
		label: "新增需求",
		unit: "%",
		min: 0,
		max: 100,
		hint: "不計入基線排放",
	},
];
export const FACTOR_FIELDS: FieldSpec[] = [
	{ key: "fDiesel", label: "柴油 CO2e 係數", unit: "kg CO2e / L", min: 0 },
	{ key: "fElectricity", label: "購電排放係數", unit: "kg CO2e / kWh", min: 0 },
	{ key: "fCar", label: "小客車強度", unit: "kg CO2e / pkm", min: 0 },
	{ key: "fMotorcycle", label: "機車強度", unit: "kg CO2e / pkm", min: 0 },
	{ key: "fTransit", label: "其他公共運具強度", unit: "kg CO2e / pkm", min: 0 },
];
const ALL_FIELDS = [...VEHICLE_FIELDS, ...SPLIT_FIELDS, ...FACTOR_FIELDS];
export const SPLIT_KEYS: InputKey[] = SPLIT_FIELDS.map((f) => f.key);

const text = (n: number) => String(n);
export function defaultRaw(
	inputVehicleKm: number,
	factors: EmissionFactors,
): Raw {
	const v = DEFAULT_VEHICLE_PARAMETERS;
	const s = DEFAULT_COUNTERFACTUAL_SPLIT;
	return {
		vehicleKm: text(inputVehicleKm),
		electrification: text(v.electrificationRate * 100),
		dieselKmPerLiter: text(v.dieselKmPerLiter),
		electricKwhPerKm: text(v.electricKwhPerKm),
		deadheadRatio: text(v.deadheadRatio),
		privateCar: text(Math.round(s.privateCarShare * 100)),
		motorcycle: text(Math.round(s.motorcycleShare * 100)),
		otherTransit: text(Math.round(s.otherTransitShare * 100)),
		induced: text(Math.round(s.inducedDemandShare * 100)),
		fDiesel: text(factors.dieselKgCo2ePerLiter.value),
		fElectricity: text(factors.electricityKgCo2ePerKwh.value),
		fCar: text(factors.privateCarKgCo2ePerPkm.value),
		fMotorcycle: text(factors.motorcycleKgCo2ePerPkm.value),
		fTransit: text(factors.publicTransitKgCo2ePerPkm.value),
	};
}

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** Strict: empty, thousands separators, units or words are rejected, never coerced to 0. */
export function readField(
	spec: FieldSpec,
	raw: string,
): { value: number } | { error: string } {
	const s = raw.trim();
	if (s === "") return { error: "不可空白" };
	if (!NUMBER.test(s)) return { error: "請輸入純數字（不含逗號與單位）" };
	const value = Number(s);
	if (!Number.isFinite(value)) return { error: "數值超出範圍" };
	if (spec.above !== undefined && value <= spec.above)
		return { error: `必須大於 ${spec.above}` };
	if (spec.min !== undefined && value < spec.min)
		return { error: `不可小於 ${spec.min}` };
	if (spec.max !== undefined && value > spec.max)
		return { error: `不可大於 ${spec.max}` };
	return { value };
}

export type Evaluation = ReturnType<typeof evaluateScenario>;
export type Sweep = {
	rate: number;
	fuel: number;
	electricity: number;
	total: number;
};
export type CalcOutcome =
	| {
			ok: false;
			fieldErrors: Partial<Record<InputKey, string>>;
			errors: string[];
	  }
	| {
			ok: true;
			evaluation: Evaluation;
			sweep: Sweep[];
			factors: EmissionFactors;
			changedOfficial: boolean;
	  };

/** Splits are entered in percent and must total exactly 100 (to 1e-7 points); never normalised. */
export function splitTotal(raw: Raw): number | null {
	let t = 0;
	for (const k of SPLIT_KEYS) {
		const v = Number(raw[k].trim());
		if (raw[k].trim() === "" || !Number.isFinite(v)) return null;
		t += v;
	}
	return t;
}

export function calculate(
	raw: Raw,
	od: TripODRecord[],
	base: EmissionFactors,
): CalcOutcome {
	const fieldErrors: Partial<Record<InputKey, string>> = {};
	const n = {} as Record<InputKey, number>;
	for (const spec of ALL_FIELDS) {
		const r = readField(spec, raw[spec.key]);
		if ("error" in r) fieldErrors[spec.key] = r.error;
		else n[spec.key] = r.value;
	}
	const errors: string[] = [];
	if (Object.keys(fieldErrors).length === 0) {
		const total = SPLIT_KEYS.reduce((a, k) => a + n[k], 0);
		if (Math.abs(total - 100) > 1e-7)
			errors.push(
				`分流合計為 ${nf3.format(total)}%，必須剛好 100%；本工具不會自動正規化。`,
			);
	}
	if (Object.keys(fieldErrors).length || errors.length)
		return { ok: false, fieldErrors, errors };

	const factors: EmissionFactors = {
		...base,
		dieselKgCo2ePerLiter: custom(base.dieselKgCo2ePerLiter, n.fDiesel),
		electricityKgCo2ePerKwh: custom(
			base.electricityKgCo2ePerKwh,
			n.fElectricity,
		),
		privateCarKgCo2ePerPkm: custom(base.privateCarKgCo2ePerPkm, n.fCar),
		motorcycleKgCo2ePerPkm: custom(base.motorcycleKgCo2ePerPkm, n.fMotorcycle),
		publicTransitKgCo2ePerPkm: custom(
			base.publicTransitKgCo2ePerPkm,
			n.fTransit,
		),
	};
	const split: CounterfactualModalSplit = {
		privateCarShare: n.privateCar / 100,
		motorcycleShare: n.motorcycle / 100,
		otherTransitShare: n.otherTransit / 100,
		inducedDemandShare: n.induced / 100,
	};
	const scenario: ScenarioDefinition = {
		id: "custom",
		name: "自訂情境",
		description: "使用者輸入的獨立假設展示",
		dieselKmPerLiter: n.dieselKmPerLiter,
		electricKwhPerKm: n.electricKwhPerKm,
		deadheadRatio: n.deadheadRatio,
		electrificationRate: n.electrification / 100,
		modalSplit: split,
	};
	try {
		const evaluation = evaluateScenario(scenario, od, n.vehicleKm, factors);
		const sweep = [0, 0.5, 1].map((rate) => {
			const o = calculateOperationalEmissions(
				n.vehicleKm,
				null,
				{ ...scenario, electrificationRate: rate },
				factors,
			);
			return {
				rate,
				fuel: o.fuelCombustionKgCo2e,
				electricity: o.purchasedElectricityKgCo2e,
				total: o.totalOperationalKgCo2e,
			};
		});
		const changedOfficial =
			n.fElectricity !== base.electricityKgCo2ePerKwh.value;
		return { ok: true, evaluation, sweep, factors, changedOfficial };
	} catch (e) {
		// RangeError/TypeError are the calculators' input rejections; surface them, never turn into 0
		const kind =
			e instanceof RangeError || e instanceof TypeError
				? "輸入被計算函式拒絕"
				: "計算失敗";
		const raw = e instanceof Error ? e.message : String(e);
		const detail = /overflow/i.test(raw) ? "計算溢位（數值過大）" : raw;
		return { ok: false, fieldErrors, errors: [`${kind}：${detail}`] };
	}
}

function custom(
	base: EmissionFactorReference,
	value: number,
): EmissionFactorReference {
	if (value === base.value) return base;
	return {
		...base,
		value,
		status: "assumption",
		sourceUrl: null,
		year: null,
		boundary: "scenario-unknown",
		notes: "使用者輸入值，不是官方係數。",
	};
}

export const DEFAULT_FACTORS = DEFAULT_EMISSION_FACTORS;

export const BOUNDARY_LABEL: Record<
	EmissionFactorReference["boundary"],
	string
> = {
	TTW: "車輛燃燒階段 (TTW)",
	"purchased-electricity-combustion": "購電間接燃料燃燒",
	"scenario-unknown": "情境假設，邊界未核實",
};
export const METHOD_LABEL: Record<string, string> = {
	"same-stop-zero-assumption": "同站 0 km（假設）",
	"OSRM-pair-subroute-unresolved-reverse-copied":
		"OSRM 路網近似（正反向共用、未約束支線）",
};
