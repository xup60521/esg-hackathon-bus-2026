"""回測營運儀表板資料匯出：把留出期（2025-07-01 起）的刷卡資料逐日匯出成「當時系統收得到的刷卡流」，
並以提案 v6 的因果查表調度卡（N5、60 秒靜默）重放提示，供 /dashboard 頁面回放。

班次切分、方向推斷、離站判斷與提示規則照抄 docs/proposal/submission/analysis/alert/v5/run_causal.py
（raw 篩選、GAP=60、QX=60、DROP=0、DELAY=0），並與 causal_q60/ledger_41few_N5_lookup.csv 逐列核對。

用法：uv run --with pandas --with numpy python -I scripts/dashboard/export_replay.py <trips.db> <輸出資料夾（須不存在）>
"""
import collections
import csv
import json
import os
import sqlite3
import sys

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
V5 = f"{ROOT}/docs/proposal/submission/analysis/alert/v5/causal_q60"
db, out = sys.argv[1], sys.argv[2]
GAP, QX, HOLD, TRAIN_END = 60, 60, "2025-07-01", "2025-03-31"
MID = {"桃米坑", "暨南大學", "暨南大學校內", "九族文化村", "崎下", "大雁", "牛耳石雕公園", "魚池", "日月老茶廠", "向山行政中心", "水社", "埔里站"}

stops = json.load(open(f"{ROOT}/public/geo/stops.json"))
order = {s["name"]: s["order"] for s in stops}
name = {s["order"]: s["name"] for s in stops}
mid_orders = sorted(order[n] for n in MID)
cal = json.load(open(f"{ROOT}/public/data/lab/visualization/calendar.json"))["days"]

c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
df = pd.read_sql("select subroute, vehicle, board_date, board_ts, board_stop, alight_ts, alight_stop from trips "
                 "where alight_ts is not null", c)  # 同 causal_q60 的 raw 篩選
df["bo"] = df.board_stop.map(order)
df["ao"] = df.alight_stop.map(order)
df["dir"] = np.sign(df.ao - df.bo).astype(int)
df = df.sort_values(["vehicle", "board_date", "dir", "board_ts"]).reset_index(drop=True)
served = {}
for (sub_, d_), g_ in df[df.board_date <= "2025-03-31"].groupby(["subroute", "dir"]):
    cnt_ = collections.Counter(g_.bo.tolist()) + collections.Counter(g_.ao.tolist())
    served[(sub_, int(d_))] = {o for o, c_ in cnt_.items() if c_ >= 30}

# ---- 班次切分與即時方向（只用當下已觀察的刷卡）----
df = df.sort_values(["vehicle", "board_date", "board_ts"]).reset_index(drop=True)
rid, cdir, cur, state = [], [], -1, None
for r in df.itertuples(index=False):
    key = (r.vehicle, r.board_date)
    if state is None or key != state[0] or r.board_ts - state[1] > GAP * 60:
        cur += 1
        state = [key, r.board_ts, r.bo, 0]
    else:
        _, lt, ext, d = state
        if d == 0:
            if r.bo != ext:
                d = int(np.sign(r.bo - ext))
                ext = r.bo
        else:
            if d * (ext - r.bo) >= 3:
                cur += 1
                state = [key, r.board_ts, r.bo, 0]
                rid.append(cur)
                cdir.append(0)
                continue
            ext = max(ext, r.bo) if d > 0 else min(ext, r.bo)
        state = [key, r.board_ts, ext, d]
    state[1] = r.board_ts
    rid.append(cur)
    cdir.append(state[3])
df["rid"], df["cdir"] = rid, cdir
df["nxt_ts"] = df.groupby(["vehicle", "board_date"]).board_ts.shift(-1)
df = df[(df.board_date >= HOLD) | (df.board_date <= TRAIN_END)].sort_values(["rid", "board_ts"], kind="stable").reset_index(drop=True)

# ---- 調度卡 ----
card, card_rows = {}, []
with open(f"{V5}/lookup_card_N5.csv", encoding="utf-8-sig") as f:
    for row in csv.reader(f):
        if row[0] == "子路線":
            continue
        lo = 48 if row[3] == "48+" else int(row[3].split("–")[0])
        card[(row[0], order[row[1]], order[row[2]], lo // 3)] = len(card_rows)
        card_rows.append({"sub": row[0], "from": row[1], "to": row[2], "band": row[3], "ratio": float(row[4]), "n": int(row[5])})

day0 = lambda date: int(pd.Timestamp(f"{date}T00:00:00+08:00").timestamp())
days = collections.defaultdict(lambda: {"runs": [], "trips": [], "deps": [], "arr": []})
units = []  # (t, date, dep_idx, alertable)
train_rows = []  # 訓練期 (子路線, 離站站, 下游站, 載客區間, 下游實際載客)：重建完整查表（調度卡只是其中比率 ≥0.944 的列）
for rid_, g in df.groupby("rid", sort=False):
    date, sub, veh = g.board_date.iat[0], g.subroute.iat[0], g.vehicle.iat[0]
    train = date <= TRAIN_END
    D = days["train" if train else date]
    z = day0(date)
    ri = len(D["runs"])
    bo, ao, bt, at_ = g.bo.values, g.ao.values, g.board_ts.values, g.alight_ts.values
    post_dir = int(np.sign(np.sign(g.dir.values).sum()))
    D["runs"].append([sub, veh, post_dir])
    D["trips"] += [[ri, int(b - z), int(o), int(a - z), int(p)] for b, o, a, p in zip(bt, bo, at_, ao)]
    # 離站候選（60 秒靜默）
    seen = set()
    nx, cd = g.nxt_ts.values, g.cdir.values
    for i in range(len(bt)):
        gap = (nx[i] - bt[i]) if not np.isnan(nx[i]) else 10 ** 9
        if gap < QX:
            continue
        d, u, t_d = int(cd[i]), int(bo[i]), int(bt[i]) + QX
        if (u, t_d) in seen:
            continue
        seen.add((u, t_d))
        abstain = d == 0
        if abstain:
            if train:
                continue
            d = post_dir
            if d == 0:
                continue
        up = -1 if abstain else int(((bt <= bt[i]) & (at_ > t_d)).sum())
        if up == 0:
            continue
        nxt = sorted([o for o in mid_orders if (o - u) * d > 0 and o in served.get((sub, d), set())], key=lambda o: abs(o - u))[:3]
        if not nxt:
            continue
        if train:
            for s_ in nxt:
                ld = int(((bo < s_) & (ao > s_)).sum()) if d > 0 else int(((bo > s_) & (ao < s_)).sum())
                train_rows.append((sub, u, s_, min(up, 50) // 3, ld))
            continue
        down = []
        best = None
        for s_ in nxt:
            ld = int(((bo < s_) & (ao > s_)).sum()) if d > 0 else int(((bo > s_) & (ao < s_)).sum())
            down.append([int(s_), ld])
            if not abstain:
                ci = card.get((sub, u, s_, min(up, 50) // 3))
                if ci is not None and (best is None or card_rows[ci]["ratio"] > card_rows[best]["ratio"]):
                    best = ci
        y = int(any(ld >= 36 for _, ld in down))
        di = len(D["deps"])
        D["deps"].append([t_d - z, ri, u, 0 if abstain else d, up, best if best is not None else -1, 0, y, down])
        units.append((t_d, date, di, best is not None))

days.pop("train", None)

# 完整查表：平滑比率 (命中數 + 5×訓練期盛行率)/(樣本數 + 5)，與 run_causal.py 相同；41 席（≥36）與 37 席（≥32）各一
T = pd.DataFrame(train_rows, columns=["sub", "u", "s", "ub", "ld"])
lookup = []
pv = {cap: float((T.ld >= cap - 5).mean()) for cap in (41, 37)}
for (sub_, u_, s_, ub_), g_ in T.groupby(["sub", "u", "s", "ub"]):
    n_ = len(g_)
    lookup.append([sub_, int(u_), int(s_), int(ub_), *(round((int((g_.ld >= cap - 5).sum()) + 5 * pv[cap]) / (n_ + 5), 3) for cap in (41, 37)), n_])
mine_card = sorted((r[0], r[1], r[2], r[3]) for r in lookup if r[4] >= 0.944)
print(f"lookup cells={len(lookup)} cells≥0.944={len(mine_card)} card rows={len(card)} same={mine_card == sorted(card)}")

# 中途站到站：沿用提案熱點分析（dispatch/analyze.py）的重建到站列，數字才能與 620／1,634 次對得上
seats = json.load(open(f"{ROOT}/public/data/lab/seats/summary.json"))
DIRS = {"outbound": 1, "inbound": -1, "unknown": 0}
for month in seats["months"]:
    if month < HOLD[:7]:
        continue
    for day, stop, minute, sub, di, load, boarded in json.load(open(f"{ROOT}/public/data/lab/seats/arrivals-{month}.json"))["rows"]:
        sname = seats["stops"][stop]
        if sname in MID and load > 0:
            days[f"{month}-{day:02d}"]["arr"].append([minute * 60, order[sname], seats["subroutes"][sub], DIRS[seats["directions"][di]], load, boarded])

# 首次提示（每班一次）＋每日上限 5
first = {}
for t_d, date, di, ok in units:
    if ok:
        ri = days[date]["deps"][di][1]
        if (date, ri) not in first or t_d < first[(date, ri)][0]:
            first[(date, ri)] = (t_d, di)
cnt = collections.Counter()
for (date, _), (t_d, di) in sorted(first.items(), key=lambda kv: kv[1][0]):
    cnt[date] += 1
    if cnt[date] <= 5:
        days[date]["deps"][di][6] = 1

# ---- 與提案台帳核對 ----
ledger = []
with open(f"{V5}/ledger_41few_N5_lookup.csv", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        ledger.append((row["日期"], row["離站時刻"], row["離站站"], int(row["上游載客"]), int(row["前3中途站是否任一達門檻"])))
mine = []
for date, D in days.items():
    for dep in D["deps"]:
        if dep[6]:
            hh, mm = divmod(dep[0] // 60, 60)
            mine.append((date, f"{hh:02d}:{mm:02d}", name[dep[2]], dep[4], dep[7]))
diff = collections.Counter(ledger)
diff.subtract(collections.Counter(mine))
bad = {k: v for k, v in diff.items() if v}
print(f"alerts mine={len(mine)} ledger={len(ledger)} hits mine={sum(m[4] for m in mine)} ledger={sum(l[4] for l in ledger)} mismatched={len(bad)}")
for k, v in sorted(bad.items()):
    print("  diff", k, v)

# ---- 輸出 ----
os.makedirs(f"{out}/days")
dispatch = json.load(open(f"{ROOT}/docs/proposal/submission/analysis/dispatch/v3/out/results.json"))
index = {"stops": [[s["order"], s["name"]] for s in stops], "mid": mid_orders, "card": card_rows, "lookup": lookup,
         "served": {f"{k[0]}|{k[1]}": sorted(v) for k, v in served.items() if k[1] != 0},
         "hot": [{"sub": w["window"][0], "dir": -1 if w["window"][1] == "inbound" else 1, "hour": w["window"][2], "rest": w["window"][3] == "休息日",
                  "train": w["train_near"], "holdout": w["holdout_near"], "perDay": round(w["holdout_near_per_day"], 3)} for w in dispatch["cap41"]["top10"]],
         "days": []}
for date in sorted(days):
    D = days[date]
    D["trips"].sort(key=lambda r: r[1])
    D["deps"].sort(key=lambda r: r[0])
    D["arr"].sort(key=lambda r: r[0])
    rest = bool(cal[date]["rest"])
    with open(f"{out}/days/{date}.json", "x") as f:
        json.dump({"date": date, "rest": rest, **D}, f, ensure_ascii=False, separators=(",", ":"))
    al = [d for d in D["deps"] if d[6]]
    an = [d for d in al if d[4] > 50 or any(ld > 50 for _, ld in d[8])]  # 載客重建 >50：交人工核對，不計入操作統計
    known = D["arr"]
    index["days"].append({"date": date, "rest": rest, "note": cal[date].get("note"), "runs": len(D["runs"]), "rides": len(D["trips"]),
                          "alerts": len(al), "hits": sum(d[7] for d in al),
                          "anom": len(an), "anomHits": sum(d[7] for d in an), "deps": len(D["deps"]), "abstain": sum(1 for d in D["deps"] if d[3] == 0),
                          "near41": sum(1 for a in known if a[4] >= 36), "near37": sum(1 for a in known if a[4] >= 32)})
with open(f"{out}/index.json", "x") as f:
    json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
print("days", len(index["days"]), "near41", sum(d["near41"] for d in index["days"]), "near37", sum(d["near37"] for d in index["days"]))
