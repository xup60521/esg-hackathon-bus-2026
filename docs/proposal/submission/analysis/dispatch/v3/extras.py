"""v3 補件：(1) 熱點排序基線（座位不多次數／比率／上車量／到站數）；(2) 6670 乘車 OD 直線距離分布（取代「每位轉乘者避免 30 公里」假設）；
(3) 各窗口留出期日均座位不多次數的最大值（41／37 席）。方向＝到站列方向（以 stops.json 地理順序對該到站上車旅客投票，非資料庫站序欄）。
用法：python extras.py <專案根目錄> <trips.db> <輸出資料夾（須不存在）>"""
import json, glob, sys, os, math, random, collections, sqlite3
import numpy as np
root, dbp, out = sys.argv[1:4]; os.makedirs(out)
S = json.load(open(f"{root}/public/data/lab/seats/summary.json"))
cal = json.load(open(f"{root}/public/data/lab/visualization/calendar.json"))["days"]
stops = [s if isinstance(s, str) else s["name"] for s in S["stops"]]; subs = S["subroutes"]; dirs = S["directions"]
MID = {"桃米坑","暨南大學","暨南大學校內","九族文化村","崎下","大雁","牛耳石雕公園","魚池","日月老茶廠","向山行政中心","水社","埔里站"}
TRAIN_END, HOLD_START = "2025-03-31", "2025-07-01"
rows = []; all_arr = 0; unk = 0
for f in sorted(glob.glob(f"{root}/public/data/lab/seats/arrivals-*.json")):
    d = json.load(open(f)); m = d["month"]
    for day, stop, minute, sub, di, load, boarded in d["rows"]:
        if stops[stop] not in MID or load <= 0: continue
        all_arr += 1
        if dirs[di] == "unknown": unk += 1; continue
        date = f"{m}-{day:02d}"
        rows.append((date, cal[date]["rest"], (subs[sub], dirs[di], minute // 60, "休息日" if cal[date]["rest"] else "上班日"), load, boarded))
res = {"mid_arrivals_load_gt0": all_arr, "direction_unknown": unk, "used": len(rows)}
days_ho = {r: sum(1 for k, v in cal.items() if k >= HOLD_START and k[:4] == "2025" and v["rest"] == r) for r in (True, False)}
alldates = sorted({r[0] for r in rows if r[0] >= HOLD_START and r[0][:4] == "2025"})
res["windows_known_direction"] = len({r[2] for r in rows})
for cap in (41, 37):
    thr = cap - 5
    tr = collections.Counter(); trn = collections.Counter(); trb = collections.Counter(); tro = collections.Counter()
    ho_by_day = collections.defaultdict(collections.Counter); ho = collections.Counter()
    for date, rest, w, load, boarded in rows:
        if date <= TRAIN_END:
            trn[w] += 1; trb[w] += boarded
            if load >= thr: tr[w] += 1
        elif date >= HOLD_START and date[:4] == "2025" and load >= thr:
            ho[w] += 1; ho_by_day[date][w] += 1
    allw = sorted(set(trn) | set(ho)); tot = sum(ho.values())
    rank = {"座位不多次數": sorted(allw, key=lambda w: -tr[w]),
            "座位不多比率": sorted(allw, key=lambda w: -(tr[w] / trn[w] if trn[w] else 0)),
            "比率（訓練期到站≥30）": sorted([w for w in allw if trn[w] >= 30], key=lambda w: -(tr[w] / trn[w])),
            "上車人次": sorted(allw, key=lambda w: -trb[w]), "中途站到站數": sorted(allw, key=lambda w: -trn[w])}
    rng = random.Random(7); R = {}
    for name, order in rank.items():
        R[name] = {}
        for k in (10, 20, 30):
            top = set(order[:k]); cov = sum(ho[w] for w in top) / tot; bs = []
            for _ in range(300):
                samp = [rng.choice(alldates) for _ in alldates]; num = den = 0
                for dd in samp:
                    c = ho_by_day.get(dd, {}); den += sum(c.values()); num += sum(v for w, v in c.items() if w in top)
                bs.append(num / den if den else 0)
            bs.sort(); R[name][k] = {"coverage": cov, "ci": [bs[7], bs[292]]}
    if cap == 41:
        r_tr = rank["座位不多次數"]; r_ho = sorted(allw, key=lambda w: -ho[w])
        stab = {}
        for k in (10, 20, 30): stab[k] = len(set(r_tr[:k]) & set(r_ho[:k]))
        res["stability_overlap_train_vs_holdout_top_k"] = stab
        res["holdout_top10"] = [{"window": list(w), "holdout_near": ho[w], "train_rank": r_tr.index(w) + 1 if w in r_tr else None} for w in r_ho[:10]]
    nd = lambda w: days_ho[w[3] == "休息日"]
    per_day = sorted(((ho[w] / nd(w), list(w)) for w in allw), reverse=True)[:5]
    res[f"cap{cap}"] = {"windows": len(allw), "holdout_near_total": tot, "rankings": R, "max_holdout_near_per_day_top5": per_day}
# OD 直線距離
st = {s["name"]: s for s in json.load(open(f"{root}/public/geo/stops.json"))}
def hav(a, b):
    R_ = 6371.0; p1, p2 = math.radians(a["lat"]), math.radians(b["lat"]); dl = math.radians(b["lon"] - a["lon"]); dp = p2 - p1
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2; return 2 * R_ * math.asin(math.sqrt(h))
c = sqlite3.connect(f"file:{dbp}?mode=ro", uri=True)
cnt = collections.Counter()
for b, a, n in c.execute("select board_stop, alight_stop, count(*) from trips where board_stop<>alight_stop and alight_ts-board_ts between 180 and 14400 group by 1,2"): cnt[(b, a)] += n
ds = []; ws = []
for (b, a), n in cnt.items():
    if b in st and a in st: ds.append(hav(st[b], st[a])); ws.append(n)
ds = np.array(ds); ws = np.array(ws); o = np.argsort(ds); cw = np.cumsum(ws[o]) / ws.sum()
q = lambda p: float(ds[o][np.searchsorted(cw, p)])
res["od_straight_km"] = {"rides": int(ws.sum()), "p25": q(.25), "median": q(.5), "p75": q(.75), "mean": float((ds * ws).sum() / ws.sum())}
# 站別採樣速率：留出期（2025-07～12）每日有載客(>0)的中途站到站數（全站、方向可判定與否皆含）
cnt_stop = collections.Counter(); nd_all = len({k for k in cal if k >= HOLD_START and k[:4] == "2025"})
for f in sorted(glob.glob(f"{root}/public/data/lab/seats/arrivals-2025-*.json")):
    d = json.load(open(f)); m = d["month"]
    if m < "2025-07": continue
    for day, stop, minute, sub, di, load, boarded in d["rows"]:
        if stops[stop] in MID: cnt_stop[(stops[stop], load > 0)] += 1
res["stop_daily_arrivals_holdout"] = {n: {"all": (cnt_stop[(n, True)] + cnt_stop[(n, False)]) / nd_all, "load_gt0": cnt_stop[(n, True)] / nd_all} for n in sorted(MID)}
res["holdout_days"] = nd_all
json.dump(res, open(f"{out}/extras.json", "x"), ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1)[:4000])
