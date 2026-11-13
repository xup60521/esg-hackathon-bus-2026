import { useEffect, useState } from "react";

export const BASE = "/data/lab/seats";
export const CONTROL =
	"w-full rounded-lg border border-[var(--line)] bg-[var(--chip)] px-2.5 py-1.5 text-sm text-[var(--fg)]";

export type Summary = {
	generatedAt: string;
	dataThrough: string;
	trips: number;
	arrivals: number;
	stops: string[];
	subroutes: string[];
	directions: string[];
	months: string[];
	dates: string[];
	loadHistogram: Record<string, { work: number[]; rest: number[] }>;
};

/** [day, stopIndex, minuteOfDay, subrouteIndex, direction(0 out,1 in,2 unknown), load, boarded] */
export type ArrivalRow = [
	number,
	number,
	number,
	number,
	number,
	number,
	number,
];
export type MonthFile = { month: string; rows: ArrivalRow[] };

export type DemandFile = {
	generatedAt: string;
	binMinutes: number;
	corridors: { from: string; to: string }[];
	days: { date: string; rest: boolean; weekday: number }[];
	/** [dayIndex, corridor, binStartMinute, riders] */
	rows: [number, number, number, number][];
};

export type Loaded<T> =
	| { state: "loading" }
	| { state: "error"; message: string }
	| { state: "ready"; data: T };

export function useJson<T>(url: string | null): Loaded<T> {
	const [value, setValue] = useState<Loaded<T>>({ state: "loading" });
	useEffect(() => {
		if (!url) return;
		const ctrl = new AbortController();
		setValue({ state: "loading" });
		fetch(url, { signal: ctrl.signal })
			.then((r) => {
				if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
				return r.json() as Promise<T>;
			})
			.then(
				(data) => setValue({ state: "ready", data }),
				(e: Error) => {
					if (!ctrl.signal.aborted)
						setValue({ state: "error", message: e.message });
				},
			);
		return () => ctrl.abort();
	}, [url]);
	return value;
}

export const hhmm = (m: number) =>
	`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export const DIRECTION_LABEL = ["往日月潭", "往臺中", "方向不明"];

export function Status({ loaded }: { loaded: Loaded<unknown> }) {
	if (loaded.state === "loading")
		return <p className="text-xs text-[var(--muted)]">載入中…</p>;
	if (loaded.state === "error")
		return (
			<p role="alert" className="text-xs text-[var(--sev-review)]">
				資料讀取失敗：{loaded.message}
			</p>
		);
	return null;
}
