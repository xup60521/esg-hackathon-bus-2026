#!/usr/bin/env python3
"""唯讀重算影響指標；輸出至標準輸出，不修改資料庫。"""
import argparse, collections, datetime, itertools, math, sqlite3
from pathlib import Path
from statistics import NormalDist
from zoneinfo import ZoneInfo

parser = argparse.ArgumentParser()
parser.add_argument('database', type=Path, help='trips.db 的路徑（必填）')
a = parser.parse_args()
db = sqlite3.connect(a.database.resolve().as_uri() + '?mode=ro', uri=True)
q = """select id,vehicle,board_date,board_ts,alight_ts,board_stop,coalesce(ticket_type,'') from trips
where vehicle is not null and board_ts is not null and alight_ts is not null
and board_stop != alight_stop and alight_ts-board_ts between 180 and 14400 order by vehicle,board_date"""
caps = (37,38,42,43)
counts = collections.Counter()
ends = ('臺中','高鐵臺中站','日月潭','台中航空站')
for _, group in itertools.groupby(db.execute(q), key=lambda r:(r[1],r[2])):
    rows = list(group); active = set(); hits = {c:set() for c in caps}; rising = False
    for _, kind, ident in sorted((t,k,r[0]) for r in rows for t,k in ((r[3],1),(r[4],0))):
        if kind == 0:
            if rising:
                for c in caps:
                    if c-2 <= len(active) <= c: hits[c].update(active)
            rising = False; active.discard(ident)
        else:
            active.add(ident); rising = True
    for row in rows:
        if row[5] in ends: continue
        hour = datetime.datetime.fromtimestamp(row[3], datetime.timezone.utc).astimezone(ZoneInfo('Asia/Taipei')).hour
        period = '上午' if hour < 12 else '下午' if hour < 18 else '晚'
        labels = ['全體'] + [name for name,words in [('學生',('學生',)),('敬老',('敬老',)),('愛心等',('愛心','博愛','陪伴'))] if any(w in row[6] for w in words)]
        for label in labels:
            counts['n',label,row[5],period] += 1
            for cap in caps:
                if row[0] in hits[cap]: counts[cap,label,row[5],period] += 1
        if '學生' in labels:
            counts['student_stop',row[5]] += 1
            counts['student_card',row[6]] += 1

for cap in caps:
    print('\n容量',cap)
    for mode in ('原始','站別','站別×時段'):
        def aggregate(label):
            out=collections.Counter()
            for item,n in counts.items():
                if len(item) != 4: continue
                kind,lab,stop,period = item
                if lab == label and (kind == 'n' or kind == cap):
                    key = '全部' if mode == '原始' else stop if mode == '站別' else (stop,period)
                    out[kind,key] += n
            return out
        allc=aggregate('全體'); keys=[k for kind,k in allc if kind=='n']; total=sum(allc['n',k] for k in keys)
        base=sum(allc[cap,k] for k in keys)/total
        for label in ('學生','敬老','愛心等'):
            group=aggregate(label); covered=sum(allc['n',k] for k in keys if group['n',k]); missing=total-covered
            # No extrapolation into strata with no group observations.
            rate=sum(allc['n',k]/covered*group[cap,k]/group['n',k] for k in keys if group['n',k])
            commonbase=sum(allc[cap,k] for k in keys if group['n',k])/covered
            print(mode,label,'暴露率',round(100*rate,3),'相對值',round(rate/commonbase,3),'缺格權重%',round(100*missing/total,3))
print('\n學生站別', counts.most_common(0) if False else sorted(((k[1],v) for k,v in counts.items() if k[0]=='student_stop'),key=lambda x:-x[1])[:5])
print('學生票種',sorted(((k[1],v) for k,v in counts.items() if k[0]=='student_card'),key=lambda x:-x[1])[:10])
z=NormalDist().inv_cdf(.975); power=NormalDist().inv_cdf(.8)
def sample(p,r):
    q=p*(1-r); m=(p+q)/2
    return math.ceil((z*math.sqrt(2*m*(1-m))+power*math.sqrt(p*(1-p)+q*(1-q)))**2/(p-q)**2)
print('\nG2 每臂樣本（獨立樣本、設計效果）')
for p in (.05,.1,.2):
    for r in (.1,.2,.3):
        n=sample(p,r); print(p,r,n,math.ceil(n*1.5),n*2)
print('G2 每臂100/500/1000，基率10%，設計效果1.5，可偵測相對降幅')
for n in (100,500,1000):
    lo,hi=0.00001,.99999
    for _ in range(40):
        mid=(lo+hi)/2
        if sample(.1,mid)*1.5 > n: lo=mid
        else: hi=mid
    print(n,round(hi*100,1),'%' if sample(.1,.99999)*1.5<=n else '%（超出可行範圍）')
def upper(k,n):
    lo,hi=0.,1.
    for _ in range(80):
        p=(lo+hi)/2
        cdf=sum(math.comb(n,i)*p**i*(1-p)**(n-i) for i in range(k+1))
        if cdf > .05: lo=p
        else: hi=p
    return (lo+hi)/2
print('G1 單側精確上限',[(k,round(100*upper(k,100),2)) for k in (0,1,3,5)])
