#!/usr/bin/env python3
"""Independent temporal threshold experiment; run from any directory, optional DB argument."""
import json, random, statistics
from collections import defaultdict
from pathlib import Path

# Reuse the original extraction and model definitions without executing its experiment.
p = Path(__file__).resolve().parent
source = (p / 'run.py').read_text().split('rng=random.Random(20261111)')[0]
exec(compile(source, str(p / 'run.py'), 'exec'))
R = random.Random(20261111)
B = 300

def calc(rows, cutoff):
    y=[r['y'] for r in rows]; alert=[r['p'] >= cutoff for r in rows]
    tp=sum(a and b for a,b in zip(y,alert)); n=sum(alert); pos=sum(y); neg=len(y)-pos
    gaps=sorted(r['gap'] for r,a in zip(rows,alert) if a and r['y'])
    return {'precision':tp/n if n else None, 'recall':tp/pos if pos else None,
            'false_alarm_rate':(n-tp)/neg if neg else None, 'alert_share':n/len(y),
            'lead_median':statistics.median(gaps) if gaps else None,
            'lead_p10':gaps[int(.1*(len(gaps)-1))] if gaps else None}

def top(rows, key):
    days=defaultdict(list)
    for r in rows:
        if 6 <= r['hour'] < 9 or 15 <= r['hour'] < 18: days[r['date']].append(r)
    # Fixed k=1; deterministic tie-break independent of outcome.
    chosen=[max(v,key=lambda r:(r[key],-r['idx'])) for v in days.values()]
    return sum(r['y'] for r in chosen)/len(chosen) if chosen else None

def evaluate(rows, cutoff):
    days=defaultdict(list)
    for r in rows: days[r['date']].append(r)
    dates=sorted(days); samples=[]
    for _ in range(B):
        # Preserve distinct resampled days for the top-1 statistic.
        sample=[]
        for j,d in enumerate(R.choices(dates,k=len(dates))):
            sample.extend(dict(r,date=str(j)) for r in days[d])
        samples.append(sample)
    values=calc(rows,cutoff); values.update(top1=top(rows,'p'),baseline_top1=top(rows,'hist'))
    bs=defaultdict(list)
    for s in samples:
        v=calc(s,cutoff); v.update(top1=top(s,'p'),baseline_top1=top(s,'hist'))
        for k,x in v.items():
            if x is not None: bs[k].append(x)
    return {'metrics':values,'ci95':{k:interval(v) for k,v in bs.items()},'defined_bootstrap':{k:len(v) for k,v in bs.items()}}

def budget_cut(rows,budget):
    # Strictly exceed a score so ties cannot violate the selection-set budget.
    scores=sorted((r['p'] for r in rows),reverse=True); allowed=int(len(scores)*budget)
    return math.nextafter(scores[allowed],math.inf) if allowed < len(scores) else 0.0

allrows=[]
for stop in TARGET:
 for cap in (37,38,42,43):
    train=[r for r in examples if r[1]==stop and r[0]<'2025-04-01']
    groups=defaultdict(list)
    for r in train: groups[(r[2],r[3])].append(r[5])
    overall=sum(r[5] for r in train)/len(train)
    def hist(r):
        v=groups[(r[2],r[3])]; return (sum(v)+10*overall)/(len(v)+10)
    w=fit([[1,(hist(r)-overall)/10,r[4]/40] for r in train],[int(r[5]>=cap-5) for r in train])
    for idx,r in enumerate(examples):
        if r[1]!=stop or r[0]<'2025-04-01': continue
        h=hist(r); prob=sigmoid(sum(a*b for a,b in zip(w,[1,(h-overall)/10,r[4]/40])))
        allrows.append(dict(date=r[0],stop=stop,cap=cap,y=int(r[5]>=cap-5),p=prob,hist=h,gap=r[6],hour=r[3]*3,idx=idx))

# Predeclared nearby group: 桃米坑 and 暨南大學, pooled arrivals.
results=[]
for stop in TARGET+['中途站群（桃米坑、暨南大學）']:
 for cap in (37,38,42,43):
    subset=[r for r in allrows if r['cap']==cap and (r['stop'] in ('桃米坑','暨南大學') if stop.startswith('中途站群') else r['stop']==stop)]
    selection=[r for r in subset if r['date']<'2025-07-01']; test=[r for r in subset if r['date']>='2025-07-01']
    for budget in (.05,.1,.2):
        cutoff=budget_cut(selection,budget)
        results.append(dict(stop=stop,capacity=cap,budget=budget,cutoff=cutoff,selection_n=len(selection),selection_alert_share=calc(selection,cutoff)['alert_share'],test_n=len(test),positive=sum(r['y'] for r in test),**evaluate(test,cutoff)))
(OUT/'results_v2.json').write_text(json.dumps({'seed':20261111,'bootstrap':B,'results':results},ensure_ascii=False,indent=2)+'\n')
print('wrote results_v2.json')
