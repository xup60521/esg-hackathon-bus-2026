import { createFileRoute } from "@tanstack/react-router";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { trpcRouter } from "#/integrations/trpc/router";

function handler({ request }: { request: Request }) {
	return fetchRequestHandler({
		req: request,
		router: trpcRouter,
		endpoint: "/api/trpc",
		// Historical data never changes: let browsers / Cloudflare cache successful queries.
		responseMeta({ type, errors }) {
			if (type === "query" && errors.length === 0) {
				return {
					headers: new Headers({
						"cache-control": "public, max-age=3600, s-maxage=86400",
					}),
				};
			}
			return {};
		},
	});
}

export const Route = createFileRoute("/api/trpc/$")({
	server: {
		handlers: {
			GET: handler,
			POST: handler,
		},
	},
});
