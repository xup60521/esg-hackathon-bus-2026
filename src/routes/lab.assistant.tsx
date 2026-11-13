import { createFileRoute } from "@tanstack/react-router";
import AssistantPage from "#/components/lab/assistant/AssistantPage";

/** Content only: the /lab layout route (src/routes/lab.tsx) supplies theme, navigation and footer. */
export const Route = createFileRoute("/lab/assistant")({
	component: AssistantPage,
	head: () => ({ meta: [{ title: "6670 可信旅遊問答 Lab" }] }),
});
