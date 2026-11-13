/**
 * Build the compact replay + backtest files for the operations prototype.
 *
 *   bun scripts/lab/operations/fetch-calendar.ts      # once (network)
 *   bun scripts/lab/operations/build-replay.ts        # reads public/data/midstop.json
 *
 * Output: public/data/lab/operations/{replay.json,backtest.json}. Aggregates only — no card
 * numbers, driver IDs or plate numbers exist in the input.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
	backtest,
	buildDays,
	type Calendar,
	DIRS,
	decisionsAt,
	highlights,
	middleStopNames,
	packDays,
	RULES,
} from "../../../src/features/lab/operations/replay";
import type { MidstopData } from "../../../src/lib/midstop";

const OUT = "public/data/lab/operations";
const src = JSON.parse(readFileSync("public/data/midstop.json", "utf8")) as MidstopData;
const calFile = JSON.parse(readFileSync(`${OUT}/calendar.json`, "utf8")) as {
	source: string;
	fetchedAt: string;
	days: Calendar;
};
const cal = calFile.days;

const days = buildDays(src.rows, middleStopNames(src.stops));

// --- integrity: every card boarding lands in exactly one bucket -------------------------
let rowBoard = 0;
let rowAlight = 0;
for (const r of src.rows) {
	rowBoard += r[5];
	rowAlight += r[6];
}
let known = 0;
let unknown = 0;
let alightKnown = 0;
for (const d of days.values()) {
	unknown += d.unknown;
	for (const dir of DIRS) {
		known += d[dir].b.reduce((x, y) => x + y, 0);
		alightKnown += d[dir].a.reduce((x, y) => x + y, 0);
	}
}
if (known + unknown !== rowBoard) throw new Error("boardings do not reconcile");
if (alightKnown > rowAlight) throw new Error("alightings exceed source");

const dates = [...days.keys()].sort();
const first = dates[0];
const last = dates[dates.length - 1];
const missing: string[] = [];
for (let t = Date.parse(`${first}T00:00:00Z`); t <= Date.parse(`${last}T00:00:00Z`); t += 86_400_000) {
	const d = new Date(t).toISOString().slice(0, 10);
	if (!days.has(d)) missing.push(d);
}

// --- backtest + sensitivity -------------------------------------------------------------
const bt = backtest(days, cal);
const sensitivity = [1.3, 1.5, 2].map((surgeRatio) => {
	let cells = 0;
	let surge = 0;
	let sustained = 0;
	for (const date of dates) {
		for (let clock = 6; clock <= 24; clock++) {
			for (const a of decisionsAt(days, cal, date, clock, 0, { surgeRatio })) {
				if (a.kind === "surge") surge++;
				if (a.kind === "sustained-surge") sustained++;
			}
			cells++;
		}
	}
	return { surgeRatio, replayedHours: cells, surgeAlerts: surge, sustainedAlerts: sustained };
});
const kindCounts: Record<string, number> = {};
for (const date of dates)
	for (let clock = 6; clock <= 24; clock++)
		for (const a of decisionsAt(days, cal, date, clock, 0))
			kindCounts[a.kind] = (kindCounts[a.kind] ?? 0) + 1;

const hl = highlights(days, cal);

writeFileSync(
	`${OUT}/replay.json`,
	`${JSON.stringify({
		generatedAt: new Date().toISOString(),
		source: {
			file: "public/data/midstop.json",
			generatedAt: src.generatedAt,
			rows: src.rows.length,
			boardings: rowBoard,
			alightings: rowAlight,
		},
		dataThrough: last,
		firstDate: first,
		missingDates: missing,
		unknownDirectionBoardings: unknown,
		layout: "days[date] = [out.b, out.a, out.m, in.b, in.a, in.m, unknownBoardings]; arrays are hours 0–23",
		days: packDays(days),
	})}\n`,
);
writeFileSync(
	`${OUT}/backtest.json`,
	`${JSON.stringify(
		{
			generatedAt: new Date().toISOString(),
			rules: RULES,
			range: { first, last, dates: dates.length, missingDates: missing },
			calendar: { source: calFile.source, fetchedAt: calFile.fetchedAt, entries: Object.keys(cal).length },
			backtest: bt,
			alertSensitivity: sensitivity,
			alertCountsDefaultRules: kindCounts,
			highlights: hl,
		},
		null,
		1,
	)}\n`,
);
console.log(
	`dates=${dates.length} missing=${missing.length} boardings=${rowBoard} unknownDir=${unknown} evalDirDays=${bt.evaluatedDirDays}`,
);
console.log(JSON.stringify(bt.methods, null, 1));
console.log(JSON.stringify(sensitivity), JSON.stringify(kindCounts));
