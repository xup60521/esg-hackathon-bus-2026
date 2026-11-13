#!/usr/bin/env python3
"""Validate against matched visible-event high-minus-low truth; create CSV exclusively."""
import argparse
import bisect
import csv
import multiprocessing as mp
from collections import defaultdict
import estimator


def one(job):
    cap, a, b, shock, seed, boot = job
    # Reproduce validate.one's simulations, then match exactly estimator's visible pairs.
    import tempfile
    from pathlib import Path
    from types import SimpleNamespace
    import sim
    with tempfile.TemporaryDirectory() as tmp:
        paths = [str(Path(tmp) / str(i)) for i in range(4)]
        args = dict(days=60, stops=4, buses=28, cap=cap, a=a, b=b, shock=shock,
                    gap_min=15, gap_max=45, demand=7, initial_load=25, alight=.08,
                    voluntary=0, track_sources=True)
        for i in range(2):
            sim.run(SimpleNamespace(**args, seed=seed+i, visible=paths[2*i], truth=paths[2*i+1]))
        baseline, events, truth = map(estimator.read, (paths[0], paths[2], paths[3]))
        result = estimator.estimate(baseline, events, cap, bootstrap=boot, seed=seed+2)
        bins = [defaultdict(int) for _ in range(3)]
        def keys(e):
            return ((e['s'], e['dir'], estimator.daytype(e['d']), e['h']),
                    (e['s'], e['dir'], estimator.daytype(e['d'])), (e['s'], e['dir']))
        for e in baseline:
            for table, key in zip(bins, keys(e)): table[key] += 1
        groups = defaultdict(list)
        for e in events: groups[e['d'], e['s'], e['dir']].append(e)
        for group in groups.values(): group.sort(key=lambda e: (e['time'], e['v']))
        actual = {(e['d'], e['s'], e['dir'], e['v']): e for e in truth}
        strata = defaultdict(lambda: [[], []])
        for (day, stop, direction), group in groups.items():
            opposite = groups.get((day, stop, -direction), [])
            times = [e['time'] for e in opposite]
            for prev, e in zip(group, group[1:]):
                j = bisect.bisect_left(times, e['time']) - 1
                if e['time']-prev['time'] > 60 or j < 0 or e['time']-times[j] > 60: continue
                if not any(table[key] >= 5 for table, key in zip(bins, keys(e))): continue
                idx = 0 if prev['L'] >= cap-5 else (1 if prev['L'] < cap-10 else None)
                if idx is not None:
                    t = actual[day, stop, direction, e['v']]
                    strata[keys(e)[0]][idx].append((t['B'], t['true_carryover_boarded']))
        matched = [v for v in strata.values() if all(v)]
        if not matched: return None
        mean = lambda xs: sum(xs)/len(xs)
        total = sum(len(v[0]) for v in matched)
        def contrast(column):
            return sum(len(v[0]) * (mean([x[column] for x in v[0]]) -
                                    mean([x[column] for x in v[1]])) for v in matched) / total
        net, carry = contrast(0), contrast(1)
        row = dict(cap=cap, a=a, b=b, shock=shock, seed=seed, net=net, carry=carry,
                   ratio=net/carry if carry else '', high_n=total,
                   low_n=sum(len(v[1]) for v in matched))
        for name in ('naive', 'did'):
            row[name] = result[name]
            ci = result[name+'_ci']
            row[name+'_covered'] = int(ci[0] <= net <= ci[1]) if ci else ''
        return row


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', required=True)
    p.add_argument('--repetitions', type=int, default=40)
    p.add_argument('--bootstrap', type=int, default=500)
    p.add_argument('--workers', type=int, default=4)
    p.add_argument('--seed', type=int, default=20261112)
    args = p.parse_args()
    if min(args.repetitions, args.bootstrap, args.workers) < 1: p.error('counts must be positive')
    # A deliberately bounded grid: varies all requested parameters, plus the reviewer's cell.
    cells = [(37,.2,.24,0), (37,.8,.14,.8), (38,.5,.15,0),
             (38,.5,.35,.8), (42,.2,.56,.8), (42,.8,.06,0),
             (43,.5,.15,.4), (43,.8,.14,.4)]
    jobs = [(cap,a,b,s,args.seed+i*100000+j*10,args.bootstrap)
            for i,(cap,a,b,s) in enumerate(cells) for j in range(args.repetitions)]
    fields = ['cap','a','b','shock','seed','net','carry','ratio','high_n','low_n',
              'naive','naive_covered','did','did_covered']
    with open(args.output, 'x', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader(); f.flush()
        with mp.Pool(args.workers) as pool:
            for row in pool.imap(one, jobs):
                if row is None: raise RuntimeError('missing high or low group')
                writer.writerow(row); f.flush()

if __name__ == '__main__': main()
