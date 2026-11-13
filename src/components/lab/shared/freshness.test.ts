import { expect, test } from "bun:test";
import { assessFreshness, formatAge } from "./freshness";

const at = (s: string) => new Date(s);

test("a date-only value is a Taipei day, never claimed to be 23:59 and never real-time", () => {
	// day 2025-12-31 ends at 2025-12-31T16:00:00Z; 17:00Z is one hour after the day ended
	const f = assessFreshness("2025-12-31", at("2025-12-31T17:00:00Z"));
	expect(f.precision).toBe("date");
	expect(f.level).toBe("recent");
	expect(f.ageMs).toBe(3_600_000);
	expect(f.ageText).toBe("至少 1 小時");
	expect(f.usableForRealtime).toBe(false);
});
test("date-only today or still-running day has no precise time", () => {
	const f = assessFreshness("2025-12-31", at("2025-12-31T10:00:00Z"));
	expect(f.level).toBe("unknown");
	expect(f.usableForRealtime).toBe(false);
});
test("levels by age for historical data", () => {
	const now = at("2026-11-04T00:00:00Z");
	expect(assessFreshness("2026-11-02", now).level).toBe("recent");
	expect(assessFreshness("2026-09-01", now).level).toBe("aging");
	const old = assessFreshness("2025-12-31", now);
	expect(old.level).toBe("stale");
	expect(old.usableForRealtime).toBe(false);
	expect(old.ageText).toBe("至少 307 天");
});
test("recent history is not real-time: a 30-minute-old timestamp is only recent", () => {
	const now = at("2026-11-04T00:30:00Z");
	const f = assessFreshness("2026-11-04T00:00:00Z", now);
	expect(f.level).toBe("recent");
	expect(f.precision).toBe("timestamp");
	expect(f.ageText).toBe("30 分鐘");
	expect(f.usableForRealtime).toBe(false); // within 2 h, still no real-time source declared
});
test("only a declared real-time source with a precise fresh timestamp is usable", () => {
	const now = at("2026-11-04T00:30:00Z");
	const rt = { realtime: { maxAgeMs: 10 * 60_000 } };
	expect(
		assessFreshness("2026-11-04T00:25:00Z", now, rt).usableForRealtime,
	).toBe(true);
	expect(
		assessFreshness("2026-11-04T00:00:00Z", now, rt).usableForRealtime,
	).toBe(false);
	// a date-only value can never qualify, even with a declared source
	expect(assessFreshness("2026-11-04", now, rt).usableForRealtime).toBe(false);
	// timezone offsets are honoured
	expect(
		assessFreshness("2026-11-04T08:25:00+08:00", now, rt).usableForRealtime,
	).toBe(true);
});
test("future timestamps and dates are flagged, never live", () => {
	const now = at("2026-11-04T00:00:00Z");
	const rt = { realtime: { maxAgeMs: 3_600_000 } };
	const ts = assessFreshness("2026-11-04T01:00:00Z", now, rt);
	expect(ts.level).toBe("future");
	expect(ts.usableForRealtime).toBe(false);
	expect(ts.ageText).toBe("未來時間");
	const d = assessFreshness("2026-11-06", now);
	expect(d.level).toBe("future");
	expect(d.usableForRealtime).toBe(false);
});
test("invalid input is reported, not thrown or guessed", () => {
	const now = at("2026-11-04T00:00:00Z");
	for (const bad of [
		"nope",
		"",
		"2025-02-30", // not a real calendar day
		"2025-13-01",
		"2026-11-04T00:00:00", // no timezone
		"2026-11-04T00:00", // no seconds / timezone
		"2026-11-04 00:00:00Z",
		"2026-11-04T24:00:00Z",
		"2026-02-29T00:00:00Z",
		"2026-11-04T00:00:00+8",
	]) {
		const f = assessFreshness(bad, now, { realtime: { maxAgeMs: 1e12 } });
		expect(f.level).toBe("invalid");
		expect(f.ageMs).toBeNull();
		expect(f.usableForRealtime).toBe(false);
	}
	expect(assessFreshness("2024-02-29", now).level).toBe("stale"); // real leap day
});
test("formatAge units", () => {
	expect(formatAge(30 * 60_000)).toBe("30 分鐘");
	expect(formatAge(5 * 3_600_000)).toBe("5 小時");
	expect(formatAge(-1)).toBe("未來時間");
});
