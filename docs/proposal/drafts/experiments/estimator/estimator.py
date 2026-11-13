#!/usr/bin/env python3
"""Estimate excess boardings from visible JSONL only; outputs are exclusive."""
import argparse
import bisect
import json
import random
from collections import defaultdict


def daytype(d):
    return 'weekend' if d % 7 >= 5 else ('friday' if d % 7 == 4 else 'weekday')


def read(path):
    with open(path, encoding='utf-8') as f:
        return [json.loads(line) for line in f]


def estimate(baseline, events, cap, window=60, bootstrap=500, seed=20261111):
    bins = [defaultdict(lambda: [0, 0]) for _ in range(3)]
    def keys(e):
        return ((e['s'], e['dir'], daytype(e['d']), e['h']),
                (e['s'], e['dir'], daytype(e['d'])), (e['s'], e['dir']))
    for e in baseline:
        for table, key in zip(bins, keys(e)):
            table[key][0] += e['B']; table[key][1] += 1
    groups = defaultdict(list)
    for e in events:
        groups[e['d'], e['s'], e['dir']].append(e)
    for group in groups.values():
        group.sort(key=lambda e: (e['time'], e['v']))
    daily = defaultdict(lambda: [[0.0, 0] for _ in range(4)])
    high_boardings = []
    for (day, stop, direction), group in groups.items():
        opposite = groups.get((day, stop, -direction), [])
        times = [e['time'] for e in opposite]
        for i in range(1, len(group)):
            e, prev = group[i], group[i-1]
            j = bisect.bisect_left(times, e['time']) - 1
            if e['time'] - prev['time'] > window or j < 0 or e['time'] - times[j] > window:
                continue
            base = next((table[key] for table, key in zip(bins, keys(e)) if table[key][1] >= 5), None)
            if base is None:
                continue
            excess = e['B'] - base[0] / base[1]
            if prev['L'] >= cap - 5:
                high_boardings.append(e['B'])
            for offset, load in ((0, prev['L']), (2, opposite[j]['L'])):
                idx = offset if load >= cap - 5 else (offset + 1 if load < cap - 10 else None)
                if idx is not None:
                    daily[day][idx][0] += excess; daily[day][idx][1] += 1
    def calc(days):
        sums = [sum(daily[d][i][0] for d in days) for i in range(4)]
        counts = [sum(daily[d][i][1] for d in days) for i in range(4)]
        means = [s / n if n else None for s, n in zip(sums, counts)]
        naive = means[0] - means[2] if means[0] is not None and means[2] is not None else None
        did = means[0] - means[1] - means[2] + means[3] if all(x is not None for x in means) else None
        return naive, did, counts
    days = sorted({e['d'] for e in events})
    point = calc(days)
    rng = random.Random(seed)
    samples = [[], []]
    for _ in range(bootstrap):
        values = calc(rng.choices(days, k=len(days))) if days else (None, None, [])
        for i in range(2):
            if values[i] is not None: samples[i].append(values[i])
    def interval(a):
        a.sort()
        return [a[int(.025 * (len(a)-1))], a[int(.975 * (len(a)-1))]] if len(a) >= .9 * bootstrap and a else None
    return {'naive': point[0], 'did': point[1], 'counts': point[2],
            'naive_ci': interval(samples[0]), 'did_ci': interval(samples[1]),
            'bootstrap_valid': [len(a) for a in samples], 'days': len(days),
            'high_next_boardings_mean': sum(high_boardings) / len(high_boardings) if high_boardings else None}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--baseline', required=True); p.add_argument('--visible', required=True)
    p.add_argument('--output', required=True); p.add_argument('--cap', type=int, required=True)
    p.add_argument('--window', type=float, default=60); p.add_argument('--bootstrap', type=int, default=500)
    p.add_argument('--seed', type=int, default=20261111)
    a = p.parse_args()
    if a.cap <= 0 or a.window <= 0 or a.bootstrap <= 0: p.error('parameters must be positive')
    result = estimate(read(a.baseline), read(a.visible), a.cap, a.window, a.bootstrap, a.seed)
    with open(a.output, 'x', encoding='utf-8') as f: json.dump(result, f, ensure_ascii=False, indent=2)

if __name__ == '__main__': main()
