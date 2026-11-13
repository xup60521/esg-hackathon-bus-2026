import type {
	Scenario,
	Solution,
	Trip,
} from "#/features/lab/optimization/solver";

export type Result = {
	scenario: Scenario;
	solution: Solution;
	certificateErrors: string[] | null;
};

export type Inventory = {
	source: string;
	sha256: string;
	generatedAt: string;
	rows: number;
	firstDate: string;
	lastDate: string;
	selectedObservation: {
		date: string;
		subroute: string;
		hour: number;
		boardings: number;
		stop: string;
	};
};

export type Data = {
	researchDate: string;
	disclaimer: string;
	inventory: Inventory;
	results: Result[];
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null;

/** Shallow shape check: enough to fail visibly instead of crashing on a wrong file. */
export function isData(v: unknown): v is Data {
	if (!isRecord(v) || !Array.isArray(v.results) || !isRecord(v.inventory))
		return false;
	const inv = v.inventory;
	if (
		typeof inv.lastDate !== "string" ||
		typeof inv.sha256 !== "string" ||
		!isRecord(inv.selectedObservation)
	)
		return false;
	return v.results.every(
		(r) =>
			isRecord(r) &&
			isRecord(r.scenario) &&
			Array.isArray(r.scenario.targets) &&
			Array.isArray(r.scenario.resources) &&
			Array.isArray(r.scenario.candidates) &&
			Array.isArray(r.scenario.baseline) &&
			isRecord(r.solution) &&
			Array.isArray(r.solution.selectedTripIds) &&
			Array.isArray(r.solution.assignments),
	);
}

export const nf = new Intl.NumberFormat("en-US");

export const hhmm = (minute: number) =>
	`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export const SCENARIO_LABEL: Record<string, string> = {
	"baseline-capacity-gap": "無加班基準",
	"full-extra-feasible": "全程加班",
	"mixed-feasible": "混合（含中間站起駛）",
	"fleet-infeasible": "車輛不足",
	"budget-infeasible": "預算不足",
	"shift-infeasible": "班段過早結束",
	"midstop-seats30-infeasible": "中間站每班僅保留 30 席",
	"midstop-seats30-expanded-feasible": "30 席並增加資源/預算",
};
export const labelOf = (id: string) => SCENARIO_LABEL[id] ?? id;

export const KIND_LABEL: Record<Trip["kind"], string> = {
	baseline: "假設基準班",
	"full-extra": "全程加班",
	"midstop-extra": "中間站起駛",
};
/** Block colours per trip kind; the kind is always also written as text. */
export const KIND_COLOR: Record<Trip["kind"], string> = {
	baseline: "var(--fg2)",
	"full-extra": "var(--boarding)",
	"midstop-extra": "var(--middle)",
};

export const REJECT_LABEL: Record<string, string> = {
	"extra-trip-limit": "加班班數超過上限",
	budget: "加班成本超過預算",
	"minimum-service": "未達最低服務班數",
	"assumed-capacity-target": "保留席位未達情境乘客數",
	"resource-assignment": "找不到合法的車輛司機配對",
};

export const seatsOf = (t: Trip) =>
	t.reservations.reduce((n, r) => n + r.seats, 0);

function latestAvailable(s: Scenario) {
	return Math.max(0, ...s.resources.map((r) => r.availableUntil));
}

/** One line per modelling limit that a reader may compare across scenarios. */
export function limitSummary(s: Scenario): Record<string, string> {
	const mid = s.candidates.find((t) => t.kind === "midstop-extra");
	const full = s.candidates.filter((t) => t.kind === "full-extra").length;
	const midN = s.candidates.filter((t) => t.kind === "midstop-extra").length;
	return {
		資源組數: nf.format(s.resources.length),
		資源最晚可用: s.resources.length ? hhmm(latestAvailable(s)) : "無",
		加班預算: `${nf.format(s.extraBudget)} 假設單位`,
		加班班數上限: nf.format(s.maxExtraTrips),
		中間站候選每班保留席位: mid
			? `${nf.format(seatsOf(mid))} 席`
			: "無中間站候選",
		候選班次: `全程 ${full}、中間站 ${midN}`,
		覆蓋模式: s.requireFullCoverage
			? "須達情境乘客數"
			: "軟覆蓋（允許模型缺口）",
	};
}

export function diffLimits(
	reference: Scenario,
	s: Scenario,
): { key: string; from: string; to: string }[] {
	const a = limitSummary(reference);
	const b = limitSummary(s);
	return Object.keys(a)
		.filter((k) => a[k] !== b[k])
		.map((k) => ({ key: k, from: a[k], to: b[k] }));
}

export const sumSupplied = (r: Result) =>
	r.solution.evaluation?.reservations.reduce(
		(n, x) => n + x.suppliedSeats,
		0,
	) ?? null;
export const sumPassengers = (r: Result) =>
	r.scenario.targets.reduce((n, t) => n + t.assumedPassengers, 0);
export const sumObserved = (r: Result) =>
	r.scenario.targets.reduce((n, t) => n + t.observedBoardings, 0);
