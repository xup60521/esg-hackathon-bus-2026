import { createClient } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql/web";

import * as schema from "./schema.ts";

let cached: ReturnType<typeof makeDb> | undefined;

function makeDb() {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is not set");
	const client = createClient({ url, authToken: process.env.DATABASE_TOKEN });
	return drizzle(client, { schema });
}

/** Lazily created so env vars are read at request time (Cloudflare Workers). */
export function getDb() {
	cached ??= makeDb();
	return cached;
}
