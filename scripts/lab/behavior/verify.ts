import { reconcileBehavior } from "../../../src/features/lab/behavior/reconcile";
import type { BehaviorAnalysisSummary } from "../../../src/features/lab/behavior/types";
const summary: BehaviorAnalysisSummary = await Bun.file("public/data/lab/behavior/od-behavior-summary.json").json();
if (summary.schemaVersion !== 2) throw new Error("Expected behavior schema v2");
const checks = reconcileBehavior(summary);
console.log(JSON.stringify({generatedAt: summary.generatedAt, totalTrips: summary.totalTrips, odCount: summary.allOdPairs.length, checks}, null, 2));
if (Object.values(checks).some(v => !v)) process.exit(1);
const clusters = await Bun.file("public/data/lab/behavior/od-clusters.json").json();
const temporal = await Bun.file("public/data/lab/behavior/temporal-behavior.json").json();
const audit = await Bun.file("docs/lab/behavior/audit-summary.json").json();
for (const artifact of [clusters, temporal, audit]) {
  if (artifact.schemaVersion !== 2 || artifact.generatedAt !== summary.generatedAt) throw new Error("Artifact snapshot/version mismatch");
}
if (JSON.stringify(clusters.clusters) !== JSON.stringify(summary.clusters)) throw new Error("Cluster file mismatch");
if (JSON.stringify(temporal.overallHourly) !== JSON.stringify(summary.overallHourly)) throw new Error("Temporal file mismatch");
if (JSON.stringify(audit.qualityEvidence) !== JSON.stringify(summary.qualityEvidence)) throw new Error("Audit evidence mismatch");
console.log("All four artifacts share the same v2 aggregate snapshot.");
