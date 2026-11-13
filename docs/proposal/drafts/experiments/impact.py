# 舊版，預設路徑為開發副本，不作交付重跑指令。
#!/usr/bin/env python3
import sqlite3, itertools, collections, random, math, statistics, sys
p=sys.argv[1] if len(sys.argv)>1 else '/tmp/claude-1000/-home-zup-code-esg-hackathon-bus-2026/e3280782-e84b-4051-8849-189e12c5a845/scratchpad/trips.db'
c=sqlite3.connect('file:'+p+'?mode=ro',uri=True)
q="""select id,vehicle,board_date,board_ts,alight_ts,board_stop,alight_stop,coalesce(ticket_type,'') from trips where vehicle is not null and board_ts is not null and alight_ts is not null and board_stop != alight_stop and alight_ts-board_ts between 180 and 14400 order by vehicle,board_date"""
counts=collections.Counter(); dates=collections.defaultdict(set)
for (vehicle,date),group in itertools.groupby(c.execute(q),key=lambda r:(r[1],r[2])):
 rows=list(group); events=[]; active={}; hit=set(); low=set(); peak=0; rising=False
 for r in rows:
  events.extend([(r[3],1,r[0],r),(r[4],0,r[0],r)])
 for t,kind,i,r in sorted(events):
  if kind==0:
   if rising:
    if 41<=len(active)<=43: hit.update(active)
    rising=False
   active.pop(i,None)
  else:
   if len(active)>=38: low.add(i)
   active[i]=r; rising=True
 for name,ids in [('高負載峰值在車',hit),('上車前剩5席以下',low)]:
  for r in rows:
   if r[0] not in ids: continue
   dt=r[2]; day=__import__('datetime').date.fromisoformat(dt); period='週五' if day.weekday()==4 else '週日' if day.weekday()==6 else '其他'
   groups=['全部']
   if r[5] not in ('臺中','高鐵臺中站','日月潭','台中航空站'): groups.append('中途站上車')
   if '敬老' in r[7]: groups.append('敬老票')
   if any(x in r[7] for x in ('愛心','博愛','陪伴')): groups.append('愛心博愛陪伴票')
   if '學生' in r[7]: groups.append('學生票')
   if r[5]=='日月潭' or r[6]=='日月潭': groups.append('日月潭起訖代理')
   for g in groups: counts[name,period,g]+=1
for row in c.execute('select distinct board_date from trips'):
 try: d=__import__('datetime').date.fromisoformat(row[0]); dates['全部'].add(d); dates['週五' if d.weekday()==4 else '週日' if d.weekday()==6 else '其他'].add(d)
 except (ValueError,TypeError): pass
print('DATES', {k:len(v) for k,v in dates.items()})
for name in ('高負載峰值在車','上車前剩5席以下'):
 for g in ('全部','中途站上車','敬老票','愛心博愛陪伴票','學生票','日月潭起訖代理'):
  vals=[counts[name,x,g] for x in ('週五','週日','其他')]; print(name,g,'兩年',sum(vals),'年化',round(sum(vals)*365.25/len(dates['全部']),1),'週五日均',round(vals[0]/len(dates['週五']),1),'週日日均',round(vals[1]/len(dates['週日']),1))
# Hypothetical annual intervention; no observed refusal data.
N=counts['上車前剩5席以下','週五','全部']+counts['上車前剩5席以下','週日','全部']; N=N*52/((len(dates['週五'])+len(dates['週日']))/2)
print('weekend annual exposure',N)
params={'隱藏需求比例':(0.05,0.15,0.30),'可避免比例':(0.10,0.35,0.60),'節省分鐘':(15,30,60),'高鐵乘客比例':(0.20,0.45,0.70),'錯過高鐵風險差':(0.02,0.10,0.25),'轉移私人車比例':(0.05,0.20,0.40),'私人車每人公里':(10,30,60),'私人車排放kg/km':(0.10,0.18,0.25),'加班車公里':(5000,15000,30000),'加班車排放kg/km':(0.6,1.0,1.4)}
rng=random.Random(6670); out=[]; xs=[]
for _ in range(30000):
 x={k:rng.triangular(a,c,b) for k,(a,b,c) in params.items()}; avoided=N*x['隱藏需求比例']*x['可避免比例']; hours=avoided*x['節省分鐘']/60; missed=avoided*x['高鐵乘客比例']*x['錯過高鐵風險差']; carbon=(avoided*x['轉移私人車比例']*x['私人車每人公里']*x['私人車排放kg/km']-x['加班車公里']*x['加班車排放kg/km'])/1000
 out.append((avoided,hours,missed,carbon)); xs.append(x)
def quant(v,p): return sorted(v)[int(p*(len(v)-1))]
for j,label in enumerate(('避免等下一班人次','節省小時','避免錯過高鐵人次','淨減碳噸')):
 v=[r[j] for r in out]; print(label,*(round(quant(v,p),1) for p in (.1,.5,.9)))
 def corr(k):
  a=[x[k] for x in xs]; ma=statistics.mean(a); mb=statistics.mean(v); return sum((i-ma)*(j-mb) for i,j in zip(a,v))/math.sqrt(sum((i-ma)**2 for i in a)*sum((j-mb)**2 for j in v))
 print('敏感度',sorted(((k,round(corr(k),3)) for k in params),key=lambda t:abs(t[1]),reverse=True)[:3])
