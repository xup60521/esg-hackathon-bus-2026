#!/usr/bin/env python3
import sys, sqlite3, json, datetime, random, math, bisect
from collections import defaultdict, Counter
from pathlib import Path
if len(sys.argv)!=3: raise SystemExit('usage: run.py DATABASE NEW_OUTPUT.json')
out=Path(sys.argv[2]); f=out.open('x',encoding='utf8')
root=Path(__file__).resolve().parents[5]
orders={x['name']:x['order'] for x in json.loads((root/'public/geo/stops.json').read_text())}
c=sqlite3.connect('file:'+str(Path(sys.argv[1]).resolve())+'?mode=ro',uri=True)
rows=defaultdict(list)
for v,d,b,a,s,t in c.execute("select vehicle,board_date,board_ts,alight_ts,board_stop,alight_stop from trips where board_date >= '2024-01-01' and board_date < '2026-01-01' and alight_ts is not null"):
 if b is not None and s!=t and 180<=a-b<=14400: rows[v,d].append((b,a,s,t))
c.close(); allarr=[]
for (v,d),trips in rows.items():
 ev=[]
 for b,a,s,t in trips:
  direction=(orders[t]>orders[s])-(orders[t]<orders[s]) if s in orders and t in orders else 0
  ev.append((b,1,s,direction)); ev.append((a,-1,t,0))
 ev.sort(key=lambda x:(x[0],x[1])); load=0; cur=None
 for ts,delta,stop,direction in ev:
  if delta<0: load-=1; continue
  if cur is None or stop!=cur['s'] or ts-cur['last']>600:
   cur={'v':v,'d':d,'s':stop,'time':ts,'last':ts,'L':load,'B':0,'votes':[]}; allarr.append(cur)
  cur['last']=ts; cur['B']+=1; cur['votes'].append(direction); load+=1
 del ev
del rows
seq=defaultdict(list); byday=defaultdict(list)
for a in allarr:
 vote=sum(a.pop('votes')); a['dir']=(vote>0)-(vote<0)
 if not a['dir']: continue
 dt=datetime.datetime.fromtimestamp(a['time'],datetime.timezone(datetime.timedelta(hours=8))); a['h']=dt.hour; a['weekend']=int(dt.weekday()>=5)
 seq[a['s'],a['dir']].append(a); byday[a['d'],a['dir']].append(a)
for k in byday: byday[k].sort(key=lambda x:x['time'])
pairs=[]
for key,arr in seq.items():
 arr.sort(key=lambda x:x['time'])
 for p,n in zip(arr,arr[1:]):
  gap=(n['time']-p['time'])/60
  if p['d']!=n['d'] or p['v']==n['v'] or not 0<gap<=90: continue
  others=byday[n['d'],-n['dir']]; times=[a['time'] for a in others]; j=bisect.bisect_left(times,p['time'])-1; control=None
  while j>=0 and p['time']-others[j]['time']<=5400:
   if others[j]['s']!=p['s'] and others[j]['v']!=p['v']: control=others[j]['L']; break
   j-=1
  pairs.append(dict(d=n['d'],s=n['s'],direction=n['dir'],h=n['h'],w=n['weekend'],gap=gap,L=p['L'],B=n['B'],control=control))
# Station-specific threshold computed over observed arrivals, including ties.
quant={}
for (s,di),arr in seq.items():
 vals=sorted(a['L'] for a in arr); quant[s,di]=vals[int(.9*(len(vals)-1))]
# assign quantile to pair via predecessor's direction
for (s,di),arr in seq.items():
 pass
# pairing output stores station only; station pooled threshold is deliberate
qs=defaultdict(list)
for a in allarr:
 if a['dir']: qs[a['s']].append(a['L'])
qs={s:sorted(v)[int(.9*(len(v)-1))] for s,v in qs.items()}
for p in pairs:p['q']=qs[p['s']]
rng=random.Random(20261111)
def analyze(data,threshold,control=False):
 # Matched strata: weighted contrast by number of exposed observations.
 groups=defaultdict(list)
 for p in data:
  x=p['control'] if control else p['L']
  if x is None: continue
  high=x >= (p['q'] if threshold=='q' else threshold); low=x < (p['q'] if threshold=='q' else threshold)
  groups[p['s'],p['direction'],p['w'],p['h']].append((p,high))
 eligible=[]
 for g in groups.values():
  hi=[p for p,h in g if h]; lo=[p for p,h in g if not h]
  if hi and lo: eligible.extend((p,h,sum(x['B'] for x in lo)/len(lo)) for p,h in g)
 def calc(items):
  # Within-stratum means recalculated for each resample.
  gs=defaultdict(lambda:[[],[]])
  for p,h,_ in items: gs[p['s'],p['direction'],p['w'],p['h']][int(h)].append(p['B'])
  num=den=0
  for lo,hi in gs.values():
   if lo and hi: num+=len(hi)*(sum(hi)/len(hi)-sum(lo)/len(lo)); den+=len(hi)
  return num/den if den else None
 estimate=calc(eligible); days=defaultdict(list)
 for row in eligible: days[row[0]['d']].append(row)
 ds=list(days); boots=[]
 for _ in range(100):
  x=calc([r for d in rng.choices(ds,k=len(ds)) for r in days[d]]) if ds else None
  if x is not None: boots.append(x)
 boots.sort(); hi=[p for p,h,_ in eligible if h]; lo=[p for p,h,_ in eligible if not h]
 ratios=[p['B']/base for p,h,base in eligible if h and base>0]
 # Permute labels inside strata, preserving time/stratum composition.
 permutations=[]
 for _ in range(100):
  gs=defaultdict(list)
  for p,h,b in eligible: gs[p['s'],p['direction'],p['w'],p['h']].append((p,h,b))
  shuffled=[]
  for g in gs.values():
   labels=[r[1] for r in g]; rng.shuffle(labels); shuffled.extend((r[0],h,r[2]) for r,h in zip(g,labels))
  x=calc(shuffled)
  if x is not None: permutations.append(x)
 return dict(n_high=len(hi),n_other=len(lo),mean_high=sum(p['B'] for p in hi)/len(hi) if hi else None,mean_other=sum(p['B'] for p in lo)/len(lo) if lo else None,ratio_high=sum(ratios)/len(ratios) if ratios else None,effect=estimate,ci95=[boots[int(.025*(len(boots)-1))],boots[int(.975*(len(boots)-1))]] if boots else None,permutation_p=(1+sum(abs(x)>=abs(estimate) for x in permutations))/(1+len(permutations)) if estimate is not None else None,high_per_year=len(hi)/ (len({a['d'] for a in allarr})/365.25),annual=estimate*len(hi)/(len({a['d'] for a in allarr})/365.25) if estimate is not None else None)
results=[]
for T in (30,45,60,90):
 data=[p for p in pairs if p['gap']<=T]
 for cap in (37,38,42,43,'q'):
  threshold=cap-5 if isinstance(cap,int) else 'q'
  results.append(dict(T=T,cap=cap,main=analyze(data,threshold),negative=analyze(data,threshold,True)))
json.dump(dict(days=len({a['d'] for a in allarr}),arrivals=len(allarr),pairs=len(pairs),results=results),f,ensure_ascii=False,indent=2); f.close()
