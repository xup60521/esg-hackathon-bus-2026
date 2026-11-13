#!/usr/bin/env python3
"""Hourly boarding backtest: published Stacking features vs. simple baselines.

Reproduces the three temporal features of 吳姿樺等 (2024,《運輸學刊》36(2))
on line 6670 card data, plus a tourism variant with weekly lags and the
DGPA day-off calendar. Run from the repository root via run.sh.
"""
from collections import defaultdict
import csv
from datetime import date, timedelta
import hashlib
import importlib.util
import json
from pathlib import Path
import statistics

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor, StackingRegressor
from sklearn.linear_model import RidgeCV
from sklearn.model_selection import KFold

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('forecast_baseline', HERE.parent / 'build.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

CALENDAR = HERE / 'dgpa-calendar-2024-2025.csv'
DOC = Path('docs/lab/forecast/hourly')
TRAIN_START = date(2024, 1, 29)  # first day with 28 prior calendar days
SERVICE_SHARE = 0.5  # hour kept if it has boardings on >= half of 2024H1 observed days

PAPER = ['hour', 'weekday', 'sameHourYesterday', 'totalYesterday']
TOURISM = PAPER + ['sameHourLastWeek', 'sameHourWeekdayMedian4', 'dayOff', 'dayOffYesterday', 'dayOffTomorrow']
# Fixed before evaluation. "realtime" adds the previous hour of the target day,
# which needs an hourly data feed this project does not have today.
CANDIDATES = {
    'paper_dayahead': PAPER,
    'paper_realtime': PAPER + ['previousHour'],
    'tourism_dayahead': TOURISM,
    'tourism_realtime': TOURISM + ['previousHour'],
}
BASELINES = {
    'yesterday_same_hour': 'sameHourYesterday',
    'last_week_same_hour': 'sameHourLastWeek',
    'weekday_median4_same_hour': 'sameHourWeekdayMedian4',
    'previous_hour': 'previousHour',
}
DAYAHEAD = ['yesterday_same_hour', 'last_week_same_hour', 'weekday_median4_same_hour',
            'paper_dayahead', 'tourism_dayahead']


def load_calendar(path=CALENDAR):
    with path.open(encoding='utf-8') as f:
        return {date.fromisoformat(r['date']): r['dayOff'] == '1' for r in csv.DictReader(f)}


def hourly_series(merged):
    """{date: [24 hourly boardings]} for days with any boarding; absent days stay missing."""
    series = defaultdict(lambda: [0] * 24)
    for (day, _route, _direction, _stop, hour), (board, _alight) in merged.items():
        if board > 0:
            series[date.fromisoformat(day)][hour] += board
    return dict(series)


def service_hours(series):
    days = [d for d in series if d < date(2024, 7, 1)]
    return [h for h in range(24) if sum(series[d][h] > 0 for d in days) >= SERVICE_SHARE * len(days)]


def features(series, days_off, d, h):
    """Only days before d, plus hours before h on d. Any missing prior day => None."""
    prior = [series.get(d - timedelta(days=k)) for k in range(1, 29)]
    if d not in series or any(p is None for p in prior):
        return None
    return {
        'hour': h, 'weekday': d.weekday(),
        'sameHourYesterday': prior[0][h], 'totalYesterday': sum(prior[0]),
        'sameHourLastWeek': prior[6][h],
        'sameHourWeekdayMedian4': statistics.median(prior[k - 1][h] for k in (7, 14, 21, 28)),
        'dayOff': int(days_off[d]), 'dayOffYesterday': int(days_off[d - timedelta(days=1)]),
        'dayOffTomorrow': int(days_off.get(d + timedelta(days=1), False)),
        # Real-time scenario only: previous hour of the target day itself.
        'previousHour': series[d][h - 1] if h > 0 else prior[0][23],
    }


def rows_between(series, days_off, hours, start, end):
    rows = []
    for d in base.calendar(start, end):
        for h in hours:
            x = features(series, days_off, d, h)
            if x is not None:
                rows.append({'date': d, 'hour': h, 'x': x, 'actual': series[d][h]})
    return rows


def make_model():
    return StackingRegressor(
        estimators=[('rf', RandomForestRegressor(n_estimators=100, min_samples_leaf=5, random_state=0, n_jobs=1)),
                    ('gbr', GradientBoostingRegressor(random_state=0)),
                    ('ridge', RidgeCV())],
        final_estimator=RidgeCV(), cv=KFold(5), n_jobs=1)


def matrix(rows, names):
    return np.asarray([[r['x'][n] for n in names] for r in rows], dtype=float)


def backtest(series, days_off, hours, start, end):
    """Retrain on the first of each month with all rows strictly before that day."""
    out, audits = [], []
    month = start
    while month <= end:
        nxt = (month.replace(day=28) + timedelta(days=4)).replace(day=1)
        train = rows_between(series, days_off, hours, TRAIN_START, month - timedelta(days=1))
        target = rows_between(series, days_off, hours, month, min(nxt - timedelta(days=1), end))
        for r in target:
            r['predictions'] = {m: float(r['x'][f]) for m, f in BASELINES.items()}
        for name, cols in CANDIDATES.items():
            model = make_model().fit(matrix(train, cols), [r['actual'] for r in train])
            if target:
                for r, p in zip(target, model.predict(matrix(target, cols))):
                    r['predictions'][name] = max(0.0, float(p))
        audits.append({'cutoffExclusive': str(month), 'trainingRows': len(train),
                       'trainingLastDate': str(train[-1]['date']) if train else None})
        out += target
        month = nxt
    return out, audits


def mape(rows, model):
    pairs = [(r['actual'], r['predictions'][model]) for r in rows if r['actual'] > 0]
    return sum(abs(p - y) / y for y, p in pairs) / len(pairs) if pairs else None


def score(rows, models, threshold):
    return {m: {**base.metrics(rows, m, threshold), 'mapePositiveHours': mape(rows, m)} for m in models}


def daily_rollup(rows, models):
    """Sum hourly predictions per day (service hours only) for day-ahead models."""
    days = defaultdict(lambda: {'actual': 0, 'predictions': defaultdict(float)})
    for r in rows:
        day = days[r['date']]
        day['actual'] += r['actual']
        for m in models:
            day['predictions'][m] += r['predictions'][m]
    return list(days.values())


def build():
    baseline = base.build(Path('data/midstop-months'), Path('public/data/midstop.json'))  # reconciles inputs
    merged, _provenance, _count = base.load(Path('data/midstop-months'))
    series = hourly_series(merged)
    days_off = load_calendar()
    hours = service_hours(series)
    pretest = [series[d][h] for d in series if d < base.TEST_START for h in hours]
    threshold = sorted(pretest)[int(0.9 * len(pretest)) - 1]
    models = [*BASELINES, *CANDIDATES]

    validation, val_audits = backtest(series, days_off, hours, base.VALIDATION_START, date(2024, 12, 31))
    test, test_audits = backtest(series, days_off, hours, base.TEST_START, base.END)
    val_scores = score(validation, models, threshold)
    # Day-ahead pick uses 2024H2 only; all candidates are still reported on 2025.
    selected = min(DAYAHEAD, key=lambda m: val_scores[m]['mae'])

    total = next(g for g in baseline['groups'] if g['id'] == 'total')
    daily_bt = {r['date']: r for r in total['backtest']}
    test_days = daily_rollup(test, DAYAHEAD)
    in_service = sum(r['actual'] for r in test) / sum(series[d][h] for d in {r['date'] for r in test} for h in range(24))
    monthly = {}
    for m in range(1, 13):
        subset = [r for r in test if r['date'].month == m]
        monthly[f'2025-{m:02}'] = {'rows': len(subset), **{k: v['wape'] for k, v in score(subset, models, threshold).items()}}
    return {
        'schemaVersion': 1, 'status': 'historical_backtest_not_current_forecast',
        'reference': '吳姿樺、洪百賢、蘇昭銘、林峰正、吳東凌、何毓芬（2024）。利用集成學習模式與不同時間特徵預測短期公車服務運量。運輸學刊，36(2)，153-186。',
        'target': 'hourly observed card boardings, line 6670 total, service hours only',
        'serviceHours': hours, 'serviceHourShareOfTestBoardings': in_service,
        'hourlyPeakThreshold2024P90': threshold,
        'protocol': {'validation': ['2024-07-01', '2024-12-31'], 'test': ['2025-01-01', '2025-12-31'],
                     'retraining': 'monthly, expanding window from 2024-01-29, rows strictly before month start',
                     'dayAheadAssumption': 'previous day fully available before the target day',
                     'realtimeAssumption': 'previous hour available before the target hour; not available in this project today',
                     'missing': 'any missing day in prior 28 days or target day => no row; all models share identical rows',
                     'stacking': 'RF(100, leaf 5) + GBR(default) + RidgeCV -> RidgeCV, KFold(5) without shuffle inside training data'},
        'candidates': CANDIDATES, 'baselines': BASELINES, 'dayAheadSelectedOnValidation': selected,
        'validationRows': len(validation), 'testRows': len(test),
        'validation': val_scores, 'test': score(test, models, threshold),
        'testDailyRollup': {'days': len(test_days), **score(test_days, DAYAHEAD, None)},
        'dailyBaselineSameDays': base.metrics(
            [daily_bt[str(d)] for d in sorted({r['date'] for r in test}) if daily_bt[str(d)]['predictions']['weekday_median4'] is not None],
            'weekday_median4', None),
        'monthlyTestWape': monthly,
        'audits': val_audits + test_audits,
        'inputs': {'calendarSha256': hashlib.sha256(CALENDAR.read_bytes()).hexdigest(),
                   'referenceSha256': baseline['referenceSha256']},
    }


def main():
    summary = build()
    DOC.mkdir(parents=True, exist_ok=True)
    (DOC / 'run-output.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    print(json.dumps({k: summary[k] for k in ('dayAheadSelectedOnValidation', 'testRows', 'test', 'testDailyRollup', 'dailyBaselineSameDays')},
                     ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
