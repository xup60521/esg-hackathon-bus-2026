#!/usr/bin/env python3
"""Event-level scenario, using seats build outputs and read-only trips database."""
import csv, datetime as dt, json, math, sqlite3, sys
from collections import defaultdict
from pathlib import Path
ROOT = Path(__file__).resolve().parents[5]
DB = Path(sys.argv[1]).resolve()
OUT = Path(__file__).resolve().parent
stops = json.loads((ROOT/'public/geo/stops.json').read_text())
order = {s['name']: s['order'] for s in stops}
target = order['九族文化村']
summary = json.loads((ROOT/'public/data/lab/seats/summary.json').read_text())
idx = summary['stops'].index('九族文化村')
cal = json.loads((ROOT/'public/data/lab/visualization/calendar.json').read_text())['days']
events = defaultdict(list)
for year in (2024, 2025):
 for month in range(1,13):
  data = json.loads((ROOT/f'public/data/lab/seats/arrivals-{year}-{month:02}.json').read_text())
  for day, stop, minute, subroute, direction, load, boarded in data['rows']:
   date = f'{year}-{month:02}-{day:02}'
   if stop == idx and direction == 1 and 780 <= minute < 1080 and dt.date.fromisoformat(date).weekday() == 6 and cal[date]['rest']:
    events[date].append((minute, load, boarded))
# Fixed half-hour bin, training-year aggregate B; earliest bin wins ties.
bins = [sum(b for d, ev in events.items() if d.startswith('2024') for t,l,b in ev if k <= t < k+30) for k in range(780,1080,30)]
peak = 780 + 30 * bins.index(max(bins)) + 15
con = sqlite3.connect(DB.as_uri()+'?mode=ro', uri=True)
up = defaultdict(list)
q = """SELECT board_date, board_ts, board_stop, alight_stop FROM trips WHERE board_date >= '2025-01-01' AND board_date < '2026-01-01' AND alight_ts-board_ts BETWEEN 180 AND 14400 AND board_stop != alight_stop"""
for date, ts, origin, dest in con.execute(q):
 if date in events and origin in order and dest in order and order[origin] > target and order[dest] < target:
  minute = (int(ts)+28800)%86400//60
  if 780 <= minute < 1080: up[date].append((minute,origin))
con.close()
def sim(ev, c, h, extra, u, when):
 # New demand appears at each observed arrival, including fractional hidden demand.
 q=0.; wait=0.; left_events=0; left_people=0.; last=780
 sequence=[(t,0,l,b) for t,l,b in ev]
 if extra: sequence.append((when,1,0,0))
 for t,kind,l,b in sorted(sequence):
  wait += q*(t-last); last=t
  if kind: seats=max(0,c-u)
  else: q += b*(1+h); seats=max(0,c-l)
  q=max(0,q-seats)
  if q>1e-9: left_events+=1; left_people+=q
 wait += q*(1080-last)
 return wait, left_events, left_people, q
rows=[]
for d in sorted(x for x in events if x.startswith('2025')):
 ev=sorted(events[d])
 for c in (37,38,42,43):
  for h in (0,.1,.25):
   for shift in (-60,0,60):
    when=max(780,min(1079,peak+shift))
    eligible=sum(1 for t,o in up[d] if abs((t+30)-when)<=60)
    for share in (0,.2,.4):
     u=min(c,math.floor(eligible*share+.5))
     for arm in (0,1,2):
      actual_u=u if arm==1 else 0
      w,e,p,q=sim(ev,c,h,arm!=0,actual_u,when)
      rows.append([d,c,h,shift,share,arm,when,eligible,actual_u,w,e,p,q])
with (OUT/'event-results-v2.csv').open('w',newline='') as f:
 w=csv.writer(f); w.writerow(['date','capacity','hidden','shift_minutes','upstream_share','arm','extra_minute','eligible_upstream','upstream_extra','queue_person_minutes','left_events','left_person_events','end_queue']); w.writerows(rows)
print('events',len(events),'train',sum(d.startswith('2024') for d in events),'test',sum(d.startswith('2025') for d in events),'train bins',bins,'peak',peak)
for arm in (0,1,2):
 a=[r for r in rows if r[1:6]==[43,0,0,.2,arm]]
 print('arm',arm,'n',len(a))
 for i in (8,9,10,11,12):
  vals=sorted(r[i] for r in a)
  print(i, [round(vals[round((len(vals)-1)*p)],2) for p in (.1,.5,.9)])
