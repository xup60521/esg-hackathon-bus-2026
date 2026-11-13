import { expect, test } from "bun:test";
import { meanDurationMinutes } from "./duration";

test("integer seconds round ties half up and preserve missing samples", () => {
	expect(meanDurationMinutes(423, 1)).toBe(7.1);
	expect(meanDurationMinutes(1047, 1)).toBe(17.5);
	expect(meanDurationMinutes(846, 2)).toBe(7.1);
	expect(meanDurationMinutes(422, 1)).toBe(7);
	expect(meanDurationMinutes(424, 1)).toBe(7.1);
	expect(meanDurationMinutes(0, 0)).toBeNull();
	expect(() => meanDurationMinutes(NaN, 1)).toThrow();
});
