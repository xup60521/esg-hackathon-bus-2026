#!/usr/bin/env python3
"""Compare upstream definitions on identical samples; exclusive output."""
import sys, json, math
from pathlib import Path
if len(sys.argv)!=3: raise SystemExit('usage: run_v4.py DATABASE NEW_OUTPUT.json')
out=Path(sys.argv[2]); p=Path(__file__).resolve().parent
src=(p/'run.py').read_text().split('rng=random.Random(20261111)')[0]
src=src.replace('rows[(v,d)].append((b,a,s))','rows[(v,d)].append((b,a,s,t))')
src=src.replace('for b,a,s in trips: events.append((b,1,s)); events.append((a,-1,s))','for b,a,s,t in trips: events.append((b,1,s)); events.append((a,-1,t))')
src=src.replace('examples=[]; counts=', 'examples=[]; b_values=[]; counts=')
src=src.replace('for ts,delta,stop in events:', 'for idx,(ts,delta,stop) in enumerate(events):')
src=src.replace("current['last']=ts; load+=1; current['after']=load", "current['last']=ts; current['idx']=idx; load+=1; current['after']=load")
src=src.replace("examples.append((date,a['stop'],local.weekday(),local.hour//3,p['after'],a['before'],gap/60))", """examples.append((date,a['stop'],local.weekday(),local.hour//3,p['after'],a['before'],gap/60))
        final=p['after']
        for et,delta,es in events[p['idx']+1:]:
            if et-p['last']>600 or es!=p['stop']: break
            if delta<0: final-=1
        b_values.append(final)""")
exec(compile(src,str(p/'run.py'),'exec'))
results=[]; audits={}
for definition in ('A','B'):
 data=[r[:4]+((r[4] if definition=='A' else b),)+r[5:] for r,b in zip(examples,b_values)]
 audits[definition]={'samples':len(data),'target_before_exceeds_upstream':sum(r[5]>r[4] for r in data),'changed_from_A':sum(r[4]!=original[4] for r,original in zip(data,examples)), 'heldout_samples':sum(r[0]>='2025-07-01' for r in data), 'heldout_exceeds':sum(r[5]>r[4] for r in data if r[0]>='2025-07-01'), 'heldout_changed':sum(r[4]!=original[4] for r,original in zip(data,examples) if r[0]>='2025-07-01')}
 for stop in TARGET:
  for cap in (37,38,42,43):
   train=[r for r in data if r[1]==stop and r[0]<'2025-04-01']; select=[r for r in data if r[1]==stop and '2025-04-01'<=r[0]<'2025-07-01']; test=[r for r in data if r[1]==stop and r[0]>='2025-07-01']
   groups=defaultdict(list)
   for r in train: groups[r[2],r[3]].append(r[5])
   overall=sum(r[5] for r in train)/len(train)
   def hist(r):
    v=groups[r[2],r[3]]; return (sum(v)+10*overall)/(len(v)+10)
   w=fit([[1,(hist(r)-overall)/10,r[4]/40] for r in train],[int(r[5]>=cap-5) for r in train])
   def model(r): return sigmoid(sum(a*b for a,b in zip(w,[1,(hist(r)-overall)/10,r[4]/40])))
   y=[int(r[5]>=cap-5) for r in test]; base=sum(y)/len(y)
   for name,score in [('H',hist),('R',lambda r:r[4]),('M',model)]:
    if name=='R': cuts=[('cap-5',cap-5)]
    else:
     s=sorted((score(r) for r in select),reverse=True); cuts=[('10%',math.nextafter(s[int(len(s)*.1)],math.inf))]
    for label,cut in cuts:
     ix=[i for i,r in enumerate(test) if score(r)>=cut]; tp=sum(y[i] for i in ix); precision=tp/len(ix) if ix else None
     results.append(dict(definition=definition,stop=stop,cap=cap,method=name,cut=label,n=len(y),positive=sum(y),base=base,precision=precision,recall=tp/sum(y) if sum(y) else None,share=len(ix)/len(y),lift=precision/base if precision is not None and base else None))
with out.open('x',encoding='utf-8') as f: json.dump({'audit':audits,'results':results},f,ensure_ascii=False,indent=2)
