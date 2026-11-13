from datetime import date, timedelta
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('hourly', Path(__file__).with_name('build.py'))
hourly = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hourly)

TARGET = date(2024, 3, 1)


def fixture():
    series = {TARGET - timedelta(days=k): [k + h for h in range(24)] for k in range(0, 40)}
    days_off = {d: d.weekday() >= 5 for d in hourly.base.calendar()}
    return series, days_off


class HourlyFeatureTest(unittest.TestCase):
    def test_no_target_or_future_leakage(self):
        series, days_off = fixture()
        before = hourly.features(series, days_off, TARGET, 10)
        series[TARGET][10:] = [999] * 14
        series[TARGET + timedelta(days=1)] = [999] * 24
        self.assertEqual(before, hourly.features(series, days_off, TARGET, 10))

    def test_previous_hour_reads_only_hour_before(self):
        series, days_off = fixture()
        self.assertEqual(hourly.features(series, days_off, TARGET, 10)['previousHour'], series[TARGET][9])

    def test_missing_prior_day_abstains(self):
        series, days_off = fixture()
        del series[TARGET - timedelta(days=20)]
        self.assertIsNone(hourly.features(series, days_off, TARGET, 10))

    def test_lags(self):
        series, days_off = fixture()
        x = hourly.features(series, days_off, TARGET, 5)
        self.assertEqual(x['sameHourYesterday'], 1 + 5)
        self.assertEqual(x['totalYesterday'], sum(1 + h for h in range(24)))
        self.assertEqual(x['sameHourLastWeek'], 7 + 5)
        self.assertEqual(x['sameHourWeekdayMedian4'], (14 + 21) / 2 + 5)


if __name__ == '__main__':
    unittest.main()
