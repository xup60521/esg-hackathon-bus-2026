/**
 * Build the /lab?view=seats data from the `trips` table (read-only).
 *
 *   bun scripts/lab/seats/build.ts            # uses DATABASE_URL / DATABASE_TOKEN
 *   bun scripts/lab/seats/build.ts file:/path/to/trips.db
 *
 * Output (public/data/lab/seats/) holds counts only: no card, vehicle or per-passenger fields.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import {
	type Arrival,
	arrivalsForVehicleDay,
	type Trip,
} from "../../../src/features/lab/seats/model";

const OUT = "public/data/lab/seats";
const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) throw new Error("pass a libsql URL or set DATABASE_URL");
const db = createClient({
	url,
	authToken: url.startsWith("file:") ? undefined : process.env.DATABASE_TOKEN,
});

const stops: { name: string; order: number }[] = JSON.parse(
	await readFile("public/geo/stops.json", "utf8"),
);
const stopOrder = new Map(stops.map((s) => [s.name, s.order]));
const calendar: { days: Record<string, { rest: boolean }> } = JSON.parse(
	await readFile("public/data/lab/visualization/calendar.json", "utf8"),
);

/** Main OD pairs offered as reservation corridors. */
const CORRIDORS: [string, string][] = [
	["埔里站", "高鐵臺中站"],
	["高鐵臺中站", "埔里站"],
	["日月潭", "高鐵臺中站"],
	["高鐵臺中站", "日月潭"],
	["埔里站", "臺中"],
	["臺中", "埔里站"],
	["日月潭", "臺中"],
	["臺中", "日月潭"],
];
const BIN = 15;
const corridorIndex = new Map(CORRIDORS.map(([a, b], i) => [`${a}>${b}`, i]));
const minuteOfDay = (ts: number) => Math.floor(((ts + 8 * 3600) % 86400) / 60);
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

const stopNames = stops.map((s) => s.name);
const subroutes: string[] = [];
const subrouteIdx = (s: string) => {
	let i = subroutes.indexOf(s);
	if (i < 0) i = subroutes.push(s) - 1;
	return i;
};
const DIR = { outbound: 0, inbound: 1, unknown: 2 } as const;

const days: { date: string; rest: boolean; weekday: number }[] = [];
const demandRows: number[][] = [];
/** loadHist[stop][rest?1:0][load] = arrivals */
const loadHist = stopNames.map(() => [[] as number[], [] as number[]]);
let tripCount = 0;
let arrivalCount = 0;

async function query(start: string, end: string) {
	for (let attempt = 1; ; attempt++) {
		try {
			return await db.execute({
				sql: `SELECT vehicle, board_date, board_ts, alight_ts, board_stop, alight_stop, subroute
				      FROM trips WHERE board_date >= ? AND board_date < ? AND alight_ts IS NOT NULL`,
				args: [start, end],
			});
		} catch (error) {
			if (attempt >= 4) throw error;
			console.warn(`${start}: retry ${attempt}`);
		}
	}
}

await mkdir(OUT, { recursive: true });
for (let i = 0; i < 24; i++) {
	const y = 2024 + Math.floor(i / 12);
	const m = (i % 12) + 1;
	const start = `${y}-${String(m).padStart(2, "0")}-01`;
	const end =
		m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
	const result = await query(start, end);

	const groups = new Map<string, Trip[]>();
	const demand = new Map<string, number>();
	for (const r of result.rows) {
		const t: Trip = {
			vehicle: String(r.vehicle),
			date: String(r.board_date),
			board: Number(r.board_ts),
			alight: Number(r.alight_ts),
			boardStop: String(r.board_stop),
			alightStop: String(r.alight_stop),
			subroute: String(r.subroute),
		};
		tripCount++;
		const key = `${t.vehicle}|${t.date}`;
		const list = groups.get(key);
		if (list) list.push(t);
		else groups.set(key, [t]);

		const c = corridorIndex.get(`${t.boardStop}>${t.alightStop}`);
		if (c !== undefined) {
			const bin = Math.floor(minuteOfDay(t.board) / BIN) * BIN;
			const k = `${t.date}|${c}|${bin}`;
			demand.set(k, (demand.get(k) ?? 0) + 1);
		}
	}

	const arrivals: Arrival[] = [];
	for (const list of groups.values())
		arrivals.push(...arrivalsForVehicleDay(list, stopOrder));
	arrivals.sort((a, b) => a.time - b.time);
	arrivalCount += arrivals.length;

	const rows = arrivals.map((a) => {
		const s = stopNames.indexOf(a.stop);
		const hist = loadHist[s][calendar.days[a.date].rest ? 1 : 0];
		hist[a.load] = (hist[a.load] ?? 0) + 1;
		return [
			Number(a.date.slice(8)),
			s,
			minuteOfDay(a.time),
			subrouteIdx(a.subroute),
			DIR[a.direction],
			a.load,
			a.boarded,
		];
	});
	const month = start.slice(0, 7);
	await writeFile(
		`${OUT}/arrivals-${month}.json`,
		JSON.stringify({
			month,
			columns: ["day", "stop", "minute", "subroute", "direction", "load", "boarded"],
			rows,
		}),
	);

	const monthDays = [...new Set(result.rows.map((r) => String(r.board_date)))].sort();
	for (const date of monthDays) {
		const di = days.push({
			date,
			rest: calendar.days[date].rest,
			weekday: weekday(date),
		}) - 1;
		for (let c = 0; c < CORRIDORS.length; c++)
			for (let bin = 0; bin < 1440; bin += BIN) {
				const n = demand.get(`${date}|${c}|${bin}`);
				if (n) demandRows.push([di, c, bin, n]);
			}
	}
	console.log(month, result.rows.length, "trips", arrivals.length, "arrivals");
}
db.close();

const generatedAt = new Date().toISOString();
await writeFile(
	`${OUT}/demand.json`,
	JSON.stringify({
		generatedAt,
		binMinutes: BIN,
		corridors: CORRIDORS.map(([from, to]) => ({ from, to })),
		days,
		columns: ["dayIndex", "corridor", "binStartMinute", "riders"],
		rows: demandRows,
	}),
);
await writeFile(
	`${OUT}/summary.json`,
	`${JSON.stringify(
		{
			generatedAt,
			dataThrough: days.at(-1)?.date,
			trips: tripCount,
			arrivals: arrivalCount,
			stops: stopNames,
			subroutes,
			directions: ["outbound", "inbound", "unknown"],
			months: [...new Set(days.map((d) => d.date.slice(0, 7)))],
			dates: days.map((d) => d.date),
			loadHistogram: Object.fromEntries(
				stopNames.map((s, i) => [
					s,
					{
						work: Array.from(loadHist[i][0], (x) => x ?? 0),
						rest: Array.from(loadHist[i][1], (x) => x ?? 0),
					},
				]),
			),
		},
		null,
		1,
	)}\n`,
);
console.log("trips", tripCount, "arrivals", arrivalCount);
