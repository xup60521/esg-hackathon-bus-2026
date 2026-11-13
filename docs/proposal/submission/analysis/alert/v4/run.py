"""預警回測 v4（修正 v3）：保留班次編號；上游離站載客只用離站當下已知的上下車（時間基準）；
提示單位＝班次，首次分數≥門檻的離站點發出提示，正確＝該離站點自己的前 3 個中途站確實達門檻；
提前量綁定該次提示；在相同提示量下比較 R／歷史先驗／模型；班次切分間隔做敏感度。
用法：python run.py <trips.db> <專案根目錄> <輸出資料夾（須不存在）> [切班間隔分鐘=60]
"""
import sys, os, json, math, sqlite3, collections
import numpy as np, pandas as pd
from sklearn.metrics import roc_auc_score, average_precision_score
import lightgbm as lgb
db, root, out = sys.argv[1], sys.argv[2], sys.argv[3]; GAP = int(sys.argv[4]) if len(sys.argv) > 4 else 60
os.makedirs(out)
st = json.load(open(f"{root}/public/geo/stops.json")); order = {s["name"]: s["order"] for s in st}; byorder = {s["order"]: s for s in st}
MID = {"桃米坑","暨南大學","暨南大學校內","九族文化村","崎下","大雁","牛耳石雕公園","魚池","日月老茶廠","向山行政中心","水社","埔里站"}
mid_orders = sorted(order[n] for n in MID)
def hav(a, b):
    R_ = 6371.0; p1, p2 = math.radians(a["lat"]), math.radians(b["lat"]); dl = math.radians(b["lon"]-a["lon"]); dp = p2-p1
    h = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2; return 2*R_*math.asin(math.sqrt(h))
cal = json.load(open(f"{root}/public/data/lab/visualization/calendar.json"))["days"]
c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
df = pd.read_sql("select subroute, vehicle, board_date, board_ts, board_stop, alight_ts, alight_stop from trips where board_stop<>alight_stop and alight_ts-board_ts between 180 and 14400", c)
n_raw = int(pd.read_sql("select count(*) n from trips", c).n[0])
df["bo"] = df.board_stop.map(order); df["ao"] = df.alight_stop.map(order); df["dir"] = np.sign(df.ao - df.bo).astype(int)
df = df.sort_values(["vehicle", "board_date", "dir", "board_ts"]).reset_index(drop=True)
# 班次編號
rid = []; cur = -1; prev = None
for r in df.itertuples(index=False):
    key = (r.vehicle, r.board_date, r.dir)
    new = prev is None or key != prev[0] or r.board_ts - prev[1] > GAP * 60 or (r.dir * (prev[2] - r.bo) >= 3)
    if new: cur += 1; ext = r.bo
    else: ext = max(prev[2], r.bo) if r.dir > 0 else min(prev[2], r.bo)
    rid.append(cur); prev = (key, r.board_ts, ext)
df["rid"] = rid
# 車日時間索引（供離站當下在車人數）
vd = {}
for (veh, date), g in df.groupby(["vehicle", "board_date"]): vd[(veh, date)] = (g.board_ts.values, g.alight_ts.values)
rows = []
for rid_, g in df.groupby("rid"):
    veh, date, d, sub = g.vehicle.iat[0], g.board_date.iat[0], int(g.dir.iat[0]), g.subroute.iat[0]
    bo, ao, bt = g.bo.values, g.ao.values, g.board_ts.values; bts, ats = vd[(veh, date)]
    for u in sorted(set(bo.tolist()), key=lambda o: o * d):
        t_dep = int(bt[bo == u].max())
        up = int(((bts <= t_dep) & (ats > t_dep)).sum())  # 離站當下已知：已上車且尚未下車（同車同日，與切班無關）
        nxt = sorted([o for o in mid_orders if (o - u) * d > 0], key=lambda o: abs(o - u))[:3]
        for k, s in enumerate(nxt, 1):
            ld = int(((bo < s) & (ao > s)).sum()) if d > 0 else int(((bo > s) & (ao < s)).sum())  # 標籤（事後真值，限同班次）
            rows.append((rid_, date, veh, sub, d, u, s, k, t_dep, up, ld))
R = pd.DataFrame(rows, columns=["rid", "date", "veh", "sub", "dir", "u", "s", "k", "t", "up_load", "load"])
subs = sorted(R["sub"].unique()); subi = {s_: i for i, s_ in enumerate(subs)}
R["subi"] = R["sub"].map(subi); R["rest"] = R.date.map(lambda x: 1 if cal[x]["rest"] else 0)
ts = pd.to_datetime(R.t + 8 * 3600, unit="s"); R["minute"] = ts.dt.hour * 60 + ts.dt.minute; R["dow"] = pd.to_datetime(R.date).dt.day_of_week
R["dist"] = [hav(byorder[u], byorder[s_]) for u, s_ in zip(R.u, R.s)]
R = R[R.up_load > 0].reset_index(drop=True)
tr = (R.date <= "2025-03-31").values; va = ((R.date >= "2025-04-01") & (R.date <= "2025-06-30")).values; ho = (R.date >= "2025-07-01").values
feat = ["up_load", "minute", "dow", "rest", "subi", "dir", "u", "s", "k", "dist"]
res = {"gap_min": GAP, "counts": {"trips_raw": n_raw, "rides_used": int(len(df)), "runs": int(df.rid.nunique()), "rows": int(len(R)), "train": int(tr.sum()), "val": int(va.sum()), "holdout": int(ho.sum()),
        "vehicle_day_dir_groups": int(df.groupby(["vehicle", "board_date", "dir"]).ngroups), "multi_run_groups": int((df.groupby(["vehicle", "board_date", "dir"]).rid.nunique() > 1).sum())}, "tasks": {}}
SPEEDS = (0.5, 0.7, 1.0)  # km/分
dash = {"replays": {}}
def unit_frame(msk, sc, yv):
    H = R[msk].assign(sc=sc[msk], y=yv[msk]); H["pos_d"] = np.where(H.y == 1, H.dist, np.nan)
    A = H.groupby(["rid", "u"], sort=False).agg(sc=("sc", "max"), y=("y", "max"), t=("t", "first"), date=("date", "first"), rest=("rest", "first"), pos_d=("pos_d", "min"), sub=("sub", "first"), dir=("dir", "first"), up=("up_load", "first")).reset_index()
    return A.sort_values(["rid", "t"])
def first_flag(A, tau):
    f = A[A.sc >= tau]; return f.groupby("rid", sort=False).head(1)
def curve(A, ndays, taus):
    pos_runs = A.groupby("rid").y.max(); npos = int(pos_runs.sum()); out_ = []
    for tau in taus:
        F = first_flag(A, tau); tp = int(F.y.sum()); out_.append((len(F) / ndays, tp / max(1, len(F)), tp / max(1, npos), F))
    return out_, npos
for cap in (41, 37):
    for kind, thr in (("few", cap - 5), ("full", cap)):
        key = f"{cap}_{kind}"; yv = (R.load >= thr).astype(int).values
        grp = R[tr].assign(y=yv[tr], h=lambda x: x.minute // 60).groupby(["subi", "dir", "h", "rest", "s"]).y.mean()
        prior = np.array([grp.get(k, np.nan) for k in zip(R.subi, R.dir, R.minute // 60, R.rest, R.s)]); prior = np.where(np.isnan(prior), yv[tr].mean(), prior)
        lg = lgb.LGBMClassifier(n_estimators=400, learning_rate=0.05, num_leaves=31, min_child_samples=40, subsample=0.8, subsample_freq=1, colsample_bytree=0.9, random_state=42, verbose=-1)
        lg.fit(R.loc[tr, feat], yv[tr], eval_set=[(R.loc[va, feat], yv[va])], eval_metric="average_precision", callbacks=[lgb.early_stopping(40, verbose=False)])
        sc = lg.predict_proba(R[feat])[:, 1]; Rs = R.up_load.values.astype(float)
        yh = yv[ho]; T = {"prev": float(yh.mean()), "n_holdout": int(ho.sum()), "models": {}}
        for name, s_ in (("R", Rs), ("prior", prior), ("lightgbm", sc)):
            sh = s_[ho]
            if name == "R": t_ = thr
            else:
                best = (0, 0.5)
                for q in np.unique(np.quantile(s_[va], np.linspace(0.5, 0.999, 100))):
                    p = s_[va] >= q; tp = (p & (yv[va] == 1)).sum(); pr = tp / max(1, p.sum()); rc = tp / max(1, yv[va].sum()); f1 = 2*pr*rc/max(1e-9, pr+rc)
                    if f1 > best[0]: best = (f1, float(q))
                t_ = best[1]
            p = sh >= t_; tp = int((p & (yh == 1)).sum())
            dts = R.date.values[ho]; ud = np.unique(dts); idx = {d_: np.where(dts == d_)[0] for d_ in ud}; rng = np.random.RandomState(42); ps_, rs_ = [], []
            for _ in range(200):
                pick = np.concatenate([idx[ud[i_]] for i_ in rng.randint(0, len(ud), len(ud))]); pp = p[pick]; yy = yh[pick]; tpp = (pp & (yy == 1)).sum()
                ps_.append(tpp / max(1, pp.sum())); rs_.append(tpp / max(1, (yy == 1).sum()))
            T["models"][name] = {"thr": float(t_), "precision": tp / max(1, int(p.sum())), "recall": tp / max(1, int(yh.sum())), "precision_ci": [float(np.percentile(ps_, 2.5)), float(np.percentile(ps_, 97.5))], "recall_ci": [float(np.percentile(rs_, 2.5)), float(np.percentile(rs_, 97.5))], "pr_auc": float(average_precision_score(yh, sh)), "roc_auc": (float(roc_auc_score(yh, sh)) if name != "R" else None)}
        sh = sc[ho]; qs = np.quantile(sh, np.linspace(0, 1, 11)); T["calibration"] = [{"score_mean": float(sh[(sh >= a) & (sh <= b)].mean()), "obs_rate": float(yh[(sh >= a) & (sh <= b)].mean()), "n": int(((sh >= a) & (sh <= b)).sum())} for a, b in zip(qs[:-1], qs[1:]) if ((sh >= a) & (sh <= b)).sum()]
        # 班次層級提示（首次分數≥門檻；正確＝該離站點自己的前 3 個中途站達門檻）
        Ah = {n_: unit_frame(ho, s_, yv) for n_, s_ in (("R", Rs), ("prior", prior), ("lightgbm", sc))}
        ndays = Ah["R"].date.nunique(); runs_pos = int(Ah["R"].groupby("rid").y.max().sum())
        T["runs_holdout"] = int(Ah["R"].rid.nunique()); T["pos_runs_per_day"] = runs_pos / ndays
        # 曲線：各方法掃門檻（描述性；用於同提示量比較）
        T["curves"] = {}
        for n_, A in Ah.items():
            taus = np.unique(np.quantile(A.sc, np.linspace(0.40, 0.9999, 60))); cv, _ = curve(A, ndays, taus)
            T["curves"][n_] = [[float(v), float(p), float(r)] for v, p, r, _ in cv]
        def at_volume(n_, vol):
            pts = T["curves"][n_]; best = min(pts, key=lambda x: abs(x[0] - vol)); return {"alerts_per_day": best[0], "precision": best[1], "recall": best[2]}
        T["matched_volume"] = {str(v): {n_: at_volume(n_, v) for n_ in Ah} for v in (2, 3, 5, 10)}
        # 操作點：選擇期門檻（平均每日提示≈N）＋留出期按時間順序的每日硬上限 N
        T["ops"] = {}
        for N in (3, 5, 10):
            T["ops"][str(N)] = {}
            for n_, s_ in (("R", Rs), ("prior", prior), ("lightgbm", sc)):
                Av = unit_frame(va, s_, yv); nd = Av.date.nunique(); tau = float(Av.sc.max())
                for q in np.unique(np.quantile(Av.sc, np.linspace(0.3, 0.99995, 500))):
                    if len(first_flag(Av, q)) / nd <= N: tau = float(q); break
                F = first_flag(Ah[n_], tau).sort_values("t"); cnt = collections.Counter(); keep = []
                for r_ in F.itertuples():
                    cnt[r_.date] += 1; keep.append(cnt[r_.date] <= N)
                Fk = F[np.array(keep)]; tp = int(Fk.y.sum())
                lead = {str(sp): (Fk[Fk.y == 1].pos_d.dropna() / sp) for sp in SPEEDS}
                rd = Ah[n_].groupby("date").rest.first(); nrest, nwork = int((rd == 1).sum()), int((rd == 0).sum())
                T["ops"][str(N)][n_] = {"threshold": tau, "alerts_per_day": len(Fk) / ndays, "rest_alerts_per_day": float((Fk.rest == 1).sum() / max(1, nrest)), "work_alerts_per_day": float((Fk.rest == 0).sum() / max(1, nwork)),
                                        "max_alerts_in_a_day": int(max(cnt.values())) if cnt else 0, "precision": tp / max(1, len(Fk)), "recall": tp / max(1, runs_pos),
                                        "lead_min": {sp: {"median": (float(v.median()) if len(v) else None), "p10": (float(v.quantile(0.1)) if len(v) else None), "ge10_share": (float((v >= 10).mean()) if len(v) else None)} for sp, v in lead.items()}}
        res["tasks"][key] = T
        if key == "41_few":
            A = Ah["lightgbm"]; thr5 = T["ops"]["5"]["lightgbm"]["threshold"]
            for typ, pick in (("work", lambda d: not cal[d]["rest"]), ("rest", lambda d: cal[d]["rest"] and "note" not in cal[d]), ("holiday", lambda d: cal[d]["rest"] and "note" in cal[d])):
                ds = sorted({d for d in A.date.unique() if pick(d) and d >= "2025-09-01"}); d0 = ds[len(ds)//2]
                g = A[A.date == d0].sort_values("t"); cnt = 0; ev = []; seen = set()
                for rr in g.itertuples():
                    al = rr.sc >= thr5 and cnt < 5 and rr.rid not in seen
                    if al: cnt += 1; seen.add(rr.rid)
                    ev.append([int(rr.t), rr.sub, int(rr.dir), byorder[int(rr.u)]["name"], int(rr.up), round(float(rr.sc), 3), 1 if al else 0, int(rr.y)])
                dash["replays"][typ] = {"day": d0, "events": ev}
json.dump(res, open(f"{out}/metrics.json", "x"), ensure_ascii=False)
dash["summary"] = {k: {"prev": v["prev"], "models": {m_: {x: v["models"][m_][x] for x in ("precision", "recall", "pr_auc")} for m_ in v["models"]}, "ops": v["ops"], "matched_volume": v["matched_volume"], "pos_runs_per_day": v["pos_runs_per_day"], "calibration": v["calibration"]} for k, v in res["tasks"].items()}
dash["counts"] = res["counts"]; json.dump(dash, open(f"{out}/dashboard_data.json", "x"), ensure_ascii=False); print("ok")
