/**
 * Build the /lab/visualization datasets from the local, already-exported card-tap buckets.
 *
 *   bun scripts/lab/visualization/build.ts
 *
 * Reads : public/data/midstop.json, data/midstop-months/*.json (cross-check only),
 *         public/data/lab/visualization/calendar.json (run fetch-calendar.ts first)
 * Writes: public/data/lab/visualization/cube.json      compact columnar copy used by the page
 *         public/data/lab/visualization/findings.json  numbers quoted in docs/lab/visualization/report.zh-TW.md
 * Exits non-zero when any validation fails. No personal identifiers are read or written.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import {
	analyze,
	type Analysis,
	type CalendarFile,
	type Cube,
	decodeCube,
	encodeCube,
	type Filter,
	fullFilter,
	peakHour,
	restWorkRatio,
	type SourceData,
	type SourceRow,
	top3HourShare,
} from "../../../src/features/lab/visualization/model";

const OUT = "public/data/lab/visualization";
const checks: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
	checks.push({ name, ok, detail });
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const src = JSON.parse(await readFile("public/data/midstop.json", "utf8")) as SourceData;
const cal = JSON.parse(await readFile(`${OUT}/calendar.json`, "utf8")) as CalendarFile;
const cube = encodeCube(src, "public/data/midstop.json");
await writeFile(`${OUT}/cube.json`, JSON.stringify(cube));
const t = decodeCube(JSON.parse(JSON.stringify(cube)) as Cube);

// ── validation ─────────────────────────────────────────────────────────────────
const srcB = src.rows.reduce((s, r) => s + r[5], 0);
const srcA = src.rows.reduce((s, r) => s + r[6], 0);
check("cube row count equals source", cube.meta.rowCount === src.rows.length, `${cube.meta.rowCount}`);
check("cube boardings/alightings equal source", cube.meta.totalBoardings === srcB && cube.meta.totalAlightings === srcA, `${srcB} / ${srcA}`);
check("source boardings equal alightings (every trip has both taps)", srcB === srcA, `${srcB} vs ${srcA}`);

// round trip: decode every cube row back to source tuples
const names = cube.stops.map((s) => s.name);
const dirs = ["outbound", "inbound", "unknown"];
const back = new Map<string, string>();
for (let di = 0; di < cube.dates.length; di++) {
	for (let i = cube.dateOffsets[di]; i < cube.dateOffsets[di + 1]; i++) {
		back.set([cube.dates[di], cube.subs[t.sub[i]], dirs[t.dir[i]], names[t.stop[i]], t.hour[i]].join("|"), `${t.b[i]}/${t.a[i]}`);
	}
}
let mismatches = 0;
const seen = new Set<string>();
for (const r of src.rows as SourceRow[]) {
	const k = r.slice(0, 5).join("|");
	if (seen.has(k)) mismatches++; // duplicate bucket would be silently merged away
	seen.add(k);
	if (back.get(k) !== `${r[5]}/${r[6]}`) mismatches++;
}
check("round trip: every source bucket recovered exactly, no duplicate keys", mismatches === 0 && back.size === src.rows.length, `${mismatches} mismatches`);

// the unfiltered aggregation must return the same totals as the source
const full = analyze(t, cal, fullFilter(t));
check("analyze(all filters open) totals equal source", full.totalB === srcB && full.totalA === srcA, `${full.totalB} / ${full.totalA}`);
check("sum of per-stop totals equals total", full.stopTotals.reduce((s, x) => s + x.b, 0) === srcB);
check("hour profile sums to total", full.hours.all.b.reduce((s, v) => s + v, 0) === srcB && full.weekdayHour.b.flat().reduce((s, v) => s + v, 0) === srcB);
check("monthly rows sum to total", full.months.reduce((s, m) => s + m.b, 0) === srcB);

// partitions: sub-routes and directions must add up
const f = (patch: Partial<Filter>): Analysis => analyze(t, cal, { ...fullFilter(t), ...patch });
const bySub = cube.subs.map((s, i) => ({ s, a: f({ subs: [i] }) }));
check("sub-route partition adds up", bySub.reduce((s, x) => s + x.a.totalB, 0) === srcB);
const out = f({ direction: "outbound" });
const inn = f({ direction: "inbound" });
check("direction partition: outbound + inbound + dropped unknown = total", out.totalB + inn.totalB + out.unknownDropped.b === srcB, `${out.totalB}+${inn.totalB}+${out.unknownDropped.b}`);
check("day-type partition adds up", f({ dayType: "work" }).totalB + f({ dayType: "rest" }).totalB === srcB);

// independent cross-check against the monthly cache that the exporter wrote
try {
	const files = (await readdir("data/midstop-months")).filter((x) => x.endsWith(".json")).sort();
	let mb = 0;
	let ma = 0;
	for (const file of files) {
		const rows = JSON.parse(await readFile(`data/midstop-months/${file}`, "utf8")) as SourceRow[];
		for (const r of rows) {
			mb += r[5];
			ma += r[6];
		}
	}
	check("monthly cache totals equal published JSON", mb === srcB && ma === srcA, `${files.length} files, ${mb} / ${ma}`);
} catch {
	check("monthly cache cross-check", false, "data/midstop-months not readable");
}

// calendar coverage
const missingCal = cube.dates.filter((d) => !cal.days[d]);
check("official calendar covers every date with records", missingCal.length === 0, missingCal.join(","));

// ── findings ───────────────────────────────────────────────────────────────────
const round = (v: number | null, n = 3) => (v === null ? null : Math.round(v * 10 ** n) / 10 ** n);
const summarize = (a: Analysis) => ({
	boardings: a.totalB,
	alightings: a.totalA,
	activeDays: a.activeDays,
	avgBoardingsPerActiveDay: round(a.activeDays ? a.totalB / a.activeDays : null, 1),
	restOverWorkRatioBoardings: round(restWorkRatio(a, "b")),
	peakBoardingHour: peakHour(a, "b") && { hour: peakHour(a, "b")?.hour, share: round(peakHour(a, "b")?.share ?? null) },
	top3HourShareBoardings: round(top3HourShare(a, "b")),
	workDays: a.hours.work.days,
	restDays: a.hours.rest.days,
});
const stopRows = (a: Analysis) =>
	cube.stops.map((s, i) => ({ stop: s.name, order: s.order, boardings: a.stopTotals[i].b, alightings: a.stopTotals[i].a }));

const hourOfDayTop = (a: Analysis, key: "work" | "rest") =>
	a.hours[key].b
		.map((v, h) => ({ hour: h, avg: round(a.hours[key].days ? v / a.hours[key].days : null, 1) }))
		.sort((x, y) => (y.avg ?? 0) - (x.avg ?? 0))
		.slice(0, 3);

const days = full.days;
const activeDays = days.filter((d) => d.status === "active");
const sorted = [...activeDays].sort((a, b) => b.b - a.b);
const findings = {
	generatedFrom: { file: "public/data/midstop.json", exporterGeneratedAt: src.generatedAt, calendarRetrievedAt: cal.retrievedAt },
	dataset: {
		rows: src.rows.length,
		boardings: srcB,
		alightings: srcA,
		firstDate: cube.dates[0],
		lastDate: cube.dates[cube.dates.length - 1],
		datesWithRecords: cube.dates.length,
		calendarDays: days.length,
		missingDates: full.missingDays,
		unknownDirection: { boardings: out.unknownDropped.b, alightings: out.unknownDropped.a },
		hourBuckets: Object.fromEntries(full.hours.all.b.map((v, h) => [h, v]).filter(([, v]) => (v as number) > 0)),
	},
	overall: summarize(full),
	byDirection: { outbound: summarize(out), inbound: summarize(inn) },
	bySubroute: Object.fromEntries(bySub.map((x) => [x.s, summarize(x.a)])),
	topWorkHours: hourOfDayTop(full, "work"),
	topRestHours: hourOfDayTop(full, "rest"),
	stops: stopRows(full),
	stopsByDirection: { outbound: stopRows(out), inbound: stopRows(inn) },
	months: full.months,
	busiestDays: sorted.slice(0, 10).map((d) => ({ date: d.date, boardings: d.b, note: cal.days[d.date]?.note ?? null, rest: d.rest })),
	quietestActiveDays: [...activeDays].sort((a, b) => a.b - b.b).slice(0, 10).map((d) => ({ date: d.date, boardings: d.b, rest: d.rest })),
	validation: checks,
};
await writeFile(`${OUT}/findings.json`, `${JSON.stringify(findings, null, 1)}\n`);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed; wrote ${OUT}/cube.json and findings.json`);
if (failed.length) process.exit(1);
