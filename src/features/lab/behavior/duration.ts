/** Round nonnegative integer seconds to tenths of a minute, half up. */
export function meanDurationMinutes(
	sumSec: number,
	count: number,
): number | null {
	if (
		!Number.isSafeInteger(sumSec) ||
		sumSec < 0 ||
		!Number.isSafeInteger(count) ||
		count < 0
	)
		throw new RangeError("Invalid duration aggregate");
	if (count === 0) return null;
	const n = BigInt(count);
	return Number((BigInt(sumSec) + 3n * n) / (6n * n)) / 10;
}
