/** Print aggregate findings (no rows) using the same logic as /analysis: bun scripts/analysis/summarize-midstop.ts */
import { readFile } from "node:fs/promises";
import {
	analyze,
	defaultRoles,
	type MidstopData,
	type Params,
	quality,
} from "../../src/lib/midstop";

const data: MidstopData = JSON.parse(
	await readFile("public/data/midstop.json", "utf8"),
);
const dates = data.rows.map((r) => r[0]).sort();
const subroutes = ["6670A", "6670B", "6670D", "6670E", "6670F"];
console.log(JSON.stringify(quality(data.rows, subroutes)));

const pct = (v: number | null) =>
	v === null ? "–" : `${Math.round(v * 100)}%`;
for (const direction of ["outbound", "inbound"] as const)
	for (const reference of ["board", "alight"] as const)
		for (const lag of [-2, -1, 0, 1, 2]) {
			const p: Params = {
				subroutes,
				direction,
				from: dates[0],
				to: dates[dates.length - 1],
				roles: defaultRoles(data.stops),
				reference,
				lag,
			};
			const a = analyze(data.rows, p);
			console.log(
				[
					direction,
					reference,
					`lag=${lag}`,
					`high=${pct(a.high.ratio)}(n=${a.high.slots})`,
					`other=${pct(a.other.ratio)}(n=${a.other.slots})`,
					`r=${a.correlation.r?.toFixed(3) ?? "–"}(n=${a.correlation.n})`,
					`bins=${a.bins.map((b) => `${b.label}:${pct(b.ratio)}/${b.slots}`).join(" ")}`,
					`candidates=${a.candidates.length}`,
					a.verdict,
				].join("  "),
			);
		}
