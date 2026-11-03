"""Read existing hourly card aggregates; no DB access or passenger identifiers."""
import json, hashlib, math, statistics, datetime, collections, csv
from pathlib import Path
root=Path(__file__).parent
source=Path('public/data/midstop.json');raw=source.read_bytes();data=json.loads(raw)
counts=collections.defaultdict(lambda:[0]*24)
for date,route,direction,stop,h,b,a in data['rows']:
 if b: counts[route,direction,stop,date][h]+=b

def moment(hist,lo,hi):
 n=sum(hist[lo:hi]);return sum((h+.5)*hist[h] for h in range(lo,hi))/n if n else None

def run(route,direction,ref,target,minimum=5,lo=4,hi=24):
 groups=collections.defaultdict(list)
 for r,di,s,d in counts:
  if (r,di,s)==(route,direction,ref) and sum(counts[r,di,s,d][lo:hi])>=10:
   groups[d[:7],datetime.date.fromisoformat(d).weekday()].append(d)
 pairs=[];eligible=0; ties=0
 for key,dates in sorted(groups.items()):
  dates.sort(key=lambda d:(-sum(counts[route,direction,ref,d][lo:hi]),d))
  if len(dates)<4:continue
  k=math.ceil(len(dates)/4)
  if sum(counts[route,direction,ref,dates[k-1]][lo:hi])==sum(counts[route,direction,ref,dates[k]][lo:hi]):ties+=1;continue
  peaks=dates[:k];controls=dates[k:]
  for d in peaks:
   eligible+=1
   if sum(counts[route,direction,target,d][lo:hi])<minimum:continue
   peers=[x for x in controls if sum(counts[route,direction,target,x][lo:hi])>=minimum]
   if len(peers)<2:continue
   rm=moment(counts[route,direction,ref,d],lo,hi);tm=moment(counts[route,direction,target,d],lo,hi)
   rb=statistics.mean(moment(counts[route,direction,ref,x],lo,hi) for x in peers)
   tb=statistics.mean(moment(counts[route,direction,target,x],lo,hi) for x in peers)
   pairs.append(dict(route=route,direction=direction,reference=ref,target=target,date=d,controls=peers,reference_count=sum(counts[route,direction,ref,d][lo:hi]),target_count=sum(counts[route,direction,target,d][lo:hi]),reference_shift=rm-rb,target_shift=tm-tb,relative_shift=(tm-tb)-(rm-rb),raw_gap=tm-rm))
 if not pairs:return dict(route=route,direction=direction,reference=ref,target=target,n=0,eligible=eligible,tie_groups=ties)
 shifts=[x['relative_shift'] for x in pairs]
 result=dict(route=route,direction=direction,reference=ref,target=target,n=len(pairs),eligible=eligible,tie_groups=ties,reference_shift=statistics.mean(x['reference_shift'] for x in pairs),target_shift=statistics.mean(x['target_shift'] for x in pairs),mean_shift=statistics.mean(shifts),median_shift=statistics.median(shifts),positive_fraction=sum(x>0 for x in shifts)/len(shifts),over_one_hour=sum(x>=1 for x in shifts)/len(shifts),raw_gap=statistics.mean(x['raw_gap'] for x in pairs),target_count=sum(x['target_count'] for x in pairs))
 profiles={s:{'peak':[0]*24,'control':[0]*24} for s in [ref,target]}
 for p in pairs:
  for s in [ref,target]:
   hp=counts[route,direction,s,p['date']];np=sum(hp[lo:hi])
   for h in range(lo,hi):profiles[s]['peak'][h]+=hp[h]/np/len(pairs)
   for d in p['controls']:
    hc=counts[route,direction,s,d];nc=sum(hc[lo:hi])
    for h in range(lo,hi):profiles[s]['control'][h]+=hc[h]/nc/len(pairs)/len(p['controls'])
 result['profiles']=profiles;result['pairs']=pairs
 return result
specs=[]
for r in ['6670A','6670B','6670D','6670E','6670F']:
 for t in ['埔里站','魚池','暨南大學','暨南大學校內','桃米坑','崎下']:
  specs.append((r,'inbound','日月潭',t))
 for t in ['埔里站','魚池','暨南大學','暨南大學校內']:
  specs.append((r,'outbound','高鐵臺中站',t))
specs.append(('6670H','inbound','埔里站','崎下'))
results=[run(*s) for s in specs]
# Cross-check weighted moment differences against normalized profile curves.
for r in results:
 if not r['n']:continue
 p=r['profiles'];ref=r['reference'];t=r['target']
 cross=sum((h+.5)*(p[t]['peak'][h]-p[t]['control'][h]-p[ref]['peak'][h]+p[ref]['control'][h]) for h in range(24))
 assert abs(cross-r['mean_shift'])<1e-10
 assert all(abs(sum(v)-1)<1e-10 for s in p.values() for v in s.values())
summary={k:v for k,v in dict(source_sha256=hashlib.sha256(raw).hexdigest(),generated_at=data['generatedAt'],row_count=len(data['rows']),results=results).items()}
(root/'results.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
with (root/'paired-days.csv').open('w') as f:
 fields=['route','direction','reference','target','date','controls','reference_count','target_count','reference_shift','target_shift','relative_shift','raw_gap'];w=csv.DictWriter(f,fieldnames=fields,lineterminator="\n");w.writeheader()
 for r in results:
  for row in r.get('pairs',[]):w.writerow({**row,'controls':'|'.join(row['controls'])})
for r in results:
 if r['n']>=20:print(json.dumps({k:v for k,v in r.items() if k not in ['profiles','pairs']},ensure_ascii=False))
print('SENSITIVITY primary inbound D:')
for t in ['埔里站','魚池','暨南大學','崎下']:
 for minimum in [3,5,10]:
  for lo,hi in [(4,24),(10,22)]:
   r=run('6670D','inbound','日月潭',t,minimum,lo,hi)
   print(t,minimum,lo,hi,r['n'],round(r.get('mean_shift',0),3))
print('CHECKS: profile normalization and moment equivalence passed')
