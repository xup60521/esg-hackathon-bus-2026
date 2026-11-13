import argparse, collections, glob, json, math, pathlib, sqlite3
p=argparse.ArgumentParser(); p.add_argument('db'); p.add_argument('--out',required=True); a=p.parse_args()
out=pathlib.Path(a.out); out.mkdir(parents=True,exist_ok=True)
for name in ('dashboard_data.json','README.zh-TW.md'):
 if (out/name).exists(): raise FileExistsError(out/name)
conn=sqlite3.connect('file:'+str(pathlib.Path(a.db).resolve())+'?mode=ro',uri=True); conn.execute('select 1 from trips limit 1').fetchone(); conn.close()
root=pathlib.Path(__file__).resolve().parents[5]
s=json.loads((root/'public/data/lab/seats/summary.json').read_text()); cal=json.loads((root/'public/data/lab/visualization/calendar.json').read_text())['days']
mid=set('埔里站 崎下 魚池 暨南大學校內 九族文化村 日月老茶廠 大雁 桃米坑 向山行政中心 暨南大學 牛耳石雕公園 水社'.split())
g=collections.defaultdict(lambda:collections.defaultdict(lambda:[0,0,0,0,0]))
for f in sorted(glob.glob(str(root/'public/data/lab/seats/arrivals-*.json'))):
 d=json.load(open(f))
 for day,stop,minute,sub,di,load,boarded in d['rows']:
  if s['stops'][stop] not in mid or load<=0: continue
  date=f"{d['month']}-{day:02d}"; key=(s['subroutes'][sub],s['directions'][di],minute//60,'休息日' if cal[date]['rest'] else '平日'); x=g[key][date]; x[0]+=1; x[1]+=load>=36; x[2]+=load>=32; x[3]+=boarded*(load>=36); x[4]+=boarded*(load>=32)
rows=[]
for key,days in g.items():
 vals=list(days.values()); n=sum(x[0] for x in vals)
 row=dict(zip(('subroute','direction','hour','day_type'),key)); row.update(days=len(days),denominator=n,near41=sum(x[1] for x in vals),near37=sum(x[2] for x in vals),boarded41=sum(x[3] for x in vals),boarded37=sum(x[4] for x in vals))
 for cap,i in ((41,1),(37,2)):
  rate=row['near'+str(cap)]/n; se=math.sqrt(sum((x[i]-rate*x[0])**2 for x in vals)/(len(vals)-1)*len(vals))/n if len(vals)>1 else None
  row['rate'+str(cap)]=round(rate,5); row['se_day_cluster'+str(cap)]=round(se,5) if se is not None else None
 rows.append(row)
rows.sort(key=lambda x:(-x['near41'],x['subroute'],x['direction'],x['hour'],x['day_type']))
data={'method':'依 41 席受影響到站總數排序；日期叢聚標準誤','windows':rows,'top10':rows[:10],'scenario_a':None,'scenario_b':None,'cost_carbon':None}
with (out/'dashboard_data.json').open('x') as f: json.dump(data,f,ensure_ascii=False,separators=(',',':'))
lines=['# 調度熱點：初步到站統計','', '【事實】使用既有重建到站列與休息日資料，僅保留指定 12 站及上車前載客大於零。門檻分別為 41 席情境 ≥36 人、37 席情境 ≥32 人。以 41 席受影響到站總數排序，這是暴露量排序，非成本效益排名。日期數為有符合分母到站的日期，不是熱點日期。方向採資料原始代碼。', '', '|子路線|方向|小時|日類|日期數|分母到站|41席到站（比例）|37席到站（比例）|41／37席上車人次|', '|---|---|---:|---|---:|---:|---:|---:|---:|']
for x in rows[:10]: lines.append(f"|{x['subroute']}|{x['direction']}|{x['hour']:02d}|{x['day_type']}|{x['days']}|{x['denominator']}|{x['near41']} ({x['rate41']:.1%})|{x['near37']} ({x['rate37']:.1%})|{x['boarded41']} / {x['boarded37']}|")
lines+=['','【推論】上述窗口可供業者優先核對班表和車型，不能據此判定應加班或調整無障礙車。上車人次不等於無座人次。JSON 每窗口含按日期叢聚的比例標準誤，反映同日到站相關性；不涵蓋重建系統誤差。', '', '【限制】到站檔沒有車碼或班次識別，尚未由原始旅次完成班次重建，因此無法可信估算相鄰班次不均、每加班緩解量、車型指派、成本與碳平衡點。JSON 對未完成項目使用 null；不可把它們視作零。僅可見成功刷卡者，無法量測被留下的人；重建載客可能出錯，不可據此指控超載。車型和車牌對照未知。不同日的近似獨立假設也可能不成立。', '', '## 重跑', '', '使用環境 Python，將輸出指定到不存在上述兩個檔案的資料夾，程式以唯讀模式檢查資料庫，並由本專案讀取已重建到站與日曆：', '', '```sh', 'python analyze.py /path/to/trips.db --out /path/to/new-output', '```', '', 'dashboard_data.json 的 windows 為子路線、方向、小時、日類細分；denominator 為 load>0 到站數，near41／near37 為門檻到站數，boarded41／boarded37 為這些到站的上車人次，rate 為對應比例，se_day_cluster 為日期叢聚標準誤；top10 按 near41 排序。scenario_a、scenario_b、cost_carbon 為 null，表示未完成。']
with (out/'README.zh-TW.md').open('x') as f: f.write('\n'.join(lines)+'\n')
