import { type ComponentType, lazy } from "react";

/**
 * Every `views/<Name>View.tsx` file becomes the in-page view `/lab?view=<name>` (lower-case,
 * "View" suffix dropped: ForecastView.tsx → "forecast"). A direction that has its own child route
 * (`src/routes/lab.<slug>.tsx`) does not need a view file; the overview links to whichever exists.
 */
const loaders = import.meta.glob<{ default: ComponentType }>(
	"./views/*View.tsx",
);

export const VIEWS: Record<string, ComponentType> = {};
for (const [path, load] of Object.entries(loaders)) {
	const name = path.match(/\/(\w+)View\.tsx$/)?.[1];
	if (name) VIEWS[name.toLowerCase()] = lazy(load);
}
