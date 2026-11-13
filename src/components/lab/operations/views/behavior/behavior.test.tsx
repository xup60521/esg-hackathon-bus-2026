import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import summaryFixture from "../../../../../../public/data/lab/behavior/od-behavior-summary.json";
import clustersFixture from "../../../../../../public/data/lab/behavior/od-clusters.json";
import temporalFixture from "../../../../../../public/data/lab/behavior/temporal-behavior.json";
import { StatusBox } from "./common";
import {
	AM_WINDOW,
	aggregate,
	DEFAULT_FILTERS,
	type Filters,
	filterOds,
	fmtMin,
	fmtPct,
	normalizeText,
	PM_WINDOW,
	peakHours,
	ratio,
	sortOds,
	windowTrips,
} from "./explore";
import { HourBars } from "./HourBars";
import {
	assembleData,
	crossCheck,
	loadBehavior,
	parseClusters,
	parseSummary,
	parseTemporal,
	RULE_ORDER,
} from "./model";
import { OdExplorer } from "./OdExplorer";
import { DEFAULT_TIME, TimePanel } from "./TimePanel";

const clone = <T,>(v: T): T => structuredClone(v);

function loadFixture() {
	const s = parseSummary(clone(summaryFixture));
	const c = parseClusters(clone(clustersFixture));
	const t = parseTemporal(clone(temporalFixture));
	if (!s.ok || !c.ok || !t.ok) throw new Error("fixture rejected");
	return { s: s.data, c: c.data, t: t.data };
}

const fixture = loadFixture();
const ods = fixture.s.allOdPairs;
const f = (p: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...p });

describe("behavior data validation (real files)", () => {
	test("the three committed files load, reconcile and share one snapshot", () => {
		const merged = assembleData(fixture.s, fixture.c, fixture.t);
		expect(merged.ok).toBe(true);
		expect(ods).toHaveLength(206);
		expect(fixture.s.topOdPairs).toHaveLength(30);
		expect(fixture.s.clusters.map((c) => c.archetype).sort()).toEqual(
			[...RULE_ORDER].sort(),
		);
	});

	test("old schema, wrong method and a null root are rejected with readable messages", () => {
		const v1 = { ...clone(summaryFixture), schemaVersion: 1 };
		const r1 = parseSummary(v1);
		expect(r1.ok).toBe(false);
		if (!r1.ok) expect(r1.message).toContain("schemaVersion 不是 2");
		const ml = parseSummary({ ...clone(summaryFixture), method: "kmeans" });
		expect(ml.ok).toBe(false);
		const root = parseSummary(null);
		expect(root.ok).toBe(false);
	});

	test("a top-30-only allOdPairs is not accepted as the full list", () => {
		const bad = clone(summaryFixture);
		bad.allOdPairs = bad.allOdPairs.slice(0, 30);
		const r = parseSummary(bad);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.message).toContain("distinctOdPairsCount");
	});

	test("an unknown average must stay null, a zero replacement is rejected", () => {
		const bad = clone(summaryFixture);
		const i = bad.allOdPairs.findIndex((o) => o.avgDurationMin === null);
		expect(i).toBeGreaterThanOrEqual(0);
		(bad.allOdPairs[i] as { avgDurationMin: number | null }).avgDurationMin = 0;
		const r = parseSummary(bad);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.message).toContain("無有效時長樣本");
	});

	test("a displayed average that differs from exact seconds/count is rejected", () => {
		const bad = clone(summaryFixture);
		bad.allOdPairs[0].avgDurationMin =
			(bad.allOdPairs[0].avgDurationMin ?? 0) + 0.1;
		const r = parseSummary(bad);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.message).toContain("平均時長");
	});

	test("ticket partition must keep other: dropping it fails", () => {
		const bad = clone(summaryFixture);
		bad.ticketGroupOverview = bad.ticketGroupOverview.filter(
			(t) => t.group !== "other",
		);
		expect(parseSummary(bad).ok).toBe(false);
		const bad2 = clone(summaryFixture);
		bad2.allOdPairs[0].otherTrips += 1;
		const r = parseSummary(bad2);
		expect(r.ok).toBe(false);
	});

	test("a rule group whose members disagree with its legacy id, or a failed reconciliation flag, is rejected", () => {
		const bad = clone(summaryFixture);
		bad.allOdPairs[0].archetype = "abnormal_tap";
		const a = parseSummary(bad);
		expect(a.ok).toBe(false);
		const bad2 = clone(summaryFixture);
		(bad2.reconciliation as Record<string, boolean>).hourly = false;
		const b = parseSummary(bad2);
		expect(b.ok).toBe(false);
		if (!b.ok) expect(b.message).toContain("對帳");
	});

	test("files from different snapshots are not mixed", () => {
		const t = clone(fixture.t);
		t.generatedAt = "2020-01-01T00:00:00.000Z";
		expect(crossCheck(fixture.s, fixture.c, t).join()).toContain("generatedAt");
		const c = clone(fixture.c);
		c.clusters[0].totalTrips += 1;
		expect(crossCheck(fixture.s, c, fixture.t).length).toBeGreaterThan(0);
		const t2 = clone(fixture.t);
		t2.topOdHourly[0].hourly[0] += 1;
		expect(crossCheck(fixture.s, fixture.c, t2).length).toBeGreaterThan(0);
	});
});

describe("loadBehavior error handling", () => {
	const body = (name: string): unknown =>
		name.includes("summary")
			? summaryFixture
			: name.includes("clusters")
				? clustersFixture
				: temporalFixture;
	const ok = (url: string) =>
		Promise.resolve(new Response(JSON.stringify(body(url))));

	test("success path", async () => {
		const r = await loadBehavior(((u: string) =>
			ok(u)) as unknown as typeof fetch);
		expect(r.state).toBe("ready");
	});

	test("missing or inconsistent representative ODs enter the retryable error state", async () => {
		const missing = clone(summaryFixture);
		Reflect.deleteProperty(missing.clusters[0], "topOdPairs");
		const wrongTrips = clone(summaryFixture);
		wrongTrips.clusters[0].topOdPairs[0].trips = 999999999;
		const wrongMean = clone(summaryFixture);
		(
			wrongMean.clusters[0].topOdPairs[0] as {
				avgDurationMin: number | null;
			}
		).avgDurationMin = null;
		const wrongGroup = clone(summaryFixture);
		wrongGroup.clusters[0].topOdPairs[0] = clone(
			wrongGroup.clusters[1].topOdPairs[0],
		);
		const duplicate = clone(summaryFixture);
		duplicate.clusters[0].topOdPairs.push(
			clone(duplicate.clusters[0].topOdPairs[0]),
		);
		for (const bad of [missing, wrongTrips, wrongMean, wrongGroup, duplicate]) {
			const fetcher = ((u: string) =>
				u.includes("summary")
					? Promise.resolve(new Response(JSON.stringify(bad)))
					: ok(u)) as unknown as typeof fetch;
			const r = await loadBehavior(fetcher);
			expect(r.state).toBe("error");
			if (r.state === "error")
				expect(r.lines.join()).toContain("od-behavior-summary.json");
		}
	});

	test("HTTP error names the file and the status", async () => {
		const fetcher = ((u: string) =>
			u.includes("clusters")
				? Promise.resolve(new Response("nope", { status: 404 }))
				: ok(u)) as unknown as typeof fetch;
		const r = await loadBehavior(fetcher);
		expect(r.state).toBe("error");
		if (r.state === "error") {
			expect(r.lines.join()).toContain("od-clusters.json");
			expect(r.lines.join()).toContain("404");
		}
	});

	test("network failure and invalid JSON are reported, not thrown", async () => {
		const r1 = await loadBehavior((() =>
			Promise.reject(new Error("boom"))) as unknown as typeof fetch);
		expect(r1.state).toBe("error");
		if (r1.state === "error") expect(r1.lines.join()).toContain("網路錯誤");
		const r2 = await loadBehavior((() =>
			Promise.resolve(new Response("{not json"))) as unknown as typeof fetch);
		expect(r2.state).toBe("error");
		if (r2.state === "error") expect(r2.lines.join()).toContain("JSON");
	});
});

describe("exploration helpers", () => {
	test("a filtered time panel identifies the day count as global", () => {
		const html = renderToStaticMarkup(
			<TimePanel
				summary={fixture.s}
				temporal={fixture.t}
				state={{ ...DEFAULT_TIME, scope: fixture.s.clusters[0].clusterId }}
				onChange={() => {}}
			/>,
		);
		expect(html).toContain("全體有紀錄日數");
		expect(html).toContain("不隨規則組篩選");
	});
	test("rule groups partition all 206 ODs and every trip", () => {
		let n = 0;
		let trips = 0;
		for (const c of fixture.s.clusters) {
			const m = filterOds(ods, f({ group: c.clusterId }));
			expect(m).toHaveLength(c.odPairCount);
			n += m.length;
			trips += aggregate(m).trips;
		}
		expect(n).toBe(206);
		expect(trips).toBe(fixture.s.validOdTripsCount);
	});

	test("aggregate of everything equals file totals and the exact mean", () => {
		const a = aggregate(ods);
		expect(a.trips).toBe(1_800_910);
		expect(a.durationSampleCount).toBe(1_788_442);
		expect(a.durationSumSec).toBe(7_562_498_073);
		expect(a.avgDurationMin).toBe(70.5);
		expect(a.hourly).toEqual(fixture.s.overallHourly.map((h) => h.trips));
		expect(Object.values(a.tickets).reduce((x, y) => x + y, 0)).toBe(a.trips);
		expect(a.tickets.other).toBe(10_705);
		expect(a.weekendTrips + a.weekdayTrips).toBe(a.trips);
		expect(a.amTrips + a.pmTrips + a.offTrips).toBe(a.trips);
	});

	test("rule-group mean is the file value, weighted by valid samples", () => {
		for (const c of fixture.s.clusters)
			expect(
				aggregate(filterOds(ods, f({ group: c.clusterId }))).avgDurationMin,
			).toBe(c.avgDurationMin);
	});

	test("same-stop filter: 16 ODs, 6,281 trips; exclude is the complement", () => {
		const only = filterOds(ods, f({ sameStop: "only" }));
		expect(only).toHaveLength(16);
		expect(aggregate(only).trips).toBe(6281);
		expect(filterOds(ods, f({ sameStop: "exclude" }))).toHaveLength(190);
	});

	test("an all-unknown selection shows null, never 0", () => {
		const unknown = ods.filter((o) => o.avgDurationMin === null);
		expect(unknown).toHaveLength(1);
		const a = aggregate(unknown);
		expect(a.avgDurationMin).toBeNull();
		expect(fmtMin(a.avgDurationMin)).toBe("無");
		const none = aggregate([]);
		expect(none.trips).toBe(0);
		expect(ratio(none.weekendTrips, none.trips)).toBeNull();
		expect(fmtPct(ratio(0, 0))).toBe("無");
	});

	test("query treats 台 and 臺 alike and ignores spaces", () => {
		expect(normalizeText("台中 航空站")).toBe("臺中航空站");
		const a = filterOds(ods, f({ query: "台中航空站" }));
		const b = filterOds(ods, f({ query: "臺中航空站" }));
		expect(a.length).toBeGreaterThan(0);
		expect(a.map((o) => o.id)).toEqual(b.map((o) => o.id));
		expect(filterOds(ods, f({ query: "不存在的站" }))).toHaveLength(0);
	});

	test("ticket share threshold uses the OD's own trips", () => {
		const m = filterOds(ods, f({ ticket: "student", minShare: 0.5 }));
		expect(m.length).toBeGreaterThan(0);
		for (const o of m)
			expect(o.studentTrips / o.trips).toBeGreaterThanOrEqual(0.5);
		const outside = ods.filter((o) => !m.includes(o));
		for (const o of outside) expect(o.studentTrips / o.trips).toBeLessThan(0.5);
		// "any" ignores the threshold
		expect(filterOds(ods, f({ ticket: "any", minShare: 0.5 }))).toHaveLength(
			206,
		);
	});

	test("sorting puts unknown durations last in both directions", () => {
		for (const desc of [true, false]) {
			const sorted = sortOds(ods, f({ sort: "avgDuration", desc }));
			expect(sorted).toHaveLength(206);
			expect(sorted[sorted.length - 1].avgDurationMin).toBeNull();
			expect(sorted.filter((o) => o.avgDurationMin === null)).toHaveLength(1);
		}
		const byTrips = sortOds(ods, f({ sort: "trips", desc: true }));
		expect(byTrips[0].rank).toBe(1);
	});

	test("windows: AM/PM equal the files' own counts; wrap-around works", () => {
		const a = aggregate(ods);
		expect(windowTrips(a.hourly, AM_WINDOW.from, AM_WINDOW.to)).toBe(a.amTrips);
		expect(windowTrips(a.hourly, PM_WINDOW.from, PM_WINDOW.to)).toBe(a.pmTrips);
		expect(windowTrips(a.hourly, 22, 3)).toBe(
			[22, 23, 0, 1, 2, 3].reduce((n, h) => n + a.hourly[h], 0),
		);
		expect(windowTrips(a.hourly, 0, 23)).toBe(a.trips);
		expect(peakHours(new Array(24).fill(0))).toEqual([]);
		expect(peakHours([...new Array(23).fill(0), 5])).toEqual([23]);
	});
});

describe("rendering", () => {
	test("explorer states the numerator and denominator of the filter", () => {
		const html = renderToStaticMarkup(
			<OdExplorer
				summary={fixture.s}
				filters={DEFAULT_FILTERS}
				onChange={() => {}}
			/>,
		);
		expect(html).toContain("符合 206 / 206 組 OD");
		expect(html).toContain("1,800,910 / 1,800,910");
		expect(html).toContain("顯示 25 / 206 組 OD");
		const same = renderToStaticMarkup(
			<OdExplorer
				summary={fixture.s}
				filters={f({ sameStop: "only" })}
				onChange={() => {}}
			/>,
		);
		expect(same).toContain("符合 16 / 206 組 OD");
		expect(same).toContain("6,281 / 1,800,910");
		expect(same).toContain("同站・待查");
		const empty = renderToStaticMarkup(
			<OdExplorer
				summary={fixture.s}
				filters={f({ query: "不存在的站" })}
				onChange={() => {}}
			/>,
		);
		expect(empty).toContain("符合 0 / 206 組 OD");
		expect(empty).toContain("沒有符合條件的 OD");
	});

	test("chart has a text alternative and marks the window with text", () => {
		const a = aggregate(ods);
		const html = renderToStaticMarkup(
			<HourBars values={a.hourly} window={AM_WINDOW} what="全部 OD" />,
		);
		expect(html).toContain('role="img"');
		expect(html).toContain("aria-label");
		expect(html).toContain("窗口 06–09 時");
		expect(html).toContain("用表格讀取 24 小時數值");
	});

	test("error box is an alert with retry and explains nothing partial is shown", () => {
		const html = renderToStaticMarkup(
			<StatusBox
				title="無法載入"
				lines={["a.json：載入失敗（HTTP 404）"]}
				onRetry={() => {}}
			/>,
		);
		expect(html).toContain('role="alert"');
		expect(html).toContain("HTTP 404");
		expect(html).toContain("重新載入");
	});
});
