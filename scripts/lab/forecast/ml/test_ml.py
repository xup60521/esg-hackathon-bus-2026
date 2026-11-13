"""Run separately from baseline discovery to avoid module-name collision."""
from datetime import date, timedelta
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('forecast_ml',Path(__file__).with_name('build.py'))
ml = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ml)


class MLTests(unittest.TestCase):
    def history(self):
        return {d:100+10*d.weekday()+((d-ml.base.START).days % 17) for d in ml.base.calendar()}

    def test_calendar_features_and_future_immunity(self):
        history = self.history()
        target = date(2024,8,1)
        x = ml.features(history,target)
        self.assertEqual(x[0],history[target-timedelta(days=1)])
        self.assertEqual(x[3],history[target-timedelta(days=7)])
        history[target] = 999999
        history[target+timedelta(days=1)] = 999999
        self.assertEqual(x,ml.features(history,target))
        del history[target-timedelta(days=14)]
        self.assertIsNone(ml.features(history,target))

    def test_nonpositive_lag_is_not_zero_filled(self):
        history = self.history()
        target = date(2024,8,1)
        history[target-timedelta(days=1)] = 0
        self.assertIsNone(ml.features(history,target))
        self.assertIsNone(ml.predict(None,ml.CANDIDATES['raw_squared'],None))

    def test_training_cutoff_and_fitted_learning(self):
        history = self.history()
        cutoff = date(2024,7,1)
        candidate = ml.CANDIDATES['raw_squared']
        model,audit = ml.fit(history,cutoff,candidate)
        x = ml.features(history,cutoff)
        prediction = ml.predict(model,candidate,x)
        # Changing target and all future actuals cannot change fitted trees or forecast.
        changed = {d:(y if d < cutoff else y*100) for d,y in history.items()}
        again,audit2 = ml.fit(changed,cutoff,candidate)
        self.assertEqual(audit,audit2)
        self.assertEqual(prediction,ml.predict(again,candidate,ml.features(changed,cutoff)))
        self.assertEqual(audit['trainingLastTarget'],'2024-06-30')
        self.assertEqual(audit['trainingRows'],154)
        self.assertEqual(audit['treeCount'],100)
        # Fitting a changed response genuinely changes the learned function.
        doubled,_ = ml.fit({d:2*y for d,y in history.items()},cutoff,candidate)
        self.assertGreater(ml.predict(doubled,candidate,[v*2 if i<11 else v for i,v in enumerate(x)]),prediction*1.8)

    def test_selection_validation_only_and_tie_order(self):
        def rows(actual):
            return [{'date':'2024-08-01','actual':actual,'commonSupport':True,
                     'predictions':{name:i+10 for i,name in enumerate(ml.CANDIDATES)}} for _ in range(28)]
        self.assertEqual(ml.select(rows(10),100)[0],'raw_squared')
        tied = rows(10)
        for r in tied:
            r['predictions'] = dict.fromkeys(ml.CANDIDATES,10)
        self.assertEqual(ml.select(tied,100)[0],'raw_squared')
        with self.assertRaises(ValueError):
            ml.select(tied[:27],100)

    def test_peak_underestimate_and_coverage_are_distinct(self):
        rows = [{'actual':100,'predictions':{'m':80},'commonSupport':True},
                {'actual':50,'predictions':{'m':None},'commonSupport':False},
                {'actual':None,'predictions':{'m':10},'commonSupport':False}]
        result = ml.evaluate(rows,['m'],90)
        self.assertEqual(result['metrics']['m']['peakUnderforecastShare'],.2)
        self.assertEqual(result['metrics']['m']['wape'],.2)
        self.assertEqual(result['availability']['m']['observedDayCoverage'],.5)
        self.assertEqual(result['availability']['m']['predictedCalendarDays'],2)

    def test_real_artifact_contract_and_fair_support(self):
        summary = json.loads((ml.OUT/'summary.json').read_text())
        results = json.loads((ml.OUT/'results.json').read_text())
        selected = summary['selectedModel']
        self.assertEqual(summary['test']['commonDays'],336)
        self.assertEqual(summary['validation']['commonDays'],96)
        self.assertEqual(summary['test']['observedDays'],364)
        baseline = summary['test']['metrics']['weekday_median4']
        self.assertAlmostEqual(baseline['mae'],291.53,places=2)
        self.assertAlmostEqual(baseline['wape'],.1128,places=4)
        self.assertEqual(selected,min(ml.CANDIDATES,key=lambda m:summary['validationCandidateMetrics'][m]['mae']))
        for row in results['test']:
            self.assertEqual(row['commonSupport'],row['actual'] is not None and all(p is not None for p in row['predictions'].values()))
            self.assertLess(row['trainingCutoffExclusive'],row['date'][:7]+'-02')
        july8 = next(r for r in results['test'] if r['date']=='2025-07-08')
        self.assertIsNone(july8['predictions'][selected])
        self.assertEqual(sum(m['commonDays'] for m in summary['monthlyTest']),336)
        for audit in summary['trainingAudits']:
            self.assertLess(audit['trainingLastTarget'],audit['cutoffExclusive'])
        for model,metric in summary['test']['metrics'].items():
            self.assertEqual(metric['n'],336)
        self.assertEqual(len([a for a in summary['trainingAudits'] if a['cutoffExclusive'].startswith('2025')]),12)


if __name__ == '__main__':
    unittest.main()
