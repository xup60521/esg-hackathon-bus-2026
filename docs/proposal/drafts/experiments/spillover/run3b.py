#!/usr/bin/env python3
"""Exploratory spillover contrasts, fixed 2024 baseline, clustered day bootstrap."""
import argparse, collections, datetime, json, random
from pathlib import Path
p=argparse.ArgumentParser(); p.add_argument('--data',required=True); p.add_argument('--output',required=True); p.add_argument('--bootstrap',type=int,default=1000); a=p.parse_args()
out=Path(a.output); out.mkdir(parents=True,exist_ok=False)
cal=json.loads((Path(__file__).resolve().parents[5]/'public/data/lab/visualization/calendar.json').read_text())['days']
rows=collections.defaultdict(list)
with open(a.data) as f:
 for line in f:
  e=json.loads(line); rows[e['d'][:4]].append(e)
def kind(d): return 2 if cal[d]['rest'] else 1 if datetime.date.fromisoformat(d).weekday()==4 else 0
def cell(e): return (e['s'],e['dir'],kind(e['d']),e['h'])
def pct(v,q): return sorted(v)[int((len(v)-1)*q)]
tables=[collections.defaultdict(lambda:[0,0]) for _ in range(3)]; loads=collections.defaultdict(list)
for e in rows['2024']:
 k=cell(e); loads[e['s']].append(e['L'])
 for tab,key in zip(tables,(k,k[:3],k[:2])): tab[key][0]+=1; tab[key][1]+=e['B']
threshold={s:pct(v,.9) for s,v in loads.items()}
by=collections.defaultdict(list)
for e in rows['2025']:
 k=cell(e); e['base']=next((tab[key][1]/tab[key][0] for tab,key in zip(tables,(k,k[:3],k[:2])) if key in tab and tab[key][0]>=5),None); by[(e['d'],e['s'],e['dir'])].append(e)
for v in by.values(): v.sort(key=lambda e:(e['time'],e['v']))
pairs=[]
for (d,s,di),events in by.items():
 opp=by.get((d,s,-di),[]); j=0; o=None
 for i,e in enumerate(events):
  while j<len(opp) and opp[j]['time']<e['time']: o=opp[j]; j+=1
  if i and e['base'] is not None:
   gap=(e['time']-events[i-1]['time'])/60
   if gap<=90: pairs.append((e,events[i-1],gap,o,(events[i-1]['time']-events[i-2]['time'])/60 if i>=2 else None))
days=sorted({e['d'] for e in rows['2025']}); rng=random.Random(20261111)
# Pre-generate common resamples for every contrast.
samples=[collections.Counter(rng.choices(days,k=len(days))) for _ in range(a.bootstrap)]
def summary(groups, coeff):
 daily=collections.defaultdict(lambda:[[0,0.] for _ in groups])
 for i,g in enumerate(groups):
  for d,v in g: daily[d][i][0]+=1; daily[d][i][1]+=v
 def calc(weights):
  ns=[sum(daily[d][i][0]*w for d,w in weights.items() if d in daily) for i in range(len(groups))]
  if not all(ns): return None
  return sum(c*sum(daily[d][i][1]*w for d,w in weights.items() if d in daily)/ns[i] for i,c in enumerate(coeff))
 point=calc({d:1 for d in days}); bs=[v for s in samples if (v:=calc(s)) is not None]
 return {'n':[len(g) for g in groups], 'estimate':point,'ci':[pct(bs,.025),pct(bs,.975)] if bs else None}
result={}
for t in (30,60,90):
 for cap in (38,43,'top10'):
  def high(e): return e['L'] >= (threshold[e['s']] if cap=='top10' else cap-5)
  def low(e): return e['L'] < (threshold[e['s']] if cap=='top10' else cap-10)
  gs=[[] for _ in range(6)]; strata=collections.defaultdict(lambda:[[],[]]); annual=sum(high(e) for e in rows['2025'])
  for e,prev,gap,opp,prior in pairs:
   if gap>t or e['s'] not in threshold: continue
   v=(e['d'],e['B']-e['base']); mh=high(prev); ml=low(prev); eligible=opp is not None and e['time']-opp['time']<=t*60
   if mh: gs[0].append(v)
   if eligible:
    oh=high(opp); ol=low(opp)
    if oh: gs[1].append(v)
    if mh: gs[2].append(v)
    if ml: gs[3].append(v)
    if oh: gs[4].append(v)
    if ol: gs[5].append(v)
    if prior is not None:
     label='0-30' if prior<=30 else '30-60' if prior<=60 else '>60'
     if mh: strata[label][0].append(v)
     if oh: strata[label][1].append(v)
  result[f'{t}_{cap}']={'annual_high_arrivals':annual,'level':summary(gs[:2],[1,-1]),'common_high_difference':summary([gs[2],gs[4]],[1,-1]),'common_did':summary(gs[2:6],[1,-1,-1,1]),'headway':{k:summary(v,[1,-1]) for k,v in strata.items()}}
with (out/'results.json').open('x') as f: json.dump(result,f,ensure_ascii=False,indent=2)
