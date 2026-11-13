#!/usr/bin/env python3
"""Extract reconstructed arrivals once. Output must not already exist."""
import datetime, json, sqlite3, sys
from itertools import groupby
from pathlib import Path

if len(sys.argv) != 3:
    raise SystemExit('usage: run2.py DATABASE NEW_ARRIVALS.jsonl')
root = Path(__file__).resolve().parents[5]
orders = {s['name']: s['order'] for s in json.loads((root / 'public/geo/stops.json').read_text())}
db = sqlite3.connect(Path(sys.argv[1]).resolve().as_uri() + '?mode=ro', uri=True)
query = '''select vehicle, board_date, board_ts, alight_ts, board_stop, alight_stop
from trips where board_date >= '2024-01-01' and board_date < '2026-01-01'
and alight_ts is not null order by vehicle, board_date'''
count = 0
with open(sys.argv[2], 'x', encoding='utf-8') as output:
    for (vehicle, day), trips in groupby(db.execute(query), key=lambda row: row[:2]):
        events = []
        for _, _, b, a, s, t in trips:
            if b is None or s == t or not 180 <= a-b <= 14400:
                continue
            direction = ((orders[t] > orders[s]) - (orders[t] < orders[s])) if s in orders and t in orders else 0
            events.append((b, 1, s, direction))
            events.append((a, -1, t, 0))
        events.sort(key=lambda x: (x[0], x[1]))
        load = 0
        arrivals = []
        current = None
        for ts, delta, stop, direction in events:
            if delta < 0:
                load -= 1
                continue
            if current is None or stop != current['s'] or ts-current['last'] > 600:
                current = dict(v=vehicle, d=day, s=stop, time=ts, last=ts, L=load, B=0, vote=0)
                arrivals.append(current)
            current['last'] = ts
            current['B'] += 1
            current['vote'] += direction
            load += 1
        for row in arrivals:
            vote = row.pop('vote')
            row['dir'] = (vote > 0) - (vote < 0)
            if not row['dir']:
                continue
            dt = datetime.datetime.fromtimestamp(row['time'], datetime.timezone(datetime.timedelta(hours=8)))
            row['h'] = dt.hour
            row['weekend'] = int(dt.weekday() >= 5)
            output.write(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n')
            count += 1
print('arrivals:', count)
