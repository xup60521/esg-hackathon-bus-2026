"""調度情境：熱點窗口集中度、機動加班與車型指派情境、碳平衡點。
輸入（唯讀）：public/data/lab/seats/{summary.json,arrivals-*.json}、visualization/calendar.json、geo/stops.json。
用法：python scenarios.py <專案根目錄> <輸出資料夾（須不存在）>"""
import json, glob, sys, os, math, random, collections
root, out = sys.argv[1], sys.argv[2]
os.makedirs(out)  # 已存在則失敗，不覆寫
S = json.load(open(f"{root}/public/data/lab/seats/summary.json"))
cal = json.load(open(f"{root}/public/data/lab/visualization/calendar.json"))["days"]
stops = [s if isinstance(s, str) else s["name"] for s in S["stops"]]; subs = S["subroutes"]; dirs = S["directions"]
MID = {"桃米坑","暨南大學","暨南大學校內","九族文化村","崎下","大雁","牛耳石雕公園","魚池","日月老茶廠","向山行政中心","水社","埔里站"}
TRAIN_END, HOLD_START = "2025-03-31", "2025-07-01"
rows = []  # (date, rest, key, load, boarded)
for f in sorted(glob.glob(f"{root}/public/data/lab/seats/arrivals-*.json")):
    d = json.load(open(f)); m = d["month"]
    for day, stop, minute, sub, di, load, boarded in d["rows"]:
        if stops[stop] not in MID or load <= 0: continue
        date = f"{m}-{day:02d}"
        rows.append((date, cal[date]["rest"], (subs[sub], dirs[di], minute // 60), load, boarded))
days_tr = {r: sum(1 for k, v in cal.items() if k <= TRAIN_END and k[:4] in ("2024", "2025") and v["rest"] == r) for r in (True, False)}
days_ho = {r: sum(1 for k, v in cal.items() if k >= HOLD_START and k[:4] == "2025" and v["rest"] == r) for r in (True, False)}
res = {"days_train": {str(k): v for k, v in days_tr.items()}, "days_holdout": {str(k): v for k, v in days_ho.items()}}

def window(key, rest): return (key[0], key[1], key[2], "休息日" if rest else "上班日")
for cap in (41, 37):
    thr = cap - 5
    tr, ho, hoall = collections.Counter(), collections.Counter(), collections.Counter()
    ho_by_day = collections.defaultdict(collections.Counter)  # date -> window -> near count
    exp_ho = collections.Counter(); n_tr_all = collections.Counter(); n_ho_all = collections.Counter()
    for date, rest, key, load, boarded in rows:
        w = window(key, rest)
        if date <= TRAIN_END:
            n_tr_all[w] += 1
            if load >= thr: tr[w] += 1
        elif date >= HOLD_START and date[:4] == "2025":
            n_ho_all[w] += 1
            if load >= thr:
                ho[w] += 1; ho_by_day[date][w] += 1; exp_ho[w] += boarded
    allw = sorted(set(n_tr_all) | set(n_ho_all))
    ranked = sorted(allw, key=lambda w: -tr[w])
    tot_ho = sum(ho.values()); tot_hoall = sum(n_ho_all.values())
    # 集中度曲線 + 日 bootstrap
    hodates = sorted(ho_by_day) ; alldates = sorted({r[0] for r in rows if r[0] >= HOLD_START and r[0][:4] == "2025"})
    rng = random.Random(7)
    curve = []
    for k in list(range(1, 31)):
        topk = set(ranked[:k])
        cov = sum(ho[w] for w in topk) / tot_ho
        arr_share = sum(n_ho_all[w] for w in topk) / tot_hoall
        orac = sum(sorted(ho.values(), reverse=True)[:k]) / tot_ho
        rand = k / len(allw)
        bs = []
        for _ in range(300):
            samp = [rng.choice(alldates) for _ in alldates]
            num = den = 0
            for dd in samp:
                c = ho_by_day.get(dd, {})
                den += sum(c.values()); num += sum(v for w, v in c.items() if w in topk)
            bs.append(num / den if den else 0)
        bs.sort(); curve.append({"k": k, "coverage": cov, "ci": [bs[7], bs[292]], "arrival_share": arr_share, "oracle": orac, "random": rand})
    # 熱點窗口表（訓練期排序前 10），留出期的日均與情境 A
    top = []
    for w in ranked[:10]:
        nd = days_ho[w[3] == "休息日"]
        near_day = ho[w] / nd; expo_day = exp_ho[w] / nd
        top.append({"window": list(w), "train_near": tr[w], "holdout_near": ho[w], "holdout_near_per_day": near_day,
                    "holdout_exposed_boardings_per_day": expo_day,
                    "relief_per_extra_run": {str(s): min(41.0, s * expo_day) for s in (0.1, 0.3, 0.5)}})
    # 情境 B：車型指派（以到站為時段代理）
    n41 = collections.Counter(); n37 = collections.Counter()
    # 需要兩種席數的 near 數：另算
    res[f"cap{cap}"] = {"threshold": thr, "windows": len(allw), "holdout_near_total": tot_ho, "holdout_arrivals_total": tot_hoall,
                        "curve": curve, "top10": top, "top30_hold": [list(w) for w in ranked[:30]]}
    res[f"_near_{cap}"] = {"|".join(map(str, w)): [tr[w], ho[w], n_ho_all[w], exp_ho[w]] for w in allw}
# 情境 B
near41 = {tuple(k.split("|")): v for k, v in res["_near_41"].items()}; near37 = {tuple(k.split("|")): v for k, v in res["_near_37"].items()}
ranked41 = [tuple(map(str, w)) for w in [tuple(x) for x in res["cap41"]["top30_hold"]]]
scen_b = []
for K in (5, 10, 20):
    hot = set(tuple(x[:2] + [str(x[2])] + [x[3]]) for x in [list(w) for w in res["cap41"]["top30_hold"][:K]])
    for q in (0.10, 0.25, 0.50):
        tot_arr = sum(v[2] for v in near41.values())
        hot_arr = sum(v[2] for k, v in near41.items() if k in hot)
        # 隨機指派：每個到站以機率 q 為 37 席車
        e_rand = sum((1 - q) * v[1] + q * near37[k][1] for k, v in near41.items())
        # 避開熱點：37 席車只出現在非熱點，非熱點 37 席比例 = min(1, q*tot/nonhot)
        nonhot = tot_arr - hot_arr; qn = min(1.0, q * tot_arr / nonhot)
        e_avoid = sum((v[1] if k in hot else (1 - qn) * v[1] + qn * near37[k][1]) for k, v in near41.items())
        # 理想：全部 41 席
        e_all41 = sum(v[1] for v in near41.values())
        scen_b.append({"hot_windows": K, "q37": q, "expected_near_random": e_rand, "expected_near_avoid_hot": e_avoid, "all_41": e_all41,
                       "reduction_vs_random_pct": 100 * (1 - e_avoid / e_rand), "qn_nonhot": qn})
res["scenario_b"] = scen_b
# 路線長度與碳平衡點
st = json.load(open(f"{root}/public/geo/stops.json"))
def hav(a, b):
    R = 6371.0; p1, p2 = math.radians(a["lat"]), math.radians(b["lat"]); dl = math.radians(b["lon"] - a["lon"]); dp = p2 - p1
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2; return 2 * R * math.asin(math.sqrt(h))
seq = sorted(st, key=lambda s: s["order"]); straight = sum(hav(seq[i], seq[i + 1]) for i in range(len(seq) - 1))
res["route"] = {"stops": len(seq), "straight_km": straight, "road_factor_assumed": [1.2, 1.4], "road_km": [straight * 1.2, straight * 1.4]}
carbon = []
for vkm in (40, 80):
    for d in (20, 30, 40):
        lo = vkm * 0.90 / (0.104 * d); hi = vkm * 1.23 / (0.104 * d)
        carbon.append({"vehicle_km": vkm, "avoided_pkm_per_transfer": d, "breakeven_transfers": [lo, hi]})
res["carbon_breakeven"] = carbon
res["carbon_note"] = "公車 0.90–1.23 kg CO2e/車公里（官方油耗標準與柴油係數算例，與運研所 0.077 kg/人公里×平均載客 11.7–16.0 人交叉檢查）；自用車 0.104 kg/人公里（運研所 2022）。"
res["cost_per_run_wan_assumed"] = [0.5, 1.5]
for k in ("_near_41", "_near_37"): res.pop(k)
json.dump(res, open(f"{out}/results.json", "x"), ensure_ascii=False)
dash = {"cap41": {"curve": res["cap41"]["curve"], "top10": res["cap41"]["top10"]}, "cap37": {"curve": res["cap37"]["curve"], "top10": res["cap37"]["top10"]},
        "scenario_b": scen_b, "carbon_breakeven": carbon, "route": res["route"], "cost_per_run_wan_assumed": res["cost_per_run_wan_assumed"]}
json.dump(dash, open(f"{out}/dashboard_data.json", "x"), ensure_ascii=False)
print("ok")
