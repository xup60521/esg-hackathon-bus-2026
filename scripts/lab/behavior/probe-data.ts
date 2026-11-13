import { createClient } from "@libsql/client";
import { metadataSql } from "./queries";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = createClient({ url, authToken: process.env.DATABASE_TOKEN });
  try {
    const result = await db.execute(`WITH source AS (
      SELECT * FROM trips WHERE board_date >= '2024-01-01' AND board_date < '2026-01-01'
    ) ${metadataSql.replaceAll("FROM trips", "FROM source")}`);
    console.log(JSON.stringify(result.rows[0]));
  } finally { db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
