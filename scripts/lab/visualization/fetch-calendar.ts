/**
 * Download the official 政府行政機關辦公日曆表 (DGPA, data.gov.tw dataset 14718) for 2024–2025
 * and write public/data/lab/visualization/calendar.json.
 *
 * Run: bun scripts/lab/visualization/fetch-calendar.ts
 * 是否放假: 0 = 上班, 2 = 放假 (weekends, national holidays, make-up days off). A Saturday with 0 is a
 * make-up working day. This is a *government office* calendar, only an approximation of travel demand days.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const OUT = "public/data/lab/visualization/calendar.json";
const BASE = "https://www.dgpa.gov.tw/FileConversion";
// resourceDownloadUrl values from https://data.gov.tw/api/v2/rest/dataset/14718
const RESOURCES: { year: number; label: string; url: string; encoding: string }[] = [
	{
		year: 2024,
		label: "113年中華民國政府行政機關辦公日曆表",
		url: `${BASE}?filename=dgpa/files/202407/777152e9-fdd1-4a61-876c-2733e7692538.csv&nfix=&name=113%e5%b9%b4%e4%b8%ad%e8%8f%af%e6%b0%91%e5%9c%8b%e6%94%bf%e5%ba%9c%e8%a1%8c%e6%94%bf%e6%a9%9f%e9%97%9c%e8%be%a6%e5%85%ac%e6%97%a5%e6%9b%86%e8%a1%a8.csv`,
		encoding: "utf-8",
	},
	{
		year: 2025,
		label: "114年中華民國政府行政機關辦公日曆表(1141020更新)",
		url: `${BASE}?filename=dgpa/files/202510/b84cb88a-803c-4621-a843-d637b2775615.csv&nfix=&name=114%e5%b9%b4%e4%b8%ad%e8%8f%af%e6%b0%91%e5%9c%8b%e6%94%bf%e5%ba%9c%e8%a1%8c%e6%94%bf%e6%a9%9f%e9%97%9c%e8%be%a6%e5%85%ac%e6%97%a5%e6%9b%86%e8%a1%a8(1141020%e6%9b%b4%e6%96%b0).csv`,
		encoding: "big5",
	},
];

type Day = { rest: boolean; note?: string };
const days: Record<string, Day> = {};
const sources: Record<string, unknown>[] = [];

for (const r of RESOURCES) {
	const res = await fetch(r.url);
	if (!res.ok) throw new Error(`${r.label}: HTTP ${res.status}`);
	const buf = new Uint8Array(await res.arrayBuffer());
	const text = new TextDecoder(r.encoding).decode(buf).replace(/^﻿/, "");
	let n = 0;
	for (const line of text.split(/\r?\n/).slice(1)) {
		const [d, , flag, note] = line.split(",");
		if (!d || !/^\d{8}$/.test(d)) continue;
		const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
		days[iso] = { rest: flag === "2", ...(note ? { note } : {}) };
		n++;
	}
	sources.push({
		year: r.year,
		label: r.label,
		days: n,
		sha256: createHash("sha256").update(buf).digest("hex"),
		url: r.url,
	});
}

const out = {
	retrievedAt: new Date().toISOString(),
	dataset: "https://data.gov.tw/dataset/14718",
	provider: "行政院人事行政總處",
	field: "rest=true 即 是否放假=2（週休、國定假日、補假）；rest=false 為上班日，含補行上班日",
	sources,
	days,
};
await mkdir("public/data/lab/visualization", { recursive: true });
await writeFile(OUT, `${JSON.stringify(out)}\n`);
console.log(`wrote ${OUT}: ${Object.keys(days).length} days`, sources.map((s) => `${s.year}:${s.days}`).join(" "));
