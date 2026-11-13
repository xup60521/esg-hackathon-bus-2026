import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { LabShell, useLabTheme } from "#/components/lab/shared";

/**
 * Layout for every /lab page (owned by the operations/UI lead): theme, navigation, footer.
 * Child routes (`lab.<slug>.tsx`) and `lab.index.tsx` render content only.
 */
export const Route = createFileRoute("/lab")({
	component: LabLayout,
	head: () => ({ meta: [{ title: "6670 研究實驗室" }] }),
});

function LabLayout() {
	const [theme, toggleTheme] = useLabTheme();
	const pathname = useLocation({ select: (l) => l.pathname });
	const search = useLocation({ select: (l) => l.search }) as { view?: string };
	const atHub = pathname.replace(/\/+$/, "") === "/lab" && !search.view;
	return (
		<LabShell theme={theme} onToggleTheme={toggleTheme} showBack={!atHub}>
			<Outlet />
		</LabShell>
	);
}
