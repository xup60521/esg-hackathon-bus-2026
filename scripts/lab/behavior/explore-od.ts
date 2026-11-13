import { createClient } from "@libsql/client";

async function main() {
  const url = process.env.DATABASE_URL;
  const token = process.env.DATABASE_TOKEN;
  if (!url) throw new Error("DATABASE_URL not set");
  const db = createClient({ url, authToken: token });

  try {
    // 1. Subroutes count
    const subroutesRes = await db.execute(`
      SELECT subroute, count(*) as count 
      FROM trips 
      GROUP BY subroute 
      ORDER BY count DESC
    `);
    console.log("Subroutes:", JSON.stringify(subroutesRes.rows));

    // 2. Ticket types count
    const ticketTypesRes = await db.execute(`
      SELECT ticket_type, count(*) as count 
      FROM trips 
      GROUP BY ticket_type 
      ORDER BY count DESC
    `);
    console.log("Ticket Types:", JSON.stringify(ticketTypesRes.rows));

    // 3. Top 15 OD pairs
    const topOdRes = await db.execute(`
      SELECT board_stop, alight_stop, count(*) as count,
        round(avg(alight_ts - board_ts) / 60.0, 1) as avg_duration_min
      FROM trips
      WHERE board_stop IS NOT NULL AND alight_stop IS NOT NULL
      GROUP BY board_stop, alight_stop
      ORDER BY count DESC
      LIMIT 15
    `);
    console.log("Top 15 OD pairs:", JSON.stringify(topOdRes.rows, null, 2));

    // 4. Trip duration anomalies check
    const durationAnomalyRes = await db.execute(`
      SELECT
        sum(CASE WHEN alight_ts - board_ts < 0 THEN 1 ELSE 0 END) as negative_dur,
        sum(CASE WHEN alight_ts - board_ts = 0 THEN 1 ELSE 0 END) as zero_dur,
        sum(CASE WHEN alight_ts - board_ts > 0 AND alight_ts - board_ts < 180 THEN 1 ELSE 0 END) as under_3min,
        sum(CASE WHEN alight_ts - board_ts > 21600 THEN 1 ELSE 0 END) as over_6hr
      FROM trips
    `);
    console.log("Duration anomalies:", JSON.stringify(durationAnomalyRes.rows[0]));

  } finally {
    db.close();
  }
}

main().catch(console.error);
