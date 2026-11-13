import argparse, sqlite3, pathlib, json, heapq, collections, datetime
import numpy as np, pandas as pd
p=argparse.ArgumentParser(); p.add_argument('db'); p.add_argument('--out',required=True); a=p.parse_args()
out=pathlib.Path(a.out); out.mkdir(parents=True,exist_ok=True)
for f in ['results.json','README.zh-TW.md']:
 if (out/f).exists(): raise FileExistsError(out/f)
root=pathlib.Path(__file__).resolve().parents[6]
cal=json.loads((root/'public/data/lab/visualization/calendar.json').read_text())['days']
mid=set('埔里站 崎下 魚池 暨南大學校內 九族文化村 日月老茶廠 大雁 桃米坑 向山行政中心 暨南大學 牛耳石雕公園 水社'.split())
con=sqlite3.connect(pathlib.Path(a.db).resolve().as_uri()+'?mode=ro',uri=True)
q='''select vehicle, board_date, board_ts, alight_ts, board_stop, alight_stop, board_seq, alight_seq, subroute from trips where alight_ts-board_ts between 180 and 14400 and board_stop != alight_stop and board_seq is not null and alight_seq is not null and board_seq != alight_seq order by vehicle, board_date, board_ts, id'''
runs=[]; group=[]; key=None; arrivals=0

def process(g):
 global arrivals
 if not g:return
 heap=[]; prev=None; run=None; current=None
 for v,day,t,end,stop,alstop,seq,aseq,sub in g:
  direction=1 if aseq>seq else -1
  while heap and heap[0]<=t: heapq.heappop(heap)
  new=prev is None or direction!=prev[0] or (seq-prev[1])*direction<0 or t-prev[2]>5400
  if new:
   run={'date':day,'start':t,'sub':sub,'direction':'outbound' if direction==1 else 'inbound','max':0,'hit36':None,'hit32':None,'stops':0}; runs.append(run)
  if current is None or stop!=current[0] or t-current[1]>600:
   arrivals+=1; run['stops']+=1
   load=len(heap)
   if stop in mid and load>0:
    run['max']=max(run['max'],load)
    for th in (32,36):
     if load>=th and run['hit'+str(th)] is None: run['hit'+str(th)]=t
  current=(stop,t); heapq.heappush(heap,end); prev=(direction,seq,t)
for row in con.execute(q):
 k=row[:2]
 if k!=key: process(group); group=[]; key=k
 group.append(row)
process(group); con.close()
df=pd.DataFrame(runs); df['hour']=((df.start+28800)//3600)%24; df['rest']=df.date.map(lambda d: cal[d]['rest']); df=df.sort_values(['date','sub','direction','start']).reset_index(drop=True)
# Same-time ties have no known ordering and are excluded as predecessors.
g=df.groupby(['date','sub','direction'],sort=False)
for k in (1,2):
 for c in ['start','max','hit32','hit36']: df[f'prev{k}_{c}']=g[c].shift(k)
summary=json.loads((root/'public/data/lab/seats/summary.json').read_text())
# Recover the exact training-period top ten by arrival event hour, not run start.
counter=collections.Counter()
for f in sorted((root/'public/data/lab/seats').glob('arrivals-*.json')):
 d=json.loads(f.read_text()); month=d['month']
 if month>'2025-03': continue
 for day,stop,minute,sub,di,load,boarded in d['rows']:
  date=f'{month}-{day:02d}'
  if summary['stops'][stop] in mid and load>=36: counter[(summary['subroutes'][sub],summary['directions'][di],minute//60,cal[date]['rest'])]+=1
top=[x for x,n in sorted(counter.items(),key=lambda x:(-x[1],x[0]))[:10]]
df['hot']=[(s,d,int(h),r) in top for s,d,h,r in zip(df['sub'],df.direction,df.hour,df.rest)]
rng=np.random.default_rng(20261113)
def calc(x,num,den,days):
 n=np.asarray(num,dtype=float); d=np.asarray(den,dtype=float); N=float(n.sum()); D=float(d.sum())
 daily=pd.DataFrame({'day':x.date,'n':n,'d':d}).groupby('day').sum().reindex(days,fill_value=0).to_numpy()
 ix=rng.integers(0,len(days),(1000,len(days))); sums=daily[ix].sum(axis=1); z=np.divide(sums[:,0],sums[:,1],out=np.full(1000,np.nan),where=sums[:,1]>0)
 return {'numerator':N,'denominator':D,'value':N/D if D else None,'ci95':np.nanpercentile(z,[2.5,97.5]).tolist() if D else None,'unreliable':D<30}
result={'method':'每日 bootstrap 1000 次，seed 20261113','top10':[list(x) for x in top],'reconstruction':{'runs':len(df),'mean_observed_stops':float(df.stops.mean()),'reconstructed_arrivals':arrivals,'reference_arrivals':summary['arrivals']},'periods':{}}
for name,start,end in [('train','2024-01-01','2025-03-31'),('holdout','2025-07-01','2025-12-31')]:
 x=df[(df.date>=start)&(df.date<=end)].copy(); days=pd.date_range(start,end).strftime('%Y-%m-%d'); o={'runs':len(x),'observable_runs':int((x['max']>0).sum()),'thresholds':{}}
 for th in (36,32):
  y=x['max']>=th; observable=x['max']>0; z={}
  for k in (1,2):
   eligible=observable & x[f'prev{k}_start'].notna() & (x[f'prev{k}_start']<x.start); triggered=eligible & (x[f'prev{k}_max']>=th)
   # matched contemporaneous baseline, weighted by the triggered target windows
   keys=['sub','direction','hour','rest']; base=x[observable].assign(y=y[observable].astype(int)).groupby(keys).y.mean(); b=pd.MultiIndex.from_frame(x[keys]).map(base).to_numpy(dtype=float); b=np.nan_to_num(b)
   entry={'conditional':calc(x,y&triggered,triggered,days),'matched_baseline':calc(x,b*triggered,triggered,days)}
   # calc accepts fractional baseline; preserve exact mean (numerator is an expected count)
   entry['matched_baseline']['value']=float(b[triggered].mean()) if triggered.any() else None
   if k==1:
    gaps=(x.start-x.prev1_start)[eligible]/60; entry['gap_minute_quartiles']=np.percentile(gaps,[25,50,75]).tolist()
   z['k'+str(k)]=entry
  timely=(x.prev1_hit36 if th==36 else x.prev1_hit32)<x.start
  for label,mask in [('previous',timely.fillna(False)&(x.prev1_start<x.start)),('hot',x.hot),('all',pd.Series(True,index=x.index))]:
   daily=x.assign(alert=mask).groupby('date').alert.sum().reindex(days,fill_value=0).to_numpy(); samples=daily[rng.integers(0,len(days),(1000,len(days)))].mean(axis=1); z[label]={'precision':calc(x,y&mask,mask&observable,days),'coverage':calc(x,y&mask,y,days),'alerts_per_day':{'numerator':int(mask.sum()),'denominator':len(days),'value':float(daily.mean()),'ci95':np.percentile(samples,[2.5,97.5]).tolist()},'unobservable_alerts':int((mask&~observable).sum())}
  z['hot_windows']=[]
  for window in top:
   mask=observable&(x['sub']==window[0])&(x.direction==window[1])&(x.hour==window[2])&(x.rest==window[3]); prev=mask&((x.prev1_hit36 if th==36 else x.prev1_hit32)<x.start)&(x.prev1_start<x.start)
   z['hot_windows'].append({'window':list(window),'conditional':calc(x,y&prev,prev,days),'baseline':calc(x,y&mask,mask,days)})
  o['thresholds'][str(th)]=z
 result['periods'][name]=o
with (out/'results.json').open('x') as f: json.dump(result,f,ensure_ascii=False,indent=2,allow_nan=False)
def pct(v): return '—' if v is None else f'{100*v:.1f}%'
def fmt(z):
 if z['value'] is None:return '無資料（不可靠）'
 ci=z['ci95']; return f"{pct(z['value'])}（{pct(ci[0])}–{pct(ci[1])}；{z['numerator']:.2f}/{z['denominator']:.0f}）"+(' 不可靠' if z.get('unreliable') else '')
lines=['# 相鄰班次座位不多：描述性分析','','【事實】以票證重建同日、同子路線與方向的相鄰 run，分別檢查 41 席 ≥36 人、37 席 ≥32 人。只評估 12 個指定中途站至少有一次上車前載客大於零的目標班次。區間為日期重抽 1,000 次的百分位 95% 區間；括號為分子／分母，分母小於 30 標為不可靠。未評估的班次不算負例。','','## 條件機率與同窗口基準','','基準為同一期間、目標班次的子路線×方向×起始小時×休息日的所有可評估班次事件率，以觸發樣本窗口分布加權。基準與條件組共用資料，屬描述性比較，並非獨立預測評估。基準分子為加權期望次數，可能非整數；各窗口基準由原始期間估計後固定，區間未反映基準估計誤差。未計算兩者差異的配對區間，不能據此判定有額外資訊。','','|期間|門檻|間隔|條件機率|同窗口基準|','|---|---:|---|---|---|']
for period,o in result['periods'].items():
 for th,z in o['thresholds'].items():
  for k in ('k1','k2'):
   e=z[k]; lines.append(f"|{period}|≥{th}|{k}|{fmt(e['conditional'])}|{fmt(e['matched_baseline'])}|")
lines+=['','## 班次提示','','前一班首次在中途站達門檻的時間早於下一班起始，才算可用提示；這需要已知下一班，並假設刷卡資料即時可用。精確率僅計可評估的被提示班次；涵蓋率分母是所有可評估且達門檻的班次；每日提示含不可評估班次，分母為整段日曆日。熱點以訓練期到站的 41 席達門檻次數排序，窗口以目標 run 起始小時近似，與原表的到站小時不同。','', '|期間|門檻|規則|精確率|涵蓋率|每日提示（95% 區間）|不可評估提示數|','|---|---:|---|---|---|---|---:|']
for period,o in result['periods'].items():
 for th,z in o['thresholds'].items():
  for k in ('previous','hot','all'):
   v=z[k]; d=v['alerts_per_day']; lines.append(f"|{period}|≥{th}|{k}|{fmt(v['precision'])}|{fmt(v['coverage'])}|{d['value']:.2f}（{d['ci95'][0]:.2f}–{d['ci95'][1]:.2f}）|{v['unobservable_alerts']}|")
lines+=['','## 前十窗口','','各列為起始窗口內、前一班門檻在本班起始前已觀察到的班次機率，及該窗口全部可評估班次基準。true 為休息日。窗口未依連假另細分。','','|窗口 子路線／方向／時／休息日|期間|門檻|前一班提示後|窗口基準|','|---|---|---:|---|---|']
for i,w in enumerate(top):
 for period,o in result['periods'].items():
  for th,z in o['thresholds'].items():
   v=z['hot_windows'][i]; lines.append(f"|{' / '.join(map(str,w))}|{period}|≥{th}|{fmt(v['conditional'])}|{fmt(v['baseline'])}|")
r=result['reconstruction']; lines+=['','## 重建與限制',f"【事實】全期重建 {r['runs']:,} 個 run，平均 {r['mean_observed_stops']:.2f} 個有人上車到站；重建到站 {r['reconstructed_arrivals']:,} 次，既有到站檔 {r['reference_arrivals']:,} 次，差 {r['reconstructed_arrivals']-r['reference_arrivals']:,} 次（總量比 {r['reconstructed_arrivals']/r['reference_arrivals']:.3%}），未逐筆配對。缺站序、同站、旅次小於 180 秒或大於 4 小時者排除。",'每車每日依刷卡時間排序，方向依上下車站序；方向反轉、站序倒退或相鄰刷卡間隔超過 90 分鐘切 run，同站視為遞進。起始時間是首筆刷卡時間，run 子路線取首筆。上車前載客以同車同日尚未下車旅次計數，時間同秒先處理下車；同站連續刷卡相隔至多 10 分鐘合併。站序遞增往日月潭（outbound），遞減往臺中（inbound）。不同車的同秒起始不判先後。', '班次是刷卡推估，可能分裂或合併真實班次，缺少無人刷卡班次、現金、漏刷及未上車乘客。無車型對照，兩種席數皆為情境，載客重建異常不可作超載指控。部分前一班在下一班起始後才達門檻，條件機率是回顧性關聯；操作提示只計事前已觀察到者，兩者不可直接等同。窗口基準及日重抽不修正未觀察班次或重建誤差。', '【推論】條件機率與窗口基準的差異尚無配對不確定度檢驗，不能宣稱前一班提供額外資訊，也不能直接推導調度效益。','', '## 重跑','','指定不存在輸出檔的新目錄；程式以 SQLite mode=ro 讀取，輸出以獨佔模式建立。','', '```sh', '/tmp/claude-1000/-home-zup-code-esg-hackathon-bus-2026/52074730-66f8-496b-af45-2f740ae8b487/scratchpad/ds-venv/bin/python docs/proposal/submission/analysis/adjacent/v1/analyze.py /path/to/trips.db --out /path/to/new-output', '```']
for period,o in result['periods'].items():
 q=o['thresholds']['36']['k1']['gap_minute_quartiles']; lines.insert(-5,f"【事實】{period}：{o['observable_runs']:,}/{o['runs']:,} 個 run 可評估；相鄰起始時間差第 25、50、75 百分位為 {q[0]:.1f}、{q[1]:.1f}、{q[2]:.1f} 分鐘。")
with (out/'README.zh-TW.md').open('x') as f:f.write('\n'.join(lines)+'\n')
