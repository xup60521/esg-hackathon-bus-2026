import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DayChart } from "./DayChart";

test("replay accessibility exposes future actuals only in explicit hindsight", () => {
	const observed = Array(24).fill(1);
	observed[18] = 9876;
	const props = {
		dir: "outbound" as const,
		observed,
		baseline: null,
		lastDelivered: 12,
		alertHours: [],
	};
	const hidden = renderToStaticMarkup(
		<DayChart {...props} showHindsight={false} />,
	);
	expect(hidden).toContain("18:00：尚未送達");
	expect(hidden).not.toContain("9876");
	const hindsight = renderToStaticMarkup(<DayChart {...props} showHindsight />);
	expect(hindsight).toContain("18:00：9876 人（事後）");
});
