# 舊版，預設路徑為開發副本，不作交付重跑指令。
#!/usr/bin/env python3
import sqlite3, json, math, random, statistics, datetime, sys
from collections import defaultdict
from pathlib import Path

DB='/tmp/claude-1000/-home-zup-code-esg-hackathon-bus-2026/e3280782-e84b-4051-8849-189e12c5a845/scratchpad/trips.db'
ROOT=Path(__file__).resolve().parents[5]
OUT=Path(__file__).resolve().parent
TARGET=['九族文化村','桃米坑','暨南大學','崎下']
orders={x['name']:x['order'] for x in json.loads((ROOT/'public/geo/stops.json').read_text())}
c=sqlite3.connect('file:'+str(Path(sys.argv[1] if len(sys.argv)>1 else DB).resolve())+'?mode=ro',uri=True)
rows=defaultdict(list)
for v,d,b,a,s,t in c.execute("select vehicle,board_date,board_ts,alight_ts,board_stop,alight_stop from trips where board_date >= '2024-01-01' and board_date < '2026-01-01' and alight_ts is not null"):
    if b is not None and s!=t and 180<=a-b<=14400: rows[(v,d)].append((b,a,s))
c.close()
examples=[]; counts=defaultdict(int)
for (_,date), trips in rows.items():
    events=[]
    for b,a,s in trips: events.append((b,1,s)); events.append((a,-1,s))
    events.sort(key=lambda x:(x[0],x[1]))
    load=0; arrivals=[]; current=None
    for ts,delta,stop in events:
        if delta<0: load-=1; continue
        if current is None or stop!=current['stop'] or ts-current['last']>600:
            current={'stop':stop,'time':ts,'last':ts,'before':load,'after':None}; arrivals.append(current)
        current['last']=ts; load+=1; current['after']=load
    for i,a in enumerate(arrivals):
        if a['stop'] not in TARGET: continue
        counts[a['stop']]+=1
        if not i: continue
        p=arrivals[i-1]; gap=a['time']-p['last']
        if p['stop'] not in orders or a['stop'] not in orders or orders[p['stop']]==orders[a['stop']] or not 0<gap<=1800: continue
        local=datetime.datetime.fromtimestamp(p['last'],datetime.timezone(datetime.timedelta(hours=8)))
        examples.append((date,a['stop'],local.weekday(),local.hour//3,p['after'],a['before'],gap/60))
del rows

def sigmoid(x): return 1/(1+math.exp(-max(-30,min(30,x))))
def fit(xs,ys):
    w=[0.0]*len(xs[0])
    for it in range(350):
        g=[0.0]*len(w)
        for x,y in zip(xs,ys):
            e=sigmoid(sum(a*b for a,b in zip(w,x)))-y
            for j in range(len(w)): g[j]+=e*x[j]
        for j in range(len(w)): w[j]-=0.45*(g[j]/len(xs)+(0.002*w[j] if j else 0))
    return w
def auc(y,p):
    pos=sum(y); neg=len(y)-pos
    if not pos or not neg:return None
    pairs=sorted(zip(p,y)); rank=0.; i=0
    while i<len(pairs):
        j=i+1
        while j<len(pairs) and pairs[j][0]==pairs[i][0]: j+=1
        rank+=(i+1+j)/2*sum(v for _,v in pairs[i:j]); i=j
    return (rank-pos*(pos+1)/2)/(pos*neg)
def metrics(y,p):
    n=len(y); tp=sum(a and b>=.5 for a,b in zip(y,p)); predicted=sum(b>=.5 for b in p); positives=sum(y)
    return {'auc':auc(y,p),'precision':tp/predicted if predicted else None,'recall':tp/positives if positives else None,'brier':sum((a-b)**2 for a,b in zip(y,p))/n,'observed':positives/n,'predicted':sum(p)/n}
def interval(vals):
    vals=sorted(x for x in vals if x is not None)
    return [vals[int(.025*(len(vals)-1))],vals[int(.975*(len(vals)-1))]] if vals else None
rng=random.Random(20261111); result={'seed':20261111,'bootstrap':300,'arrival_counts':dict(counts),'results':[]}
for stop in TARGET:
 for cap in (37,38,42,43):
    threshold=cap-5
    train=[r for r in examples if r[1]==stop and r[0]<'2025-07-01']; test=[r for r in examples if r[1]==stop and r[0]>='2025-07-01']
    groups=defaultdict(list)
    for r in train: groups[(r[2],r[3])].append(r[5])
    overall=sum(r[5] for r in train)/len(train)
    def hist(r):
        v=groups[(r[2],r[3])]; return (sum(v)+10*overall)/(len(v)+10)
    def features(r): return [1,(hist(r)-overall)/10,r[4]/40]
    w=fit([features(r) for r in train],[int(r[5]>=threshold) for r in train])
    wa=fit([[1,(hist(r)-overall)/10] for r in train],[int(r[5]>=threshold) for r in train])
    predA=[sigmoid(wa[0]+wa[1]*(hist(r)-overall)/10) for r in test]; predB=[sigmoid(sum(x*y for x,y in zip(w,features(r)))) for r in test]; labels=[int(r[5]>=threshold) for r in test]
    days=defaultdict(list)
    for i,r in enumerate(test): days[r[0]].append(i)
    daylist=sorted(days); samples=[]
    for _ in range(300): samples.append([i for d in rng.choices(daylist,k=len(daylist)) for i in days[d]])
    models={}
    for name,p in [('A',predA),('B',predB)]:
        m=metrics(labels,p); boots=defaultdict(list)
        for ix in samples:
            b=metrics([labels[i] for i in ix],[p[i] for i in ix])
            for k,v in b.items(): boots[k].append(v)
        models[name]={'metrics':m,'ci95':{k:interval(v) for k,v in boots.items()},'calibration_bins':[]}
        for lo,hi in [(0,.1),(.1,.2),(.2,.4),(.4,.6),(.6,.8),(.8,1.01)]:
            ix=[i for i,x in enumerate(p) if lo<=x<hi]
            if ix: models[name]['calibration_bins'].append({'range':[lo,hi],'n':len(ix),'predicted':sum(p[i] for i in ix)/len(ix),'observed':sum(labels[i] for i in ix)/len(ix)})
    gaps=sorted(r[6] for r in test)
    result['results'].append({'stop':stop,'capacity':cap,'threshold':threshold,'train':len(train),'test':len(test),'positive':sum(labels),'lead_median_ci95':interval([statistics.median([test[i][6] for i in ix]) for ix in samples]),'lead_minutes_median':statistics.median(gaps),'lead_minutes_p10':gaps[int(.1*(len(gaps)-1))],'lead_minutes_p90':gaps[int(.9*(len(gaps)-1))],'coefficients':w,'models':models})
(OUT/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('wrote',OUT/'results.json')
