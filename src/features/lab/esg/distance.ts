import { nonnegative } from "./calculator";
export interface RoutePairs {
	pairs: Record<string, { distance: number }>;
}
/** Cache copied reverse routes and ignores subroute. Neither is an actual bus trajectory. */
export function resolveDistance(
	board: string,
	alight: string,
	routes: RoutePairs,
) {
	if (board === alight)
		return { distanceKm: 0, method: "same-stop-zero-assumption" } as const;
	const entry = routes.pairs[`${board}|${alight}`];
	if (!entry) return { distanceKm: null, method: "unknown" } as const;
	nonnegative("route distance meters", entry.distance);
	return {
		distanceKm: entry.distance / 1000,
		method: "OSRM-pair-subroute-unresolved-reverse-copied",
	} as const;
}
