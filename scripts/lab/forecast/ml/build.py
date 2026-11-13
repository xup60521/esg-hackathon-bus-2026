#!/usr/bin/env python3
"""Train deterministic boosting offline; invoke from checkout root with pinned uv packages."""
from datetime import date, timedelta
import hashlib
import importlib.metadata
import importlib.util
import json
import math
from pathlib import Path
import platform
import statistics

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor

BASE_PATH = Path(__file__).resolve().parents[1] / 'build.py'
spec = importlib.util.spec_from_file_location('forecast_baseline', BASE_PATH)
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
OUT = Path('public/data/lab/forecast/ml')
DOC = Path('docs/lab/forecast/ml')
FEATURES = ['lag1', 'lag2', 'lag3', 'lag7', 'lag14', 'lag21', 'lag28',
            'mean7', 'mean28', 'std28', 'weekdayMedian4', 'weekdaySin', 'weekdayCos',
            'annualSin', 'annualCos', 'elapsedDays']
# Fixed before any held-out evaluation. No hyperparameter search on 2025.
CANDIDATES = {
    'raw_squared': {'residual': False, 'loss': 'squared_error'},
    'raw_absolute': {'residual': False, 'loss': 'absolute_error'},
    'residual_squared': {'residual': True, 'loss': 'squared_error'},
    'residual_absolute': {'residual': True, 'loss': 'absolute_error'},
}
PARAMS = dict(n_estimators=100, learning_rate=0.05, max_depth=2,
              min_samples_leaf=10, random_state=0)


def features(history, target):
    """Require each previous calendar day, never impute or read target/future values."""
    previous = [history.get(target-timedelta(days=k)) for k in range(1,29)]
    if any(v is None or v <= 0 for v in previous):
        return None
    weekday_median = statistics.median(previous[k-1] for k in (7,14,21,28))
    annual = 2*math.pi*(target.timetuple().tm_yday-1)/(366 if target.year == 2024 else 365)
    weekday = 2*math.pi*target.weekday()/7
    return [previous[k-1] for k in (1,2,3,7,14,21,28)] + [
        statistics.mean(previous[:7]), statistics.mean(previous), statistics.pstdev(previous),
        weekday_median, math.sin(weekday), math.cos(weekday), math.sin(annual), math.cos(annual),
        (target-base.START).days]


def fit(history, cutoff, candidate):
    """Expanding window, targets in [2024-01-29, cutoff), no early stopping."""
    dates = [d for d in sorted(history) if d < cutoff and history[d] > 0 and features(history,d) is not None]
    if len(dates) < 60:
        raise ValueError('At least 60 complete historical training rows required')
    x = np.asarray([features(history,d) for d in dates], dtype=float)
    offset = x[:, FEATURES.index('weekdayMedian4')] if candidate['residual'] else np.zeros(len(dates))
    y = np.asarray([history[d] for d in dates], dtype=float)-offset
    model = GradientBoostingRegressor(**PARAMS, loss=candidate['loss']).fit(x,y)
    predicted = np.maximum(0, model.predict(x)+offset)
    audit = {'cutoffExclusive': str(cutoff), 'trainingFirstTarget': str(dates[0]),
             'trainingLastTarget': str(dates[-1]), 'trainingRows': len(dates),
             'trainingMae': float(np.mean(np.abs(predicted-np.asarray([history[d] for d in dates])))),
             'treeCount': len(model.estimators_),
             'featureImportances': dict(zip(FEATURES,map(float,model.feature_importances_)))}
    return model, audit


def predict(model, candidate, x):
    if x is None:
        return None
    offset = x[FEATURES.index('weekdayMedian4')] if candidate['residual'] else 0
    return max(0.0, float(model.predict(np.asarray([x]))[0])+offset)


def backtest(history, start, end, candidates):
    rows, audits = [], []
    models = {}
    for d in base.calendar(start,end):
        if not models or d.day == 1:
            models = {}
            for name, candidate in candidates.items():
                model,audit = fit(history,d.replace(day=1),candidate)
                models[name] = model
                audits.append({'model':name,**audit})
        x = features(history,d)
        predictions = {m:base.predict(history,d,m) for m in base.MODELS}
        predictions.update({m:predict(models[m],c,x) for m,c in candidates.items()})
        rows.append({'date':str(d), 'actual':history.get(d), 'predictions':predictions,
                     'commonSupport': history.get(d) is not None and all(p is not None for p in predictions.values()),
                     'trainingCutoffExclusive':str(d.replace(day=1))})
    return rows,audits


def select(validation, threshold):
    common = [r for r in validation if r['commonSupport']]
    scores = {m:base.metrics(common,m,threshold) for m in CANDIDATES}
    if len(common) < 28:
        raise ValueError('Insufficient common validation days')
    return min(CANDIDATES,key=lambda m:scores[m]['mae']),scores


def evaluate(rows, names, threshold):
    common = [r for r in rows if r['commonSupport']]
    observed = sum(r['actual'] is not None for r in rows)
    return {'calendarDays':len(rows),'observedDays':observed,'commonDays':len(common),
            'metrics':{m:base.metrics(common,m,threshold) for m in names},
            'availability':{m:{
                'predictedCalendarDays':sum(r['predictions'][m] is not None for r in rows),
                'evaluatedObservedDays':sum(r['actual'] is not None and r['predictions'][m] is not None for r in rows),
                'observedDayCoverage':sum(r['actual'] is not None and r['predictions'][m] is not None for r in rows)/observed if observed else None,
                'individualSupportMetrics':base.metrics([r for r in rows if r['actual'] is not None and r['predictions'][m] is not None],m,threshold),
            } for m in names}}


def build():
    # Reuse the read-only authoritative parser and reconciliation. Do not rewrite baseline outputs.
    baseline = base.build(Path('data/midstop-months'),Path('public/data/midstop.json'))
    total = next(g for g in baseline['groups'] if g['id']=='total')
    history = {date.fromisoformat(d):y for d,y in total['daily'] if y is not None}
    threshold = total['peakThresholdTrainingP90']
    validation,audits = backtest(history,base.VALIDATION_START,date(2024,12,31),CANDIDATES)
    selected,scores = select(validation,threshold)
    # Selection frozen here, before even computing a single test prediction.
    test,test_audits = backtest(history,base.TEST_START,base.END,{selected:CANDIDATES[selected]})
    names = [*base.MODELS,selected]
    evaluation = evaluate(test,names,threshold)
    monthly = [{'month':f'2025-{m:02}', **evaluate([r for r in test if r['date'].startswith(f'2025-{m:02}')],names,threshold)} for m in range(1,13)]
    summary = {
        'schemaVersion':1,'experiment':'A-008-direction1-ml','target':baseline['target'],
        'group':'total','timezone':'Asia/Taipei','status':'historical_backtest_not_current_forecast',
        'selectedModel':selected,'baselineSelectedModel':total['selectedModel'],
        'protocol':{'validationWindow':['2024-07-01','2024-12-31'], 'testWindow':['2025-01-01','2025-12-31'],
                    'horizonDays':1,'retraining':'first calendar day of each month; expanding targets from 2024-01-29 through preceding day, complete lag windows only',
                    'availabilityAssumption':baseline['protocol']['availabilityAssumption'],
                    'selection':'lowest 2024 common validation MAE; fixed candidate insertion order for ties; 2025 never used to select',
                    'missing':'null; any missing/nonpositive lag in prior 28 calendar days causes abstention; missing/nonpositive target excluded',
                    'comparison':'all four statistical baselines and selected ML on identical dates',
                    'coverage':'prediction availability on observed days; not prediction interval coverage',
                    'peakMetric':baseline['protocol']['peakMetric'], 'intervals':None},
        'model':{'estimator':'sklearn.ensemble.GradientBoostingRegressor','parameters':PARAMS,
                 'candidates':CANDIDATES,'features':FEATURES,'predictionFloor':0,
                 'residualDefinition':'target minus prior four same-weekday median; add median back at prediction'},
        'validationCandidateMetrics':scores,
        'validation':evaluate(validation,[*base.MODELS,*CANDIDATES],threshold),
        'test':evaluation,'monthlyTest':monthly,'peakThreshold2024P90':threshold,
        'quality':baseline['quality'],'sources':baseline['sources'],
        'referenceSha256':baseline['referenceSha256'],
        'codeSha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path('scripts/lab/forecast/build.py'),Path('scripts/lab/forecast/ml/build.py')]},
        'runtime':{'python':platform.python_version(), **{p:importlib.metadata.version(p) for p in ('scikit-learn','numpy','scipy','joblib','threadpoolctl')}},
        'trainingAudits':audits+test_audits,
        'warnings':['刷卡成功搭乘量不是完整需求、候車、拒載或應增班數。','缺日原因未知；有紀錄日也可能不完整。',
                    '只有總量；沒有可靠假日、天氣、班表或容量特徵。','未建立預測區間；coverage 只表示能出預測的日期比例。',
                    '日更實際值假設可在隔日前取得。2025 年是逐日一步回測，並非年初一次預測全年。',
                    '2024 下半年僅少量共同驗證日，年度季節特徵未經跨年度驗證。不得直接用於現行營運。']}
    return summary,{'schemaVersion':1,'summaryPath':'/data/lab/forecast/ml/summary.json','validation':validation,'test':test}


def main():
    summary,results = build()
    OUT.mkdir(parents=True,exist_ok=True)
    DOC.mkdir(parents=True,exist_ok=True)
    for name,value in [('summary',summary),('results',results)]:
        (OUT/f'{name}.json').write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n')
    receipt = {k:summary[k] for k in ('selectedModel','validationCandidateMetrics','test','runtime')}
    (DOC/'run-output.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
    print(json.dumps(receipt,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
