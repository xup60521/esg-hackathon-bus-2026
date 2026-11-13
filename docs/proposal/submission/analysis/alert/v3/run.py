"""預警回測 v3：以「通過下游中途站時的實際在車人數」為目標，不依賴下游是否有人上車（避免用未來資訊選樣）。
用法：python run.py <trips.db> <專案根目錄> <輸出資料夾（須不存在）>
設計：
 - 站序採 public/geo/stops.json 的 order（地理順序）；資料庫的 board_seq 不穩定，不使用。方向＝sign(下車站序−上車站序)。
 - 班次(run)：同車、同日、同方向，依上車時間排序；相鄰上車間隔>60 分，或上車站序在行進方向上倒退≥3 站，視為新班次。
 - 預測時點：班次中每個「有人刷卡上車的站 u」離站時（離站時刻代理＝該站最後一筆刷卡上車時刻）。
 - 目標：u 之後行進方向上的前 3 個中途站 s，通過 s 時（先下後上）的在車人數 load(s) ≥ 門檻（41 席 36／37 席 32；已滿 41／37）。
   在車人數由「上車站序<s 且 下車站序>s」的旅次數計算，與 s 是否有人刷卡上車無關。
 - 特徵只含 u 離站時可得資訊：u 離站在車人數、時刻、星期、休息日旗標、子路線、方向、u 與 s 的站序、距離、s 是第幾個中途站。
 - 時間切分：訓練 ≤2025-03-31、選擇 2025-04-01～06-30、留出 ≥2025-07-01。"""
import sys, os, json, math, sqlite3, collections, random
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, average_precision_score
import lightgbm as lgb
db, root, out = sys.argv[1], sys.argv[2], sys.argv[3]; os.makedirs(out)
st = json.load(open(f"{root}/public/geo/stops.json")); order = {s["name"]: s["order"] for s in st}; byorder = {s["order"]: s for s in st}
MID = {"桃米坑","暨南大學","暨南大學校內","九族文化村","崎下","大雁","牛耳石雕公園","魚池","日月老茶廠","向山行政中心","水社","埔里站"}
mid_orders = sorted(order[n] for n in MID)
def hav(a, b):
    R = 6371.0; p1, p2 = math.radians(a["lat"]), math.radians(b["lat"]); dl = math.radians(b["lon"] - a["lon"]); dp = p2 - p1
    h = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2; return 2*R*math.asin(math.sqrt(h))
cal = json.load(open(f"{root}/public/data/lab/visualization/calendar.json"))["days"]
c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
df = pd.read_sql("select subroute, vehicle, board_date, board_ts, board_stop, alight_ts, alight_stop from trips where board_stop<>alight_stop and alight_ts-board_ts between 180 and 14400", c)
df["bo"] = df.board_stop.map(order); df["ao"] = df.alight_stop.map(order); df["dir"] = np.sign(df.ao - df.bo).astype(int)
df = df.sort_values(["vehicle", "board_date", "dir", "board_ts"]).reset_index(drop=True)
subs = sorted(df.subroute.unique()); subi = {s: i for i, s in enumerate(subs)}
runs = []; cur = None; prev = None
for r in df.itertuples(index=False):
    key = (r.vehicle, r.board_date, r.dir)
    new = prev is None or key != prev[0] or r.board_ts - prev[1] > 3600 or (r.dir * (prev[2] - r.bo) >= 3)
    if new:
        cur = []; runs.append((key, r.subroute, cur))
    cur.append((r.bo, r.ao, r.board_ts, r.alight_ts)); prev = (key, r.board_ts, max(prev[2], r.bo) if (prev and not new and r.dir > 0) else (min(prev[2], r.bo) if (prev and not new) else r.bo))
print("runs", len(runs), flush=True)
# 離站時刻代理與速度
rows = []
for (veh, date, d), sub, rides in runs:
    bo = np.array([x[0] for x in rides]); ao = np.array([x[1] for x in rides]); bt = np.array([x[2] for x in rides])
    obs = sorted(set(bo.tolist()), key=lambda o: o * d)
    for u in obs:
        mask_u = bt[bo == u]; t_dep = int(mask_u.max())
        # 離站在車人數：u 及之前上車、下車在 u 之後（行進方向）
        if d > 0: after = int(((bo <= u) & (ao > u)).sum())
        else: after = int(((bo >= u) & (ao < u)).sum())
        nxt = [o for o in mid_orders if (o - u) * d > 0]; nxt.sort(key=lambda o: abs(o - u))
        for k, s in enumerate(nxt[:3], 1):
            if d > 0: ld = int(((bo < s) & (ao > s)).sum())
            else: ld = int(((bo > s) & (ao < s)).sum())
            rows.append((date, veh, sub, d, u, s, k, t_dep, after, ld, len(obs)))
R = pd.DataFrame(rows, columns=["date", "veh", "sub", "dir", "u", "s", "k", "t", "up_load", "load", "n_obs"])
print("rows", len(R), flush=True)
R["subi"] = R["sub"].map(subi); R["rest"] = R.date.map(lambda x: 1 if cal[x]["rest"] else 0)
ts = pd.to_datetime(R.t + 8 * 3600, unit="s"); R["minute"] = ts.dt.hour * 60 + ts.dt.minute; R["dow"] = pd.to_datetime(R.date).dt.dayofweek
R["dist"] = [hav(byorder[u], byorder[s]) for u, s in zip(R.u, R.s)]
R = R[R.up_load > 0].reset_index(drop=True)  # 上游離站車上已有乘客
tr = R.date <= "2025-03-31"; va = (R.date >= "2025-04-01") & (R.date <= "2025-06-30"); ho = R.date >= "2025-07-01"
# 速度（km/分）：訓練期相鄰觀察站的 距離／時間 中位數，以子路線分別
spd = {}
for sub, g in R[tr].groupby("sub"):
    spd[sub] = float(np.median(g.dist / np.maximum(1e-6, (g.t.groupby([g.veh, g.date]).transform("max") - g.t) / 60.0 + 20))) if False else None
speed_kmpm = 0.7  # 保守的固定速度假設（42 km/h），提前量僅為近似；README 揭露
R["lead"] = R.dist / speed_kmpm
feat = ["up_load", "minute", "dow", "rest", "subi", "dir", "u", "s", "k", "dist"]
res = {"counts": {"rows": int(len(R)), "train": int(tr.sum()), "val": int(va.sum()), "holdout": int(ho.sum()), "runs": len(runs)}, "tasks": {}}
rng = np.random.RandomState(42)
def ci_by_day(df_, y, score, thr, n=200):
    days = df_.date.unique(); g = {d: (y[df_.date.values == d], score[df_.date.values == d]) for d in days}
    ps, rs = [], []
    for _ in range(n):
        pick = rng.choice(len(days), len(days)); yy = np.concatenate([g[days[i]][0] for i in pick]); ss = np.concatenate([g[days[i]][1] for i in pick])
        pred = ss >= thr; tp = (pred & (yy == 1)).sum(); ps.append(tp / max(1, pred.sum())); rs.append(tp / max(1, (yy == 1).sum()))
    return [float(np.percentile(ps, 2.5)), float(np.percentile(ps, 97.5))], [float(np.percentile(rs, 2.5)), float(np.percentile(rs, 97.5))]
dash = {"replays": {}}
for cap in (41, 37):
    for kind, thr in (("few", cap - 5), ("full", cap)):
        y = (R.load >= thr).astype(int).values; key = f"{cap}_{kind}"
        base = (R.up_load >= thr).astype(float).values
        # 歷史先驗：訓練期同（子路線,方向,小時,休息日,s）的比率
        R["_h"] = R.minute // 60
        grp = R[tr].assign(y=y[tr.values]).groupby(["subi", "dir", "_h", "rest", "s"]).y.agg(["mean", "count"])
        prior = np.array([grp["mean"].get(k, np.nan) for k in zip(R.subi, R.dir, R._h, R.rest, R.s)]); gm = float(y[tr.values].mean()); prior = np.where(np.isnan(prior), gm, prior)
        Xtr, Xva, Xho = R.loc[tr, feat], R.loc[va, feat], R.loc[ho, feat]
        lg = lgb.LGBMClassifier(n_estimators=400, learning_rate=0.05, num_leaves=31, min_child_samples=40, subsample=0.8, subsample_freq=1, colsample_bytree=0.9, random_state=42, verbose=-1)
        lg.fit(Xtr, y[tr.values], eval_set=[(Xva, y[va.values])], eval_metric="average_precision", callbacks=[lgb.early_stopping(40, verbose=False)])
        sc = lg.predict_proba(R[feat])[:, 1]
        lr = LogisticRegression(max_iter=300); Z = R[["up_load", "dist", "k", "rest"]].values.astype(float); mu, sd = Z[tr.values].mean(0), Z[tr.values].std(0) + 1e-9
        lr.fit((Z[tr.values] - mu) / sd, y[tr.values]); sl = lr.predict_proba((Z - mu) / sd)[:, 1]
        yh = y[ho.values]; T = {"prev": float(yh.mean()), "n_holdout": int(ho.sum()), "models": {}}
        # val 選門檻：F1 最大
        def best_thr(s):
            ys, ss = y[va.values], s[va.values]; best = (0, 0.5)
            for t in np.unique(np.quantile(ss, np.linspace(0.5, 0.999, 120))):
                p = ss >= t; tp = (p & (ys == 1)).sum(); pr = tp / max(1, p.sum()); rc = tp / max(1, ys.sum()); f = 2 * pr * rc / max(1e-9, pr + rc)
                if f > best[0]: best = (f, float(t))
            return best[1]
        for name, s in (("R", base), ("prior", prior), ("logistic", sl), ("lightgbm", sc)):
            t = 0.5 if name == "R" else best_thr(s); sh = s[ho.values]; p = sh >= t; tp = (p & (yh == 1)).sum()
            pci, rci = ci_by_day(R[ho], yh, sh, t)
            T["models"][name] = {"thr": t, "precision": float(tp / max(1, p.sum())), "recall": float(tp / max(1, yh.sum())), "precision_ci": pci, "recall_ci": rci,
                                 "roc_auc": float(roc_auc_score(yh, sh)) if name != "R" else None, "pr_auc": float(average_precision_score(yh, sh))}
        # 校準（模型分數 十等分）
        sh = sc[ho.values]; qs = np.quantile(sh, np.linspace(0, 1, 11)); cal_t = []
        for a, b in zip(qs[:-1], qs[1:]):
            m = (sh >= a) & (sh <= b); 
            if m.sum(): cal_t.append({"score_mean": float(sh[m].mean()), "obs_rate": float(yh[m].mean()), "n": int(m.sum())})
        T["calibration"] = cal_t
        # 提示單位：每班車(run)。班次內每個觀察站 u 離站時產生一個分數（取其前 3 個下游中途站的最大值）；
        # 班次「首次分數≥門檻」的離站時刻發出提示；提示正確＝該班有任一分數≥門檻的離站點，其後前 3 個中途站確實達門檻。
        # 同一預算下比較 R、歷史先驗與模型：R 的分數＝上游離站載客；每日提示數以時間順序硬上限 N 限制；
        # 門檻由選擇期選到「平均每日提示 ≤ N」。
        def run_frame(msk, score):
            Hh = R[msk].assign(sc=score[msk.values], y=y[msk.values])
            A = Hh.groupby(["veh", "date", "dir", "u"]).agg(sc=("sc", "max"), y=("y", "max"), t=("t", "first"), rest=("rest", "first"), dmin=("dist", "min"), sub=("sub", "first"), up=("up_load", "first")).reset_index().sort_values("t")
            return A
        def ops_for(score, N):
            Av = run_frame(va, score); Ah = run_frame(ho, score)
            def flags(A, tau):
                f = A[A.sc >= tau]; first = f.groupby(["veh", "date", "dir"]).t.min().rename("tf").reset_index()
                caught = f[f.y == 1].groupby(["veh", "date", "dir"]).agg(tc=("t", "min"), dm=("dmin", "min")).reset_index()
                return first.merge(caught, on=["veh", "date", "dir"], how="left")
            nd = Av.date.nunique(); lo, hi = np.min(Av.sc), np.max(Av.sc); tau = hi
            for t in np.unique(np.quantile(Av.sc, np.linspace(0.3, 0.99995, 600))):
                if len(flags(Av, t)) / nd <= N: tau = float(t); break
            F = flags(Ah, tau).sort_values("tf"); cnt = collections.Counter(); acc = []
            for r_ in F.itertuples():
                d_ = pd.Timestamp(r_.tf + 8 * 3600, unit="s").strftime("%Y-%m-%d")
                if cnt[d_] < N: cnt[d_] += 1; acc.append(True)
                else: acc.append(False)
            F["acc"] = acc; Fa = F[F.acc]; nd_h = Ah.date.nunique(); runs_pos = Ah.groupby(["veh", "date", "dir"]).y.max(); npos = int(runs_pos.sum())
            tp = int(Fa.tc.notna().sum()); lead = (Fa.dm.dropna() / speed_kmpm)
            rest_days = Ah.groupby("date").rest.first(); nrest = int((rest_days == 1).sum()); nwork = int((rest_days == 0).sum())
            Fa = Fa.assign(day=[pd.Timestamp(x + 8 * 3600, unit="s").strftime("%Y-%m-%d") for x in Fa.tf]); Fa = Fa.assign(rest=Fa.day.map(lambda d: 1 if cal[d]["rest"] else 0))
            return {"threshold": float(tau), "precision": tp / max(1, len(Fa)), "recall": tp / max(1, npos), "alerts_per_day": float(len(Fa) / nd_h),
                    "rest_alerts_per_day": float((Fa.rest == 1).sum() / max(1, nrest)), "work_alerts_per_day": float((Fa.rest == 0).sum() / max(1, nwork)),
                    "max_alerts_in_a_day": int(max(cnt.values())) if cnt else 0, "lead_median_min": float(lead.median()) if len(lead) else None, "lead_p10_min": float(lead.quantile(0.1)) if len(lead) else None,
                    "lead_ge10_share": float((lead >= 10).mean()) if len(lead) else None}, npos / nd_h
        T["ops"] = {}; ev_pd = None
        for N in (3, 5, 10):
            T["ops"][str(N)] = {}
            for name, sco in (("R", R.up_load.values.astype(float)), ("prior", prior), ("lightgbm", sc)):
                o, ev_pd = ops_for(sco, N); T["ops"][str(N)][name] = o
        T["events_per_day_runs"] = ev_pd
        A = run_frame(ho, sc); ndays = A.date.nunique(); T["alert_units_per_day"] = float(len(A) / ndays); T["alert_unit_prev"] = float(A.y.mean())
        res["tasks"][key] = T
        if key == "41_few":
            # 代表日重播（N=5 規則）
            for typ, pick in (("work", lambda d: not cal[d]["rest"]), ("rest", lambda d: cal[d]["rest"] and "note" not in cal[d]), ("holiday", lambda d: cal[d]["rest"] and "note" in cal[d])):
                ds = sorted({d for d in A.date.unique() if pick(d) and d >= "2025-09-01"}); d0 = ds[len(ds) // 2]
                g = A[A.date == d0].sort_values("t"); thr5 = T["ops"]["5"]["lightgbm"]["threshold"]; cnt = 0; ev = []; seen = set()
                for rr in g.itertuples():
                    al = rr.sc >= thr5 and cnt < 5 and (rr.veh, rr.dir) not in seen
                    if al: cnt += 1; seen.add((rr.veh, rr.dir))
                    ev.append([int(rr.t), rr.sub, int(rr.dir), byorder[int(rr.u)]["name"], int(rr.up), round(float(rr.sc), 3), 1 if al else 0, int(rr.y)])
                dash["replays"][typ] = {"day": d0, "events": ev}
# 事件率換算：G1 需要幾天
for key, T in res["tasks"].items():
    T["g1_days"] = {"events_per_day": T["events_per_day_runs"]}
res["design"] = {"speed_kmpm_assumed": speed_kmpm, "note": "提前量＝站間直線距離÷假設速度，僅為近似；離站時刻為最後一筆刷卡上車時刻代理"}
json.dump(res, open(f"{out}/metrics.json", "x"), ensure_ascii=False)
dash["summary"] = {k: {"prev": v["prev"], "models": {m: {x: v["models"][m][x] for x in ("precision", "recall", "pr_auc")} for m in v["models"]}, "ops": v["ops"], "events_per_day_runs": v["events_per_day_runs"], "calibration": v["calibration"], "alert_unit_prev": v["alert_unit_prev"], "alert_units_per_day": v["alert_units_per_day"]} for k, v in res["tasks"].items()}
dash["counts"] = res["counts"]
json.dump(dash, open(f"{out}/dashboard_data.json", "x"), ensure_ascii=False)
print("ok")
