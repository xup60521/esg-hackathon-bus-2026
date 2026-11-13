/**
 * Seats lab: (1) reconstruct what an at-stop "seats left" sign would have shown, from matched
 * tap-in/tap-out card records; (2) allocate reservation-only extra buses.
 *
 * Card records only contain riders who boarded. A bus that passed a stop without anyone boarding
 * leaves no record, so stop "arrivals" here are only the arrivals where at least one card boarded.
 */

export type Trip = {
	vehicle: string;
	date: string;
	board: number; // unix seconds
	alight: number;
	boardStop: string;
	alightStop: string;
	subroute: string;
};

export type Direction = "outbound" | "inbound" | "unknown";

/** A bus stopping at a stop where one or more cards boarded. */
export type Arrival = {
	date: string;
	stop: string;
	/** first boarding, unix seconds */
	time: number;
	subroute: string;
	direction: Direction;
	/** cards already aboard just before the first boarding (after earlier alightings) */
	load: number;
	boarded: number;
};

/** Same limits as earlier lab analyses: drop same-stop, < 3 min and > 4 h records. */
export const MIN_SECONDS = 180;
export const MAX_SECONDS = 4 * 3600;
/** Boardings at the same stop this close together belong to the same arrival. */
export const ARRIVAL_GAP_SECONDS = 10 * 60;

export function isUsable(t: Trip): boolean {
	const d = t.alight - t.board;
	return t.boardStop !== t.alightStop && d >= MIN_SECONDS && d <= MAX_SECONDS;
}

/**
 * Sweep one vehicle-day. At equal timestamps alightings are applied first, so a rider who
 * transfers at the same second is not counted twice.
 */
export function arrivalsForVehicleDay(
	trips: Trip[],
	stopOrder: Map<string, number>,
): Arrival[] {
	type Ev = { t: number; delta: 1 | -1; trip: Trip };
	const events: Ev[] = [];
	for (const trip of trips) {
		if (!isUsable(trip)) continue;
		events.push({ t: trip.board, delta: 1, trip });
		events.push({ t: trip.alight, delta: -1, trip });
	}
	events.sort((a, b) => a.t - b.t || a.delta - b.delta);

	const out: Arrival[] = [];
	let onboard = 0;
	let current: (Arrival & { last: number; votes: number }) | null = null;
	for (const e of events) {
		if (e.delta === -1) {
			onboard--;
			continue;
		}
		const { trip } = e;
		const sameArrival =
			current &&
			current.stop === trip.boardStop &&
			e.t - current.last <= ARRIVAL_GAP_SECONDS;
		if (!sameArrival) {
			if (current) out.push(finish(current));
			current = {
				date: trip.date,
				stop: trip.boardStop,
				time: e.t,
				subroute: trip.subroute,
				direction: "unknown",
				load: onboard,
				boarded: 0,
				last: e.t,
				votes: 0,
			};
		}
		const arrival = current as Arrival & { last: number; votes: number };
		arrival.boarded++;
		arrival.last = e.t;
		const from = stopOrder.get(trip.boardStop);
		const to = stopOrder.get(trip.alightStop);
		if (from !== undefined && to !== undefined)
			arrival.votes += Math.sign(to - from);
		onboard++;
	}
	if (current) out.push(finish(current));
	return out;
}

function finish(a: Arrival & { last: number; votes: number }): Arrival {
	const { last: _last, votes, ...rest } = a;
	return {
		...rest,
		direction: votes > 0 ? "outbound" : votes < 0 ? "inbound" : "unknown",
	};
}

export type SeatLevel = "available" | "few" | "full";
export const LEVEL_LABEL: Record<SeatLevel, string> = {
	available: "尚有空位",
	few: "座位不多",
	full: "已滿",
};

/** Three coarse levels, because the card-based count has known gaps (cash, children, late taps). */
export function seatLevel(
	load: number,
	capacity: number,
	fewAtOrBelow: number,
): SeatLevel {
	const left = capacity - load;
	if (left <= 0) return "full";
	if (left <= fewAtOrBelow) return "few";
	return "available";
}

// ---------------------------------------------------------------------------------------------
// Reservation-only extra buses
// ---------------------------------------------------------------------------------------------

export type Demand = { minute: number; riders: number };

export type AllocationOptions = {
	/** first and last departure, minutes after midnight */
	start: number;
	end: number;
	interval: number;
	seats: number;
	/** a reservation may be moved at most this many minutes either way */
	tolerance: number;
	/** a bus with fewer reservations than this is not run; its riders go on regular buses */
	minToRun: number;
};

export type Bus = { departure: number; riders: number };
export type Allocation = {
	buses: Bus[];
	requested: number;
	carried: number;
	/** reservations that ended up on regular buses (no bus within tolerance, or bus not run) */
	toRegular: number;
};

export function validateOptions(o: AllocationOptions): void {
	const ints = [o.start, o.end, o.interval, o.seats, o.tolerance, o.minToRun];
	if (!ints.every(Number.isInteger))
		throw new Error("options must be integers");
	if (o.interval <= 0 || o.seats <= 0 || o.tolerance < 0 || o.minToRun < 1)
		throw new Error("interval, seats and minToRun must be positive");
	if (o.start > o.end) throw new Error("start must not be after end");
	if (o.minToRun > o.seats) throw new Error("minToRun cannot exceed seats");
}

/**
 * Round expected reservations (observed riders × share) to whole riders with largest-remainder
 * rounding, so the day total is preserved and small time bins are not all rounded to zero.
 */
export function reservations(demand: Demand[], share: number): Demand[] {
	if (!(share >= 0 && share <= 1)) throw new Error("share must be within 0–1");
	const exact = demand.map((d) => d.riders * share);
	const total = Math.round(exact.reduce((s, x) => s + x, 0));
	const floors = exact.map(Math.floor);
	let left = total - floors.reduce((s, x) => s + x, 0);
	const order = exact
		.map((x, i) => ({ i, frac: x - Math.floor(x) }))
		.sort((a, b) => b.frac - a.frac || a.i - b.i);
	for (const { i } of order) {
		if (left <= 0) break;
		floors[i]++;
		left--;
	}
	return demand
		.map((d, i) => ({ minute: d.minute, riders: floors[i] }))
		.filter((d) => d.riders > 0);
}

/**
 * Consolidating greedy allocation, deterministic. Repeatedly run the departure that can take the
 * most still-unassigned reservations within tolerance (capped at its seats; ties go to the earlier
 * departure), filling it with the reservations closest in time. Stop when no departure would reach
 * `minToRun`; the remaining reservations ride regular buses. Each departure runs at most once.
 */
export function allocate(requests: Demand[], o: AllocationOptions): Allocation {
	validateOptions(o);
	const departures: number[] = [];
	for (let m = o.start; m <= o.end; m += o.interval) departures.push(m);

	const pending: number[] = [];
	for (const r of requests)
		for (let k = 0; k < r.riders; k++) pending.push(r.minute);
	pending.sort((a, b) => a - b);
	const requested = pending.length;

	const buses: Bus[] = [];
	const used = new Set<number>();
	while (pending.length > 0) {
		let best = -1;
		let bestTake = 0;
		for (let b = 0; b < departures.length; b++) {
			if (used.has(b)) continue;
			const near = pending.filter(
				(m) => Math.abs(m - departures[b]) <= o.tolerance,
			).length;
			const take = Math.min(near, o.seats);
			if (take > bestTake) {
				best = b;
				bestTake = take;
			}
		}
		if (best < 0 || bestTake < o.minToRun) break;
		used.add(best);
		const dep = departures[best];
		const chosen = pending
			.map((m, i) => ({ i, gap: Math.abs(m - dep) }))
			.filter((x) => x.gap <= o.tolerance)
			.sort((a, b) => a.gap - b.gap || a.i - b.i)
			.slice(0, bestTake)
			.map((x) => x.i)
			.sort((a, b) => b - a);
		for (const i of chosen) pending.splice(i, 1);
		buses.push({ departure: dep, riders: bestTake });
	}
	buses.sort((a, b) => a.departure - b.departure);
	const carried = buses.reduce((s, x) => s + x.riders, 0);
	return { buses, requested, carried, toRegular: requested - carried };
}
