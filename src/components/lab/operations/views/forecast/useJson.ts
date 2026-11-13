import { useEffect, useState } from "react";

export type Load<T> =
	| { state: "idle" }
	| { state: "loading" }
	| { state: "error"; message: string }
	| { state: "ready"; data: T };

/** Fetches one JSON file. `request` 0 means not requested yet; `start()` (re)runs the request. */
export function useJson<T>(
	url: string,
	guard: (v: unknown) => v is T,
	autoStart: boolean,
): [Load<T>, () => void] {
	const [request, setRequest] = useState(autoStart ? 1 : 0);
	const [load, setLoad] = useState<Load<T>>({ state: "idle" });
	useEffect(() => {
		if (request === 0) return;
		const ctrl = new AbortController();
		setLoad({ state: "loading" });
		(async () => {
			const res = await fetch(url, { signal: ctrl.signal });
			if (!res.ok) {
				setLoad({ state: "error", message: `載入失敗（HTTP ${res.status}）` });
				return;
			}
			let json: unknown;
			try {
				json = await res.json();
			} catch {
				setLoad({ state: "error", message: "檔案無法解析為 JSON" });
				return;
			}
			if (!guard(json)) {
				setLoad({ state: "error", message: "資料格式與預期不符" });
				return;
			}
			setLoad({ state: "ready", data: json });
		})().catch((e: unknown) => {
			if (e instanceof DOMException && e.name === "AbortError") return;
			setLoad({ state: "error", message: "網路錯誤，無法取得檔案" });
		});
		return () => ctrl.abort();
	}, [url, guard, request]);
	return [load, () => setRequest((r) => r + 1)];
}
