/**
 * Data-age assessment for the stale-data warning.
 *
 * Two separate questions are answered here and must not be mixed up:
 *  1. How old is the newest record?  (`level`, `ageMs` — time only)
 *  2. May the data drive a real-time decision?  (`usableForRealtime`)
 *
 * (2) is false unless the caller declares a real-time source with an explicit maximum age
 * (`options.realtime`) AND the timestamp is precise, timezone-explicit and not in the future.
 * Recency alone never proves it: TDX says it keeps about the latest 2 hours of A1/A2 vehicle data,
 * which is a retention note, not evidence that data within 2 hours can be used for dispatch.
 * Every dataset in this project is historical, so none of them passes `realtime`.
 *
 * Input forms: `YYYY-MM-DD` (a real Asia/Taipei calendar day, no time of day known) or an ISO
 * timestamp with an explicit timezone (`Z` or `±hh:mm`). Anything else is "invalid" — never guessed.
 */
export type FreshnessLevel =
	| "recent" // ≤ 7 days old (still historical unless a real-time source is declared)
	| "aging" // ≤ 90 days
	| "stale" // older
	| "unknown" // date-only and the day is today (or still running): no precise time
	| "future" // the stated time is later than now
	| "invalid"; // not a real calendar date / timestamp with explicit timezone

export const DAY_MS = 86_400_000;

export type Freshness = {
	level: FreshnessLevel;
	/** "date" = only a Taipei calendar day is known; "timestamp" = exact instant; "none" = unparseable */
	precision: "date" | "timestamp" | "none";
	/**
	 * Age of the newest record. Exact for a timestamp. For a date it is the *minimum* age: time since
	 * the end of that day (the record may be up to 24 h older); null when invalid.
	 */
	ageMs: number | null;
	/** human text, e.g. "至少 308 天", "45 分鐘", "未來時間"; "無法判讀" when invalid */
	ageText: string;
	/** true only for a declared real-time source with a precise, non-future, fresh-enough timestamp */
	usableForRealtime: boolean;
};

export type FreshnessOptions = {
	/** Declare a real-time source and the largest age (ms) its consumer accepts. Omit for history. */
	realtime?: { maxAgeMs: number };
};

/** Taipei calendar day → [start, end) in epoch ms, or null if it is not a real date. */
function taipeiDay(v: string): [number, number] | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
	if (!m) return null;
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const u = new Date(Date.UTC(y, mo - 1, d));
	if (
		u.getUTCFullYear() !== y ||
		u.getUTCMonth() !== mo - 1 ||
		u.getUTCDate() !== d
	)
		return null;
	const start = u.getTime() - 8 * 3_600_000;
	return [start, start + DAY_MS];
}

const TIMESTAMP =
	/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

/** ISO timestamp with explicit timezone and a real calendar date → epoch ms, else null. */
function parseTimestamp(v: string): number | null {
	const m = TIMESTAMP.exec(v);
	if (!m || !taipeiDay(m[1])) return null;
	const t = Date.parse(v);
	return Number.isNaN(t) ? null : t;
}

export function formatAge(ms: number): string {
	if (ms < 0) return "未來時間";
	if (ms < 3_600_000) return `${Math.max(1, Math.floor(ms / 60_000))} 分鐘`;
	if (ms < DAY_MS) return `${Math.floor(ms / 3_600_000)} 小時`;
	return `${Math.floor(ms / DAY_MS)} 天`;
}

const byAge = (ageMs: number): "recent" | "aging" | "stale" =>
	ageMs <= 7 * DAY_MS ? "recent" : ageMs <= 90 * DAY_MS ? "aging" : "stale";

export function assessFreshness(
	dataThrough: string,
	now: Date = new Date(),
	options: FreshnessOptions = {},
): Freshness {
	const day = taipeiDay(dataThrough);
	const instant = day ? null : parseTimestamp(dataThrough);
	if (!day && instant === null)
		return {
			level: "invalid",
			precision: "none",
			ageMs: null,
			ageText: "無法判讀",
			usableForRealtime: false,
		};
	const t = now.getTime();
	if (day) {
		const [start, end] = day;
		const ageMs = t - end;
		const level: FreshnessLevel =
			t < start ? "future" : ageMs < 0 ? "unknown" : byAge(ageMs);
		return {
			level,
			precision: "date",
			ageMs,
			ageText:
				level === "future"
					? "未來時間"
					: level === "unknown"
						? "當日，無精確時間"
						: `至少 ${formatAge(ageMs)}`,
			usableForRealtime: false,
		};
	}
	const ageMs = t - (instant as number);
	const level: FreshnessLevel = ageMs < 0 ? "future" : byAge(ageMs);
	const max = options.realtime?.maxAgeMs;
	return {
		level,
		precision: "timestamp",
		ageMs,
		ageText: formatAge(ageMs),
		usableForRealtime: max !== undefined && ageMs >= 0 && ageMs <= max,
	};
}
