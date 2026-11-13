import argparse, json, sqlite3
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge

p=argparse.ArgumentParser(); p.add_argument('db'); p.add_argument('--output', required=True); a=p.parse_args()
out=Path(a.output); out.mkdir(parents=True,exist_ok=True)
root=Path(__file__).resolve().parents[5]
base=root/'public/data/lab'; meta=json.loads((base/'seats/summary.json').read_text()); cal=json.loads((base/'visualization/calendar.json').read_text())['days']
con=sqlite3.connect('file:'+str(Path(a.db).resolve())+'?mode=ro',uri=True)
db=pd.read_sql_query("select board_date date, subroute, count(*) n from trips group by 1,2",con); con.close()
db['date']=pd.to_datetime(db.date); dates=pd.date_range('2024-01-01','2025-12-31'); routes=meta['subroutes']
y=db.pivot_table(index='date',columns='subroute',values='n',fill_value=0).reindex(index=dates,columns=routes,fill_value=0); y['total']=y.sum(axis=1)
rows=[]
for f in sorted((base/'seats').glob('arrivals-????-??.json')):
 j=json.loads(f.read_text()); df=pd.DataFrame(j['rows'],columns=j['columns']); df['date']=pd.to_datetime(f.stem[-7:]+'-'+df.day.astype(str).str.zfill(2)); rows.append(df)
r=pd.concat(rows,ignore_index=True); r['hour']=r.minute//60
mid=['埔里站','崎下','魚池','暨南大學校內','九族文化村','日月老茶廠','大雁','桃米坑','向山行政中心','暨南大學','牛耳石雕公園','水社']; r['eligible']=r.stop.isin([meta['stops'].index(s) for s in mid]) & (r.load>0)
for cap in [41,37]: r['hot'+str(cap)]=r.eligible & (r.load>=cap-5)
rest=pd.Series({pd.Timestamp(k):bool(v.get('rest')) for k,v in cal.items()}).reindex(dates).fillna(False)
groups=(rest!=rest.shift()).cumsum(); lengths=rest.groupby(groups).transform('sum'); positions=rest.groupby(groups).cumsum(); holiday=rest & (lengths>=3)
def features(idx):
 x=pd.DataFrame(index=idx); x['dow']=idx.day_of_week; x['month']=idx.month; x['rest']=rest.reindex(idx).astype(int); x['length']=lengths.reindex(idx); x['position']=positions.reindex(idx); return pd.get_dummies(x,columns=['dow','month'],dtype=float).reindex(columns=feature_cols,fill_value=0)
feature_cols=['rest','length','position']+['dow_'+str(i) for i in range(7)]+['month_'+str(i) for i in range(1,13)]
# Fixed 14-day origin: no future observations enter the training set.
preds=[]; origins=pd.date_range('2025-07-01','2025-12-31',freq='14D')
for origin in origins:
 train=dates[dates<origin]; test=dates[(dates>=origin)&(dates<origin+pd.Timedelta(days=14))]; X=features(train); T=features(test)
 for col in ['total']+routes:
  yy=y.loc[train,col]; models={'ridge':Ridge(alpha=30).fit(X,yy).predict(T), 'calendar_gbdt':HistGradientBoostingRegressor(max_iter=100,max_leaf_nodes=7,l2_regularization=20,random_state=17).fit(X,yy).predict(T)}
  models['four_week']=[yy.reindex([d-pd.Timedelta(days=7*i) for i in range(1,5)]).mean() for d in test]
  models['last_year']=[yy.get(d-pd.Timedelta(days=364),np.nan) for d in test]
  for model,values in models.items():
   for d,v in zip(test,values): preds.append([d,col,model,max(0,float(v)),float(y.loc[d,col])])
pred=pd.DataFrame(preds,columns=['date','route','model','pred','actual']); rng=np.random.default_rng(5)
def metrics(g):
 a=g.actual.to_numpy(); p=g.pred.to_numpy(); err=np.abs(a-p); den=a.sum(); w=100*err.sum()/den if den else np.nan
 boots=[]
 for _ in range(500):
  ix=rng.integers(0,len(a),len(a)); denom=a[ix].sum(); boots.append(100*err[ix].sum()/denom if denom else np.nan)
 peak=a>=np.quantile(a,.9); predicted=p>=np.quantile(p,.9)
 return dict(n=len(a),wape=w,wape_ci=np.nanpercentile(boots,[2.5,97.5]).tolist(),mae=err.mean(),smape=100*np.mean(2*err/np.maximum(a+p,1)),peak_recall=float((peak & predicted).sum()/peak.sum()))
metrics_out=[]
for (route,model),g in pred.groupby(['route','model']):
 for name,mask in [('all',np.ones(len(g),bool)),('holiday',holiday.reindex(g.date).to_numpy()),('ordinary',~holiday.reindex(g.date).to_numpy())]:
  if sum(mask): metrics_out.append(dict(route=route,model=model,category=name,**metrics(g.iloc[np.flatnonzero(mask)])))
# Rank windows by historical mean hot arrivals for matching day type, trained strictly before origin.
r['type']=np.where(holiday.reindex(r.date).to_numpy(),'holiday',np.where(rest.reindex(r.date).to_numpy(),'rest','work'))
windows=['subroute','direction','hour']; daily=r.groupby(['date']+windows)[['hot41','hot37','boarded']].sum().reset_index(); daily['type']=np.where(holiday.reindex(daily.date).to_numpy(),'holiday',np.where(rest.reindex(daily.date).to_numpy(),'rest','work'))
results=[]; ranked=[]
for cap in [41,37]:
 hit={k:[0,0,0,0] for k in range(1,6)}
 for origin in origins:
  hist=daily[daily.date<origin]; future=dates[(dates>=origin)&(dates<origin+pd.Timedelta(days=14))]
  scores=hist.groupby(['type']+windows)['hot'+str(cap)].sum(); counts=pd.Series(np.where(holiday.loc[dates[dates<origin]],'holiday',np.where(rest.loc[dates[dates<origin]],'rest','work'))).value_counts()
  scores=scores.div(counts,level='type').rename('hot'+str(cap)).reset_index().sort_values('hot'+str(cap),ascending=False)
  for d in future:
   typ='holiday' if holiday.loc[d] else 'rest' if rest.loc[d] else 'work'; actual=daily[daily.date==d]; rank=scores[scores.type==typ].head(5)
   if origin==origins[-1]:
    for row in rank.itertuples(index=False): ranked.append(dict(capacity=cap,category=typ,subroute=meta['subroutes'][row.subroute],direction=meta['directions'][row.direction],hour=int(row.hour),score=float(getattr(row,'hot'+str(cap)))))
   for k in hit:
    chosen=rank.head(k); matched=actual.merge(chosen[windows],on=windows); h=hit[k]; h[0]+=int((matched['hot'+str(cap)]>0).sum()); h[1]+=int((actual['hot'+str(cap)]>0).sum()); h[2]+=int(matched['hot'+str(cap)].sum()); h[3]+=int(actual['hot'+str(cap)].sum())
 for k,h in hit.items(): results.append(dict(capacity=cap,k=k,hit_windows=h[0],all_hot_windows=h[1],hit_arrivals=h[2],all_hot_arrivals=h[3],days=len(dates[dates>=origins[0]]),recommended_window_hours_per_day=k))
shape=r.groupby(['type','hour']).boarded.sum().reset_index(); daycounts=pd.Series(np.where(holiday,'holiday',np.where(rest,'rest','work'))).value_counts(); shape['per_day']=shape.apply(lambda q:q.boarded/daycounts[q['type']],axis=1)
holidays=[]
for group,inds in rest[holiday].groupby(groups[holiday]).groups.items():
 ds=pd.DatetimeIndex(inds); ordinary=y.loc[rest & ~holiday & (y.index.year==ds[0].year),'total']; notes=sorted({str(cal[d.strftime('%Y-%m-%d')].get('note','')) for d in ds}-{''}); sub=r[r.date.isin(ds)]; h=sub.groupby(['direction','hour']).boarded.sum(); peaks={meta['directions'][int(di)]:int(h.loc[di].idxmax()) for di in h.index.get_level_values(0).unique()}; e=pred[(pred.date.isin(ds))&(pred.route=='total')&(pred.model=='ridge')]; holidays.append(dict(start=str(ds[0].date()),end=str(ds[-1].date()),notes=notes,mean=float(y.loc[ds,'total'].mean()),ratio=float(y.loc[ds,'total'].mean()/ordinary.mean()),peak_hour_by_direction=peaks,ridge_mae=float(abs(e.actual-e.pred).mean()) if len(e) else None))
for col in ['date']: pred[col]=pred[col].dt.strftime('%Y-%m-%d')
top=y[routes].sum().nlargest(3).index.tolist(); dashboard=dict(holdout=pred[(pred.route.isin(['total']+top)) & (pred.model=='ridge')].to_dict('records'),hourly=shape[['type','hour','per_day']].to_dict('records'),window_ranking=ranked,backtest=results,holidays=holidays,metrics=metrics_out,top_routes=top)
with (out/'dashboard_data.json').open('x') as f: json.dump(dashboard,f,ensure_ascii=False,allow_nan=False,separators=(',',':'))
with (out/'metrics.json').open('x') as f: json.dump(metrics_out,f,ensure_ascii=False,indent=2,allow_nan=False)
print(json.dumps({'metrics':[x for x in metrics_out if x['route']=='total' and x['category']=='all'],'backtest':results,'holidays':holidays},ensure_ascii=False))
