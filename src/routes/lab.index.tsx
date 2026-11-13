import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import Overview from "#/components/lab/operations/Overview";
import { VIEWS } from "#/components/lab/operations/views";

/** `/lab` = overview; `/lab?view=<slug>` = an in-page prototype (see components/lab/operations/views). */
export const Route = createFileRoute("/lab/")({
	validateSearch: (s: Record<string, unknown>): { view?: string } => ({
		view:
			typeof s.view === "string" && Object.hasOwn(VIEWS, s.view)
				? s.view
				: undefined,
	}),
	component: LabIndex,
});

function LabIndex() {
	const { view } = Route.useSearch();
	const View = view ? VIEWS[view] : null;
	if (!View) return <Overview />;
	return (
		<Suspense
			fallback={<div className="mt-10 text-sm text-[var(--fg2)]">載入中…</div>}
		>
			<View />
		</Suspense>
	);
}
