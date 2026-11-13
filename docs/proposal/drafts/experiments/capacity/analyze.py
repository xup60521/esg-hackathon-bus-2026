#!/usr/bin/env python3
import sqlite3, sys, itertools, collections, json, statistics, math
from pathlib import Path
if len(sys.argv)!=3: raise SystemExit('usage: analyze.py DATABASE NEW_OUTPUT.json')
out=Path(sys.argv[2])
if out.exists(): raise SystemExit('output exists')
c=sqlite3.connect(Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True)
counts=collections.Counter(); years=collections.defaultdict(set)
for v,d,n in c.execute('select vehicle,substr(board_date,1,4),count(*) from trips group by vehicle,substr(board_date,1,4)'):
 counts[str(v)]+=n; years[str(v)].add(d)
q='''select id,vehicle,board_date,board_ts,alight_ts,subroute from trips where vehicle is not null and board_ts is not null and alight_ts is not null and board_stop != alight_stop and alight_ts-board_ts between 180 and 14400 order by vehicle,board_date'''
peaks=collections.defaultdict(list); mixed=collections.Counter(); mixed_days=set(); peakmixed=collections.Counter(); days=collections.Counter()
for (v,d),g in itertools.groupby(c.execute(q),lambda r:(r[1],r[2])):
 ev=[]; days[v,d[:4]]+=1
 for i,_,_,b,a,route in g: ev.extend([(b,1,i,route),(a,0,i,route)])
 active=collections.Counter(); load=0; rising=False
 for t,kind,i,route in sorted(ev,key=lambda x:(x[0],x[1],x[2])):
  if kind==0:
   if rising:
    peaks[v,d[:4]].append(load)
    if sum(n>0 for n in active.values())>1: peakmixed[v]+=int(load>43)
    rising=False
   active[route]-=1; load-=1
  else:
   if any(n>0 and k!=route for k,n in active.items()): mixed[v]+=1; mixed_days.add((v,d))
   active[route]+=1; load+=1; rising=True
hist=collections.Counter(x for p in peaks.values() for x in p)
def pct(x,p):
 x=sorted(x); z=(len(x)-1)*p; a=int(z); return x[a]+(x[math.ceil(z)]-x[a])*(z-a)
vehicles={}
for v in sorted(counts):
 data={}
 for y in ('2024','2025'):
  x=peaks.get((v,y),[])
  if x: data[y]={'days':days[v,y],'peaks':len(x),'max':max(x),'p99':pct(x,.99),'p95':pct(x,.95),'hist':dict(sorted(collections.Counter(x).items())), 'over43':sum(z>43 for z in x)}
 # No credible seat class can be established without verified labels.
 vehicles[v]={'trips':counts[v],'years':sorted(y for y in years[v] if y),'annual':data,'mixed_route_boardings':mixed[v],'over43_mixed_route_peaks':peakmixed[v], 'seat_class':'不明','confidence':'低'}
pairs=[(a['annual']['2024']['max'],a['annual']['2025']['max']) for a in vehicles.values() if '2024' in a['annual'] and '2025' in a['annual']]
def corr(p):
 if len(p)<2:return None
 x,y=zip(*p); mx=statistics.mean(x); my=statistics.mean(y); den=math.sqrt(sum((a-mx)**2 for a in x)*sum((b-my)**2 for b in y)); return sum((a-mx)*(b-my) for a,b in p)/den if den else None
result={'all_rows':sum(counts.values()),'codes_including_null':len(counts),'both_year_codes':sum('2024' in y and '2025' in y for y in years.values()),'peak_hist':dict(sorted(hist.items())), 'over43_total':sum(n for x,n in hist.items() if x>43),'mixed_route_boardings':sum(mixed.values()),'mixed_route_days':len(mixed_days),'paired_max_n':len(pairs),'paired_max_correlation':corr(pairs),'vehicles':vehicles}
with out.open('x',encoding='utf-8') as f: json.dump(result,f,ensure_ascii=False,indent=2)
