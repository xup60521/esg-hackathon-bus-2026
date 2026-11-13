#!/usr/bin/env python3
"""Recompute 108 scenarios and observed overload days; never overwrite output."""
import sys,csv
from pathlib import Path
if len(sys.argv)!=3: raise SystemExit('usage: run_v3.py DATABASE OUTPUT.csv')
out=Path(sys.argv[2])
if out.exists(): raise SystemExit('output exists')
p=Path(__file__).resolve().parent
src=(p/'event_sim_v2.py').read_text().split('rows=[]')[0]
exec(compile(src,str(p/'event_sim_v2.py'),'exec'))
dates=sorted(d for d in events if d.startswith('2025'))
with out.open('x',newline='') as f:
 w=csv.writer(f); w.writerow(['capacity','hidden','shift','share','days','overload_days','first_overload_minute','up_better_days','near_better_days','near_beats_up_days','up_person_minutes_saved','near_person_minutes_saved'])
 for c in (37,38,42,43):
  for h in (0,.1,.25):
   for shift in (-60,0,60):
    for share in (0,.2,.4):
     ups=[]; nears=[]; first=[]
     for d in dates:
      ev=events[d]; when=peak+shift
      first.extend(t for t,l,b in ev if l+b>c)
      eligible=sum(abs(t+30-when)<=60 for t,o in up[d]); u=min(c,math.floor(eligible*share+.5))
      base=sim(ev,c,h,False,0,when)[0]; ups.append(base-sim(ev,c,h,True,u,when)[0]); nears.append(base-sim(ev,c,h,True,0,when)[0])
     w.writerow([c,h,shift,share,len(dates),sum(any(l+b>c for t,l,b in events[d]) for d in dates),min(first) if first else '',sum(x>1e-8 for x in ups),sum(x>1e-8 for x in nears),sum(n>u+1e-8 for n,u in zip(nears,ups)),round(sum(ups),2),round(sum(nears),2)])
