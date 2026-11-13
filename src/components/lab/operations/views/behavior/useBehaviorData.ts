import { useEffect, useState } from "react";
import { type Loaded, loadBehavior } from "./model";

const LOADING: Loaded = { state: "loading" };

/** Loads and validates the three files; `reload` retries after an error. */
export function useBehaviorData(): { loaded: Loaded; reload: () => void } {
	const [attempt, setAttempt] = useState(0);
	const [loaded, setLoaded] = useState<Loaded>(LOADING);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the load on retry
	useEffect(() => {
		const ctrl = new AbortController();
		setLoaded(LOADING);
		void loadBehavior(fetch, ctrl.signal).then((r) => {
			if (!ctrl.signal.aborted) setLoaded(r);
		});
		return () => ctrl.abort();
	}, [attempt]);

	return { loaded, reload: () => setAttempt((n) => n + 1) };
}
