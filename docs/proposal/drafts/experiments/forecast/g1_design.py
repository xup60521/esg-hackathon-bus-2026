#!/usr/bin/env python3
"""Count boarding arrivals; database and new report paths are mandatory."""
import sys, sqlite3, json, datetime, math
from collections import defaultdict
from pathlib import Path
if len(sys.argv)!=3: raise SystemExit('usage: g1_design.py DATABASE NEW_REPORT.md')
db, out = Path(sys.argv[1]).resolve(), Path(sys.argv[2])
root=Path(__file__).resolve().parents[5]
calendar=json.loads((root/'public/data/lab/visualization/calendar.json').read_text())['days']
stops=['九族文化村','桃米坑','暨南大學','崎下']
rows=defaultdict(list)
with sqlite3.connect(db.as_uri()+'?mode=ro',uri=True) as c:
 for v,d,b,a,s,t in c.execute("select vehicle,board_date,board_ts,alight_ts,board_stop,alight_stop from trips where board_date >= '2024-01-01' and board_date < '2026-01-01' and alight_ts is not null"):
  if b is not None and s!=t and 180<=a-b<=14400: rows[v,d].append((b,a,s))
counts=defaultdict(int)
for (v,d), trips in rows.items():
 events=[]
 for b,a,s in trips: events.extend([(b,1,s),(a,-1,s)])
 events.sort(key=lambda x:(x[0],x[1]))
 load=0; current=None
 for ts,delta,stop in events:
  if delta<0: load-=1; continue
  if current is None or stop!=current[0] or ts-current[1]>600:
   current=[stop,ts]
   if stop in stops:
    for cap in (37,38,42,43):
     for threshold in (cap-5,cap):
      if load>=threshold: counts[d,stop,cap,threshold]+=1
  current[1]=ts; load+=1
lines=['# G1 樣本設計','', '2024–2025 全部資料，事件及載客計算沿用 run.py：同車同日，旅次 180–14400 秒，同秒先下後上；連續同站上車間隔不超過 10 分鐘視為一次到站。有人上車到站的觀察數，不含滿車過站；計數口徑見 F；刷卡漏記、車日不等於班次也影響估計。', '', '週五、週日不以是否休假篩選；休息日依專案政府辦公日曆，含補假與補班。年次數為兩年各自計數，日均為兩年合計事件除以該類全部日數，含零事件日。四站合計可包含同一車在不同站的事件，不能假定獨立。', '', '低／中／高為週五、週日、休息日三種日均排序，非信賴區間；觀察日為目標數除以日均向上取整，分別按低／中／高事件率排列。假定可同時觀察所列站、全天完整覆蓋，實際抽樣及獨立性會拉長時程。', '', '|席|站|門檻|2024／2025 次|每週五／週日／休息日|100 事件所需日（低／中／高率）|200 事件所需日（低／中／高率）|','|---:|---|---|---:|---:|---:|---:|']
dates=[d for d in sorted(calendar) if '2024-01-01'<=d<'2026-01-01']
groups=[[d for d in dates if datetime.date.fromisoformat(d).weekday()==4],[d for d in dates if datetime.date.fromisoformat(d).weekday()==6],[d for d in dates if calendar[d]['rest']]]
for cap in (37,38,42,43):
 for stop in stops+['四站合計']:
  selected=stops if stop=='四站合計' else [stop]
  for th in (cap-5,cap):
   def total(ds): return sum(counts[d,s,cap,th] for d in ds for s in selected)
   years=[total([d for d in dates if d.startswith(str(y))]) for y in (2024,2025)]
   rates=[total(g)/len(g) for g in groups]
   def days(n): return '／'.join(str(math.ceil(n/x)) if x else '無法估算' for x in sorted(rates))
   lines.append(f'|{cap}|{stop}|≥{th}|{years[0]}／{years[1]}|'+ '／'.join(f'{x:.3f}' for x in rates)+f'|{days(100)}|{days(200)}|')
lines += ['', '## 試辦建議', '', '先完成 G0，核對實際席數、班次與獨立現場計數，預先固定站點、時段與抽樣方式。影子運行不對乘客顯示，先收集至少 100 個獨立核對的警示，以及 100 個實際無空位事件；分別估錯報率及漏報率，並記錄未配對與零上車過站。這兩個分母不同，不能互相替代。', '', '發布階段另收集至少 200 個獨立核對的實際無空位事件，估計漏報率；同時至少 100 個警示估計錯報率。事先要求兩者的 Clopper–Pearson 單側 95% 上限均不超過 5%，才考慮發布或持續發布；未達樣本數不判通過。100 次零錯報上限 2.95%，1 次為 4.66%，3 次為 7.57%；200 次零漏報上限約 1.49%。兩階段獨立樣本，不用影子期調參後再回填驗證。日內事件可能相關，二項上限依賴獨立且同分布，應按班次及日分層檢查，不能只靠此上限宣稱安全。', '', '表中 ≥cap 是有上車的滿載代理，不是已核對的無空位事件；≥cap−5 是較寬的高載事件，也不是滿載或漏報分母。38 與 43 席需各自採用表中對應門檻，不能把較低門檻的事件充作 43 席滿載證據。實際席數未知時須按車核對。', '', '預期時程按表中觀察日與實際每週排班換算，並額外留 G0、資料核對與重抽時間；不是連續日曆日。43 席單站以表中最慢日均為壓力測試，若速度為零即無有限估計。不可行時可預先改為四站共同估計並保留分站報告，或改研究較低高載門檻；後者不能證明滿載漏報率達標。']
lines += ['', '依休息日日均，四站合計 ≥38 代理收集 100／200 次約需 69／138 個觀察日；≥43 約需 382／764 日。若每週覆蓋兩個休息日，分別約 35／69 週與 191／382 週，還未計核對失敗、季節變化與事件相依。43 席單站九族週日無事件，無有限週日估計；休息日日均則約 4,660／9,320 日，兩日／週約 45／90 年。這是歷史均速外推而非期限保證，也不含滿車過站，G0 應先更新現場速率。表中的其他站或週五可能較快，不能據此保證九族週日可達標。']
with out.open('x',encoding='utf-8') as f: f.write('\n'.join(lines)+'\n')
