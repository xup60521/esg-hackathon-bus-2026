import { describe, expect, test } from "bun:test";
import {
	evaluate,
	type Scenario,
	solve,
	type Trip,
	validateScenario,
	verifySolution,
} from "./solver";

const makeTrip = (
	id: string,
	start = 10,
	end = 20,
	seats = 4,
	cost = 2,
): Trip => ({
	id,
	kind: "midstop-extra",
	startMinute: start,
	endMinute: end,
	capacity: 4,
	reservations: [{ targetId: "t", seats, serviceMinute: start }],
	cost,
});
function scenario(): Scenario {
	return {
		id: "test",
		assumptions: ["synthetic test only"],
		targets: [
			{
				id: "t",
				observedBoardings: 8,
				assumedPassengers: 8,
				minimumServices: 1,
				readyMinute: 0,
				deadlineMinute: 50,
			},
		],
		baseline: [],
		candidates: [makeTrip("a"), makeTrip("b")],
		resources: [
			{ id: "r1", availableFrom: 0, availableUntil: 50, maxWorkMinutes: 20 },
			{ id: "r2", availableFrom: 0, availableUntil: 50, maxWorkMinutes: 20 },
		],
		extraBudget: 4,
		maxExtraTrips: 2,
		requireFullCoverage: true,
	};
}
describe("bounded exact optimization", () => {
	test("returns verified full coverage within constraints", () => {
		const s = scenario();
		const r = solve(s);
		expect(r.status).toBe("optimal");
		expect(r.evaluation?.extraCost).toBe(4);
		expect(verifySolution(s, r)).toEqual([]);
	});
	test("overlap makes one resource infeasible", () => {
		const s = scenario();
		s.resources.pop();
		expect(solve(s).status).toBe("infeasible");
	});
	test("end equals start permits reuse, cumulative work still binds", () => {
		const s = scenario();
		s.resources.pop();
		s.candidates[1] = makeTrip("b", 20, 30);
		expect(solve(s).status).toBe("optimal");
		s.resources[0].maxWorkMinutes = 19;
		expect(solve(s).status).toBe("infeasible");
	});
	test("availability and return to depot are required", () => {
		const s = scenario();
		s.resources[1].availableUntil = 19;
		expect(solve(s).status).toBe("infeasible");
	});
	test("budget equality is allowed; one less is infeasible", () => {
		const s = scenario();
		expect(solve(s).status).toBe("optimal");
		s.extraBudget--;
		expect(solve(s).status).toBe("infeasible");
	});
	test("trip limit applies independently of capacity", () => {
		const s = scenario();
		s.maxExtraTrips = 1;
		expect(solve(s).status).toBe("infeasible");
	});
	test("minimum service cannot be satisfied by seats on too few trips", () => {
		const s = scenario();
		s.targets[0].minimumServices = 3;
		expect(solve(s).status).toBe("infeasible");
	});
	test("soft coverage reports modeled shortfall, not denied boarding", () => {
		const s = scenario();
		s.requireFullCoverage = false;
		s.extraBudget = 2;
		expect(solve(s).evaluation?.shortfall).toBe(4);
	});
	test("keeps fixed baseline and assigns its resource", () => {
		const s = scenario();
		const b = makeTrip("base");
		b.kind = "baseline";
		b.cost = 0;
		s.baseline = [b];
		s.candidates = [makeTrip("extra")];
		const r = solve(s);
		expect(r.selectedTripIds).toContain("base");
		expect(verifySolution(s, r)).toEqual([]);
		r.selectedTripIds = ["extra"];
		expect(verifySolution(s, r)).toContain("Missing fixed baseline");
	});
	test("rejects capacity, invalid counts, identifiers and timing input", () => {
		let s = scenario();
		s.candidates[0].reservations[0].seats = 5;
		expect(() => validateScenario(s)).toThrow("capacity");
		s = scenario();
		s.targets[0].assumedPassengers = Number.NaN;
		expect(() => validateScenario(s)).toThrow("target");
		s = scenario();
		s.candidates[1].id = "a";
		expect(() => validateScenario(s)).toThrow("identifier");
		s = scenario();
		s.candidates[0].reservations[0].serviceMinute = 51;
		expect(() => validateScenario(s)).toThrow("window");
		s = scenario();
		s.assumptions = [];
		expect(() => validateScenario(s)).toThrow("assumptions");
	});
	test("does not double count reservation within one trip", () => {
		const s = scenario();
		s.candidates[0].reservations.push({
			targetId: "t",
			seats: 1,
			serviceMinute: 10,
		});
		expect(() => validateScenario(s)).toThrow("Duplicate trip reservation");
	});
	test("limits candidate enumeration", () => {
		const s = scenario();
		s.candidates = Array.from({ length: 19 }, (_, i) => makeTrip(`t${i}`));
		expect(() => solve(s)).toThrow("18");
	});
	test("detects tampered resource, overlap and objective certificate", () => {
		const s = scenario();
		const r = solve(s);
		r.assignments[1].resourceId = r.assignments[0].resourceId;
		expect(verifySolution(s, r).some((e) => e.startsWith("Overlap"))).toBe(
			true,
		);
		r.assignments[1].resourceId = "unknown";
		expect(verifySolution(s, r)).toContain("Unknown resource");
		if (!r.evaluation) throw new Error("Missing feasible evaluation");
		r.evaluation.shortfall = 100;
		expect(verifySolution(s, r)).toContain("Evaluation mismatch");
	});
	test("zero passengers still enforces service floor", () => {
		const s = scenario();
		s.targets[0].assumedPassengers = 0;
		expect(solve(s).evaluation?.extraTrips).toBe(1);
	});
	test("reservation sum across targets cannot exceed vehicle capacity", () => {
		const s = scenario();
		s.targets.push({ ...s.targets[0], id: "second" });
		s.candidates[0].reservations.push({
			targetId: "second",
			seats: 1,
			serviceMinute: 10,
		});
		expect(() => validateScenario(s)).toThrow("capacity");
	});
	test("50 seeded small cases match independent subset/resource brute force", () => {
		let seed = 808;
		const rand = (n: number) => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
			return seed % n;
		};
		for (let trial = 0; trial < 50; trial++) {
			const s = scenario();
			s.requireFullCoverage = Boolean(rand(2));
			s.extraBudget = rand(14);
			s.maxExtraTrips = rand(6);
			s.targets[0].assumedPassengers = rand(16);
			s.targets[0].minimumServices = rand(3);
			s.candidates = Array.from({ length: 5 }, (_, i) => {
				const start = rand(4) * 10;
				return makeTrip(
					`c${i}`,
					start,
					start + 10 + rand(2) * 10,
					1 + rand(4),
					rand(5),
				);
			});
			s.resources.forEach((r) => {
				r.maxWorkMinutes = 10 + rand(4) * 10;
			});
			let oracle: number[] | null = null;
			for (let mask = 0; mask < 32; mask++) {
				const ts = s.candidates.filter((_, i) => (mask >> i) & 1);
				const cost = ts.reduce((n, t) => n + t.cost, 0),
					seats = ts.reduce((n, t) => n + t.reservations[0].seats, 0);
				const shortfall = Math.max(0, s.targets[0].assumedPassengers - seats);
				if (
					cost > s.extraBudget ||
					ts.length > s.maxExtraTrips ||
					ts.length < s.targets[0].minimumServices ||
					(s.requireFullCoverage && shortfall)
				)
					continue;
				let possible = false;
				for (let placement = 0; placement < 2 ** ts.length; placement++) {
					const ok = s.resources.every((r, k) => {
						const jobs = ts.filter((_, i) => ((placement >> i) & 1) === k);
						return (
							jobs.every(
								(t) =>
									t.startMinute >= r.availableFrom &&
									t.endMinute <= r.availableUntil,
							) &&
							jobs.reduce((n, t) => n + t.endMinute - t.startMinute, 0) <=
								r.maxWorkMinutes &&
							jobs.every((t, i) =>
								jobs.every(
									(u, j) =>
										i === j ||
										t.endMinute <= u.startMinute ||
										u.endMinute <= t.startMinute,
								),
							)
						);
					});
					if (ok) {
						possible = true;
						break;
					}
				}
				const score = [shortfall, cost, ts.length];
				if (
					possible &&
					(!oracle ||
						score[0] < oracle[0] ||
						(score[0] === oracle[0] &&
							(score[1] < oracle[1] ||
								(score[1] === oracle[1] && score[2] < oracle[2]))))
				)
					oracle = score;
			}
			const result = solve(s);
			if (!oracle) expect(result.status).toBe("infeasible");
			else {
				const e = result.evaluation;
				if (!e) throw new Error("Missing feasible evaluation");
				expect([e.shortfall, e.extraCost, e.extraTrips]).toEqual(oracle);
				expect(verifySolution(s, result)).toEqual([]);
				expect(
					evaluate(
						s,
						s.candidates.filter((t) => result.selectedTripIds.includes(t.id)),
					),
				).toEqual(e);
			}
		}
	});
});
