#!/usr/bin/env python3
"""Run synthetic validation; exclusively create the requested CSV."""
import argparse
import csv
import math
import tempfile
from pathlib import Path
from types import SimpleNamespace
import estimator
import sim


def one(cap, a, b, shock, seed, boot):
    with tempfile.TemporaryDirectory() as temp:
        paths = [str(Path(temp) / str(i)) for i in range(4)]
        args = dict(days=60, stops=4, buses=28, cap=cap, a=a, b=b, shock=shock,
                    gap_min=15, gap_max=45, demand=7, initial_load=25, alight=.08, voluntary=0, track_sources=True)
        for i in range(2):
            sim.run(SimpleNamespace(**args, seed=seed+i, visible=paths[2*i], truth=paths[2*i+1]))
        visible = estimator.read(paths[2]); truth = estimator.read(paths[3])
        result = estimator.estimate(estimator.read(paths[0]), visible, cap, bootstrap=boot, seed=seed+2)
        actual = {(e['d'], e['s'], e['dir'], e['v']): e for e in truth}
        # For each visible high-load arrival, measure carried passengers boarding the
        # immediately following actual bus. The last bus has no observable successor.
        targets = [actual[e['d'], e['s'], e['dir'], e['v']+1]
                   for e in visible if e['L'] >= cap-5 and e['v'] < args['buses']-1]
        return result, (sum(t['true_carryover_boarded'] for t in targets)/len(targets) if targets else None), (sum(t['boarded_carryover'] for t in targets)/len(targets) if targets else None)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', required=True); p.add_argument('--caps', type=int, nargs='+', required=True)
    p.add_argument('--repetitions', type=int, required=True); p.add_argument('--bootstrap', type=int, default=500)
    p.add_argument('--seed', type=int, default=20261111)
    args = p.parse_args()
    if args.repetitions < 1 or args.bootstrap < 1: p.error('counts must be positive')
    fields = ['cap','a','b','shock','repetitions','estimator','valid','truth_mean','approx_truth_mean','estimate_mean','bias','rmse','ci_valid','coverage']
    with open(args.output, 'x', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); f.flush()
        cell = 0
        for cap in args.caps:
            for a in (.2, .5, .8):
                for ratio in (.3, .7):
                    b = (1-a)*ratio
                    for shock in (0, .4, .8):
                        runs = [one(cap, a, b, shock, args.seed + cell*100000 + i*10, args.bootstrap) for i in range(args.repetitions)]
                        for name in ('naive', 'did'):
                            valid = [(r,t,approx) for r,t,approx in runs if t is not None and r[name] is not None]
                            cis = [(r,t,approx) for r,t,approx in valid if r[name+'_ci'] is not None]
                            errors = [r[name]-t for r,t,approx in valid]
                            mean = lambda x: sum(x)/len(x) if x else ''
                            w.writerow(dict(cap=cap,a=a,b=b,shock=shock,repetitions=args.repetitions,estimator=name,valid=len(valid),
                                truth_mean=mean([t for r,t,approx in valid]),approx_truth_mean=mean([approx for r,t,approx in valid]),estimate_mean=mean([r[name] for r,t,approx in valid]),
                                bias=mean(errors),rmse=math.sqrt(mean([x*x for x in errors])) if errors else '',ci_valid=len(cis),
                                coverage=mean([r[name+'_ci'][0] <= t <= r[name+'_ci'][1] for r,t,approx in cis])))
                            f.flush()
                        cell += 1

if __name__ == '__main__': main()
