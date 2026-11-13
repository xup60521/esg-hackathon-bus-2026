#!/usr/bin/env python3
"""Fixed candidate screen; not a simulation or an estimate of denied boarding."""
import csv
import sqlite3
import sys

if len(sys.argv) != 2:
    raise SystemExit('Usage: python3 -I screen.py /absolute/path/to/trips.db')
from pathlib import Path
uri = Path(sys.argv[1]).resolve().as_uri() + '?mode=ro'
con = sqlite3.connect(uri, uri=True)
query = """
SELECT count(*), count(DISTINCT board_date),
       count(DISTINCT vehicle || ':' || board_date),
       group_concat(DISTINCT subroute)
FROM trips
WHERE board_stop = ? AND alight_stop IN ('埔里站','高鐵臺中站','臺中')
  AND strftime('%w', board_date) = '0'
  AND CAST(strftime('%H', board_ts, 'unixepoch', '+8 hours') AS INTEGER) BETWEEN 13 AND 17
  AND alight_ts > board_ts
"""
w = csv.writer(sys.stdout, lineterminator='\n')
w.writerow(['站','成功刷卡旅次','有紀錄週日數','車號日期組合數','支線'])
for stop in ('九族文化村', '桃米坑', '崎下'):
    w.writerow([stop, *con.execute(query, (stop,)).fetchone()])
