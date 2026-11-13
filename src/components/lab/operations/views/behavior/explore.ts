import type { OdPairStat } from "#/features/lab/behavior";
import { meanDurationMinutes } from "#/features/lab/behavior/duration";
import { TICKET_FIELD, TICKET_GROUPS, type TicketGroupId } from "./model";

/**
 * Pure helpers behind the explorer. Every ratio is computed from integer counts with an explicit
 * denominator; an empty denominator gives `null` (shown as 無), never 0.
 */

export const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Pre-set analysis windows from the report (not verified real peaks). Inclusive hours. */
export const AM_WINDOW = { from: 6, to: 9 } as const;
export const PM_WINDOW = { from: 16, to: 19 } as const;

export type SameStopMode = "all" | "only" | "exclude";
export type SortKey =
	| "trips"
	| "name"
	| "avgDuration"
	| "weekendRatio"
	| "amRatio"
	| "pmRatio"
	| "ticketShare";

export type Filters = {
	/** clusterId of one rule group, or "all" */
	group: number | "all";
	/** substring of either stop name */
	query: string;
	sameStop: SameStopMode;
	/** Only used with `minShare`: ticket group whose in-OD share must reach the threshold. */
	ticket: TicketGroupId | "any";
	/** 0–1, share of this OD's own trips */
	minShare: number;
	sort: SortKey;
	desc: boolean;
};

export const DEFAULT_FILTERS: Filters = {
	group: "all",
	query: "",
	sameStop: "all",
	ticket: "any",
	minShare: 0,
	sort: "trips",
	desc: true,
};

export const MIN_SHARE_OPTIONS = [0, 0.1, 0.25, 0.5] as const;

/** Treat 台 and 臺 as the same character; stop names mix both (e.g. 台中航空站 vs 臺中). */
export function normalizeText(s: string): string {
	return s.replace(/台/g, "臺").replace(/\s+/g, "").toLowerCase();
}

export function ratio(n: number, d: number): number | null {
	return d > 0 ? n / d : null;
}

export function isSameStop(o: OdPairStat): boolean {
	return o.boardStop === o.alightStop;
}

export function ticketShare(o: OdPairStat, g: TicketGroupId): number | null {
	return ratio(o[TICKET_FIELD[g]], o.trips);
}

export function filterOds(
	ods: readonly OdPairStat[],
	f: Filters,
): OdPairStat[] {
	const q = normalizeText(f.query);
	return ods.filter((o) => {
		if (f.group !== "all" && o.clusterId !== f.group) return false;
		if (f.sameStop === "only" && !isSameStop(o)) return false;
		if (f.sameStop === "exclude" && isSameStop(o)) return false;
		if (q && !normalizeText(`${o.boardStop}${o.alightStop}`).includes(q))
			return false;
		if (f.ticket !== "any" && f.minShare > 0) {
			const s = ticketShare(o, f.ticket);
			if (s === null || s < f.minShare) return false;
		}
		return true;
	});
}

function sortValue(o: OdPairStat, f: Filters): number | string | null {
	switch (f.sort) {
		case "trips":
			return o.trips;
		case "name":
			return `${o.boardStop}\u0000${o.alightStop}`;
		case "avgDuration":
			return o.avgDurationMin;
		case "weekendRatio":
			return ratio(o.weekendTrips, o.trips);
		case "amRatio":
			return ratio(o.amPeakTrips, o.trips);
		case "pmRatio":
			return ratio(o.pmPeakTrips, o.trips);
		case "ticketShare":
			return f.ticket === "any" ? o.trips : ticketShare(o, f.ticket);
	}
}

/** Unknown (null) values always sort last, whichever direction is chosen. */
export function sortOds(ods: readonly OdPairStat[], f: Filters): OdPairStat[] {
	const sign = f.desc ? -1 : 1;
	return [...ods].sort((a, b) => {
		const x = sortValue(a, f);
		const y = sortValue(b, f);
		if (x === null && y === null) return a.rank - b.rank;
		if (x === null) return 1;
		if (y === null) return -1;
		const c =
			typeof x === "string" && typeof y === "string"
				? x.localeCompare(y, "zh-Hant")
				: (x as number) - (y as number);
		return c !== 0 ? sign * c : a.rank - b.rank;
	});
}

export type Aggregate = {
	odCount: number;
	trips: number;
	weekendTrips: number;
	weekdayTrips: number;
	amTrips: number;
	pmTrips: number;
	offTrips: number;
	tickets: Record<TicketGroupId, number>;
	hourly: number[];
	durationSampleCount: number;
	durationSumSec: number;
	/** weighted by valid samples, from exact seconds; null when no valid sample */
	avgDurationMin: number | null;
};

export function aggregate(ods: readonly OdPairStat[]): Aggregate {
	const a: Aggregate = {
		odCount: ods.length,
		trips: 0,
		weekendTrips: 0,
		weekdayTrips: 0,
		amTrips: 0,
		pmTrips: 0,
		offTrips: 0,
		tickets: {
			general: 0,
			student: 0,
			concession: 0,
			tpass_commuter: 0,
			other: 0,
		},
		hourly: new Array<number>(24).fill(0),
		durationSampleCount: 0,
		durationSumSec: 0,
		avgDurationMin: null,
	};
	for (const o of ods) {
		a.trips += o.trips;
		a.weekendTrips += o.weekendTrips;
		a.weekdayTrips += o.weekdayTrips;
		a.amTrips += o.amPeakTrips;
		a.pmTrips += o.pmPeakTrips;
		a.offTrips += o.offPeakTrips;
		a.durationSampleCount += o.durationSampleCount;
		a.durationSumSec += o.durationSumSec;
		for (const g of TICKET_GROUPS) a.tickets[g] += o[TICKET_FIELD[g]];
		for (const h of HOURS) a.hourly[h] += o.hourly[h] ?? 0;
	}
	a.avgDurationMin = meanDurationMinutes(
		a.durationSumSec,
		a.durationSampleCount,
	);
	return a;
}

export function inWindow(h: number, from: number, to: number): boolean {
	return from <= to ? h >= from && h <= to : h >= from || h <= to;
}

/** Trips in the inclusive hour window; `from > to` wraps past midnight. */
export function windowTrips(
	hourly: readonly number[],
	from: number,
	to: number,
): number {
	return HOURS.filter((h) => inWindow(h, from, to)).reduce(
		(n, h) => n + (hourly[h] ?? 0),
		0,
	);
}

/** Hours holding the largest bucket (ties all returned); empty when nothing was recorded. */
export function peakHours(hourly: readonly number[]): number[] {
	const max = Math.max(0, ...hourly);
	return max === 0 ? [] : HOURS.filter((h) => hourly[h] === max);
}

const nfInt = new Intl.NumberFormat("en-US");
const nfPct = new Intl.NumberFormat("en-US", {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});
const nfMin = new Intl.NumberFormat("en-US", {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});

export const fmtInt = (n: number) => nfInt.format(n);
/** 0–1 ratio to percent; null (empty denominator) shows 無. */
export const fmtPct = (r: number | null) =>
	r === null ? "無" : `${nfPct.format(r * 100)}%`;
/** Already-rounded minutes (one decimal); null shows 無, never 0. */
export const fmtMin = (m: number | null) =>
	m === null ? "無" : `${nfMin.format(m)} 分`;
export const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;
