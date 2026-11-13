import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { answer, parseClock } from "./engine";
import { answerText, type QaItem, runQa } from "./qa";
import { findStops, STOPS } from "./stops";
import { queryTrips, toMin } from "./timetable";
import type { Context, HistoryData, TimetableData } from "./types";

const read = <T>(p: string) => JSON.parse(readFileSync(p, "utf8")) as T;
const tt = read<TimetableData>("public/data/lab/assistant/timetable.json");
const history = read<HistoryData>("public/data/lab/assistant/history.json");
const ctx: Context = { timetable: tt, history };
const qa = read<{ items: QaItem[] }>("docs/lab/assistant/qa-set.json").items;

describe("資料完整性（真實擷取資料）", () => {
	test("時刻表：四張表、站間時間單調不減", () => {
		expect(tt.tables.map((t) => `${t.day}/${t.direction}`)).toEqual([
			"weekday/outbound",
			"weekday/inbound",
			"holiday/outbound",
			"holiday/inbound",
		]);
		for (const t of tt.tables)
			for (const trip of t.trips) {
				const v = trip.times.filter((x): x is string => !!x).map(toMin);
				expect(v.length).toBeGreaterThanOrEqual(2);
				expect(v).toEqual([...v].sort((a, b) => a - b));
				expect(trip.times.length).toBe(t.stops.length);
			}
	});
	test("歷史彙總守恆：cells 合計＋方向未知＝全部上車刷卡＝README 的 1,800,910", () => {
		const cells = history.cells.reduce((s, c) => s + c[4], 0);
		expect(cells + history.unknownDirectionBoardings).toBe(
			history.totalBoardings,
		);
		expect(history.totalBoardings).toBe(1_800_910);
		expect(history.daysPerWeekday.reduce((a, b) => a + b, 0)).toBe(
			history.observedDays,
		);
	});
});

describe("queryTrips 對照暴力實作", () => {
	// 獨立實作：逐班掃描，不共用 queryTrips 的 indexIn
	function naive(day: "weekday" | "holiday", o: string, d: string) {
		const out: string[] = [];
		for (const t of tt.tables.filter((x) => x.day === day)) {
			const io = t.stops.indexOf(o);
			const id = t.stops.indexOf(d);
			if (io < 0 || id < 0 || id <= io) continue;
			for (const trip of t.trips)
				if (trip.times[io] && trip.times[id])
					out.push(
						`${t.direction}#${trip.no}@${trip.times[io]}>${trip.times[id]}`,
					);
		}
		return out.sort();
	}
	test("所有起訖站組合 × 兩種日型一致", () => {
		const single = STOPS.filter((s) => s.tt.length === 1);
		let pairs = 0;
		for (const day of ["weekday", "holiday"] as const)
			for (const o of single)
				for (const d of single) {
					if (o === d) continue;
					const got = queryTrips(tt, { day, origin: o, dest: d })
						.map((h) => `${h.direction}#${h.no}@${h.dep}>${h.arr}`)
						.sort();
					expect(got).toEqual(naive(day, o.tt[0], d.tt[0]));
					pairs++;
				}
		expect(pairs).toBe(single.length * (single.length - 1) * 2);
	});
});

describe("解析", () => {
	test("時間", () => {
		expect(parseClock("9點後")?.hhmm).toBe("09:00");
		expect(parseClock("下午3點半")?.hhmm).toBe("15:30");
		expect(parseClock("晚上八點之前")).toMatchObject({
			hhmm: "20:00",
			relation: "before",
		});
		expect(parseClock("十二點")?.hhmm).toBe("12:00");
		expect(parseClock("25:00")).toBeNull();
		expect(parseClock("6670 的 A 線")).toBeNull();
		expect(parseClock("5點")?.guessedPeriod).toBe(true);
	});
	test("站名：路線名不算站，長名優先", () => {
		expect(findStops("日月潭線票價").length).toBe(0);
		expect(findStops("埔里遊客中心").map((m) => m.stop.label)).toEqual([
			"埔里遊客中心",
		]);
		expect(findStops("台中火車站到埔里").map((m) => m.stop.label)).toEqual([
			"臺中車站(民族路口)",
			"埔里站",
		]);
	});
});

describe("問答驗證集（人工撰寫）", () => {
	const results = runQa(qa, ctx);
	for (const r of results)
		test(`${r.id}：${r.q}`, () => {
			expect(r.failures).toEqual([]);
		});
});

describe("不得編造", () => {
	const OFFICIAL_AMOUNTS = new Set([
		"193",
		"360",
		"110",
		"231",
		"116",
		"166",
		"146",
		"169",
	]);
	const queries = [
		...qa.map((i) => i.q),
		"6670 週日票價",
		"高鐵到九族文化村多少錢",
		"機場到埔里票價",
		"今天日月潭有幾班車",
		"請幫我預訂明天 9 點的座位",
		"帶兩個小孩要多少錢",
		"日月潭 25:00 有車嗎",
		"下一班車還有幾個座位",
	];
	test("回答中的金額只能來自官方數字", () => {
		for (const q of queries) {
			const text = answerText(answer(q, ctx));
			for (const m of text.matchAll(/(\d{2,4})\s*元/g))
				expect(OFFICIAL_AMOUNTS.has(m[1])).toBe(true);
		}
	});
	test("即時／座位類一律拒答，且不含班次表格", () => {
		for (const q of [
			"現在還有位子嗎",
			"下一班車還有幾個座位",
			"最後一班車有位子嗎",
			"目前車上擠不擠",
			"日月潭現在有車嗎誤點了嗎",
		]) {
			const a = answer(q, ctx);
			expect(a.kind).toBe("refusal");
			expect(a.table).toBeUndefined();
		}
	});
	test("每個 answer 都有來源與資料依據；班表答案帶表定提醒", () => {
		for (const q of queries) {
			const a = answer(q, ctx);
			if (a.kind === "answer") {
				expect(a.sources.length).toBeGreaterThan(0);
				expect(a.basis.length).toBeGreaterThan(0);
			}
			if (a.basis.includes("timetable") && a.table)
				expect(a.caution).toContain("不是即時資訊");
		}
	});
	test("表格中的每個時間都真的存在於官網時刻表", () => {
		const all = new Set(
			tt.tables.flatMap((t) =>
				t.trips.flatMap((x) => x.times.filter((v): v is string => !!v)),
			),
		);
		for (const q of [
			"高鐵臺中站 9 點後到日月潭",
			"週六埔里站去台中下午3點後",
			"日月潭的末班車",
			"高鐵臺中站早上七點後",
		]) {
			const a = answer(q, ctx);
			expect(a.table).toBeDefined();
			for (const row of a.table?.rows ?? [])
				for (const cell of row)
					if (/^\d{2}:\d{2}$/.test(cell)) expect(all.has(cell)).toBe(true);
		}
	});
});

describe("停靠問句補充", () => {
	test("九族與向山直接查表且不宣稱每班停靠", () => {
		for (const q of ["九族有停嗎", "向山會停嗎"]) {
			const result = answer(q, ctx);
			expect(result.trace).toStartWith("rule:stop-service");
			expect(result.lines.join("")).toContain("不能據此認定每一班都停靠");
			expect(result.basis).toContain("timetable");
		}
	});
});

describe("獨立審查回歸", () => {
	test("指定支線的班次和停靠不得套用全表", () => {
		for (const q of [
			"6670H 高鐵臺中站9點後到日月潭有哪些班次",
			"A線九族有停嗎",
			"6670A 九族停靠嗎",
		]) {
			const result = answer(q, ctx);
			expect(result.kind).toBe("refusal");
			expect(result.trace).toBe("rule:unsupported-subroute");
			expect(result.table).toBeUndefined();
		}
	});
	test("非法或午夜跨日條件必須澄清，不能移除時間", () => {
		for (const time of [
			"晚上12點後",
			"24:30",
			"25點後",
			"25:00",
			"晚上十二點後",
		]) {
			const result = answer(`高鐵臺中站到日月潭 ${time} 有車嗎`, ctx);
			expect(result.kind).toBe("clarify");
			expect(result.trace).toBe("rule:invalid-clock");
			expect(result.table).toBeUndefined();
		}
		expect(parseClock("凌晨12點後")?.hhmm).toBe("00:00");
		expect(parseClock("中午12點後")?.hhmm).toBe("12:00");
	});
});

test("fullwidth branch and complete numeric time tokens cannot bypass restrictions", () => {
	for (const q of [
		"Ｈ線高鐵到日月潭幾點發車？",
		"６６７０Ｈ 高鐵到日月潭幾點發車？",
	]) {
		expect(answer(q, ctx).trace).toBe("rule:unsupported-subroute");
	}
	for (const time of ["100點後", "123:00", "12:100"]) {
		expect(parseClock(time)).toBeNull();
		const result = answer(`高鐵到日月潭 ${time} 有哪些班次`, ctx);
		expect(result.trace).toBe("rule:invalid-clock");
		expect(result.table).toBeUndefined();
	}
});
