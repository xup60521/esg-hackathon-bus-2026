import type { ForecastModel } from "#/features/lab/forecast/data";

export const fmt = new Intl.NumberFormat("en-US");
export const fmt1 = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 1,
});
export const fmt2 = new Intl.NumberFormat("en-US", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

export const MODELS: ForecastModel[] = [
	"seasonal7",
	"weekday_mean4",
	"weekday_median4",
	"mean28",
];

export const MODEL_LABEL: Record<ForecastModel, string> = {
	seasonal7: "上週同日",
	weekday_mean4: "前 4 週同日平均",
	weekday_median4: "前 4 週同日中位數",
	mean28: "前 28 日平均",
};

export const num2 = (v: number | null) => (v === null ? "–" : fmt2.format(v));
export const pct2 = (v: number | null) =>
	v === null ? "–" : `${fmt2.format(v * 100)}%`;

/** Prediction minus actual: negative means under-forecast. The word carries the meaning, not the sign alone. */
export function signedBias(v: number | null) {
	if (v === null) return "–";
	const text = `${v > 0 ? "+" : ""}${fmt2.format(v)}`;
	if (v < 0) return `${text}（低估）`;
	if (v > 0) return `${text}（高估）`;
	return text;
}

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
export const weekday = (d: string) =>
	WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()];

export function groupLabel(id: string) {
	if (id === "total") return "總量";
	const [kind, name] = id.split(":");
	if (kind === "direction") return `方向 ${name}`;
	if (kind === "subroute") return `支線 ${name}`;
	return id;
}

export function niceMax(v: number) {
	if (v <= 0) return 1;
	const p = 10 ** Math.floor(Math.log10(v));
	return Math.ceil(v / p) * p;
}

const ML_LABEL: Record<string, string> = {
	raw_squared: "直接預測・平方誤差損失",
	raw_absolute: "直接預測・絕對誤差損失",
	residual_squared: "殘差・平方誤差損失",
	residual_absolute: "殘差・絕對誤差損失",
};

/** Label for any statistical-baseline or ML model key. */
export const modelLabel = (key: string) =>
	MODEL_LABEL[key as ForecastModel] ?? ML_LABEL[key] ?? key;
