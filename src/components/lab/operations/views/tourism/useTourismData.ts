import { useEffect, useState } from "react";
import type {
	Attraction,
	ScenarioExample,
	TimetableData,
} from "#/features/lab/tourism";
import {
	DATA_URLS,
	isAttractionsFile,
	isScenarios,
	isTimetable,
	type Loaded,
	loadJson,
} from "./model";

export type Part<T> =
	| { state: "loading" }
	| { state: "error"; message: string }
	| { state: "ready"; data: T };

const LOADING = { state: "loading" } as const;

function toPart<T>(r: Loaded<T>): Part<T> {
	return r.ok
		? { state: "ready", data: r.data }
		: { state: "error", message: r.message };
}

/**
 * Timetable and attractions are required; the stored sample scenarios are optional, so a failed
 * scenarios file only removes the shortcuts and never blocks the calculator.
 */
export function useTourismData(): {
	timetable: Part<TimetableData>;
	attractions: Part<Attraction[]>;
	scenarios: Part<ScenarioExample[]>;
	reload: () => void;
} {
	const [attempt, setAttempt] = useState(0);
	const [timetable, setTimetable] = useState<Part<TimetableData>>(LOADING);
	const [attractions, setAttractions] = useState<Part<Attraction[]>>(LOADING);
	const [scenarios, setScenarios] = useState<Part<ScenarioExample[]>>(LOADING);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the loads on retry
	useEffect(() => {
		const ctrl = new AbortController();
		setTimetable(LOADING);
		setAttractions(LOADING);
		setScenarios(LOADING);
		const run = <T>(
			url: string,
			guard: (v: unknown) => v is T,
			set: (p: Part<T>) => void,
		) =>
			loadJson(url, guard, fetch, ctrl.signal).then((r) => {
				if (!ctrl.signal.aborted) set(toPart(r));
			});
		void run(DATA_URLS.timetable, isTimetable, setTimetable);
		void run(DATA_URLS.attractions, isAttractionsFile, (p) =>
			setAttractions(
				p.state === "ready" ? { state: "ready", data: p.data.attractions } : p,
			),
		);
		void run(DATA_URLS.scenarios, isScenarios, setScenarios);
		return () => ctrl.abort();
	}, [attempt]);

	return {
		timetable,
		attractions,
		scenarios,
		reload: () => setAttempt((n) => n + 1),
	};
}
