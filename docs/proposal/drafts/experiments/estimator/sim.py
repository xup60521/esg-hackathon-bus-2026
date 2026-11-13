#!/usr/bin/env python3
"""Synthetic route; visible and truth JSONL files are created exclusively."""
import argparse
import json
import math
import random
from pathlib import Path


def poisson(rng, mean):
    if mean <= 0:
        return 0
    limit = math.exp(-mean)
    product, n = 1.0, 0
    while product > limit:
        n += 1
        product *= rng.random()
    return n - 1


def binomial(rng, n, p):
    return sum(rng.random() < p for _ in range(n))


def run(args):
    rng = random.Random(args.seed)
    tracking = getattr(args, "track_sources", False)
    visible_path, truth_path = Path(args.visible), Path(args.truth)
    # Exclusive opens protect existing results; remove only our empty first file
    # if opening the second fails.
    with visible_path.open('x', encoding='utf-8') as visible:
        try:
            truth = truth_path.open('x', encoding='utf-8')
        except BaseException:
            visible_path.unlink()
            raise
        with truth:
            for day in range(args.days):
                shock = math.exp(rng.gauss(-args.shock ** 2 / 2, args.shock))
                for direction in (-1, 1):
                    queue = [0] * args.stops
                    sources = [[] for _ in range(args.stops)]
                    minute = 360.0
                    for bus in range(args.buses):
                        gap = rng.uniform(args.gap_min, args.gap_max)
                        minute += gap
                        hour = int(minute // 60) % 24
                        peak = 1.6 if 7 <= hour < 10 or 16 <= hour < 19 else 1.0
                        load = poisson(rng, args.initial_load)
                        load = min(load, args.cap)
                        for stop in range(args.stops):
                            load -= binomial(rng, load, args.alight)
                            before = load
                            fresh = poisson(rng, args.demand * gap / 30 * peak * shock)
                            carried = queue[stop]
                            available = args.cap - load
                            # Existing queue boards first; voluntary wait applies only to fresh arrivals.
                            boarded_old = min(carried, available)
                            available -= boarded_old
                            willing = binomial(rng, fresh, 1 - args.voluntary)
                            boarded_new = min(willing, available)
                            denied = carried - boarded_old + willing - boarded_new
                            voluntary = fresh - willing
                            next_queue = binomial(rng, denied, args.a) + voluntary
                            abandoned = binomial(rng, denied - next_queue + voluntary,
                                                 args.b / (1 - args.a) if args.a < 1 else 0)
                            if tracking:
                                old_sources = sources[stop]
                                boarded_sources = old_sources[:boarded_old]
                                # Every person denied by this bus now has this bus as source.
                                sources[stop] = [bus] * (next_queue - voluntary) + [None] * voluntary
                                true_carryover_boarded = boarded_sources.count(bus - 1)
                                true_left_behind = denied
                            queue[stop] = next_queue
                            boarded = boarded_old + boarded_new
                            load += boarded
                            event = dict(d=day, s=stop, dir=direction, time=minute,
                                         h=hour, L=before, B=boarded, v=bus)
                            # As in reconstructed AFC, no boarding means no visible event.
                            if boarded:
                                visible.write(json.dumps(event) + '\n')
                            extra = dict(true_carryover_boarded=true_carryover_boarded, true_left_behind=true_left_behind) if tracking else {}
                            truth.write(json.dumps(dict(**event, **extra, fresh=fresh, carried=carried,
                                boarded_carryover=boarded_old, denied=denied,
                                voluntary=voluntary, abandoned=abandoned, next_queue=next_queue,
                                gap=gap, shock=shock)) + '\n')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--track-sources', action='store_true')
    p.add_argument('--visible', required=True)
    p.add_argument('--truth', required=True)
    p.add_argument('--seed', type=int, required=True)
    p.add_argument('--days', type=int, default=365)
    p.add_argument('--stops', type=int, default=4)
    p.add_argument('--buses', type=int, default=28)
    p.add_argument('--cap', type=int, choices=[37, 38, 42, 43], required=True)
    p.add_argument('--a', type=float, required=True)
    p.add_argument('--b', type=float, required=True)
    p.add_argument('--shock', type=float, required=True)
    p.add_argument('--gap-min', type=float, default=15)
    p.add_argument('--gap-max', type=float, default=45)
    p.add_argument('--demand', type=float, default=7)
    p.add_argument('--initial-load', type=float, default=25)
    p.add_argument('--alight', type=float, default=.08)
    p.add_argument('--voluntary', type=float, default=0)
    a = p.parse_args()
    if not (0 <= a.a <= 1 and 0 <= a.b <= 1 and a.a + a.b <= 1 and
            0 <= a.alight <= 1 and 0 <= a.voluntary <= 1 and a.shock >= 0 and
            a.days > 0 and a.stops > 0 and a.buses > 0 and
            0 < a.gap_min <= a.gap_max and a.demand >= 0 and a.initial_load >= 0):
        p.error('invalid parameters')
    run(a)


if __name__ == '__main__':
    main()
