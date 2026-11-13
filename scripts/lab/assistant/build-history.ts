/**
 * 由既有彙總 public/data/midstop.json（唯讀）產生問答用的歷史搭乘彙總：
 * public/data/lab/assistant/history.json
 *
 *   bun scripts/lab/assistant/build-history.ts
 *
 * 維度：站點 × 方向 × 星期 × 小時，值為該星期在資料期間內「每個有紀錄日」的平均上車刷卡次數。
 * 這是歷史成功刷卡量，不含候車、未上車、座位或即時資訊；方向未知的列不納入並單獨計數。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

type Row = [string, string, string, string, number, number, number];
const SRC = "public/data/midstop.json";
const OUT = "public/data/lab/assistant/history.json";

const src = JSON.parse(readFileSync(SRC, "utf8")) as {
	generatedAt: string;
	rows: Row[];
};

const weekdayOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay(); // 0=日
const dates = new Set<string>();
const daysPerWeekday = Array(7).fill(0) as number[];
/** key = stop|direction|weekday|hour -> boardings sum */
const sums = new Map<string, number>();
let totalBoard = 0;
let unknownBoard = 0;
let used = 0;
for (const [date, , dir, stop, hour, board] of src.rows) {
	if (!dates.has(date)) {
		dates.add(date);
		daysPerWeekday[weekdayOf(date)]++;
	}
	totalBoard += board;
	if (dir !== "outbound" && dir !== "inbound") {
		unknownBoard += board;
		continue;
	}
	used += board;
	const k = `${stop}|${dir}|${weekdayOf(date)}|${hour}`;
	sums.set(k, (sums.get(k) ?? 0) + board);
}

const sorted = [...dates].sort();
const cells: [string, string, number, number, number][] = [];
let cellSum = 0;
for (const [k, v] of sums) {
	const [stop, dir, wd, hour] = k.split("|");
	cells.push([stop, dir, Number(wd), Number(hour), v]);
	cellSum += v;
}
cells.sort(
	(a, b) =>
		a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2] - b[2] || a[3] - b[3],
);
if (cellSum !== used) throw new Error(`彙總不守恆：${cellSum} ≠ ${used}`);

const out = {
	sourceFile: SRC,
	sourceGeneratedAt: src.generatedAt,
	range: [sorted[0], sorted[sorted.length - 1]],
	observedDays: sorted.length,
	/** 日曆天數 − 有紀錄天數 = 缺資料日（不代表停駛或零搭乘） */
	calendarDays:
		(Date.parse(`${sorted[sorted.length - 1]}T00:00:00Z`) -
			Date.parse(`${sorted[0]}T00:00:00Z`)) /
			86400000 +
		1,
	daysPerWeekday,
	totalBoardings: totalBoard,
	unknownDirectionBoardings: unknownBoard,
	columns: ["stop", "direction", "weekday(0=日)", "hour", "boardingsSum"],
	cells,
};
mkdirSync("public/data/lab/assistant", { recursive: true });
writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(
	`範圍 ${out.range.join(" ~ ")}；有紀錄 ${out.observedDays}/${out.calendarDays} 天`,
);
console.log(
	`上車刷卡合計 ${totalBoard}（方向未知 ${unknownBoard} 不納入；納入 ${used}）；cells=${cells.length}`,
);
console.log(`各星期有紀錄天數(日..六)：${daysPerWeekday.join(",")}`);
