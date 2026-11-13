/**
 * 擷取台灣好行官網「日月潭線」靜態時刻表，輸出 public/data/lab/assistant/timetable.json。
 *
 *   bun scripts/lab/assistant/fetch-timetable.ts [--html <本機 html 檔>]
 *
 * 只讀公開網頁（不含任何乘客資料）。頁面 HTML 內有 4 張表：平日去程、平日回程、假日去程、假日回程。
 * 解析後逐班驗證：同一班次的站間時間必須單調不減，否則中止，不輸出檔案。
 * 時刻表會異動，輸出檔只代表「擷取當下官網的表定時刻」，不是即時資訊。
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const TIMETABLE_URL =
	"https://www.taiwantrip.com.tw/Frontend/Bustime/TimeTable/R0005";
const OUT = "public/data/lab/assistant/timetable.json";

export type Trip = {
	no: string;
	note: string;
	/** stop name -> "HH:MM"；null 表示該班不停靠（官網以 - 表示） */
	times: (string | null)[];
};
export type Table = {
	day: "weekday" | "holiday";
	direction: "outbound" | "inbound";
	stops: string[];
	trips: Trip[];
};

const decode = (s: string) =>
	s
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/\s+/g, " ")
		.trim();

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

export function parseTables(html: string): Table[] {
	const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => m[0]);
	if (tables.length !== 4)
		throw new Error(`預期 4 張時刻表，實得 ${tables.length}；頁面結構可能已改版`);
	const layout: Pick<Table, "day" | "direction">[] = [
		{ day: "weekday", direction: "outbound" },
		{ day: "weekday", direction: "inbound" },
		{ day: "holiday", direction: "outbound" },
		{ day: "holiday", direction: "inbound" },
	];
	return tables.map((tb, i) => {
		const rows = [...tb.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) =>
			[...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) =>
				decode(c[1]),
			),
		);
		const [head, ...body] = rows;
		if (head[0] !== "班次" || head[1] !== "備註")
			throw new Error(`表 ${i} 表頭非預期：${head.slice(0, 3)}`);
		const stops = head.slice(2);
		const trips: Trip[] = body
			.filter((r) => r.length > 2)
			.map((r) => {
				if (r.length !== head.length)
					throw new Error(`表 ${i} 班次 ${r[0]} 欄數 ${r.length} ≠ ${head.length}`);
				const times = r.slice(2).map((c) => {
					if (c === "-" || c === "") return null;
					if (!/^\d{2}:\d{2}$/.test(c))
						throw new Error(`表 ${i} 班次 ${r[0]} 非預期時間格式：${c}`);
					return c;
				});
				return { no: r[0], note: r[1], times };
			});
		return { ...layout[i], stops, trips };
	});
}

/** 驗證：每班的站間時間依欄位順序單調不減；至少停靠兩站。回傳違規訊息。 */
export function validate(tables: Table[]): string[] {
	const errs: string[] = [];
	for (const t of tables) {
		for (const trip of t.trips) {
			const served = trip.times
				.map((v, i) => (v ? { v, stop: t.stops[i] } : null))
				.filter((x): x is { v: string; stop: string } => x !== null);
			if (served.length < 2)
				errs.push(`${t.day}/${t.direction} 班次 ${trip.no} 停靠站少於 2`);
			for (let i = 1; i < served.length; i++)
				if (toMin(served[i].v) < toMin(served[i - 1].v))
					errs.push(
						`${t.day}/${t.direction} 班次 ${trip.no} 時間倒退：${served[i - 1].stop} ${served[i - 1].v} → ${served[i].stop} ${served[i].v}`,
					);
		}
	}
	return errs;
}

async function main() {
	const i = process.argv.indexOf("--html");
	const html =
		i > 0
			? readFileSync(process.argv[i + 1], "utf8")
			: await fetch(TIMETABLE_URL, {
					headers: { "user-agent": "Mozilla/5.0 (lab-assistant research)" },
				}).then((r) => {
					if (!r.ok) throw new Error(`HTTP ${r.status}`);
					return r.text();
				});
	const tables = parseTables(html);
	const errs = validate(tables);
	if (errs.length) {
		console.error(`驗證失敗（${errs.length}）：\n${errs.join("\n")}`);
		process.exit(1);
	}
	// 異動備註段落（原文），供問答引用
	const noteStart = html.indexOf("時刻表異動備註");
	const noteEnd = html.indexOf("平日時刻表", noteStart);
	const rawNotice =
		noteStart > 0 && noteEnd > noteStart
			? decode(html.slice(noteStart, noteEnd).replace(/<!--|-->/g, " "))
			: "";
	const star = rawNotice.indexOf("✱");
	const changeNotice =
		star >= 0
			? rawNotice.slice(star).replace(/ 路線抬頭.*$/, "").trim()
			: null;
	const out = {
		source: TIMETABLE_URL,
		retrievedAt: new Date().toISOString(),
		pageSha256: createHash("sha256").update(html).digest("hex"),
		pageUpdatedAt: null as string | null, // 頁面未標示更新日期
		changeNotice,
		dayRule: "官網備註：平日班次為周一~周四；假日班次為周五~周日",
		tables,
	};
	mkdirSync("public/data/lab/assistant", { recursive: true });
	writeFileSync(OUT, `${JSON.stringify(out)}\n`);
	for (const t of tables)
		console.log(
			`${t.day}/${t.direction}: ${t.trips.length} 班, ${t.stops.length} 站`,
		);
	console.log(`驗證通過（站間時間單調）。已寫入 ${OUT}`);
}

if (import.meta.main) await main();
