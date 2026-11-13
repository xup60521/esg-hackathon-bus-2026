import argparse, sqlite3, csv, os
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('database', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)
c = sqlite3.connect(args.database.resolve().as_uri() + '?mode=ro', uri=True)
out = args.output
conditions={'同站':"board_stop=alight_stop and board_stop is not null and board_stop<>''",'異站短時高價':"board_stop<>alight_stop and alight_ts-board_ts>=0 and alight_ts-board_ts<180 and fare_paid>=100",'時間顛倒':"alight_ts<board_ts",'超過六小時':"alight_ts-board_ts>21600"}
kind="case when ticket_type like '%敬老%' then '敬老' when ticket_type like '%愛心%' or ticket_type like '%博愛%' or ticket_type like '%陪伴%' then '愛心/博愛/陪伴' when ticket_type like '%學生%' then '學生' when ticket_type like '%一般%' then '一般' else '其他/未識別' end"
for name,cond in conditions.items():
 c.execute('create temp view v as select *, '+kind+' as category from trips where '+cond)
 for dimension,expression in [('總計',"'全部'"),('發卡機構','issuer'),('票種','category'),('上車站','board_stop'),('下車站','alight_stop'),('小時',"strftime('%H',board_ts,'unixepoch','+8 hours')"),('站對',"board_stop||'→'||alight_stop")]:
  q=f'''select {expression} as grp,count(*) n,round(count(*)/2.0,2) annual, sum(fare_paid),round(sum(fare_paid)/2.0,2),min(fare_paid),round(avg(fare_paid),2),max(fare_paid),sum(fare_full),round(sum(fare_full)/2.0,2),min(fare_full),round(avg(fare_full),2),max(fare_full),sum(fare_paid=0) from v group by 1 order by n desc'''
  path=os.path.join(out,name+'_'+dimension+'.csv')
  with open(path,'x',encoding='utf-8',newline='') as f:
   w=csv.writer(f);w.writerow(['分組','筆數','年化筆數','paid總額','paid年化','paid最小','paid平均','paid最大','full總額','full年化','full最小','full平均','full最大','paid零筆數']);w.writerows(c.execute(q))
 c.execute('drop view v')
q=f'''select {kind},count(*),sum(fare_paid=0),round(avg(fare_paid),2),round(avg(fare_full),2),sum(fare_full-fare_paid),sum(fare_paid>fare_full) from trips group by 1'''
with open(os.path.join(out,'全體票種.csv'),'x',encoding='utf-8',newline='') as f:
 w=csv.writer(f);w.writerow(['票種','筆數','paid零筆數','paid平均','full平均','差額總和','paid大於full']);w.writerows(c.execute(q))
print('done')
