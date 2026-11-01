import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";

import type { TRPCRouter } from "#/integrations/trpc/router";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
	trpc: TRPCOptionsProxy<TRPCRouter>;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "6670 台灣好行日月潭線 · 搭乘人次 3D 視覺化" },
			{
				name: "description",
				content:
					"Route 6670 (Taichung ⇄ Sun Moon Lake) smart-card ridership 2024–2025 on official MOI terrain.",
			},
			{ name: "color-scheme", content: "light dark" },
		],
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="zh-Hant">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
