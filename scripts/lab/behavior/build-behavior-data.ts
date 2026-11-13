import { meanDurationMinutes } from "../../../src/features/lab/behavior/duration";
import { metadataSql } from "./queries";
import { reconcileBehavior } from "../../../src/features/lab/behavior/reconcile";
import { createClient } from "@libsql/client";
import { writeFile, mkdir } from "node:fs/promises";
import {
  categorizeTicketType,
  classifyOdArchetype,
  getDataInventoryComparison,
  getOdFeasibilityReport,
  EXPECTED_TOTAL_TRIPS,
} from "../../../src/features/lab/behavior/analyzer";
import { clusterOdPairs } from "../../../src/features/lab/behavior/clustering";
import type {
  BehaviorAnalysisSummary,
  HourlyDistribution,
  OdPairStat,
  TicketGroupShare,
} from "../../../src/features/lab/behavior/types";

async function main() {
  const url = process.env.DATABASE_URL;
  const token = process.env.DATABASE_TOKEN;

  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const db = createClient({
    url,
    authToken: token,
    fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => fetch(input, { ...init, signal: AbortSignal.timeout(300_000) }),
  });

  const tx = await db.transaction("read");
  // Every query uses this explicit boarding-date window, within one read snapshot.
  const query = (sql: string) => tx.execute(`WITH source AS (
    SELECT * FROM trips WHERE board_date >= '2024-01-01' AND board_date < '2026-01-01'
  ) ${sql.replaceAll("FROM trips", "FROM source")}`);
  try {
    console.log("=== Step 1: Querying Database Metadata & Invariants ===");
    const metaRes = await query(metadataSql);

    const meta = metaRes.rows[0];
    const totalTrips = Number(meta.total_trips);
    console.log(`Total trips in DB: ${totalTrips} (Expected: ${EXPECTED_TOTAL_TRIPS})`);
    if (totalTrips !== EXPECTED_TOTAL_TRIPS) {
      console.warn(`Warning: total trips ${totalTrips} differs from expected ${EXPECTED_TOTAL_TRIPS}`);
    }

    // Step 2: Subroutes overview
    console.log("=== Step 2: Querying Subroutes Distribution ===");
    const subroutesRes = await query(`
      SELECT subroute, count(*) as trips 
      FROM trips 
      GROUP BY subroute 
      ORDER BY trips DESC
    `);
    const subrouteOverview = subroutesRes.rows.map((r) => ({
      subroute: String(r.subroute),
      trips: Number(r.trips),
      share: Number((Number(r.trips) / totalTrips).toFixed(4)),
    }));

    // Step 3: Ticket Types aggregation
    console.log("=== Step 3: Querying Ticket Types Breakdown ===");
    const rawTicketsRes = await query(`
      SELECT ticket_type, count(*) as trips 
      FROM trips 
      GROUP BY ticket_type
    `);
    
    const ticketGroupCounts: Record<string, number> = {
      general: 0,
      student: 0,
      concession: 0,
      tpass_commuter: 0,
      other: 0,
    };
    for (const row of rawTicketsRes.rows) {
      const g = categorizeTicketType(String(row.ticket_type));
      ticketGroupCounts[g] = (ticketGroupCounts[g] || 0) + Number(row.trips);
    }
    const groupLabels: Record<string, string> = {
      general: "一般全票 / 電子錢包",
      student: "學生／校名票種",
      concession: "敬老／愛心等名稱票種",
      tpass_commuter: "通勤／中彰投苗等名稱票種",
      other: "其他未分類票種",
    };
    const ticketGroupOverview: TicketGroupShare[] = Object.entries(ticketGroupCounts).map(
      ([group, count]) => ({
        group: group as TicketGroupShare["group"],
        groupLabel: groupLabels[group],
        trips: count,
        share: Number((count / totalTrips).toFixed(4)),
      })
    );

    // Step 4: Overall hourly boarding distribution (Asia/Taipei)
    console.log("=== Step 4: Querying Overall Hourly Boardings ===");
    const hourlyRes = await query(`
      SELECT 
        CAST(strftime('%H', board_ts, 'unixepoch', '+8 hours') AS INT) as hour,
        count(*) as trips
      FROM trips
      GROUP BY hour
      ORDER BY hour ASC
    `);
    const hourlyMap = new Map<number, number>();
    for (const r of hourlyRes.rows) {
      hourlyMap.set(Number(r.hour), Number(r.trips));
    }
    const overallHourly: HourlyDistribution[] = Array.from({ length: 24 }, (_, h) => {
      const trips = hourlyMap.get(h) ?? 0;
      return {
        hour: h,
        trips,
        share: Number((trips / totalTrips).toFixed(4)),
      };
    });

    // Step 5: Querying All OD Pairs with Temporal & Ticket Features
    console.log("=== Step 5: Querying All OD Pairs and Features ===");
    const odRowsRes = await query(`
      SELECT 
        board_stop,
        alight_stop,
        count(*) as trips,
        sum(CASE WHEN CAST(strftime('%w', board_date) AS INT) IN (0, 6) THEN 1 ELSE 0 END) as weekend_trips,
        sum(CASE WHEN CAST(strftime('%H', board_ts, 'unixepoch', '+8 hours') AS INT) BETWEEN 6 AND 9 THEN 1 ELSE 0 END) as am_peak_trips,
        sum(CASE WHEN CAST(strftime('%H', board_ts, 'unixepoch', '+8 hours') AS INT) BETWEEN 16 AND 19 THEN 1 ELSE 0 END) as pm_peak_trips,
        count(CASE WHEN alight_ts - board_ts BETWEEN 180 AND 21600 THEN 1 END) as valid_dur_count,
        coalesce(sum(CASE WHEN alight_ts - board_ts BETWEEN 180 AND 21600 THEN alight_ts - board_ts END), 0) as duration_sum_sec
      FROM trips
      WHERE trim(coalesce(board_stop, '')) != '' AND trim(coalesce(alight_stop, '')) != ''
      GROUP BY board_stop, alight_stop
      ORDER BY trips DESC, board_stop, alight_stop
    `);

    // Step 5b: Query Hourly distribution per top OD pairs (or all)
    console.log("=== Step 5b: Querying Hourly Distribution by OD ===");
    const odHourlyRes = await query(`
      SELECT 
        board_stop,
        alight_stop,
        CAST(strftime('%H', board_ts, 'unixepoch', '+8 hours') AS INT) as hour,
        count(*) as count
      FROM trips
      GROUP BY board_stop, alight_stop, hour
    `);
    const odHourlyMap = new Map<string, number[]>();
    for (const r of odHourlyRes.rows) {
      const key = `${r.board_stop}->${r.alight_stop}`;
      if (!odHourlyMap.has(key)) {
        odHourlyMap.set(key, new Array(24).fill(0));
      }
      odHourlyMap.get(key)![Number(r.hour)] = Number(r.count);
    }

    // Step 5c: Query Subroute breakdown per OD pair
    console.log("=== Step 5c: Querying Subroute Breakdown by OD ===");
    const odSubrouteRes = await query(`
      SELECT 
        board_stop,
        alight_stop,
        subroute,
        count(*) as count
      FROM trips
      GROUP BY board_stop, alight_stop, subroute
    `);
    const odSubrouteMap = new Map<string, Record<string, number>>();
    for (const r of odSubrouteRes.rows) {
      const key = `${r.board_stop}->${r.alight_stop}`;
      if (!odSubrouteMap.has(key)) {
        odSubrouteMap.set(key, {});
      }
      odSubrouteMap.get(key)![String(r.subroute)] = Number(r.count);
    }

    // Only aggregate rows leave the DB. The same classifier serves overview and each OD.
    const odTickets = await query(`SELECT board_stop, alight_stop, ticket_type, count(*) as trips
      FROM trips GROUP BY board_stop, alight_stop, ticket_type`);
    const odTicketMap = new Map<string, Record<TicketGroupShare["group"], number>>();
    for (const r of odTickets.rows) {
      const key = `${r.board_stop}->${r.alight_stop}`;
      const counts = odTicketMap.get(key) ?? {general: 0, student: 0, concession: 0, tpass_commuter: 0, other: 0};
      counts[categorizeTicketType(r.ticket_type === null ? null : String(r.ticket_type))] += Number(r.trips);
      odTicketMap.set(key, counts);
    }

    // Step 6: Construct OdPairStat items
    console.log("=== Step 6: Assembling and Classifying OD Pairs ===");
    const allOdPairs: OdPairStat[] = odRowsRes.rows.map((r, idx) => {
      const boardStop = String(r.board_stop);
      const alightStop = String(r.alight_stop);
      const key = `${boardStop}->${alightStop}`;
      const trips = Number(r.trips);
      const weekendTrips = Number(r.weekend_trips);
      const weekdayTrips = trips - weekendTrips;
      const amPeakTrips = Number(r.am_peak_trips);
      const pmPeakTrips = Number(r.pm_peak_trips);
      const offPeakTrips = trips - amPeakTrips - pmPeakTrips;

      const tickets = odTicketMap.get(key)!;
      const studentTrips = tickets.student;
      const concessionTrips = tickets.concession;
      const tpassTrips = tickets.tpass_commuter;
      const generalTrips = tickets.general;
      const otherTrips = tickets.other;
      const durationSampleCount = Number(r.valid_dur_count);
      const durationSumSec = Number(r.duration_sum_sec);
      const avgDurationMin = durationSampleCount > 0 ? meanDurationMinutes(durationSumSec, durationSampleCount) : null;

      const weekendRatio = Number((weekendTrips / trips).toFixed(4));
      const weekdayRatio = Number((weekdayTrips / trips).toFixed(4));
      const amPeakRatio = Number((amPeakTrips / trips).toFixed(4));
      const pmPeakRatio = Number((pmPeakTrips / trips).toFixed(4));

      const studentRatio = Number((studentTrips / trips).toFixed(4));
      const concessionRatio = Number((concessionTrips / trips).toFixed(4));
      const tpassRatio = Number((tpassTrips / trips).toFixed(4));
      const generalRatio = Number((generalTrips / trips).toFixed(4));

      const { archetype, label } = classifyOdArchetype({
        boardStop,
        alightStop,
        trips,
        avgDurationMin: durationSampleCount ? durationSumSec / durationSampleCount / 60 : null,
        weekendRatio,
        amPeakRatio,
        pmPeakRatio,
        studentRatio: studentTrips / trips,
      });

      return {
        id: `od-${idx + 1}`,
        boardStop,
        alightStop,
        trips,
        shareOfTotal: Number((trips / totalTrips).toFixed(4)),
        rank: idx + 1,
        avgDurationMin,
        durationSampleCount,
        durationSumSec,
        weekendTrips,
        weekendRatio,
        weekdayTrips,
        weekdayRatio,
        amPeakTrips,
        amPeakRatio,
        pmPeakTrips,
        pmPeakRatio,
        offPeakTrips,
        hourly: odHourlyMap.get(key) ?? new Array(24).fill(0),
        studentTrips,
        studentRatio,
        concessionTrips,
        concessionRatio,
        generalTrips,
        generalRatio,
        tpassTrips,
        tpassRatio,
        otherTrips,
        otherRatio: Number((otherTrips / trips).toFixed(4)),
        subroutes: odSubrouteMap.get(key) ?? {},
        archetype,
        archetypeLabel: label,
        clusterId: 0, // Assigned next
      };
    });

    // Step 7: Run Clustering
    console.log("=== Step 7: Aggregating Manual Rule Groups ===");
    const clusters = clusterOdPairs(allOdPairs);

    // Update clusterId in allOdPairs
    const archetypeToClusterId = new Map(clusters.map((c) => [c.archetype, c.clusterId]));
    for (const od of allOdPairs) {
      od.clusterId = archetypeToClusterId.get(od.archetype) ?? 0;
    }

    // Step 8: Build complete summary
    const summary: BehaviorAnalysisSummary = {
      schemaVersion: 2,
      method: "ordered_manual_rules",
      generatedAt: new Date().toISOString(),
      totalTrips,
      activeDatesCount: Number(meta.active_dates),
      dateRange: {
        start: String(meta.start_date),
        end: String(meta.end_date),
      },
      distinctOdPairsCount: allOdPairs.length,
      validOdTripsCount: Number(meta.valid_od_trips),
      sameStopOdCount: Number(meta.same_stop_od),
      qualityEvidence: Object.fromEntries(Object.entries(meta).filter(([k]) => !["start_date", "end_date"].includes(k)).map(([k, v]) => [k, Number(v)])),
      reconciliation: {},
      durationAnomalies: {
        under3Min: Number(meta.under_3min),
        over6Hours: Number(meta.over_6hr),
        zeroDuration: Number(meta.zero_dur),
        negativeDuration: Number(meta.negative_dur),
      },
      feasibility: getOdFeasibilityReport(),
      dataInventory: getDataInventoryComparison(),
      clusters,
      allOdPairs,
      topOdPairs: allOdPairs.slice(0, 30),
      overallHourly,
      subrouteOverview,
      ticketGroupOverview,
      invariantsAudit: {
        totalTripsPreserved: allOdPairs.reduce((s, o) => s + o.trips, 0) === totalTrips,
        missingAlightStopZero: Number(meta.missing_alight_stop) === 0,
        cardIdExcluded: !/"(?:card_id|card_number|driver_id|uid)"\s*:/.test(JSON.stringify(allOdPairs)),
        noCardLinkedInferences: Object.entries(getOdFeasibilityReport()).filter(([key]) => ["returnTripTrackingFeasible", "transferChainFeasible", "loyaltyAnalysisFeasible"].includes(key)).every(([, value]) => value === false),
      },
    };

    summary.reconciliation = reconcileBehavior(summary);
    if (Object.values(summary.reconciliation).some(v => !v)) {
      throw new Error(`Reconciliation failed: ${JSON.stringify(summary.reconciliation)}`);
    }

    // Step 9: Write output JSON files
    console.log("=== Step 9: Writing Output JSON Files to public/data/lab/behavior/ ===");
    await mkdir("public/data/lab/behavior", { recursive: true });
    await mkdir("docs/lab/behavior", { recursive: true });

    // 1. Full summary
    await writeFile(
      "public/data/lab/behavior/od-behavior-summary.json",
      JSON.stringify(summary, null, 2)
    );
    console.log("Written: public/data/lab/behavior/od-behavior-summary.json");

    // 2. Clusters specific file
    await writeFile(
      "public/data/lab/behavior/od-clusters.json",
      JSON.stringify(
        {
          schemaVersion: 2,
          method: summary.method,
          generatedAt: summary.generatedAt,
          totalTrips,
          clusters,
        },
        null,
        2
      )
    );
    console.log("Written: public/data/lab/behavior/od-clusters.json");

    // 3. Temporal behavior matrix file
    const temporalData = {
      schemaVersion: 2,
      generatedAt: summary.generatedAt,
      overallHourly,
      topOdHourly: allOdPairs.slice(0, 10).map((od) => ({
        odPair: `${od.boardStop} -> ${od.alightStop}`,
        trips: od.trips,
        hourly: od.hourly,
        weekendRatio: od.weekendRatio,
        amPeakRatio: od.amPeakRatio,
        pmPeakRatio: od.pmPeakRatio,
      })),
    };
    await writeFile(
      "public/data/lab/behavior/temporal-behavior.json",
      JSON.stringify(temporalData, null, 2)
    );
    console.log("Written: public/data/lab/behavior/temporal-behavior.json");

    // 4. Audit summary for report verification
    const auditData = {
      schemaVersion: 2,
      qualityEvidence: summary.qualityEvidence,
      reconciliation: summary.reconciliation,
      ticketGroupOverview,
      rawTicketGroups: rawTicketsRes.rows.map(r => ({ ticketType: r.ticket_type, trips: Number(r.trips), group: categorizeTicketType(r.ticket_type === null ? null : String(r.ticket_type)) })),
      generatedAt: summary.generatedAt,
      totalTrips,
      distinctOdPairs: allOdPairs.length,
      top8PairsTripSum: allOdPairs.slice(0, 8).reduce((s, o) => s + o.trips, 0),
      top8PairsTripShare: Number(
        (allOdPairs.slice(0, 8).reduce((s, o) => s + o.trips, 0) / totalTrips).toFixed(4)
      ),
      clustersSummary: clusters.map((c) => ({
        id: c.clusterId,
        archetype: c.archetype,
        label: c.label,
        odCount: c.odPairCount,
        trips: c.totalTrips,
        share: c.totalTripShare,
        avgDurationMin: c.avgDurationMin,
        weekendRatio: c.weekendRatio,
        amPeakRatio: c.amPeakRatio,
        pmPeakRatio: c.pmPeakRatio,
        studentRatio: c.studentRatio,
        concessionRatio: c.concessionRatio,
      })),
    };
    await writeFile(
      "docs/lab/behavior/audit-summary.json",
      JSON.stringify(auditData, null, 2)
    );
    console.log("Written: docs/lab/behavior/audit-summary.json");

    console.log("=== Pipeline Completed Successfully ===");
  } finally {
    await tx.close();
    db.close();
  }
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
