#!/usr/bin/env python3
"""Read-only reproduction: python gate_walkthrough.py DATABASE; stdout only."""
import sys, sqlite3, datetime, json
from pathlib import Path
from collections import defaultdict
if len(sys.argv) != 2:
    raise SystemExit('usage: gate_walkthrough.py DATABASE')
root=Path(__file__).resolve().parents[4]
orders={x['name']:x['order'] for x in json.loads((root/'public/geo/stops.json').read_text())}
conn=sqlite3.connect(Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True)
rows=defaultdict(list)
for v,d,b,a,s,t in conn.execute("select vehicle,board_date,board_ts,alight_ts,board_stop,alight_stop from trips where board_date >= '2025-01-01' and board_date < '2026-01-01' and alight_ts is not null"):
    if b is not None and s!=t and 180<=a-b<=14400: rows[v,d].append((b,a,s,t))
conn.close()
days=defaultdict(list)
tz=datetime.timezone(datetime.timedelta(hours=8))
for (_,date),trips in rows.items():
    if datetime.date.fromisoformat(date).weekday()!=6: continue
    events=sorted([(b,1,s) for b,a,s,t in trips]+[(a,-1,t) for b,a,s,t in trips],key=lambda x:(x[0],x[1]))
    load=0; arrivals=[]; cur=None
    for idx,(ts,delta,stop) in enumerate(events):
        if delta<0: load-=1; continue
        if cur is None or stop!=cur['stop'] or ts-cur['last']>600:
            cur=dict(stop=stop,time=ts,last=ts,before=load,after=None); arrivals.append(cur)
        cur['last']=ts; cur['idx']=idx; load+=1; cur['after']=load
    for a in arrivals:
        a['b_after'] = a['after']
        for ts, delta, stop in events[a['idx']+1:]:
            if ts - a['last'] > 600 or stop != a['stop']: break
            if delta < 0: a['b_after'] -= 1
    for i,a in enumerate(arrivals):
        if a['stop']!='九族文化村' or not i: continue
        p=arrivals[i-1]; gap=a['time']-p['last']
        if p['stop'] not in orders or a['stop'] not in orders or orders[p['stop']]==orders[a['stop']] or not 0<gap<=1800: continue
        days[date].append((a['time'],p['stop'],p['after'],a['before'],p['b_after']))
# Representative day: median number of 38-seat positives among Sundays with >=1 matched arrival,
# ties resolved chronologically. Control: previous eligible Sunday.
ranked=sorted(days, key=lambda d:(sum(x[3]>=33 for x in days[d]),d))
day=ranked[(len(ranked)-1)//2]
control=max((d for d in days if d < day), default=None)
print('eligible',len(ranked),'median',day,'control',control)
for d in (day,control):
    if not d: continue
    print('\n',d)
    for ts,stop,up,before,b_up in sorted(days[d]):
        print(datetime.datetime.fromtimestamp(ts,tz).strftime('%H:%M:%S'),stop,up,before,'B',b_up,*('警示' if up>=cap-5 else '否' for cap in (38,43)),*('命中' if up>=cap-5 and before>=cap-5 else '否' for cap in (38,43)))
