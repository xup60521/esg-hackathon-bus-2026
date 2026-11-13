import type { Theme } from "#/lib/palette";

/**
 * Data-kind vocabulary shared by every /lab page. A page must label each dataset with exactly
 * one kind so readers never confuse card history, scenarios, forecasts and (absent) live data.
 */
export type DataKind =
	| "history"
	| "scenario"
	| "forecast"
	| "live-unavailable"
	| "unverified"
	| "official";

export const KIND_META: Record<DataKind, { label: string; hint: string }> = {
	history: {
		label: "歷史刷卡",
		hint: "2024–2025 年已成功搭乘的電子票證紀錄，非即時、非完整需求",
	},
	scenario: {
		label: "情境假設",
		hint: "依明示假設推算，不是觀測值，也不是實測成效",
	},
	forecast: {
		label: "回測預測",
		hint: "以歷史資料時間順序回測的預測，非保證、非即時預報",
	},
	"live-unavailable": {
		label: "即時資料未接",
		hint: "此處需要即時資料，但本原型沒有接入，也不假造",
	},
	unverified: { label: "未驗證", hint: "尚無資料或方法驗證，只能當線索或待辦" },
	official: {
		label: "官方文件",
		hint: "引自官方網站或開放資料，附來源與查閱日期",
	},
};

export type Status = "ready" | "partial" | "blocked" | "pending";
export const STATUS_META: Record<Status, { label: string; hint: string }> = {
	ready: {
		label: "已提交",
		hint: "報告與資料已進入 repo；入口不代表已通過驗證",
	},
	partial: {
		label: "部分提交",
		hint: "只有部分成果（例如只有資料或只有程式），仍有缺口",
	},
	blocked: { label: "資料受阻", hint: "缺少必要資料，只提供方法或情境" },
	pending: { label: "尚未提交", hint: "此方向的成果尚未進到入口" },
};

const LIGHT = {
	"--k-history": "#1f63b8",
	"--k-scenario": "#7040c0",
	"--k-forecast": "#087565",
	"--k-live-unavailable": "#b3261e",
	"--k-unverified": "#9a5700",
	"--k-official": "#4a4f5a",
	"--sev-info": "#4a4f5a",
	"--sev-watch": "#9a5700",
	"--sev-review": "#b3261e",
	"--st-ready": "#087565",
	"--st-partial": "#9a5700",
	"--st-blocked": "#b3261e",
	"--st-pending": "#6b707b",
};
const DARK: typeof LIGHT = {
	"--k-history": "#8ebcf5",
	"--k-scenario": "#bfa6f5",
	"--k-forecast": "#5ed4b8",
	"--k-live-unavailable": "#ff9a91",
	"--k-unverified": "#ffcd6e",
	"--k-official": "#c3c2b7",
	"--sev-info": "#c3c2b7",
	"--sev-watch": "#ffcd6e",
	"--sev-review": "#ff9a91",
	"--st-ready": "#5ed4b8",
	"--st-partial": "#ffcd6e",
	"--st-blocked": "#ff9a91",
	"--st-pending": "#8b8a84",
};

/** Extra CSS variables for /lab (kind, severity, status tones). Neutral tokens live in styles.css. */
export function labVars(theme: Theme): React.CSSProperties {
	return (theme === "light" ? LIGHT : DARK) as unknown as React.CSSProperties;
}
