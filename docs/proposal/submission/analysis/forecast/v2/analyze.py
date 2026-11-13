import argparse,json,sqlite3
from pathlib import Path
import numpy as np,pandas as pd
from sklearn.linear_model import Ridge,LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss
from lightgbm import LGBMRegressor
p=argparse.ArgumentParser();p.add_argument('db');p.add_argument('--output',required=True);a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
root=Path(__file__).resolve().parents[6];base=root/'public/data/lab';meta=json.loads((base/'seats/summary.json').read_text());cal=json.loads((base/'visualization/calendar.json').read_text())['days'];dates=pd.date_range('2024-01-01','2025-12-31');routes=meta['subroutes']
con=sqlite3.connect('file:'+str(Path(a.db).resolve())+'?mode=ro',uri=True);db=pd.read_sql_query('select board_date date, subroute, count(*) n from trips group by 1,2',con);con.close();db.date=pd.to_datetime(db.date);y=db.pivot(index='date',columns='subroute',values='n').reindex(index=dates,columns=routes).fillna(0);y['total']=y.sum(axis=1)
rest=pd.Series({pd.Timestamp(k):bool(v.get('rest')) for k,v in cal.items()}).reindex(dates).fillna(False);grp=(rest!=rest.shift()).cumsum();length=rest.groupby(grp).transform('sum');pos=rest.groupby(grp).cumsum();holiday=rest&(length>=3);typ=pd.Series(np.where(holiday,'holiday',np.where(rest,'rest','work')),index=dates)
rows=[]
for f in sorted((base/'seats').glob('arrivals-????-??.json')):
 j=json.loads(f.read_text());d=pd.DataFrame(j['rows'],columns=j['columns']);d['date']=pd.to_datetime(f.stem[-7:]+'-'+d.day.astype(str).str.zfill(2));rows.append(d)
r=pd.concat(rows,ignore_index=True);r['hour']=r.minute//60
mid=['埔里站','崎下','魚池','暨南大學校內','九族文化村','日月老茶廠','大雁','桃米坑','向山行政中心','暨南大學','牛耳石雕公園','水社'];eligible=r.stop.isin([meta['stops'].index(s) for s in mid])&(r.load>0)
for cap in (41,37):r['hot'+str(cap)]=(eligible&(r.load>=cap-5)).astype(int)
win=['subroute','direction','hour'];daily=r.groupby(['date']+win)[['boarded','hot41','hot37']].sum();windows=daily.index.droplevel(0).unique();idx=pd.MultiIndex.from_product([dates,range(len(windows))],names=['date','w']);wdf=windows.to_frame(index=False);lookup={tuple(v):i for i,v in enumerate(wdf.to_numpy())};dd=daily.reset_index();dd['w']=[lookup[tuple(v)] for v in dd[win].to_numpy()];cube=dd.set_index(['date','w'])[['boarded','hot41','hot37']].reindex(idx,fill_value=0);nwin=len(windows)
# Features for any date use only values at least seven days old.
def features(col):
 z=pd.DataFrame(index=dates);z['rest']=rest.astype(int);z['holiday']=holiday.astype(int);z['length']=length;z['position']=pos;z['dow']=dates.dayofweek;z['month']=dates.month;z['lag364']=y[col].shift(364);z['mean4']=sum(y[col].shift(i*7) for i in range(1,5))/4;return z
hold=dates[dates>='2025-07-01'];pred=[]; thresholds={}
for col in ['total']+routes:
 X=features(col);valid=X.notna().all(axis=1);sel=(dates>='2025-04-01')&(dates<='2025-06-30')&valid
 # Fixed threshold from selection outcomes, available before holdout.
 thresholds[col]=float(y.loc[sel,col].quantile(.9))
 train0=valid&(dates<='2025-03-31'); xs=X.loc[train0]; ys=y.loc[train0,col]; vs=X.loc[sel]; pt={'naive':vs['mean4'].to_numpy(),'ridge':Ridge(alpha=30).fit(xs,ys).predict(vs),'lightgbm':LGBMRegressor(n_estimators=60,num_leaves=7,verbosity=-1,n_jobs=1,random_state=5).fit(xs,ys).predict(vs)}; thresholds[col+'_pred']={k:float(np.quantile(v,.9)) for k,v in pt.items()}
 for d in hold:
  train=valid&(dates<=d-pd.Timedelta(days=7));xx=X.loc[train];yy=y.loc[train,col];t=X.loc[[d]]
  models={'naive':float(t['mean4'].iloc[0]),'ridge':float(Ridge(alpha=30).fit(xx,yy).predict(t)[0]),'lightgbm':float(LGBMRegressor(n_estimators=60,num_leaves=7,verbosity=-1,n_jobs=1,random_state=5).fit(xx,yy).predict(t)[0])}
  for model,v in models.items():pred.append([d,col,model,max(v,0),float(y.loc[d,col])])
pred=pd.DataFrame(pred,columns=['date','route','model','pred','actual']);rng=np.random.default_rng(5)
def metric(g):
 a=g.actual.to_numpy();q=g.pred.to_numpy();err=abs(a-q);inds=rng.integers(0,len(a),(500,len(a)));bs=100*err[inds].sum(axis=1)/np.maximum(a[inds].sum(axis=1),1);t=thresholds[g.route.iloc[0]];actual=a>=t;forecast=q>=thresholds[g.route.iloc[0]+'_pred'][g.model.iloc[0]];tp=(actual&forecast).sum();return dict(n=len(a),wape=100*err.sum()/max(a.sum(),1),wape_ci=np.percentile(bs,[2.5,97.5]).tolist(),mae=float(err.mean()),smape=float(100*np.mean(2*err/np.maximum(a+q,1))),peak_threshold=t,prediction_threshold=thresholds[g.route.iloc[0]+'_pred'][g.model.iloc[0]],precision=float(tp/forecast.sum()) if forecast.sum() else None,recall=float(tp/actual.sum()) if actual.sum() else None)
metrics=[]
for (route,model),g in pred.groupby(['route','model']):
 for cat,mask in [('all',np.ones(len(g),bool)),('work',~rest.reindex(g.date).to_numpy()),('rest_or_holiday',rest.reindex(g.date).to_numpy()),('holiday',holiday.reindex(g.date).to_numpy())]:
  if mask.sum():metrics.append(dict(route=route,model=model,category=cat,**metric(g.iloc[np.flatnonzero(mask)])))
# Historical category means through D-7. Model allocation scales same-category window means to the route forecast.
arr=cube.boarded.to_numpy().reshape(len(dates),nwin);hot={c:(cube['hot'+str(c)].to_numpy().reshape(len(dates),nwin)>0).astype(int) for c in (41,37)};records=[];shape=[]
for d in hold:
 i=dates.get_loc(d);ix=np.where((dates<=d-pd.Timedelta(days=7))&(typ.to_numpy()==typ.loc[d]))[0];mean=arr[ix].mean(axis=0);routepred=pred[(pred.date==d)&(pred.model=='lightgbm')].set_index('route')['pred'];scaled=mean.copy()
 for route in range(len(routes)):
  mask=wdf.subroute.to_numpy()==route;s=mean[mask].sum();scaled[mask]*=routepred[routes[route]]/s if s else 0
 for w in range(nwin):
  item=dict(date=str(d.date()),w=w,actual=float(arr[i,w]),baseline=float(mean[w]),forecast=float(scaled[w]))
  for c in (41,37):item['h'+str(c)]=int(hot[c][i,w]);item['freq'+str(c)]=float((hot[c][ix,w].sum()+1)/(len(ix)+2))
  records.append(item)
w=pd.DataFrame(records);w=w.merge(wdf.reset_index().rename(columns={'index':'w'}),on='w');w['type']=typ.reindex(pd.to_datetime(w.date)).to_numpy()
# Probability calibration fitted once on selection period using strictly lagged same-window frequencies; no holdout labels used.
window_metrics=[];planning=[]
for cap in (41,37):
 train=[]
 for d in dates[(dates>='2025-04-01')&(dates<='2025-06-30')]:
  i=dates.get_loc(d);ix=np.where((dates<=d-pd.Timedelta(days=7))&(typ.to_numpy()==typ.loc[d]))[0];freq=(hot[cap][ix].sum(axis=0)+1)/(len(ix)+2);demand=arr[ix].mean(axis=0)
  train.extend(zip(freq,np.log1p(demand),np.full(nwin,int(holiday.loc[d])),hot[cap][i]))
 tr=np.array(train);clf=LogisticRegression(max_iter=500).fit(tr[:,:3],tr[:,3]);w['prob'+str(cap)]=clf.predict_proba(np.column_stack([w['freq'+str(cap)],np.log1p(w.forecast), (w.type=='holiday').astype(int)]))[:,1]
 actual=w['h'+str(cap)].to_numpy();probs=w['prob'+str(cap)].to_numpy();calib=[]
 for lo,hi in zip([0,.05,.1,.2,.4],[.05,.1,.2,.4,1.01]):
  m=(probs>=lo)&(probs<hi)
  if m.sum():calib.append(dict(lower=lo,upper=hi,n=int(m.sum()),pred=float(probs[m].mean()),actual=float(actual[m].mean())))
 for k in (1,3,5):
  scores=[]
  for _,g in w.groupby('date'):
   selected=g.nlargest(k,'prob'+str(cap));scores.append((int(selected['h'+str(cap)].sum()),int(g['h'+str(cap)].sum())))
  s=np.array(scores);ix=rng.integers(0,len(s),(500,len(s)));precision=s[:,0].sum()/(len(s)*k);coverage=s[:,0].sum()/max(s[:,1].sum(),1);bs=s[ix];ci=np.percentile(bs[:,:,0].sum(axis=1)/np.maximum(bs[:,:,1].sum(axis=1),1),[2.5,97.5]);pci=np.percentile(bs[:,:,0].sum(axis=1)/(len(s)*k),[2.5,97.5]);window_metrics.append(dict(capacity=cap,k=k,precision=precision,precision_ci=pci.tolist(),coverage=coverage,coverage_ci=ci.tolist(),pr_auc=float(average_precision_score(actual,probs)),brier=float(brier_score_loss(actual,probs)),calibration=calib))
for d in [hold[0],hold[-1]]:
 day=w[w.date==str(d.date())].nlargest(5,'prob41');pday=pred[(pred.date==d)&(pred.route=='total')&(pred.model=='lightgbm')].iloc[0];planning.append(dict(date=str(d.date()),predicted_total=round(pday.pred),level='高' if pday.pred>=thresholds['total'] else '一般',windows=[dict(subroute=routes[int(x.subroute)],direction=meta['directions'][int(x.direction)],hour=int(x.hour),probability=round(x.prob41,3)) for x in day.itertuples()]))
shape_metrics=[]
for cat,g in w.groupby('type'):
 for hour,h in g.groupby('hour'):
  shape_metrics.append(dict(type=cat,hour=int(hour),actual=float(h.actual.sum()),predicted=float(h.forecast.sum()),baseline=float(h.baseline.sum()),wape=float(abs(h.actual-h.forecast).sum()/max(h.actual.sum(),1)),baseline_wape=float(abs(h.actual-h.baseline).sum()/max(h.actual.sum(),1))))
holidays=[]
for _,inds in rest[holiday].groupby(grp[holiday]).groups.items():
 ds=pd.DatetimeIndex(inds);ordinary=y.loc[rest&~holiday&(dates.year==ds[0].year),'total'];sub=r[r.date.isin(ds)];peaks={}
 for period,hrs in [('morning',range(6,10)),('afternoon',range(15,19))]:
  h=sub[sub.hour.isin(hrs)].groupby(['direction','hour']).boarded.sum();peaks[period]={meta['directions'][int(di)]:int(h.loc[di].idxmax()) for di in h.index.get_level_values(0).unique()}
 e=pred[(pred.date.isin(ds))&(pred.route=='total')&(pred.model=='lightgbm')];holidays.append(dict(start=str(ds[0].date()),end=str(ds[-1].date()),notes=sorted({str(cal[d.strftime('%Y-%m-%d')].get('note','')) for d in ds}-{''}),ratio=float(y.loc[ds,'total'].mean()/ordinary.mean()),peaks=peaks,mae=float(abs(e.actual-e.pred).mean()) if len(e) else None))
top=y[routes].sum().nlargest(3).index.tolist();pred.date=pred.date.dt.strftime('%Y-%m-%d');dashboard=dict(holdout=pred[(pred.route.isin(['total']+top))&(pred.model=='lightgbm')].round(2).to_dict('records'),hourly=shape_metrics,window_backtest=window_metrics,holidays=holidays,planning=planning,top_routes=top)
pairs=[]
for route in ['total']+routes:
 basep=pred[(pred.route==route)&(pred.model=='naive')].sort_values('date');
 for model in ['ridge','lightgbm']:
  other=pred[(pred.route==route)&(pred.model==model)].sort_values('date'); aa=basep.actual.to_numpy(); diff=abs(basep.pred.to_numpy()-aa)-abs(other.pred.to_numpy()-aa); ix=rng.integers(0,len(aa),(2000,len(aa))); samples=100*diff[ix].sum(axis=1)/aa[ix].sum(axis=1);pairs.append(dict(route=route,model=model,wape_improvement_pp=float(100*diff.sum()/aa.sum()),ci=np.percentile(samples,[2.5,97.5]).tolist()))
for name,obj in [('dashboard_data.json',dashboard),('metrics.json',dict(daily=metrics,paired=pairs,window=window_metrics,hourly=shape_metrics))]:
 with (out/name).open('x') as f:json.dump(obj,f,ensure_ascii=False,allow_nan=False,separators=(',',':'))
print(json.dumps({'daily':[m for m in metrics if m['route']=='total' and m['category']=='all'],'window':window_metrics},ensure_ascii=False))
