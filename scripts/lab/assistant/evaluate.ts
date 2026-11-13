/**
 * 執行問答驗證集（docs/lab/assistant/qa-set.json）並輸出 docs/lab/assistant/eval-results.json。
 *   bun scripts/lab/assistant/evaluate.ts
 * 題庫由實作者自撰，這是回歸測試，不是獨立準確率評測。有失敗時 exit 1。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { answer } from "../../../src/features/lab/assistant/engine";
import { type QaItem, runQa } from "../../../src/features/lab/assistant/qa";
import type { HistoryData, TimetableData } from "../../../src/features/lab/assistant/types";

const R = "public/data/lab/assistant/";
const ctx = {
	timetable: JSON.parse(readFileSync(`${R}timetable.json`, "utf8")) as TimetableData,
	history: JSON.parse(readFileSync(`${R}history.json`, "utf8")) as HistoryData,
};
const items = (JSON.parse(readFileSync("docs/lab/assistant/qa-set.json", "utf8")) as { items: QaItem[] }).items;
const results = runQa(items, ctx);
const byKind: Record<string, { n: number; pass: number }> = {};
for (const [i, r] of results.entries()) {
	const k = items[i].expect.kind;
	byKind[k] ??= { n: 0, pass: 0 };
	byKind[k].n++;
	if (r.pass) byKind[k].pass++;
}
const failed = results.filter((r) => !r.pass);
const out = {
	ranAt: new Date().toISOString(),
	timetableRetrievedAt: ctx.timetable.retrievedAt,
	total: results.length,
	passed: results.length - failed.length,
	byExpectedKind: byKind,
	note: "作者自撰題庫的回歸結果；非獨立評測。",
	failures: failed,
	results: results.map((r) => ({ id: r.id, q: r.q, kind: r.kind, trace: r.trace, pass: r.pass })),
};
writeFileSync("docs/lab/assistant/eval-results.json", `${JSON.stringify(out, null, 2)}\n`);
console.log(`通過 ${out.passed}/${out.total}`, byKind);
for (const f of failed) console.log("FAIL", f.id, f.q, f.failures);
// 抽樣：拒答類別是否皆未附班次表格
const refusals = items.filter((i) => i.expect.kind === "refusal");
const withTable = refusals.filter((i) => answer(i.q, ctx).table);
console.log(`拒答題 ${refusals.length}，其中附表格 ${withTable.length}`);
process.exit(failed.length ? 1 : 0);
