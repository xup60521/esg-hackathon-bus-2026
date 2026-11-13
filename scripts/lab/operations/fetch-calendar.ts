/**
 * Fetch the government office calendar (行政院人事行政總處 辦公日曆表, hosted on 新北市政府
 * 資料開放平台) and keep only 2024–2025 dates that differ from the plain weekend rule or carry a name.
 *
 *   bun scripts/lab/operations/fetch-calendar.ts
 *
 * Public, no secrets, no passenger data leaves the machine.
 */
import { mkdirSync, writeFileSync } from "node:fs";

const URL_BASE =
	"https://data.ntpc.gov.tw/api/datasets/308dcd75-6434-45bc-a95f-584da4fed251/json";
type Rec = { date: string; isholiday: string; name: string | null; holidaycategory: string | null };

const all: Rec[] = [];
for (let page = 0; page < 10; page++) {
	const res = await fetch(`${URL_BASE}?size=1000&page=${page}`);
	if (!res.ok) throw new Error(`calendar HTTP ${res.status}`);
	const rows = (await res.json()) as Rec[];
	if (rows.length === 0) break;
	all.push(...rows);
}

const out: Record<string, { holiday: boolean; name: string | null }> = {};
for (const r of all) {
	const date = `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}`;
	if (date < "2024-01-01" || date > "2025-12-31") continue;
	const w = new Date(`${date}T00:00:00Z`).getUTCDay();
	const weekend = w === 0 || w === 6;
	const holiday = r.isholiday === "是";
	if (holiday !== weekend || r.name) out[date] = { holiday, name: r.name };
}

const dir = "public/data/lab/operations";
mkdirSync(dir, { recursive: true });
writeFileSync(
	`${dir}/calendar.json`,
	`${JSON.stringify(
		{
			source: "中華民國政府行政機關辦公日曆表（新北市政府資料開放平台 dataset 308dcd75-6434-45bc-a95f-584da4fed251）",
			url: URL_BASE,
			fetchedAt: new Date().toISOString(),
			totalRecords: all.length,
			days: out,
		},
		null,
		1,
	)}\n`,
);
console.log(`records=${all.length} kept=${Object.keys(out).length}`);
