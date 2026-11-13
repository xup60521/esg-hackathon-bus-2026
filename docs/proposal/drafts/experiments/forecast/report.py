import json
from pathlib import Path
p=Path(__file__).resolve().parent
r=json.loads((p/'results.json').read_text())
def fmt(x): return '未定義' if x is None else f'{x:.3f}'
def metric(m,k):
    v=m['metrics'][k]; ci=m['ci95'][k]
    return fmt(v)+' '+('['+fmt(ci[0])+', '+fmt(ci[1])+']' if ci else '[未定義]')
out=['# 中途站載客預報：留出期實驗','', '## 給評審的白話摘要','', '以歷史刷卡紀錄模擬提早預報，加入上游車上人數後，四站區分高載客與其他到站的能力提高。但在固定機率 0.5 才發警示的規則下，43 座假設的四站均沒有發出警示，因此一件高載客都沒有抓到。這只能支持離線排序的技術可行性，不能證明現場警示已可用；需要另以訓練資料選擇警示門檻，並用真實班次及即時資料前瞻測試。', '', '## 方法與讀法','', '訓練 2024 全年與 2025 上半年；2025 下半年整日留出。僅使用上游最後上車當時的已知載客與當時星期、三小時時段，以及訓練期同星期時段的目標站平均載客。A 用歷史平均；B 加入上游載客。兩者均以邏輯回歸輸出機率。歷史平均向訓練期全站平均收縮 10 筆。每站獨立建模。上游到目標站的實際間隔僅供事後評估，並非特徵。容量減五為事件門檻，43 座即 ≥38 人。依驗證日期整日重抽 300 次，括號為 95% 百分位區間，模型不重訓。精確率無預警時未定義；AUC 沒有正負兩類時未定義。', '', '## 四站主要結果（43 座，≥38 人）','', '| 站 | 訓練／驗證／正例 | 提前分鐘中位數 [95%] | 方法 | AUC [95%] | 精確率 [95%] | 召回率 [95%] | Brier [95%] | 平均預測／實際比例 |','|---|---:|---:|---|---:|---:|---:|---:|---:|']
for x in r['results']:
 if x['capacity']!=43: continue
 for name,m in x['models'].items():
  out.append(f"| {x['stop']} | {x['train']}／{x['test']}／{x['positive']} | {x['lead_minutes_median']:.1f} [{x['lead_median_ci95'][0]:.1f}, {x['lead_median_ci95'][1]:.1f}] | {name} | {metric(m,'auc')} | {metric(m,'precision')} | {metric(m,'recall')} | {metric(m,'brier')} | {metric(m,'predicted')}／{metric(m,'observed')} |")
out+=['','AUC 越高代表排序越好；Brier 越低代表整體機率誤差越小。平均預測比例對照實際比例只能檢查整體校準，分組校準與各組樣本數見 `experiments/forecast/results.json` 的 `calibration_bins`。稀少正例使區間可能很寬。提前時間是刷卡觀測到的兩站時間差，並非 GPS 行車時間。','','## 座位數敏感度','','| 站 | 容量／門檻 | 驗證數／正例 | 方法 | AUC [95%] | 精確率 [95%] | 召回率 [95%] | Brier [95%] | 預測／實際比例 |','|---|---:|---:|---|---:|---:|---:|---:|---:|']
for x in r['results']:
 for name,m in x['models'].items():
  out.append(f"| {x['stop']} | {x['capacity']}／{x['threshold']} | {x['test']}／{x['positive']} | {name} | {metric(m,'auc')} | {metric(m,'precision')} | {metric(m,'recall')} | {metric(m,'brier')} | {metric(m,'predicted')}／{metric(m,'observed')} |")
out+=['','## 限制與提案意義','','資料僅含成功刷卡上車，無法觀察滿車過站、無人刷卡上車、現金乘客或放棄等候。vehicle 與實體車、班次的對應未證實；相鄰兩個刷卡站可能跨班或方向不符。評估樣本由事後看到目標站上車才選出，不能代表全部班次，也無法保證當下知道車會到該站。上游最後一筆上車需事後才能確認是最後一筆，線上系統須由 GPS／發車事件界定。只有 0–30 分鐘且可配對的觀察才納入；不同站的涵蓋率及實用提前量不能代表所有車。座位數未經業者確認。訓練期同組平均包含本身，測試期不包含；信賴區間未涵蓋訓練、資料偏差或選樣不確定性。','','這個結果支持先做離線風險排序展示，不足以宣稱可避免過站或提供可靠即時警報。下一步應取得車輛班次、方向、GPS 與即時上下車紀錄，前瞻驗證全班次，並在訓練期另選操作門檻後以新資料檢查精確率、召回與校準。','','## 簡報圖表建議','','以四站並列點圖呈現 A、B 的 AUC 與 95% 區間；旁邊直接標出 0.5 門檻下召回率為零，以及每站中位提前分鐘數。圖註說明只涵蓋成功刷卡且可配對的到站；不把 AUC 當作實際警示成功率。','','可重跑程式、完整數值與分組校準見 `experiments/forecast/README.md` 與 `results.json`。']
(p.parent.parent/'forecast-experiment.zh-TW.md').write_text('\n'.join(out)+'\n')
