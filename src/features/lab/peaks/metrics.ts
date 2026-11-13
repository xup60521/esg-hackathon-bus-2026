import type { PeakMetrics } from "./types";

/** Analysis window only. No verified service hours are available. */
export const ANALYSIS_HOURS = Array.from({ length: 24 }, (_, h) => h);
export function safeRatio(
	numerator: number | null,
	denominator: number | null,
): number | null {
	return numerator !== null && denominator !== null && denominator > 0
		? numerator / denominator
		: null;
}
export function observedMean(values: number[]): number | null {
	return safeRatio(
		values.reduce((s, v) => s + v, 0),
		values.length,
	);
}
export function calculateGini(values: number[]): number | null {
	const sum = values.reduce((s, v) => s + v, 0);
	if (!values.length || !sum) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const weighted = sorted.reduce((s, v, i) => s + (i + 1) * v, 0);
	return (2 * weighted - (values.length + 1) * sum) / (values.length * sum);
}
export function calculatePeakMetrics(
	hourly24: number[],
	analysisHours = ANALYSIS_HOURS,
): PeakMetrics {
	if (
		hourly24.length !== 24 ||
		hourly24.some((v) => !Number.isFinite(v) || v < 0)
	)
		throw new Error("Expected 24 finite nonnegative hourly values");
	if (
		new Set(analysisHours).size !== analysisHours.length ||
		analysisHours.some((h) => !Number.isInteger(h) || h < 0 || h > 23)
	)
		throw new Error("Invalid analysis hours");
	const hours = [...analysisHours].sort((a, b) => a - b);
	const values = hours.map((h) => hourly24[h]);
	const includedVolume = values.reduce((s, v) => s + v, 0);
	const peak = (subset: number[]) => {
		const volume = Math.max(0, ...subset.map((h) => hourly24[h]));
		return {
			hour: volume > 0 ? subset.find((h) => hourly24[h] === volume)! : null,
			volume,
		};
	};
	const all = peak(hours),
		am = peak(hours.filter((h) => h < 12)),
		pm = peak(hours.filter((h) => h >= 12));
	const sorted = [...values].sort((a, b) => b - a);
	const baseVolume = safeRatio(includedVolume, hours.length);
	return {
		analysisHours: hours,
		includedVolume,
		excludedVolume: hourly24.reduce((s, v) => s + v, 0) - includedVolume,
		peakHour: all.hour,
		peakVolume: all.volume,
		baseVolume,
		peakToBaseRatio: safeRatio(all.volume, baseVolume ?? 0),
		cr3: safeRatio(
			sorted.slice(0, 3).reduce((s, v) => s + v, 0),
			includedVolume,
		),
		cr4: safeRatio(
			sorted.slice(0, 4).reduce((s, v) => s + v, 0),
			includedVolume,
		),
		gini: calculateGini(values),
		amPeakHour: am.hour,
		amPeakVolume: am.volume,
		pmPeakHour: pm.hour,
		pmPeakVolume: pm.volume,
	};
}
export function calculateDirectionalAsymmetry(
	outbound: number,
	inbound: number,
): {
	dominantDirection: "outbound" | "inbound" | "balanced" | null;
	ratio: number | null;
} {
	const total = outbound + inbound;
	if (!total) return { dominantDirection: null, ratio: null };
	return {
		dominantDirection:
			Math.abs(outbound - inbound) / total <= 0.1
				? "balanced"
				: outbound > inbound
					? "outbound"
					: "inbound",
		ratio: Math.max(outbound, inbound) / total,
	};
}
