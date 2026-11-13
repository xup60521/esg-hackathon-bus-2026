#!/usr/bin/env python3
"""Offline daily card-boarding baselines, Python standard library only.

Run from the repository root. No network, credentials or per-passenger records.
"""
import argparse
from collections import defaultdict
from datetime import date, timedelta
import hashlib
import json
import math
from pathlib import Path
import statistics

START = date(2024, 1, 1)
END = date(2025, 12, 31)
VALIDATION_START = date(2024, 7, 1)
TEST_START = date(2025, 1, 1)
MODELS = ('seasonal7', 'weekday_mean4', 'weekday_median4', 'mean28')


def calendar(start=START, end=END):
    return [start + timedelta(days=i) for i in range((end-start).days+1)]


def predict(history, target, model):
    """Read only dates strictly earlier than target; missing input => abstain."""
    offsets = [7] if model == 'seasonal7' else list(range(1, 29)) if model == 'mean28' else [7, 14, 21, 28]
    values = [history.get(target-timedelta(days=k)) for k in offsets]
    if any(v is None for v in values):
        return None
    return statistics.median(values) if model == 'weekday_median4' else statistics.mean(values)


def metrics(rows, model, peak_threshold):
    pairs = [(r['actual'], r['predictions'][model]) for r in rows]
    if not pairs:
        return {'n': 0, 'mae': None, 'rmse': None, 'wape': None, 'bias': None,
                'peakN': 0, 'peakUnderforecastShare': None}
    errors = [p-y for y, p in pairs]
    total = sum(y for y, p in pairs)
    peaks = [(y,p) for y,p in pairs if peak_threshold is not None and y >= peak_threshold]
    return {'n': len(pairs), 'mae': statistics.mean(abs(e) for e in errors),
            'rmse': math.sqrt(statistics.mean(e*e for e in errors)),
            'wape': sum(abs(e) for e in errors)/total if total else None,
            'bias': statistics.mean(errors), 'peakN': len(peaks),
            'peakUnderforecastShare': sum(max(y-p,0) for y,p in peaks)/sum(y for y,p in peaks)
            if sum(y for y,p in peaks) else None}


def load(source):
    merged = defaultdict(lambda: [0, 0])
    provenance = []
    row_count = 0
    for path in sorted(source.glob('*.json')):
        raw = path.read_bytes()
        rows = json.loads(raw)
        keys = set()
        for row in rows:
            if not isinstance(row,list) or len(row) != 7:
                raise ValueError(f'{path}: expected seven columns')
            day, route, direction, stop, hour, board, alight = row
            parsed = date.fromisoformat(day)
            if not START <= parsed <= END:
                raise ValueError(f'{path}: date outside declared observation window')
            if not all(isinstance(v,str) and v for v in (route, direction, stop)):
                raise ValueError(f'{path}: invalid labels')
            if direction not in ('inbound','outbound','unknown'):
                raise ValueError(f'{path}: unexpected direction')
            if type(hour) is not int or not 0 <= hour <= 23:
                raise ValueError(f'{path}: invalid hour')
            if any(type(v) is not int or v < 0 for v in (board, alight)):
                raise ValueError(f'{path}: invalid count')
            key = tuple(row[:5])
            if key in keys:
                raise ValueError(f'{path}: duplicate aggregate key within chunk')
            keys.add(key)
            merged[key][0] += board
            merged[key][1] += alight
        provenance.append({'path': str(path), 'sha256': hashlib.sha256(raw).hexdigest(), 'rows': len(rows)})
        row_count += len(rows)
    if not provenance:
        raise ValueError('No monthly inputs found')
    return merged, provenance, row_count


def build(source, public_reference):
    merged, provenance, row_count = load(source)
    # Read only aggregated reference. Never contact the underlying database.
    reference = json.loads(public_reference.read_text())
    ref = {}
    for r in reference['rows']:
        key = tuple(r[:5])
        if key in ref:
            raise ValueError('Duplicate key in public reference')
        ref[key] = r[5:]
    if dict(merged) != ref:
        raise ValueError('Monthly data does not reconcile exactly with public reference')
    series = defaultdict(lambda: defaultdict(int))
    all_events = set()
    boardings = alightings = unknown = 0
    for (day, route, direction, stop, hour), (b,a) in merged.items():
        d = date.fromisoformat(day)
        all_events.add(d)
        # Alighting-only days are not evidence of zero boarding coverage.
        if b > 0:
            for group in ('total', f'direction:{direction}', f'subroute:{route}'):
                series[group][d] += b
        boardings += b
        alightings += a
        if direction == 'unknown':
            unknown += b
    quality = {'inputRows': row_count, 'mergedRows': len(merged),
               'referenceReconciled': True, 'boardings': boardings, 'alightings': alightings,
               'unknownDirectionBoardings': unknown,
               'unknownDirectionShare': unknown/boardings if boardings else None,
               'calendarDays': len(calendar()), 'boardingObservedDays': len(series['total']),
               'missingBoardingDates': [str(d) for d in calendar() if d not in series['total']],
               'alightingOnlyDates': [str(d) for d in sorted(all_events) if d not in series['total']]}
    results = []
    for group, history in sorted(series.items()):
        pretest = [v for d,v in history.items() if d < TEST_START]
        threshold = sorted(pretest)[math.ceil(.9*len(pretest))-1] if pretest else None
        rows = []
        for d in calendar(VALIDATION_START):
            predictions = {m: predict(history,d,m) for m in MODELS}
            rows.append({'date': str(d), 'actual': history.get(d), 'predictions': predictions,
                         'commonSupport': d in history and all(p is not None for p in predictions.values())})
        validation = [r for r in rows if r['date'] < str(TEST_START) and r['commonSupport']]
        test = [r for r in rows if r['date'] >= str(TEST_START) and r['commonSupport']]
        vm = {m:metrics(validation,m,threshold) for m in MODELS}
        tm = {m:metrics(test,m,threshold) for m in MODELS}
        # No model selection on the held-out year. Abstain if validation support is small.
        selected = min(MODELS,key=lambda m:vm[m]['mae']) if len(validation) >= 28 else None
        monthly = []
        for month in range(1,13):
            prefix = f'2025-{month:02}'
            subset = [r for r in test if r['date'].startswith(prefix)]
            monthly.append({'month': prefix, 'metrics': {m:metrics(subset,m,threshold) for m in MODELS}})
        # Historical next-day demonstration only, never presented as a current forecast.
        target = END+timedelta(days=1)
        results.append({'id': group, 'observedDays':len(history),
                        'missingDays':len(calendar())-len(history),
                        'totalBoardings':sum(history.values()), 'peakThresholdTrainingP90':threshold,
                        'validationCommonDays':len(validation), 'testCommonDays':len(test),
                        'testObservedDays':sum(d in history for d in calendar(TEST_START)),
                        'individualSupportMetrics':{
                            split:{m:metrics([r for r in rows if lo <= r['date'] <= hi
                                            and r['actual'] is not None and r['predictions'][m] is not None],m,threshold)
                                   for m in MODELS}
                            for split,lo,hi in [('validation','2024-07-01','2024-12-31'),
                                                ('test','2025-01-01','2025-12-31')]},
                        'selectedModel':selected, 'validationMetrics':vm, 'testMetrics':tm,
                        'monthlyTest':monthly, 'backtest':rows,
                        'daily':[[str(d),history.get(d)] for d in calendar()],
                        'historicalNextDay':{'date':str(target), 'origin':str(END),
                            'model':selected, 'prediction':predict(history,target,selected) if selected else None,
                            'status':'historical_demo_not_current_forecast'}})
    return {'schemaVersion':1, 'target':'daily_observed_card_boardings', 'timezone':'Asia/Taipei',
            'observationWindow':[str(START),str(END)],
            'protocol':{'horizonDays':1, 'availabilityAssumption':'previous calendar day aggregate available before prediction',
                        'validationWindow':[str(VALIDATION_START),'2024-12-31'],
                        'testWindow':[str(TEST_START),str(END)],
                        'modelSelection':'per group lowest validation MAE; at least 28 common validation days',
                        'evaluation':'rolling one day ahead, all models on identical valid dates',
                        'missing':'null; no zero filling, no fallback, all required lags must exist',
                        'models':{'seasonal7':'y[t-7]', 'weekday_mean4':'mean(y[t-7],y[t-14],y[t-21],y[t-28])',
                                  'weekday_median4':'median(y[t-7],y[t-14],y[t-21],y[t-28])',
                                  'mean28':'mean(y[t-1]..y[t-28])'},
                        'peakMetric':'sum(max(actual-prediction,0)) / sum(actual) on days >= training P90'},
            'quality':quality, 'sources':provenance,
            'referenceSha256':hashlib.sha256(public_reference.read_bytes()).hexdigest(),
            'warnings':['成功刷卡搭乘人次，不是完整需求、候車或拒載人數。',
                        '缺日原因未知；有紀錄日也可能不完整。',
                        '2025 回測每日可使用前一天已揭露的實際值，不是年初一次預測全年。',
                        '方向由站序推定，unknown 未分配到已知方向。',
                        '支線與方向為不同邊際分組，不可把所有分組相加。',
                        '資料終點為 2025-12-31，不能當作現行營運預測。'],
            'groups':results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=Path('data/midstop-months'))
    parser.add_argument('--reference',type=Path,default=Path('public/data/midstop.json'))
    parser.add_argument('--output',type=Path,default=Path('public/data/lab/forecast/results.json'))
    args = parser.parse_args()
    # All output remains inside the authorized forecast subtree.
    allowed = Path('public/data/lab/forecast').resolve()
    if not args.output.resolve().is_relative_to(allowed):
        parser.error('--output must remain inside public/data/lab/forecast')
    result = build(args.source,args.reference)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n')
    summary = {**result, 'groups':[{k:v for k,v in g.items() if k not in ('daily','backtest')}
                                  for g in result['groups']]}
    args.output.with_name('summary.json').write_text(json.dumps(summary,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n')
    print(json.dumps({'quality':result['quality'], 'groups':[
        {'id':g['id'],'selected':g['selectedModel'],'validationDays':g['validationCommonDays'],
         'testDays':g['testCommonDays'],'test':g['testMetrics'][g['selectedModel']] if g['selectedModel'] else None}
        for g in result['groups']]},ensure_ascii=False,indent=2))

if __name__ == '__main__':
    main()
