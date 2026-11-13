// Update display rounding from the saved aggregate, without re-querying the source.
import {meanDurationMinutes, clusterOdPairs, reconcileBehavior, type BehaviorAnalysisSummary} from '../../../src/features/lab/behavior';
const path='public/data/lab/behavior/od-behavior-summary.json';
const s:BehaviorAnalysisSummary=await Bun.file(path).json();
for(const od of s.allOdPairs) od.avgDurationMin=meanDurationMinutes(od.durationSumSec,od.durationSampleCount);
s.topOdPairs=s.allOdPairs.slice(0,30);
s.clusters=clusterOdPairs(s.allOdPairs);
s.reconciliation=reconcileBehavior(s);
if(Object.values(s.reconciliation).some(v=>!v)) throw new Error('Aggregate reconciliation failed');
const groups=await Bun.file('public/data/lab/behavior/od-clusters.json').json();groups.clusters=s.clusters;
const audit=await Bun.file('docs/lab/behavior/audit-summary.json').json();audit.reconciliation=s.reconciliation;
for(const item of audit.clustersSummary){const c=s.clusters.find(c=>c.clusterId===item.id);if(c)item.avgDurationMin=c.avgDurationMin;}
for(const [p,v]of [[path,s],['public/data/lab/behavior/od-clusters.json',groups],['docs/lab/behavior/audit-summary.json',audit]] as const) await Bun.write(p,JSON.stringify(v,null,2)+'\n');
console.log('Duration rounding updated from unchanged integer-second aggregate snapshot.');
