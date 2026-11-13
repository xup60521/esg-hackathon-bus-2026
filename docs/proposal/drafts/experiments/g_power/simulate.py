#!/usr/bin/env python3
"""Synthetic H2 design sensitivity; output directory must not exist."""
import argparse
import csv
from pathlib import Path
import numpy as np
from scipy.stats import spearmanr

p = argparse.ArgumentParser()
p.add_argument('--output', required=True, type=Path)
p.add_argument('--seed', type=int, default=20261111)
p.add_argument('--replicates', type=int, default=1000)
p.add_argument('--bootstrap', type=int, default=500)
a = p.parse_args()
a.output.mkdir(parents=False, exist_ok=False)
rng = np.random.default_rng(a.seed)
rows = []
for days in (8, 16, 18):
    for rate in (.05, .10, .20):
        passed = valid = 0
        widths = []
        for _ in range(a.replicates):
            # Six fixed combinations, balanced round-robin station-days. Independent dates.
            group = np.arange(days) % 6
            x = group.astype(float)
            prob = np.clip(rate + .04 * (x - 2.5), .005, .95)
            y = rng.binomial(12, prob) / 12
            rho = spearmanr(x, y).statistic
            if not np.isfinite(rho):
                continue
            boots = []
            # Resample independent combinations; keep all their days together.
            for __ in range(a.bootstrap):
                chosen = rng.integers(0, 6, 6)
                ids = np.concatenate([np.flatnonzero(group == k) for k in chosen])
                if np.unique(x[ids]).size < 2 or np.unique(y[ids]).size < 2:
                    continue
                b = spearmanr(x[ids], y[ids]).statistic
                if np.isfinite(b):
                    boots.append(b)
            if len(boots) < .9 * a.bootstrap:
                continue
            lo, hi = np.quantile(boots, [.025, .975])
            widths.append(hi-lo)
            valid += 1
            passed += lo > 0
        rows.append([days, rate, valid, passed/a.replicates, np.mean(widths) if widths else ''])
with (a.output / 'results.csv').open('x', newline='') as f:
    w = csv.writer(f)
    w.writerow(['station_days', 'baseline_rate', 'valid', 'lower_bound_positive_fraction_all_runs', 'mean_ci_width_valid'])
    w.writerows(rows)
