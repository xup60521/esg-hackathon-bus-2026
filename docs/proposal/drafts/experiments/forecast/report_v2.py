import json
from pathlib import Path
p=Path(__file__).resolve().parent
r=json.loads((p/'results_v2.json').read_text())['results']
def f(x,percent=True):
    return '未定義' if x is None else (f'{100*x:.1f}%' if percent else f'{x:.1f}')
def metric(row,k,percent=True):
    v=row['metrics'].get(k); ci=row['ci95'].get(k)
    return f(v,percent)+' '+(('['+f(ci[0],percent)+', '+f(ci[1],percent)+']') if ci else '[未定義]')
out=['', '訓練資料為 2024-01-01 至 2025-03-31；2025-04 至 06 為門檻選擇集；2025-07 至 12 為留出集。每個座位情境的事件定義為站前載客至少座位數減五。預測使用上游載客及訓練期歷史平均；模型、歷史平均及門檻皆未使用留出集重新擬合。選擇集按分數排序，在警示不超過預算下取最低門檻，分數相同一律不跨越預算，套用留出集時不再調整。預算只約束選擇集，留出期比例可能超標。', '', '以下區間是 300 次以日期為單位重抽的 95% 百分位區間，固定模型與門檻；不含訓練及門檻選擇的不確定性。假警報率為假警報除以全部負例。提前時間只計正確警示，為上游最後刷卡至目標站第一筆刷卡的時間差。精確率、召回率或提前時間分母為零時未定義；區間只用有定義的重抽樣本，次數見 JSON。', '', '## 留出期結果', '', '每格為估計值 [95% 區間]。', '', '| 站／群 | 座位 | 選擇集預算 | 選擇集／留出數／正例 | 門檻 | 精確率 | 召回 | 假警報率 | 警示比例 | 正確警示提前中位分鐘 | 提前 P10 分鐘 |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
for x in r:
 out.append(f"| {x['stop']} | {x['capacity']} | {x['budget']:.0%} | {x['selection_n']}／{x['test_n']}／{x['positive']} | {x['cutoff']:.6f} | "+' | '.join(metric(x,k,k not in ('lead_median','lead_p10')) for k in ('precision','recall','false_alarm_rate','alert_share','lead_median','lead_p10'))+' |')
out += ['', '## 每日排序', '', '以預測時點所在的 06:00–09:00 或 15:00–18:00 作尖峰窗口，每天從窗口中選風險最高的一筆到站，k=1；命中率是所選到站為正例的日數比例。歷史平均基準以訓練期同星期、三小時時段的目標站平均載客排序；平手按固定資料順序決定。無窗口樣本的日期不計。兩個窗口合併選一筆，群組按兩站合併後選一筆。這是事後以整天候選到站排序，不是可立即執行的即時排程。', '', '| 站／群 | 座位 | 模型 top-1 命中率 | 歷史平均 top-1 命中率 |', '|---|---:|---:|---:|']
for x in r:
 if x['budget']==.1: out.append(f"| {x['stop']} | {x['capacity']} | {metric(x,'top1')} | {metric(x,'baseline_top1')} |")
x=next(x for x in r if x['stop']=='中途站群（桃米坑、暨南大學）' and x['capacity']==43 and x['budget']==.1)
out += ['', '## 簡報表建議', '', '| 情境 | 選擇集預算 | 留出期實際警示比例 | 召回率 | 精確率 | 正確警示提前中位分鐘 |', '|---|---:|---:|---:|---:|---:|', f"| 桃米坑與暨南大學站群，假設 43 席 | 10% | {metric(x,'alert_share')} | {metric(x,'recall')} | {metric(x,'precision')} | {metric(x,'lead_median',False)} |", '', f"建議白話：在選擇集 10% 警示預算下，留出期實際警示 {f(x['metrics']['alert_share'])} 到站，提前中位約 {f(x['metrics']['lead_median'],False)} 分鐘抓到 {f(x['metrics']['recall'])} 的高載客到站，精確率 {f(x['metrics']['precision'])}。這是離線回放，不是現場警示績效。", '', '九族 43 席留出期只有 7 個正例，不能據此下結論。其他小正例數也使區間不穩定。樣本只含事後可見有人在目標站刷卡上車、且可配對上游的到站，有選樣偏差；不含無人上車、滿車過站及現金旅客。上游最後上車與目標站是否到達均事後得知，車次、方向及座位數未證實。提前時間是刷卡間隔，不是 GPS 行車時間。須取得班次、GPS 和即時上下車資料進行前瞻驗證，不能推論已可部署或避免過站。', '', '重跑：`python3 -I docs/proposal/drafts/experiments/forecast/run_v2.py /絕對路徑/trips.db`，接著執行 `python3 -I docs/proposal/drafts/experiments/forecast/report_v2.py`。完整門檻、區間與有效重抽數見 `experiments/forecast/results_v2.json`。']
path=p.parent.parent/'forecast-experiment-v2.zh-TW.md'
original=path.read_text().split('\n\n',1)[1].split('\n')[0]
path.write_text('# 中途站載客預報：門檻與排序實驗\n\n'+original+'\n'+'\n'.join(out)+'\n')
