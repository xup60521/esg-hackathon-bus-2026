import argparse, sqlite3, pathlib, json, collections, bisect, datetime, math, statistics
p=argparse.ArgumentParser(); p.add_argument('db'); p.add_argument('--out',required=True); a=p.parse_args()
out=pathlib.Path(a.out); out.mkdir(parents=True,exist_ok=True)
for n in ['dashboard_data.json','README.zh-TW.md']:
 if (out/n).exists(): raise FileExistsError(out/n)
root=pathlib.Path(__file__).resolve().parents[6]
cal=json.loads((root/'public/data/lab/visualization/calendar.json').read_text())['days']
mid=set('埔里站 崎下 魚池 暨南大學校內 九族文化村 日月老茶廠 大雁 桃米坑 向山行政中心 暨南大學 牛耳石雕公園 水社'.split())
c=sqlite3.connect('file:'+str(pathlib.Path(a.db).resolve())+'?mode=ro',uri=True)
cur=c.execute('select vehicle,board_date,board_ts,alight_ts,board_stop,alight_stop,board_seq,alight_seq,subroute from trips where vehicle is not null and board_ts is not null and alight_ts is not null order by vehicle,board_date,board_ts,id')
windows=collections.defaultdict(lambda:collections.defaultdict(lambda:[0,0,0,0,0,set()])); runs=0; stops=0; totalarr=0; missing=0; reversed_count=0

def process(group):
 global runs,stops,totalarr,missing,reversed_count
 valid=[]
 for t in group:
  v,date,b,e,bs,es,bseq,eseq,sub=t
  if bs==es or not 180<=e-b<=14400: continue
  if bseq is None or eseq is None or bseq==eseq: missing+=1; continue
  valid.append(t)
 if not valid:return
 boards=sorted(t[2] for t in valid); ends=sorted(t[3] for t in valid)
 chunks=[]; chunk=[]; prev=None
 for t in valid:
  direction=1 if t[7]>t[6] else -1
  if prev and (direction!=prev[0] or t[2]-prev[1]>5400 or (t[6]-prev[2])*direction<0):
   if direction==prev[0] and (t[6]-prev[2])*direction<0: reversed_count+=1
   chunks.append(chunk); chunk=[]
  chunk.append(t); prev=(direction,t[2],t[6])
 if chunk: chunks.append(chunk)
 for chunk in chunks:
  runs+=1; arrivals=[]
  for t in chunk:
   if arrivals and arrivals[-1][-1][4]==t[4] and t[2]-arrivals[-1][-1][2]<=600: arrivals[-1].append(t)
   else: arrivals.append([t])
  stops+=len(arrivals); totalarr+=len(arrivals)
  for arr in arrivals:
   t=arr[0]; date=t[1]; load=bisect.bisect_left(boards,t[2])-bisect.bisect_right(ends,t[2]);
   if t[4] not in mid or load<=0: continue
   hour=datetime.datetime.fromtimestamp(t[2],datetime.timezone(datetime.timedelta(hours=8))).hour
   key=(t[8], 'outbound' if t[7]>t[6] else 'inbound',hour,'休息日' if cal[date]['rest'] else '平日')
   x=windows[key][date]; x[0]+=1; x[1]+=load>=36; x[2]+=load>=32; x[3]+=len(arr)*(load>=36); x[4]+=len(arr)*(load>=32); x[5].add(runs)
last=None; group=[]
for t in cur:
 key=t[:2]
 if last is not None and key!=last: process(group); group=[]
 group.append(t); last=key
if group:process(group)
rows=[]
for key,days in windows.items():
 x=list(days.values()); n=sum(z[0] for z in x); row=dict(zip(('subroute','direction','hour','day_type'),key)); row.update(days=len(x),denominator=n,near41=sum(z[1] for z in x),near37=sum(z[2] for z in x),boarded41=sum(z[3] for z in x),boarded37=sum(z[4] for z in x),runs=sum(len(z[5]) for z in x))
 for cap,i in ((41,1),(37,2)):
  rate=row['near'+str(cap)]/n; row['rate'+str(cap)]=rate; row['se_day_cluster'+str(cap)]=math.sqrt(sum((z[i]-rate*z[0])**2 for z in x)*len(x)/(len(x)-1))/n if len(x)>1 else None
 rows.append(row)
rows.sort(key=lambda x:-x['near41'])
old=json.loads((root/'public/data/lab/seats/summary.json').read_text())['arrivals']
data={'windows':rows,'top10':rows[:10],'reconstruction':{'runs':runs,'arrivals':totalarr,'mean_stops':stops/runs,'existing_arrivals':old,'arrival_count_ratio':totalarr/old,'missing_direction_trips':missing,'backward_splits':reversed_count},'concentration':None,'scenario_a':None,'scenario_b':None,'cost_carbon':None}
with (out/'dashboard_data.json').open('x') as f: json.dump(data,f,ensure_ascii=False,separators=(',',':'))
lines=['# 調度與永續情境：未完成的 run 重建','',f'【事實】有效旅次依車碼、日、時間排序，方向或站序反轉、間隔超過 90 分鐘切分，共 {runs:,} 個 run，平均 {stops/runs:.2f} 個有人刷卡的站；到站共 {totalarr:,}，既有到站檔 {old:,}，數量比 {totalarr/old:.3f}。站序倒退切分 {reversed_count:,} 次，方向無法判定排除 {missing:,} 筆。數量相近不等於逐筆吻合。','', '【方法】同車同日有效旅次，上車時間小於第一筆刷卡、下車時間大於該時刻者計入上車前載客；同站連續刷卡間隔不超過 10 分鐘合併。門檻 41 席 ≥36、37 席 ≥32；分母為 12 中途站且載客大於 0 的到站。方向依站序增加為 outbound，減少為 inbound；窗口日類使用日曆休息日。數據屬重建，非車型或班表實測。','', '|子路線|方向|時|日類|日期數|run 數|分母|41 席到站／上車人次|37 席到站／上車人次|', '|---|---|---:|---|---:|---:|---:|---:|---:|']
for x in rows[:10]: lines.append(f"|{x['subroute']}|{x['direction']}|{x['hour']}|{x['day_type']}|{x['days']}|{x['runs']}|{x['denominator']}|{x['near41']}／{x['boarded41']}|{x['near37']}／{x['boarded37']}|")
lines += ['', '【限制】此交付尚未計算 run 最大中途站載客、熱點 run 數、逐日期熱點頻率、相鄰 run、留出集中度、情境 A/B、成本與碳或連假分類。表格的日期與 run 數是分母中的總數，不是熱點數。JSON 的 null 表示未完成，並非零。未逐筆比對既有到站列，run 邊界與同秒上車可能造成差異。僅見成功刷卡上車，無法測量被留下者、現金、漏刷或無人上車的過站；載客異常可能源自重建誤差，不能指控超載。需求會隨容量與資訊改變，不能將曝光量當成實際效益。車碼和車型對照未知。','', '## 重跑', '', '`python analyze.py /path/to/trips.db --out /path/to/new-output`。資料庫唯讀；輸出使用獨佔新建，請指定空資料夾。', '', 'JSON 的 windows 依子路線、方向、小時、日類列出分母、兩種門檻到站數、上車人次、比例與日期叢聚標準誤；top10 按全期 near41 排序，不應作留出驗證。reconstruction 為總量核對。']
with (out/'README.zh-TW.md').open('x') as f: f.write('\n'.join(lines)+'\n')
