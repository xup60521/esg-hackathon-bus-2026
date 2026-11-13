import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	type Attraction,
	calculateLastBusRisk,
	type ReachabilityResult,
	type ScenarioExample,
	type TimetableData,
	verifyTripReachability,
} from "#/features/lab/tourism";
import attractionsFixture from "../../../../../../public/data/lab/tourism/attractions.json";
import scenariosFixture from "../../../../../../public/data/lab/tourism/sample-scenarios.json";
import timetableFixture from "../../../../../../public/data/lab/tourism/timetable.json";
import { AttractionPanel } from "./AttractionPanel";
import { InputForm, ScenarioShortcuts } from "./InputPanel";
import {
	type Action,
	bufferText,
	buildSegments,
	type Data,
	dayTypePreview,
	type FormState,
	initialForm,
	initialState,
	isAttractionsFile,
	isScenarios,
	isTimetable,
	lastBusText,
	loadJson,
	originOptions,
	parseForm,
	provenanceRows,
	reducer,
	type State,
	sameOutcome,
	uniqueWarnings,
} from "./model";
import { ResultPanel } from "./ResultPanel";

const timetable = timetableFixture as unknown as TimetableData;
const attractions = attractionsFixture.attractions as unknown as Attraction[];
const scenarios = scenariosFixture as unknown as ScenarioExample[];
const data: Data = { timetable, attractions };

const base: FormState = {
	originStopId: "thsr",
	attractionId: "xiangshan_visitor_center",
	date: "2026-11-05",
	time: "08:30",
	dwell: "90",
	profile: "general",
	dayType: "auto",
};

function run(state: State, ...actions: Action[]): State {
	return actions.reduce(reducer, state);
}
const fresh = () => initialState(base);

describe("data guards", () => {
	test("accept the real files", () => {
		expect(isTimetable(timetableFixture)).toBe(true);
		expect(isAttractionsFile(attractionsFixture)).toBe(true);
		expect(isScenarios(scenariosFixture)).toBe(true);
	});

	test("reject damaged shapes instead of rendering them", () => {
		const t = structuredClone(timetableFixture) as Record<string, unknown>;
		(t.metadata as Record<string, unknown>).validityRange = "2026-01-01~";
		expect(isTimetable(t)).toBe(false);

		const t2 = structuredClone(timetableFixture) as {
			schedules: { weekday_inbound: { trips: unknown } };
		};
		t2.schedules.weekday_inbound.trips = "oops";
		expect(isTimetable(t2)).toBe(false);

		const a = structuredClone(attractionsFixture) as {
			attractions: Record<string, unknown>[];
		};
		delete a.attractions[0].provenance;
		expect(isAttractionsFile(a)).toBe(false);
		expect(isAttractionsFile({ attractions: [] })).toBe(false);

		const s = structuredClone(scenariosFixture) as {
			result: Record<string, unknown>;
		}[];
		s[0].result.status = "verified";
		expect(isScenarios(s)).toBe(false);
		expect(isScenarios({})).toBe(false);
	});
});

describe("loadJson", () => {
	const fakeFetch = (impl: () => Promise<Response>) =>
		impl as unknown as typeof fetch;
	const ok = (body: BodyInit) => async () => new Response(body);

	test("returns data when the file is fine", async () => {
		const r = await loadJson(
			"/x",
			isTimetable,
			fakeFetch(ok(JSON.stringify(timetableFixture))),
		);
		expect(r.ok).toBe(true);
	});

	test("reports HTTP failure, bad JSON, wrong shape and network error", async () => {
		const msg = async (impl: () => Promise<Response>) => {
			const r = await loadJson("/x", isTimetable, fakeFetch(impl));
			return r.ok ? "ok" : r.message;
		};
		expect(
			await msg(async () => new Response("no", { status: 404 })),
		).toContain("HTTP 404");
		expect(await msg(ok("{not json"))).toContain("JSON");
		expect(await msg(ok('{"a":1}'))).toContain("格式");
		expect(
			await msg(async () => {
				throw new TypeError("offline");
			}),
		).toContain("網路錯誤");
	});
});

describe("form parsing", () => {
	test("blocks inputs that cannot form a request", () => {
		const bad = (p: Partial<FormState>) => {
			const r = parseForm({ ...base, ...p }, data);
			return r.ok ? null : r.errors;
		};
		expect(bad({ date: "" })?.date).toBeTruthy();
		expect(bad({ date: "2026-02-30" })?.date).toBeTruthy();
		expect(bad({ time: "" })?.time).toBeTruthy();
		expect(bad({ time: "24:00" })?.time).toBeTruthy();
		expect(bad({ dwell: "1.5" })?.dwell).toBeTruthy();
		expect(bad({ dwell: "abc" })?.dwell).toBeTruthy();
		expect(bad({ originStopId: "nowhere" })?.originStopId).toBeTruthy();
		expect(bad({ attractionId: "pub" })?.attractionId).toBeTruthy();
		expect(bad({ date: "", time: "" })).toHaveProperty("date");
		expect(bad({ date: "", time: "" })).toHaveProperty("time");
	});

	test("blank dwell uses the suggestion; override maps to dayTypeOverride", () => {
		const r = parseForm({ ...base, dwell: "", dayType: "holiday" }, data);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect("customDwellMinutes" in r.request).toBe(false);
		expect(r.request.dayTypeOverride).toBe("holiday");
		const auto = parseForm(base, data);
		expect(auto.ok && "dayTypeOverride" in auto.request).toBe(false);
	});

	test("lets the engine decide rules: zero dwell and past dates are passed through", () => {
		expect(parseForm({ ...base, dwell: "0" }, data).ok).toBe(true);
		expect(parseForm({ ...base, dwell: "-5" }, data).ok).toBe(true);
		expect(parseForm({ ...base, date: "2020-01-01" }, data).ok).toBe(true);
	});

	test("origin options only list stops that have scheduled times", () => {
		const ids = originOptions(timetable).map((s) => s.id);
		expect(ids).toContain("thsr");
		expect(ids).toContain("taichung");
		const used = new Set(
			Object.values(timetable.schedules).flatMap((s) =>
				s.trips.flatMap((t) => Object.keys(t.stopTimes)),
			),
		);
		for (const id of ids) expect(used.has(id)).toBe(true);
	});

	test("date preview follows the timetable notes (Mon–Thu weekday, Fri–Sun holiday)", () => {
		expect(dayTypePreview("2026-11-05")).toEqual({
			weekday: "週四",
			dayType: "weekday",
		});
		expect(dayTypePreview("2026-11-06")?.dayType).toBe("holiday");
		expect(dayTypePreview("2026-02-30")).toBeNull();
	});
});

describe("interactions (reducer)", () => {
	test("submit runs the engine and keeps the conditional status", () => {
		const s = run(fresh(), { type: "submit", data });
		expect(s.run?.result.status).toBe("conditional_snapshot_simulation");
		expect(s.run?.result.isValid).toBe(true);
		expect(s.run?.result.lastBusRisk?.riskLevel).toBe("SAFE");
		expect(s.stale).toBe(false);
	});

	test("editing after a run marks the result stale and clears errors", () => {
		const s = run(
			fresh(),
			{ type: "submit", data },
			{ type: "patch", patch: { time: "10:00" } },
		);
		expect(s.stale).toBe(true);
		expect(s.run?.request.departureTime).toBe("08:30");
		expect(s.form.time).toBe("10:00");
	});

	test("invalid input is reported and the previous result is kept", () => {
		const s = run(
			fresh(),
			{ type: "submit", data },
			{ type: "patch", patch: { date: "" } },
			{ type: "submit", data },
		);
		expect(s.errors.date).toBeTruthy();
		expect(s.run?.request.departureDate).toBe("2026-11-05");
	});

	test("every rejected input still returns the conditional status with a reason", () => {
		for (const patch of [
			{ date: "2026-11-04", attractionId: "paper_dome" }, // Wednesday closure
			{ date: "2020-01-01" }, // before the snapshot
			{ dwell: "0" },
			{ dwell: "400" }, // crosses closing
			{ originStopId: "xiangshan" }, // same stop as attraction
			{ time: "23:50" }, // no later outbound
		]) {
			const s = run(
				fresh(),
				{ type: "patch", patch },
				{ type: "submit", data },
			);
			expect(s.run?.result.status).toBe("conditional_snapshot_simulation");
			expect(s.run?.result.isValid).toBe(false);
			expect(s.run?.result.invalidReason).toBeTruthy();
		}
	});

	test("dayType override changes the timetable and is labelled MANUAL_OVERRIDE", () => {
		const auto = run(fresh(), { type: "submit", data }).run?.result;
		const over = run(
			fresh(),
			{ type: "patch", patch: { dayType: "holiday" } },
			{ type: "submit", data },
		).run?.result;
		expect(auto?.dayTypeSource).toBe("OFFICIAL_NOTES_CALENDAR");
		expect(over?.dayTypeSource).toBe("MANUAL_OVERRIDE");
		expect(over?.dayType).toBe("holiday");
		expect(auto?.dayType).toBe("weekday");
	});

	test("loading a sample fills the form and runs it; all five match their stored result", () => {
		expect(scenarios).toHaveLength(5);
		for (const scenario of scenarios) {
			const s = run(fresh(), { type: "load", scenario, data });
			expect(s.form.originStopId).toBe(scenario.request.originStopId);
			expect(s.form.profile).toBe(scenario.request.profile ?? "general");
			expect(s.run?.scenarioId).toBe(scenario.scenarioId);
			expect(
				sameOutcome(s.run?.result as ReachabilityResult, scenario.result),
			).toBe(true);
		}
		const stranded = run(fresh(), {
			type: "load",
			scenario: scenarios[4],
			data,
		});
		expect(stranded.run?.result.lastBusRisk?.riskLevel).toBe("STRANDED");
		expect(stranded.run?.result.isValid).toBe(false);
	});

	test("sameOutcome detects a changed stored result", () => {
		const r = verifyTripReachability(
			scenarios[0].request,
			timetable,
			attractions,
		);
		expect(sameOutcome(r, r)).toBe(true);
		expect(sameOutcome(r, { ...r, isValid: !r.isValid })).toBe(false);
	});

	test("initial form takes the first sample when present", () => {
		expect(initialForm(data, scenarios).originStopId).toBe("thsr");
		const blank = initialForm(data, null);
		expect(blank.date).toBe(timetable.metadata.retrievedDate);
		expect(parseForm(blank, data).ok).toBe(true);
	});
});

describe("result helpers", () => {
	const result = (i: number) => scenarios[i].result;

	test("time segments are contiguous for a full round trip and partial when rejected", () => {
		const segs = buildSegments(result(0));
		expect(segs.map((s) => s.key)).toEqual([
			"ride_out",
			"walk_in",
			"dwell",
			"walk_back",
			"wait_bus",
			"ride_back",
		]);
		for (let i = 1; i < segs.length; i++)
			expect(segs[i].start).toBe(segs[i - 1].end);
		expect(buildSegments(result(2))).toEqual([]); // closed day: no outbound
		expect(buildSegments(result(4)).map((s) => s.key)).not.toContain(
			"ride_back",
		);
	});

	test("INVALID last-bus sentinels never read as real values", () => {
		const risk = calculateLastBusRisk(
			"xiangshan",
			"nowhere",
			"weekday",
			"10:00",
			timetable,
		);
		expect(risk.riskLevel).toBe("INVALID");
		expect(risk.lastBusDepartureTime).toBe("00:00"); // the sentinel exists in the engine
		expect(lastBusText(risk)).not.toContain("00:00");
		expect(bufferText(risk)).not.toContain("999");
	});

	test("stranded buffer reads as lateness, not a negative number", () => {
		const risk = result(4).lastBusRisk;
		expect(risk && bufferText(risk)).toBe("晚於末班 19 分鐘");
	});

	test("duplicate warnings collapse", () => {
		expect(uniqueWarnings(["a", "b", "a"])).toEqual(["a", "b"]);
	});
});

describe("attraction provenance", () => {
	test("one row per listed field, split into supported / assumed / unknown", () => {
		for (const a of attractions) {
			const rows = provenanceRows(a);
			const p = a.provenance;
			expect(rows).toHaveLength(
				p.verifiedFields.length +
					p.assumedFields.length +
					p.unknownFields.length,
			);
			expect(rows.filter((r) => r.basis === "unknown")).toHaveLength(
				p.unknownFields.length,
			);
		}
	});

	test("known facts land in the right bucket", () => {
		const row = (id: string, label: string) =>
			provenanceRows(attractions.find((a) => a.id === id) as Attraction).find(
				(r) => r.label === label,
			);
		expect(row("paper_dome", "最後入園")).toMatchObject({
			basis: "supported",
			value: "16:30",
		});
		expect(row("paper_dome", "閉館時間")?.basis).toBe("assumed");
		expect(row("formosan_village", "閉館時間")?.basis).toBe("assumed");
		expect(row("formosan_village", "最後入園")).toMatchObject({
			basis: "unknown",
			value: "未知",
		});
		expect(row("xiangshan_visitor_center", "每週公休")?.basis).toBe("assumed");
	});

	test("no price is ever rendered", () => {
		for (const a of attractions) {
			const html = renderToStaticMarkup(<AttractionPanel attraction={a} />);
			expect(html).not.toMatch(/NT\$|\d\s*元|\$\s*\d/);
			expect(html).toContain("未知");
			expect(html).toContain("網址本身不構成驗證");
		}
	});
});

describe("rendering", () => {
	const noop = () => {};

	test("a successful result shows the status, warnings and both disclaimers in full", () => {
		const s = run(fresh(), { type: "submit", data });
		const html = renderToStaticMarkup(
			<ResultPanel
				run={s.run as NonNullable<State["run"]>}
				timetable={timetable}
				attractionName="向山"
				stale={false}
			/>,
		);
		const res = s.run?.result as ReachabilityResult;
		expect(html).toContain("conditional_snapshot_simulation");
		expect(html).toContain("不是旅行有效或當日運行的保證");
		expect(html).toContain("快照內有緩衝");
		expect(html).toContain("不是安全保證");
		expect(html).toContain("6670F");
		expect(html).toContain("非官方車次代碼");
		for (const w of uniqueWarnings(res.warnings))
			expect(html).toContain(w.replace(/&/g, "&amp;"));
		expect(html).toContain(res.disclaimer);
		expect(html).toContain(timetable.metadata.lastBusDisclaimer);
		expect(html).not.toContain("旅行有效，");
	});

	test("a rejected result leads with the reason and says nothing about a return trip", () => {
		const s = run(
			fresh(),
			{
				type: "patch",
				patch: { date: "2026-11-04", attractionId: "paper_dome" },
			},
			{ type: "submit", data },
		);
		const html = renderToStaticMarkup(
			<ResultPanel
				run={s.run as NonNullable<State["run"]>}
				timetable={timetable}
				attractionName="紙教堂"
				stale
			/>,
		);
		expect(html).toContain("條件不成立");
		expect(html).toContain("拒絕原因");
		expect(html).toContain("例外需另向景點確認");
		expect(html).toContain("表單已修改");
		expect(html).toContain("沒有算到回程");
	});

	test("INVALID risk renders without the 00:00 / -999 sentinels", () => {
		const risk = calculateLastBusRisk(
			"xiangshan",
			"nowhere",
			"weekday",
			"10:00",
			timetable,
		);
		const stored = scenarios[4].result;
		const forged: ReachabilityResult = {
			...stored,
			lastBusRisk: risk,
			warnings: [],
			outbound: null,
			dwell: null,
		};
		const html = renderToStaticMarkup(
			<ResultPanel
				run={{
					request: scenarios[4].request,
					result: forged,
					scenarioId: null,
				}}
				timetable={timetable}
				attractionName="向山"
				stale={false}
			/>,
		);
		expect(html).toContain("INVALID");
		expect(html).not.toContain("00:00");
		expect(html).not.toContain("-999");
	});

	test("field errors are announced and tied to their inputs", () => {
		const html = renderToStaticMarkup(
			<InputForm
				data={data}
				form={{ ...base, date: "", dwell: "abc" }}
				errors={{
					date: "請輸入出發日期",
					dwell: "停留須為整數分鐘，或留空使用建議值",
				}}
				dispatch={noop}
				attraction={attractions[0]}
			/>,
		);
		expect(html).toContain('role="alert"');
		expect(html).toContain('aria-invalid="true"');
		expect(html).toContain("請輸入出發日期");
		expect(html).toContain("tour-date-error");
		expect(html).toContain("留空＝建議值 90 分鐘");
	});

	test("scenario shortcuts list five samples and report the stored/recomputed match", () => {
		const html = renderToStaticMarkup(
			<ScenarioShortcuts
				data={data}
				scenarios={scenarios}
				activeId={null}
				dispatch={noop}
			/>,
		);
		expect(html.match(/載入並執行/g)).toHaveLength(5);
		expect(html).toContain("5 組都與預存結果一致");
		expect(html).toContain("STRANDED");
		expect(html).not.toContain("與重算不一致");
	});
});
