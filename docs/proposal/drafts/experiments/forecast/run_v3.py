#!/usr/bin/env python3
"""Compare held-out baselines; outputs are exclusive-create files."""
import sys, json, math
from pathlib import Path
if len(sys.argv)!=3:
    raise SystemExit('usage: run_v3.py DATABASE OUTPUT.json')
out=Path(sys.argv[2])
if out.exists(): raise SystemExit('output exists')
p=Path(__file__).resolve().parent
src=(p/'run.py').read_text().split('rng=random.Random(20261111)')[0]
exec(compile(src,str(p/'run.py'),'exec'))
results=[]
for stop in TARGET:
 for cap in (37,38,42,43):
    train=[r for r in examples if r[1]==stop and r[0]<'2025-04-01']
    select=[r for r in examples if r[1]==stop and '2025-04-01'<=r[0]<'2025-07-01']
    test=[r for r in examples if r[1]==stop and r[0]>='2025-07-01']
    groups=defaultdict(list)
    for r in train: groups[r[2],r[3]].append(r[5])
    overall=sum(r[5] for r in train)/len(train)
    def hist(r):
        v=groups[r[2],r[3]]; return (sum(v)+10*overall)/(len(v)+10)
    w=fit([[1,(hist(r)-overall)/10,r[4]/40] for r in train],[int(r[5]>=cap-5) for r in train])
    def model(r): return sigmoid(sum(a*b for a,b in zip(w,[1,(hist(r)-overall)/10,r[4]/40])))
    y=[int(r[5]>=cap-5) for r in test]; base=sum(y)/len(y)
    for name,score in [('H',hist),('R',lambda r:r[4]),('M',model)]:
        scores=[score(r) for r in test]; cuts=[]
        if name=='R': cuts=[('cap-'+str(k),cap-k) for k in (3,5,8)]
        else:
            s=sorted((score(r) for r in select),reverse=True)
            cuts=[(str(b),math.nextafter(s[int(len(s)*b)],math.inf)) for b in (.05,.1,.2)]
        # Full score-tie curve, with no outcome-dependent tie breaking.
        curve=[]
        for cut in sorted(set(scores),reverse=True):
            selected=[i for i,x in enumerate(scores) if x>=cut]; tp=sum(y[i] for i in selected)
            curve.append([len(selected)/len(y),tp/len(selected)])
        for label,cut in cuts:
            ix=[i for i,s in enumerate(scores) if s>=cut]; tp=sum(y[i] for i in ix); precision=tp/len(ix) if ix else None
            results.append(dict(stop=stop,cap=cap,method=name,cut=label,n=len(y),positive=sum(y),base=base,precision=precision,recall=tp/sum(y) if sum(y) else None,share=len(ix)/len(y),lift=precision/base if precision is not None and base else None,auc=auc(y,scores),curve=curve))
with out.open('x') as f: json.dump(results,f,ensure_ascii=False,indent=2)
