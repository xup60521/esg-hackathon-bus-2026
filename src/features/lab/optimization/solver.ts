/** Exact bounded scenario solver. No inferred timetable, queue or actual denied boarding. */
export interface Target {
	id: string;
	observedBoardings: number;
	assumedPassengers: number;
	minimumServices: number;
	readyMinute: number;
	deadlineMinute: number;
}
export interface Trip {
	id: string;
	kind: "baseline" | "full-extra" | "midstop-extra";
	/** Occupation includes positioning, running, return and recovery to a common depot. */
	startMinute: number;
	endMinute: number;
	capacity: number;
	reservations: { targetId: string; seats: number; serviceMinute: number }[];
	cost: number;
}
export interface Resource {
	id: string;
	/** One hypothetical vehicle + qualified driver pair, at a common depot. */
	availableFrom: number;
	availableUntil: number;
	maxWorkMinutes: number;
}
export interface Scenario {
	id: string;
	assumptions: string[];
	targets: Target[];
	baseline: Trip[];
	candidates: Trip[];
	resources: Resource[];
	extraBudget: number;
	maxExtraTrips: number;
	/** False allows a best-effort capacity scenario, never an operational demand estimate. */
	requireFullCoverage: boolean;
}
export interface Evaluation {
	reservations: {
		targetId: string;
		suppliedSeats: number;
		assumedPassengers: number;
		shortfall: number;
		services: number;
	}[];
	shortfall: number;
	extraCost: number;
	extraTrips: number;
}
export interface Solution {
	status: "optimal" | "infeasible";
	selectedTripIds: string[];
	assignments: { tripId: string; resourceId: string }[];
	evaluation: Evaluation | null;
	searchedSubsets: number;
	rejected: Record<string, number>;
	scope: "finite-candidate-scenario-only";
}
const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
export function validateScenario(s: Scenario): void {
	if (!s.assumptions.length) throw new Error("Explicit assumptions required");
	if (s.candidates.length > 18)
		throw new Error("At most 18 candidates for bounded exact enumeration");
	if (!integer(s.extraBudget) || !integer(s.maxExtraTrips))
		throw new Error("Invalid budget or trip limit");
	if (typeof s.requireFullCoverage !== "boolean")
		throw new Error("Explicit coverage mode required");
	const unique = (ids: string[]) =>
		ids.every(Boolean) && new Set(ids).size === ids.length;
	if (
		!unique(s.targets.map((t) => t.id)) ||
		!unique([...s.baseline, ...s.candidates].map((t) => t.id)) ||
		!unique(s.resources.map((r) => r.id))
	)
		throw new Error("Duplicate or empty identifier");
	const targets = new Set(s.targets.map((t) => t.id));
	if (!targets.size) throw new Error("At least one target required");
	for (const t of s.targets)
		if (
			![
				t.observedBoardings,
				t.assumedPassengers,
				t.minimumServices,
				t.readyMinute,
				t.deadlineMinute,
			].every(integer) ||
			t.readyMinute > t.deadlineMinute
		)
			throw new Error("Invalid target");
	for (const r of s.resources)
		if (
			![r.availableFrom, r.availableUntil, r.maxWorkMinutes].every(integer) ||
			r.availableFrom >= r.availableUntil
		)
			throw new Error("Invalid resource");
	for (const t of [...s.baseline, ...s.candidates]) {
		if (
			![t.startMinute, t.endMinute, t.capacity, t.cost].every(integer) ||
			t.startMinute >= t.endMinute ||
			!t.capacity
		)
			throw new Error("Invalid trip");
		if (!unique(t.reservations.map((r) => r.targetId)))
			throw new Error("Duplicate trip reservation");
		if (
			t.reservations.some(
				(r) => !targets.has(r.targetId) || !integer(r.seats) || !r.seats,
			) ||
			t.reservations.reduce((n, r) => n + r.seats, 0) > t.capacity
		)
			throw new Error("Invalid reservation or capacity exceeded");
		for (const r of t.reservations) {
			const target = s.targets.find((target) => target.id === r.targetId);
			if (!target) throw new Error("Unknown target");
			if (
				!integer(r.serviceMinute) ||
				r.serviceMinute < target.readyMinute ||
				r.serviceMinute > target.deadlineMinute ||
				r.serviceMinute < t.startMinute ||
				r.serviceMinute >= t.endMinute
			)
				throw new Error("Service outside target or trip window");
		}
	}
	if (
		s.baseline.some((t) => t.kind !== "baseline" || t.cost !== 0) ||
		s.candidates.some((t) => !["full-extra", "midstop-extra"].includes(t.kind))
	)
		throw new Error("Invalid baseline/candidate kind");
}
export function evaluate(s: Scenario, trips: Trip[]): Evaluation {
	const reservations = s.targets.map((t) => {
		const seats = trips.flatMap((trip) =>
			trip.reservations.filter((r) => r.targetId === t.id),
		);
		const suppliedSeats = seats.reduce((n, r) => n + r.seats, 0);
		return {
			targetId: t.id,
			suppliedSeats,
			assumedPassengers: t.assumedPassengers,
			shortfall: Math.max(0, t.assumedPassengers - suppliedSeats),
			services: seats.length,
		};
	});
	const extra = trips.filter((t) => t.kind !== "baseline");
	return {
		reservations,
		shortfall: reservations.reduce((n, r) => n + r.shortfall, 0),
		extraCost: extra.reduce((n, t) => n + t.cost, 0),
		extraTrips: extra.length,
	};
}
function rejection(s: Scenario, e: Evaluation): string | null {
	if (e.extraTrips > s.maxExtraTrips) return "extra-trip-limit";
	if (e.extraCost > s.extraBudget) return "budget";
	if (e.reservations.some((r, i) => r.services < s.targets[i].minimumServices))
		return "minimum-service";
	if (s.requireFullCoverage && e.shortfall) return "assumed-capacity-target";
	return null;
}
/** Enumerate pair assignments, respecting non-overlap and cumulative occupied work. */
function assign(
	trips: Trip[],
	resources: Resource[],
): Solution["assignments"] | null {
	const ordered = [...trips].sort(
		(a, b) => a.startMinute - b.startMinute || a.id.localeCompare(b.id),
	);
	const freeAt = resources.map((r) => r.availableFrom);
	const worked = resources.map(() => 0);
	const result: Solution["assignments"] = [];
	function visit(i: number): boolean {
		if (i === ordered.length) return true;
		const t = ordered[i];
		for (let k = 0; k < resources.length; k++) {
			const r = resources[k];
			const duration = t.endMinute - t.startMinute;
			if (
				freeAt[k] > t.startMinute ||
				t.endMinute > r.availableUntil ||
				worked[k] + duration > r.maxWorkMinutes
			)
				continue;
			const previous = freeAt[k];
			freeAt[k] = t.endMinute;
			worked[k] += duration;
			result.push({ tripId: t.id, resourceId: r.id });
			if (visit(i + 1)) return true;
			result.pop();
			freeAt[k] = previous;
			worked[k] -= duration;
		}
		return false;
	}
	return visit(0) ? result : null;
}
export function solve(s: Scenario): Solution {
	validateScenario(s);
	let best: Solution | null = null;
	const rejected: Record<string, number> = {};
	const total = 2 ** s.candidates.length;
	for (let mask = 0; mask < total; mask++) {
		const trips = [
			...s.baseline,
			...s.candidates.filter((_, i) => mask & (2 ** i)),
		];
		const e = evaluate(s, trips);
		let reason = rejection(s, e);
		const assignments = reason ? null : assign(trips, s.resources);
		if (!reason && !assignments) reason = "resource-assignment";
		if (reason || !assignments) {
			reason ??= "resource-assignment";
			rejected[reason] = (rejected[reason] ?? 0) + 1;
			continue;
		}
		const b = best?.evaluation;
		if (
			!b ||
			e.shortfall < b.shortfall ||
			(e.shortfall === b.shortfall &&
				(e.extraCost < b.extraCost ||
					(e.extraCost === b.extraCost && e.extraTrips < b.extraTrips)))
		) {
			best = {
				status: "optimal",
				selectedTripIds: trips.map((t) => t.id),
				assignments,
				evaluation: e,
				searchedSubsets: total,
				rejected,
				scope: "finite-candidate-scenario-only",
			};
		}
	}
	return (
		best ?? {
			status: "infeasible",
			selectedTripIds: [],
			assignments: [],
			evaluation: null,
			searchedSubsets: total,
			rejected,
			scope: "finite-candidate-scenario-only",
		}
	);
}
/** Independent certificate checks; never trusts the search's resource allocator. */
export function verifySolution(s: Scenario, solution: Solution): string[] {
	validateScenario(s);
	if (solution.status !== "optimal")
		return [
			"No feasible certificate; infeasibility requires completed exhaustive search",
		];
	const errors: string[] = [];
	const all = new Map([...s.baseline, ...s.candidates].map((t) => [t.id, t]));
	const ids = solution.selectedTripIds;
	if (new Set(ids).size !== ids.length || ids.some((id) => !all.has(id)))
		return ["Unknown or repeated trip"];
	if (s.baseline.some((t) => !ids.includes(t.id)))
		errors.push("Missing fixed baseline");
	const trips = ids.map((id) => all.get(id)).filter((t): t is Trip => !!t);
	const e = evaluate(s, trips);
	const reason = rejection(s, e);
	if (reason) errors.push(reason);
	if (JSON.stringify(e) !== JSON.stringify(solution.evaluation))
		errors.push("Evaluation mismatch");
	const assignments = solution.assignments;
	if (
		assignments.length !== trips.length ||
		new Set(assignments.map((a) => a.tripId)).size !== trips.length ||
		assignments.some((a) => !ids.includes(a.tripId))
	)
		errors.push("Incomplete or repeated assignments");
	if (assignments.some((a) => !s.resources.some((r) => r.id === a.resourceId)))
		errors.push("Unknown resource");
	for (const r of s.resources) {
		const assigned = assignments
			.filter((a) => a.resourceId === r.id)
			.map((a) => all.get(a.tripId))
			.filter((t): t is Trip => !!t)
			.sort((a, b) => a.startMinute - b.startMinute);
		if (
			assigned.some(
				(t) =>
					t.startMinute < r.availableFrom || t.endMinute > r.availableUntil,
			)
		)
			errors.push(`Availability: ${r.id}`);
		if (
			assigned.some(
				(t, i) => i > 0 && assigned[i - 1].endMinute > t.startMinute,
			)
		)
			errors.push(`Overlap: ${r.id}`);
		if (
			assigned.reduce((n, t) => n + t.endMinute - t.startMinute, 0) >
			r.maxWorkMinutes
		)
			errors.push(`Work limit: ${r.id}`);
	}
	return errors;
}
