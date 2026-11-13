import sqlite3,json,collections,itertools,sys,argparse
parser = argparse.ArgumentParser()
parser.add_argument("database", help="SQLite database path (read-only)")
args = parser.parse_args()
from pathlib import Path
p=str(Path(args.database).resolve())
db=sqlite3.connect('file:'+p+'?mode=ro',uri=True)
o={s['name']:s['order'] for s in json.load(open(Path(__file__).resolve().parents[5] / 'public/geo/stops.json'))}
e={'臺中','高鐵臺中站','日月潭','台中航空站'}
c=collections.Counter(); keys=collections.defaultdict(set); votes=collections.Counter()
q="select vehicle,board_date,board_ts,alight_ts,board_stop,alight_stop from trips where board_date >= '2024-01-01' and board_date < '2026-01-01' and alight_ts is not null order by vehicle,board_date"
for (v,d), rows in itertools.groupby(db.execute(q),lambda x:x[:2]):
 a=[]
 for _,_,b,t,s,z in rows:
  if b is None or s==z or not 180<=t-b<=14400: continue
  direction=(o[z]>o[s])-(o[z]<o[s]) if s in o and z in o else 0
  a.append((b,s,direction))
  if s not in e:
   keys[d[:4]].add((v,d,s)); votes[v,d,s] += direction
 a.sort()
 for window in (0,300,600,900,1800,7200):
  groups=[]
  for ts,s,di in a:
   if not groups or groups[-1][0]!=s or ts-groups[-1][1]>window: groups.append([s,ts,di])
   else: groups[-1][1]=ts; groups[-1][2]+=di
  c[window,d[:4]]+=sum(s not in e and vote!=0 for s,_,vote in groups)
  if window == 600:
   c['no_direction',d[:4]] += sum(s not in e for s,_,vote in groups)
   groups_b=[]
   for ts,s,di in a:
    if s in e: continue
    if not groups_b or groups_b[-1][0]!=s or ts-groups_b[-1][1]>window: groups_b.append([s,ts,di])
    else: groups_b[-1][1]=ts; groups_b[-1][2]+=di
   c['B',d[:4]] += sum(vote != 0 for s,ts,vote in groups_b)
for k in sorted(keys):
 print(k, 'strict', len(keys[k]), 'strict_direction', sum(votes[key] != 0 for key in keys[k]),
       'unmerged', c[0,k], *(f'{w}s={c[w,k]}' for w in (300,600,900,1800,7200)),
       '600s_B', c['B',k], '600s_no_direction', c['no_direction',k])
print('annual', 'strict', (len(keys['2024']) + len(keys['2025'])) / 2,
      'unmerged', (c[0,'2024'] + c[0,'2025']) / 2, 'strict_direction', sum(v != 0 for v in votes.values()) / 2,
      *(f'{w}s={(c[w,"2024"] + c[w,"2025"]) / 2}' for w in (300,600,900,1800,7200)),
      '600s_B', (c['B','2024'] + c['B','2025']) / 2,
      '600s_no_direction', (c['no_direction','2024'] + c['no_direction','2025']) / 2)
