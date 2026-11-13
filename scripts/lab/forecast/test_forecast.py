"""Algorithm and real aggregate reconciliation checks; run with unittest discovery."""
from datetime import date, timedelta
import json
from pathlib import Path
import tempfile
import unittest
from build import MODELS, build, load, metrics, predict


class ForecastTests(unittest.TestCase):
    def test_exact_calendar_lags_and_missing_abstention(self):
        target = date(2025,1,29)
        history = {target-timedelta(days=k):k for k in range(1,29)}
        self.assertEqual(predict(history,target,'seasonal7'),7)
        self.assertEqual(predict(history,target,'weekday_mean4'),17.5)
        self.assertEqual(predict(history,target,'mean28'),14.5)
        del history[target-timedelta(days=14)]
        self.assertIsNone(predict(history,target,'weekday_median4'))
        self.assertIsNone(predict(history,target,'mean28'))
        self.assertEqual(predict(history,target,'seasonal7'),7)

    def test_outlier_robustness_and_no_future_leakage(self):
        target = date(2025,2,1)
        history = {target-timedelta(days=7*k):v for k,v in enumerate([10,10,10,1000],1)}
        self.assertEqual(predict(history,target,'weekday_median4'),10)
        before = {m:predict(history,target,m) for m in MODELS}
        history[target] = 999999
        history[target+timedelta(days=1)] = 999999
        self.assertEqual(before,{m:predict(history,target,m) for m in MODELS})

    def test_zero_denominator_and_signed_bias(self):
        rows = [{'actual':0,'predictions':{'m':2}}]
        result = metrics(rows,'m',0)
        self.assertEqual(result['mae'],2)
        self.assertEqual(result['bias'],2)
        self.assertIsNone(result['wape'])
        self.assertIsNone(result['peakUnderforecastShare'])
        self.assertIsNone(metrics([],'m',None)['mae'])

    def test_month_boundary_merges_without_double_count_dedup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            row = ['2024-02-01','6670A','inbound','站',1,0,3]
            (root/'2024-01-01.json').write_text(json.dumps([row]))
            row2 = [*row[:5],2,1]
            (root/'2024-02-01.json').write_text(json.dumps([row2]))
            merged,_,n = load(root)
            self.assertEqual(merged[tuple(row[:5])],[2,4])
            self.assertEqual(n,2)
            (root/'2024-02-01.json').write_text(json.dumps([row2,row2]))
            with self.assertRaisesRegex(ValueError,'duplicate'):
                load(root)

    def test_real_data_reconciliation_and_time_support(self):
        result = build(Path('data/midstop-months'),Path('public/data/midstop.json'))
        self.assertTrue(result['quality']['referenceReconciled'])
        groups = {g['id']:g for g in result['groups']}
        total = groups['total']
        self.assertEqual(total['totalBoardings'],result['quality']['boardings'])
        for prefix in ('direction:','subroute:'):
            self.assertEqual(sum(g['totalBoardings'] for g in result['groups'] if g['id'].startswith(prefix)),total['totalBoardings'])
        for group in result['groups']:
            validation = group['validationMetrics']
            if group['selectedModel']:
                self.assertEqual(group['selectedModel'],min(MODELS,key=lambda m:validation[m]['mae']))
            for row in group['backtest']:
                self.assertEqual(row['commonSupport'],row['actual'] is not None and all(p is not None for p in row['predictions'].values()))
            for m in MODELS:
                self.assertEqual(sum(month['metrics'][m]['n'] for month in group['monthlyTest']),group['testCommonDays'])
            self.assertTrue(all(v is None or v >= 0 for _,v in group['daily']))
        # Missing actual and its downstream 28-calendar-day windows stay excluded.
        missing = next(r for r in total['backtest'] if r['date']=='2025-07-07')
        after = next(r for r in total['backtest'] if r['date']=='2025-07-08')
        self.assertIsNone(missing['actual'])
        self.assertFalse(after['commonSupport'])
        self.assertIsNone(after['predictions']['mean28'])


if __name__ == '__main__':
    unittest.main()
