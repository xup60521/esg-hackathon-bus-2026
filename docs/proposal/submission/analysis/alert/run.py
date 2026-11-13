import sys, sqlite3, json, os, collections, bisect, datetime, math
import numpy as np, pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_recall_fscore_support, roc_auc_score, average_precision_score
from lightgbm import LGBMClassifier
from pathlib import Path
root=Path(__file__).resolve().parents[5]; out=Path(__file__).resolve().parent
stops=json.load(open(root/'public/geo/stops.json')); order={s['name']:s['seq'] for s in stops}; seqs=sorted(set(order.values()))
cal=json.load(open(root/'public/data/lab/visualization/calendar.json'))['days']
names=set('埔里站、崎下、魚池、暨南大學校內、九族文化村、日月老茶廠、大雁、桃米坑、向山行政中心、暨南大學、牛耳石雕公園、水社'.split('、'))
con=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
q="select vehicle,board_date,board_ts,alight_ts,board_stop,alight_stop,subroute,board_seq,alight_seq from trips where board_ts is not null and alight_ts is not null order by vehicle,board_date,board_ts"
rows=con.execute(q); events=[]; runs=0; stops_count=0; prev={}; possible=0; observable=0

def process(group):
 global runs,stops_count,possible,observable
 if not group:return
 runs+=1
 # Group consecutive boardings at the same stop, with a ten minute maximum gap.
 groups=[]
 for x in group:
  if groups and x[4]==groups[-1][-1][4] and x[2]-groups[-1][-1][2]<=600: groups[-1].append(x)
  else: groups.append([x])
 stops_count+=len(groups)
 starts=sorted(x[2] for x in group); ends=sorted(x[3] for x in group)
 load=lambda t: bisect.bisect_right(starts,t)-bisect.bisect_right(ends,t)
 for i,g in enumerate(groups):
  first,last=g[0],g[-1]; t=first[2]; dep=last[2]; key=(first[6],first[4],1 if first[8]>first[7] else -1)
  # prior arrival lookup built globally after sorting events instead
  direction=key[2]
  nextseq=next((s for s in (seqs if direction==1 else seqs[::-1]) if (s-first[7])*direction>0),None)
  if nextseq is not None:
   possible+=1
   if i+1<len(groups) and groups[i+1][0][7]==nextseq: observable+=1
  if i<2 or first[4] not in names:continue
  upstream=groups[i-1]; u=upstream[-1]; p=u[2]
  # Direction must be inferable from two already observed stops.
  prior_seq=groups[i-2][-1][7]
  if u[7]==prior_seq or (u[7]-prior_seq)*direction<=0:continue
  if p>=t or (first[7]-u[7])*direction<=0:continue
  before=bisect.bisect_left(starts,t)-bisect.bisect_right(ends,t)
  if before<=0:continue
  day=first[1]; dt=datetime.datetime.fromtimestamp(p,datetime.timezone(datetime.timedelta(hours=8)))
  rest=bool(cal.get(day,{}).get('rest',False)); d=datetime.date.fromisoformat(day)
  long=rest and (bool(cal.get(str(d-datetime.timedelta(days=1)),{}).get('rest')) or bool(cal.get(str(d+datetime.timedelta(days=1)),{}).get('rest')))
  events.append(dict(day=day,t=t,p=p,stop=first[4],upstop=u[4],route=u[6],direction=str(direction),hour=dt.hour,weekday=dt.weekday(),rest=int(rest),long=int(long),note=str(cal.get(day,{}).get('note','')),up_load=load(p),load=before,lead=(t-p)/60, next_station=int(first[7]==nextseq),arrivalroute=first[6]))
current=[]; lastkey=None; last=None
for x in rows:
 if x[7] is None or x[8] is None or x[7]==x[8] or not 180<=x[3]-x[2]<=14400:continue
 key=(x[0],x[1]); direction=1 if x[8]>x[7] else -1
 if current and (key!=lastkey or direction!=last[9] or x[2]-last[2]>5400 or (x[7]-last[7])*direction<0):process(current);current=[]
 current.append(x);lastkey=key;last=(*x,direction)
process(current)
df=pd.DataFrame(events).sort_values('p').reset_index(drop=True)
# Previous observed arrival must have occurred strictly before the prediction time.
arrival_times=collections.defaultdict(list)
for x in events: arrival_times[(x['stop'],x['direction'])].append(x['t'])
for a in arrival_times.values():a.sort()
df['gap']=df.apply(lambda x: min(1440,(x.p-arrival_times[(x.stop,x.direction)][bisect.bisect_left(arrival_times[(x.stop,x.direction)],x.p)-1])/60) if bisect.bisect_left(arrival_times[(x.stop,x.direction)],x.p)>0 else 1440,axis=1)
train=df.day<'2025-04-01'; val=(df.day>='2025-04-01')&(df.day<'2025-07-01'); test=df.day>='2025-07-01'
cat=['stop','upstop','route','direction']; num=['hour','weekday','rest','long','up_load','gap']; X=df[cat+num]
summary={'counts':{'runs':runs,'mean_stops_per_run':stops_count/runs,'eligible':len(df),'train':int(train.sum()),'validation':int(val.sum()),'holdout':int(test.sum()),'next_station_possible':possible,'next_station_observed':observable},'tasks':{}}
replays={}; rng=np.random.default_rng(42)
for cap in [41,37]:
 for kind,cut in [('few',cap-5),('full',cap)]:
  y=(df.load>=cut).astype(int); models={}; models['baseline']=(df.up_load>=cap-5).astype(float).to_numpy()
  keys=['route','direction','hour','rest']; rates=df.loc[train].assign(y=y[train]).groupby(keys).y.mean(); prior=float(y[train].mean()); models['prior']=pd.MultiIndex.from_frame(df[keys]).map(rates).fillna(prior).to_numpy()
  for name,model in [('logistic',LogisticRegression(max_iter=300)),('lightgbm',LGBMClassifier(n_estimators=160,verbosity=-1,n_jobs=4,random_state=42))]:
   pipe=make_pipeline(ColumnTransformer([('cat',OneHotEncoder(handle_unknown='ignore'),cat),('num',StandardScaler(),num)]),model);pipe.fit(X[train],y[train]);models[name]=pipe.predict_proba(X)[:,1]
  days=df.loc[test,'day'].unique(); selected='lightgbm'; result={}
  for name,p in models.items():
   ix=np.where(test)[0]; yy=y.iloc[ix].to_numpy(); pp=p[ix]; pred=pp>=.5
   def metrics(a,b):
    pr,re,f,_=precision_recall_fscore_support(a,b>=.5,average='binary',zero_division=0);return [pr,re,f,roc_auc_score(a,b) if len(np.unique(a))>1 else None,average_precision_score(a,b) if a.sum() else None]
   met=metrics(yy,pp); dayarr=df.day.iloc[ix].to_numpy(); boot=[]
   dayids={d:np.where(dayarr==d)[0] for d in days}
   for _ in range(200):
    chosen=rng.choice(days,len(days),replace=True); ids=np.concatenate([dayids[d] for d in chosen]); boot.append(precision_recall_fscore_support(yy[ids],pp[ids]>=.5,average='binary',zero_division=0)[:3])
   result[name]={'precision':met[0],'recall':met[1],'f1':met[2],'roc_auc':met[3],'pr_auc':met[4],'bootstrap_95_precision_recall_f1':np.quantile(boot,[.025,.975],axis=0).tolist()}
  # selection by validation average precision
  selected=max(['prior','logistic','lightgbm'],key=lambda n:average_precision_score(y[val],models[n][val]))
  p=models[selected]; operations={}; valdays=df.loc[val,'day'].nunique()
  for n in [3,5,10]:
   candidates=np.unique(np.r_[0,p[val],1.000001]); threshold=next((v for v in candidates if (p[val]>=v).sum()/valdays<=n),1.000001)
   mask=test&(p>=threshold); pr=float(y[mask].mean()) if mask.sum() else 0; rec=float(y[mask].sum()/y[test].sum()) if y[test].sum() else 0
   operations[str(n)]={'threshold':float(threshold),'precision':pr,'recall':rec,'holdout_alerts_per_day':float(mask.sum()/len(days)),'rest_alerts_per_day':float(mask[df.rest==1].sum()/max(1,df.loc[test&(df.rest==1),'day'].nunique())),'work_alerts_per_day':float(mask[df.rest==0].sum()/max(1,df.loc[test&(df.rest==0),'day'].nunique())), 'lead_ge_10_recall':float((mask&(df.lead>=10)&(y==1)).sum()/max(1,y[test].sum()))}
  ix=test; caltable=[]
  for lo in np.arange(0,1,.1):
   m=ix&(p>=lo)&(p<(lo+.1) if lo<.9 else p<=1); caltable.append({'bin':round(lo,1),'n':int(m.sum()),'predicted':float(p[m].mean()) if m.sum() else None,'observed':float(y[m].mean()) if m.sum() else None})
  detail=df.loc[test].assign(y=y[test].values,p=p[test]).groupby(['route','direction','hour','rest']).agg(n=('y','size'),positives=('y','sum'),mean_prediction=('p','mean')).reset_index().to_dict('records')
  task={'prevalence':float(y[test].mean()),'selected_by_validation_pr_auc':selected,'models':result,'operations':operations,'calibration':caltable,'windows':detail,'lead_median':float(df.loc[test,'lead'].median()),'lead_p10':float(df.loc[test,'lead'].quantile(.1))}; summary['tasks'][f'{cap}_{kind}']=task
  threshold=operations['5']['threshold']; choices=[]
  for typ,mask in [('work',(df.rest==0)),('rest',(df.rest==1)&(df.long==0)),('consecutive_rest',df.long==1)]:
   ds=df.loc[test&mask].groupby('day').size();
   if len(ds):
    day=ds.index[len(ds)//2]; sub=df.loc[test&(df.day==day)].copy(); sub['probability']=p[sub.index];sub['alert']=sub.probability>=threshold
    choices.append({'type':typ,'day':day,'events':sub[['p','t','stop','route','direction','upstop','up_load','probability','alert','load']].to_dict('records')})
  replays[f'{cap}_{kind}']=choices
for filename,obj in [('metrics.json',summary),('dashboard_data.json',{'summary':summary,'replays':replays})]:
 with open(out/filename,'x') as f:json.dump(obj,f,ensure_ascii=False,allow_nan=False)
print(json.dumps(summary['counts']))
