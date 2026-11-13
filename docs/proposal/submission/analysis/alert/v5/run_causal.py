"""預警回測 v5（修正 v4：只取該子路線實際服務的目標站、up_load 與標籤同一班次定義、逐站 k 與查表基線、提前量站對表）。
承 v4：保留班次編號；上游離站載客只用離站當下已知的上下車（時間基準）；
提示單位＝班次，首次分數≥門檻的離站點發出提示，正確＝該離站點自己的前 3 個中途站確實達門檻；
提前量綁定該次提示；在相同提示量下比較 R／歷史先驗／模型；班次切分間隔做敏感度。
用法：python run.py <trips.db> <專案根目錄> <輸出資料夾（須不存在）> [切班間隔分鐘=60]
"""
import sys, os, json, math, sqlite3, collections
import numpy as np, pandas as pd
from sklearn.metrics import roc_auc_score, average_precision_score
import lightgbm as lgb
db, root, out = sys.argv[1], sys.argv[2], sys.argv[3]; GAP = int(sys.argv[4]) if len(sys.argv) > 4 else 60; NOFILTER = len(sys.argv) > 5 and sys.argv[5] in ("nofilter", "raw"); RAW = len(sys.argv) > 5 and sys.argv[5] == "raw"
DELAY = int(sys.argv[6]) if len(sys.argv) > 6 else 0          # 下車事件延遲秒數：離站當下只看得到 alight_ts <= t−DELAY 的下車
DEP = sys.argv[7] if len(sys.argv) > 7 else "last"            # 離站時刻代理：last＝該站最後一筆上車（預設）、first＝第一筆、last60＝最後一筆＋60 秒
os.makedirs(out)
st = json.load(open(f"{root}/public/geo/stops.json")); order = {s["name"]: s["order"] for s in st}; byorder = {s["order"]: s for s in st}
MID = {"桃米坑","暨南大學","暨南大學校內","九族文化村","崎下","大雁","牛耳石雕公園","魚池","日月老茶廠","向山行政中心","水社","埔里站"}
mid_orders = sorted(order[n] for n in MID)
def hav(a, b):
    R_ = 6371.0; p1, p2 = math.radians(a["lat"]), math.radians(b["lat"]); dl = math.radians(b["lon"]-a["lon"]); dp = p2-p1
    h = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2; return 2*R_*math.asin(math.sqrt(h))
cal = json.load(open(f"{root}/public/data/lab/visualization/calendar.json"))["days"]
c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
_cond = "alight_ts is not null" if RAW else "board_stop<>alight_stop and alight_ts>board_ts" if NOFILTER else "board_stop<>alight_stop and alight_ts-board_ts between 180 and 14400"
df = pd.read_sql(f"select subroute, vehicle, board_date, board_ts, board_stop, alight_ts, alight_stop from trips where {_cond}", c)
funnel = {"trips_raw": int(pd.read_sql("select count(*) n from trips", c).n[0]), "same_stop": int(pd.read_sql("select count(*) n from trips where board_stop=alight_stop", c).n[0]),
          "duration_lt_180s_diff_stop": int(pd.read_sql("select count(*) n from trips where board_stop<>alight_stop and alight_ts-board_ts<180", c).n[0]),
          "duration_gt_4h_diff_stop": int(pd.read_sql("select count(*) n from trips where board_stop<>alight_stop and alight_ts-board_ts>14400", c).n[0]), "rides_used": int(len(df)), "nofilter": NOFILTER}
n_raw = int(pd.read_sql("select count(*) n from trips", c).n[0])
df["bo"] = df.board_stop.map(order); df["ao"] = df.alight_stop.map(order); df["dir"] = np.sign(df.ao - df.bo).astype(int)
df = df.sort_values(["vehicle", "board_date", "dir", "board_ts"]).reset_index(drop=True)
# 各（子路線,方向）實際服務的站：訓練期（≤2025-03-31）上下車次數 ≥30 的站（避免用到留出期資訊）
served = {}
_tr = df[df.board_date <= "2025-03-31"]
for (sub_, d_), g_ in _tr.groupby(["subroute", "dir"]):
    cnt_ = collections.Counter(g_.bo.tolist()) + collections.Counter(g_.ao.tolist()); served[(sub_, int(d_))] = {o for o, c_ in cnt_.items() if c_ >= 30}
# ---- 因果回放（第 47 輪）：方向、班次、離站與載客只用「當下已觀察」的事件 ----
QX = int(sys.argv[8]) if len(sys.argv) > 8 else 60      # 靜默秒數：本班車在該筆刷卡後 ≥QX 秒沒有新刷卡，才視為離站並發出判斷（離站時刻 = 該筆刷卡時刻 + QX）
DROP = float(sys.argv[9]) if len(sys.argv) > 9 else 0.0  # 隨機漏失比例：被漏失的旅次對方向、班次切分、靜默、離站與載客特徵都不可見（標籤仍用完整旅次）
df = df.sort_values(["vehicle", "board_date", "board_ts"]).reset_index(drop=True)
df["hid"] = (np.random.RandomState(2025).rand(len(df)) < DROP) if DROP > 0 else False
dfo = df[~df.hid].reset_index(drop=True)             # 觀察到的旅次：只用它建班次、方向、靜默與特徵
rid = []; cdir = []; cur = -1; state = None
for r in dfo.itertuples(index=False):
    key = (r.vehicle, r.board_date)
    if state is None or key != state[0] or r.board_ts - state[1] > GAP * 60:
        cur += 1; state = [key, r.board_ts, r.bo, 0]
    else:
        _, lt, ext, d = state
        if d == 0:
            if r.bo != ext: d = int(np.sign(r.bo - ext)); ext = r.bo
        else:
            if d * (ext - r.bo) >= 3: cur += 1; state = [key, r.board_ts, r.bo, 0]; rid.append(cur); cdir.append(0); continue
            ext = max(ext, r.bo) if d > 0 else min(ext, r.bo)
        state = [key, r.board_ts, ext, d]
    state[1] = r.board_ts; rid.append(cur); cdir.append(state[3])
dfo["rid"] = rid; dfo["cdir"] = cdir; dfo["obs"] = True
dfo["nxt_ts"] = dfo.groupby(["vehicle", "board_date"]).board_ts.shift(-1)   # 同車同日下一筆觀察刷卡（不分班次）：靜默判斷只能用當時已知的事件
if DROP > 0:   # 被漏失旅次（只用於標籤）依刷卡時間歸入該車日最近的前一個班次
    starts = dfo.groupby("rid").agg(vehicle=("vehicle", "first"), board_date=("board_date", "first"), st=("board_ts", "min")).reset_index().sort_values("st")
    dh = df[df.hid].sort_values("board_ts").copy(); dh["obs"] = False; dh["cdir"] = 0; dh["nxt_ts"] = np.nan
    dh = pd.merge_asof(dh, starts.rename(columns={"st": "board_ts"})[["vehicle", "board_date", "board_ts", "rid"]], on="board_ts", by=["vehicle", "board_date"], direction="backward").dropna(subset=["rid"])
    dh["rid"] = dh.rid.astype(int); dfall = pd.concat([dfo, dh], ignore_index=True)
else: dfall = dfo
dfall = dfall.sort_values(["rid", "board_ts"], kind="stable").reset_index(drop=True)
rows = []; n_cand = 0; n_abst = 0; n_dup = 0
for rid_, g in dfall.groupby("rid"):
    veh, date = g.vehicle.iat[0], g.board_date.iat[0]
    ob = g.obs.values; bo_all, ao_all = g.bo.values, g.ao.values
    bo, bt, at_, cd, sb = bo_all[ob], g.board_ts.values[ob], g.alight_ts.values[ob], g.cdir.values[ob], g.subroute.values[ob]; nx = g.nxt_ts.values[ob]
    seen_u = set()
    for i in range(len(bt)):
        gap = (nx[i] - bt[i]) if not np.isnan(nx[i]) else 10 ** 9
        if gap < QX: continue
        n_cand += 1; d = int(cd[i]); sub = sb[i]; u = int(bo[i]); t_d = int(bt[i]) + QX
        if (u, d) in seen_u: n_dup += 1
        seen_u.add((u, d)); ab = 0
        if d == 0:   # 棄權：不發提示，但仍保留列（以事後方向定義目標）以便涵蓋率用完整母體
            n_abst += 1; ab = 1; dd = np.sign(g.dir.values); d = int(np.sign(dd.sum()))
            if d == 0: continue
        up = -1 if ab else int(((bt <= bt[i]) & (at_ > t_d - DELAY)).sum())
        nxt = sorted([o for o in mid_orders if (o - u) * d > 0 and o in served.get((sub, d), set())], key=lambda o: abs(o - u))[:3]
        for k, s_ in enumerate(nxt, 1):
            ld = int(((bo_all < s_) & (ao_all > s_)).sum()) if d > 0 else int(((bo_all > s_) & (ao_all < s_)).sum())
            rows.append((rid_, date, veh, sub, d, u, s_, k, t_d, up, ld))
df = dfall
funnel["causal"] = {"quiet_seconds": QX, "drop": DROP, "candidates": n_cand, "abstain_dir_unknown": n_abst, "duplicate_stop_candidates": n_dup, "raw_filter": RAW}
R = pd.DataFrame(rows, columns=["rid", "date", "veh", "sub", "dir", "u", "s", "k", "t", "up_load", "load"])
subs = sorted(R["sub"].unique()); subi = {s_: i for i, s_ in enumerate(subs)}
R["subi"] = R["sub"].map(subi); R["rest"] = R.date.map(lambda x: 1 if cal[x]["rest"] else 0)
ts = pd.to_datetime(R.t + 8 * 3600, unit="s"); R["minute"] = ts.dt.hour * 60 + ts.dt.minute; R["dow"] = pd.to_datetime(R.date).dt.day_of_week
R["dist"] = [hav(byorder[u], byorder[s_]) for u, s_ in zip(R.u, R.s)]
_rt = json.load(open(f"{root}/public/geo/routes.json"))["pairs"]   # OSRM 行車路徑距離（公尺），僅用於提前量，不入模型特徵
_pk = lambda u, s_: byorder[u]["name"] + "|" + byorder[s_]["name"]
R["dist_road"] = [(_rt[_pk(u, s_)]["distance"] / 1000.0 if _pk(u, s_) in _rt else np.nan) for u, s_ in zip(R.u, R.s)]
R = R[R.up_load != 0].reset_index(drop=True); AB = (R.up_load < 0).values   # up_load=-1＝棄權列（只作涵蓋率母體，分數強制為最低、不進訓練）
tr = (R.date <= "2025-03-31").values & ~AB; va = ((R.date >= "2025-04-01") & (R.date <= "2025-06-30")).values; vafit = va & ~AB; ho = (R.date >= "2025-07-01").values
feat = ["up_load", "minute", "dow", "rest", "subi", "dir", "u", "s", "k", "dist"]
res = {"funnel": funnel, "served_stops": {f"{k_[0]}|{k_[1]}": sorted(v_) for k_, v_ in served.items()}, "gap_min": GAP, "counts": {"trips_raw": n_raw, "rides_used": int(len(df)), "runs": int(df.rid.nunique()), "rows": int(len(R)), "train": int(tr.sum()), "val": int(va.sum()), "holdout": int(ho.sum()),
        "vehicle_day_dir_groups": int(df.groupby(["vehicle", "board_date", "dir"]).ngroups), "multi_run_groups": int((df.groupby(["vehicle", "board_date", "dir"]).rid.nunique() > 1).sum())}, "tasks": {}}
SPEEDS = (0.5, 0.7, 1.0)  # km/分
dash = {"replays": {}}
def unit_frame(msk, sc, yv):
    H = R[msk].assign(sc=sc[msk], y=yv[msk]).sort_values(["rid", "u", "k"], kind="stable"); H["pos_d"] = np.where(H.y == 1, H.dist, np.nan); H["pos_dr"] = np.where(H.y == 1, H.dist_road, np.nan); H["pos_key"] = np.where(H.y == 1, (H.dist * 1000).astype(int) * 100 + H.s, np.nan)
    A = H.groupby(["rid", "u", "t"], sort=False).agg(sc=("sc", "max"), y=("y", "max"), date=("date", "first"), rest=("rest", "first"), pos_d=("pos_d", "first"), pos_dr=("pos_dr", "first"), pos_key=("pos_key", "first"), sub=("sub", "first"), dir=("dir", "first"), up=("up_load", "first")).reset_index()
    return A.sort_values(["rid", "t"])
def first_flag(A, tau):
    f = A[A.sc >= tau]; return f.groupby("rid", sort=False).head(1)
def curve(A, ndays, taus):
    pos_runs = A.groupby("rid").y.max(); npos = int(pos_runs.sum()); out_ = []
    for tau in taus:
        F = first_flag(A, tau); tp = int(F.y.sum()); out_.append((len(F) / ndays, tp / max(1, len(F)), tp / max(1, npos), F))
    return out_, npos
for cap in (41,):
    for kind, thr in (("few", cap - 5), ("full", cap)):
        key = f"{cap}_{kind}"; yv = (R.load >= thr).astype(int).values
        grp = R[tr].assign(y=yv[tr], h=lambda x: x.minute // 60).groupby(["subi", "dir", "h", "rest", "s"]).y.mean()
        prior = np.array([grp.get(k, np.nan) for k in zip(R.subi, R.dir, R.minute // 60, R.rest, R.s)]); prior = np.where(np.isnan(prior), yv[tr].mean(), prior); prior = np.where(AB, -1.0, prior)
        lg = lgb.LGBMClassifier(n_estimators=400, learning_rate=0.05, num_leaves=31, min_child_samples=40, subsample=0.8, subsample_freq=1, colsample_bytree=0.9, random_state=42, verbose=-1)
        lg.fit(R.loc[tr, feat], yv[tr], eval_set=[(R.loc[vafit, feat], yv[vafit])], eval_metric="average_precision", callbacks=[lgb.early_stopping(40, verbose=False)])
        sc = lg.predict_proba(R[feat])[:, 1]; sc = np.where(AB, -1.0, sc); Rs = np.where(AB, -1e9, R.up_load.values.astype(float))
        _t = R[tr].assign(y=yv[tr], ub=lambda x: np.minimum(x.up_load, 50) // 3); _ga = _t.groupby(["sub", "u", "s", "ub"]).y.agg(["sum", "count"]); M_SM = 5.0; _pv = float(yv[tr].mean())  # 查表平滑：(命中數 + 5×訓練期盛行率)/(樣本數 + 5)，避免樣本數 1–3 的格子被當成 100%
        _g = (_ga["sum"] + M_SM * _pv) / (_ga["count"] + M_SM)
        lookup = np.array([_g.get(k_, np.nan) for k_ in zip(R["sub"], R.u, R.s, np.minimum(R.up_load, 50) // 3)]); lookup = np.where(np.isnan(lookup), _pv, lookup); lookup = np.where(AB, -1.0, lookup)
        # 消融基線 R_seg：每個（子路線、上游站、下游站）在訓練期取一個載客門檻＝最小的 ℓ，使「上游載客 ≥ ℓ」的訓練樣本（≥10 筆）命中率 ≥0.9；無則永不提示。分數＝上游載客−該門檻
        _tk = {}
        for k_, g_ in _t.groupby(["sub", "u", "s"]):
            ul_, yy_ = g_.up_load.values, g_.y.values; _tk[k_] = 99
            for l_ in sorted(set(ul_.tolist())):
                m_ = ul_ >= l_
                if m_.sum() >= 10 and yy_[m_].mean() >= 0.9: _tk[k_] = l_; break
        rseg = np.where(AB, -1e9, R.up_load.values.astype(float) - np.array([_tk.get(k_, 99) for k_ in zip(R["sub"], R.u, R.s)], dtype=float))
        yh = yv[ho]; T = {"prev": float(yh.mean()), "n_holdout": int(ho.sum()), "models": {}}
        for name, s_ in (("R", Rs), ("prior", prior), ("lookup", lookup), ("lightgbm", sc)):
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
        Ah = {n_: unit_frame(ho, s_, yv) for n_, s_ in (("R", Rs), ("prior", prior), ("lookup", lookup), ("lightgbm", sc))}
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
            for n_, s_ in (("R", Rs), ("prior", prior), ("lookup", lookup), ("lightgbm", sc)):
                Av = unit_frame(va, s_, yv); nd = Av.date.nunique(); tau = float(Av.sc.max())
                for q in np.unique(np.quantile(Av.sc, np.linspace(0.3, 0.99995, 500))):
                    if len(first_flag(Av, q)) / nd <= N: tau = float(q); break
                F = first_flag(Ah[n_], tau).sort_values("t"); cnt = collections.Counter(); keep = []
                for r_ in F.itertuples():
                    cnt[r_.date] += 1; keep.append(cnt[r_.date] <= N)
                Fk = F[np.array(keep)]; tp = int(Fk.y.sum())
                lead = {str(sp): (Fk[Fk.y == 1].pos_d.dropna() / sp) for sp in SPEEDS}; leadr = {str(sp): (Fk[Fk.y == 1].pos_dr.dropna() / sp) for sp in SPEEDS}
                rd = Ah[n_].groupby("date").rest.first(); nrest, nwork = int((rd == 1).sum()), int((rd == 0).sum())
                T["ops"][str(N)][n_] = {"threshold": tau, "alerts_per_day": len(Fk) / ndays, "rest_alerts_per_day": float((Fk.rest == 1).sum() / max(1, nrest)), "work_alerts_per_day": float((Fk.rest == 0).sum() / max(1, nwork)),
                                        "max_alerts_in_a_day": int(max(cnt.values())) if cnt else 0, "precision": tp / max(1, len(Fk)), "recall": tp / max(1, runs_pos),
                                        "lead_min": {sp: {"median": (float(v.median()) if len(v) else None), "p10": (float(v.quantile(0.1)) if len(v) else None), "ge10_share": (float((v >= 10).mean()) if len(v) else None)} for sp, v in lead.items()}, "lead_min_road": {sp: {"median": (float(v.median()) if len(v) else None), "p10": (float(v.quantile(0.1)) if len(v) else None), "ge10_share": (float((v >= 10).mean()) if len(v) else None)} for sp, v in leadr.items()}}
        if key == "41_few":
            # 校準同量比較：各方法在選擇期校準門檻使每日首次提示數≈V（分數加極小隨機擾動以打破同分），於留出期報告；成對依日重抽差值
            _jit = np.random.RandomState(11).rand(len(R)) * 1e-6; T["same_volume"] = {}; _SV = {}
            for n_, s_ in (("R", Rs), ("lookup", lookup), ("lightgbm", sc)):
                sj = s_.astype(float) + _jit; Av = unit_frame(va, sj, yv); Aj = unit_frame(ho, sj, yv); nd_v = Av.date.nunique()
                cand = np.unique(np.quantile(Av.sc, np.linspace(0.0, 0.99999, 600))); vols = np.array([len(first_flag(Av, q)) for q in cand]) / nd_v
                _SV[n_] = (Aj, cand, vols)
            hdays = sorted(Ah["R"].date.unique()); hidx = {d_: i for i, d_ in enumerate(hdays)}
            for V in (1, 2, 3, 5, 10):
                per = {}
                for n_, (Aj, cand, vols) in _SV.items():
                    tau = float(cand[int(np.argmin(np.abs(vols - V)))]); F = first_flag(Aj, tau)
                    al = np.zeros(len(hdays)); tp = np.zeros(len(hdays)); npos = np.zeros(len(hdays))
                    for d_, g_ in F.groupby("date"): al[hidx[d_]] = len(g_); tp[hidx[d_]] = g_.y.sum()
                    for d_, g_ in Aj.groupby("rid").agg(date=("date", "first"), y=("y", "max")).groupby("date"): npos[hidx[d_]] = g_.y.sum()
                    per[n_] = (al, tp, npos)
                rg = np.random.RandomState(5); boots = [rg.randint(0, len(hdays), len(hdays)) for _ in range(300)]
                def stat(n_, ix):
                    al, tp, npos = per[n_]; return tp[ix].sum() / max(1, al[ix].sum()), tp[ix].sum() / max(1, npos[ix].sum())
                full = np.arange(len(hdays)); out_v = {"methods": {}, "diff": {}}
                for n_ in per:
                    pr, cv_ = stat(n_, full); out_v["methods"][n_] = {"alerts_per_day": float(per[n_][0].sum() / len(hdays)), "precision": float(pr), "coverage": float(cv_)}
                for a_, b_ in (("lightgbm", "R"), ("lookup", "R"), ("lightgbm", "lookup")):
                    dc = sorted(stat(a_, ix)[1] - stat(b_, ix)[1] for ix in boots); dp = sorted(stat(a_, ix)[0] - stat(b_, ix)[0] for ix in boots)
                    out_v["diff"][f"{a_}-{b_}"] = {"coverage": float(stat(a_, full)[1] - stat(b_, full)[1]), "coverage_ci": [float(dc[7]), float(dc[292])], "precision": float(stat(a_, full)[0] - stat(b_, full)[0]), "precision_ci": [float(dp[7]), float(dp[292])]}
                T["same_volume"][str(V)] = out_v
            # 事後同實際提示量比較（描述性）：在留出期各方法調整門檻使「實際」每日首次提示數≈V；平手以 3 個擾動種子各算一次，依日成對重抽 1000 次
            T["matched_actual"] = {}; nh = len(hdays); _seed_res = {}
            for sd in (11, 12, 13):
                jt = np.random.RandomState(sd).rand(len(R)) * 1e-6; frames = {}
                for n_, s_ in (("R", Rs), ("lookup", lookup), ("lightgbm", sc), ("rseg", rseg)):
                    Aj = unit_frame(ho, s_.astype(float) + jt, yv); cand = np.unique(np.quantile(Aj.sc, np.linspace(0.0, 0.99999, 800)))
                    vols = np.array([len(first_flag(Aj, q)) for q in cand]) / nh; frames[n_] = (Aj, cand, vols)
                for V in (1, 2, 3, 5, 8):
                    per = {}
                    for n_, (Aj, cand, vols) in frames.items():
                        tau = float(cand[int(np.argmin(np.abs(vols - V)))]); F = first_flag(Aj, tau)
                        al = np.zeros(nh); tp = np.zeros(nh); npos = np.zeros(nh)
                        for d_, g_ in F.groupby("date"): al[hidx[d_]] = len(g_); tp[hidx[d_]] = g_.y.sum()
                        for d_, g_ in Aj.groupby("rid").agg(date=("date", "first"), y=("y", "max")).groupby("date"): npos[hidx[d_]] = g_.y.sum()
                        per[n_] = (al, tp, npos)
                    _seed_res[(sd, V)] = per
            rg = np.random.RandomState(5); boots = [rg.randint(0, nh, nh) for _ in range(1000)]
            def st2(per, n_, ix):
                al, tp, npos = per[n_]; return tp[ix].sum() / max(1, al[ix].sum()), tp[ix].sum() / max(1, npos[ix].sum()), (al[ix].sum() - tp[ix].sum()) / len(ix)
            full = np.arange(nh)
            for V in (1, 2, 3, 5, 8):
                per = _seed_res[(11, V)]; o = {"methods": {}, "diff": {}, "seed_range_cov_diff": {}}
                for n_ in per:
                    pr, cv_, wr = st2(per, n_, full); o["methods"][n_] = {"alerts_per_day": float(per[n_][0].sum() / nh), "precision": float(pr), "coverage": float(cv_), "wrong_alerts_per_day": float(wr), "correct_alerts_per_day": float(per[n_][1].sum() / nh)}
                for a_, b_ in (("lightgbm", "R"), ("lookup", "R"), ("lightgbm", "lookup"), ("lookup", "rseg"), ("rseg", "R")):
                    bs = [(st2(per, a_, ix), st2(per, b_, ix)) for ix in boots]
                    dc = sorted(x[1] - y[1] for x, y in bs); dp = sorted(x[0] - y[0] for x, y in bs)
                    o["diff"][f"{a_}-{b_}"] = {"coverage": float(st2(per, a_, full)[1] - st2(per, b_, full)[1]), "coverage_ci": [float(dc[25]), float(dc[974])], "precision": float(st2(per, a_, full)[0] - st2(per, b_, full)[0]), "precision_ci": [float(dp[25]), float(dp[974])]}
                    ds_ = [st2(_seed_res[(sd, V)], a_, full)[1] - st2(_seed_res[(sd, V)], b_, full)[1] for sd in (11, 12, 13)]; o["seed_range_cov_diff"][f"{a_}-{b_}"] = [float(min(ds_)), float(max(ds_))]
                T["matched_actual"][str(V)] = o
            # 決策包比較（因果、留出期）：熱點窗口單獨、查表單獨、查表∧熱點前 30 窗口
            _hot = json.load(open(f"{root}/docs/proposal/submission/analysis/dispatch/v3/out/results.json"))["cap41"]["top30_hold"]
            _H = {10: {tuple(w) for w in _hot[:10]}, 30: {tuple(w) for w in _hot[:30]}}
            Al = Ah["lookup"].copy(); Al = Al.sort_values(["rid", "t"])
            _hr = ((Al.t.values + 8 * 3600) % 86400) // 3600
            Al["win"] = list(zip(Al["sub"], np.where(Al["dir"] < 0, "inbound", "outbound"), _hr, np.where(Al["rest"] == 1, "休息日", "上班日")))
            _nd = Al.date.nunique(); _npos = int(Al.groupby("rid").y.max().sum())
            def _pkg(F):
                F = F.groupby("rid", sort=False).head(1); n_ = len(F); tp_ = int(F.y.sum())
                return {"alerts_per_day": n_ / _nd, "precision": tp_ / max(1, n_), "coverage": tp_ / max(1, _npos)}
            known = Al[Al.sc >= 0]
            T["decision_pkg"] = {"hotspot_top10": _pkg(known[known.win.isin(_H[10])]), "hotspot_top30": _pkg(known[known.win.isin(_H[30])]),
                                 "lookup_N5": _pkg(Al[Al.sc >= T["ops"]["5"]["lookup"]["threshold"]]),
                                 "lookup_N5_and_top30": _pkg(Al[(Al.sc >= T["ops"]["5"]["lookup"]["threshold"]) & Al.win.isin(_H[30])]),
                                 "lookup_N5_and_top10": _pkg(Al[(Al.sc >= T["ops"]["5"]["lookup"]["threshold"]) & Al.win.isin(_H[10])])}
            import csv
            cand = {}
            for r2 in R[ho].itertuples():
                cand.setdefault((r2.rid, r2.u, r2.t), []).append((r2.k, f"{byorder[int(r2.s)]['name']}({int(r2.load)})"))
            for n_ in ("R", "lookup", "lightgbm"):
                tau5 = T["ops"]["5"][n_]["threshold"]; F = first_flag(Ah[n_], tau5).sort_values("t"); cnt = collections.Counter(); rows_ = []
                for r_ in F.itertuples():
                    cnt[r_.date] += 1
                    if cnt[r_.date] > 5: continue
                    tm = pd.Timestamp(r_.t + 8 * 3600, unit="s").strftime("%H:%M")
                    cs = [x[1] for x in sorted(cand.get((r_.rid, r_.u, r_.t), []))] + ["", "", ""]
                    rows_.append([r_.date, tm, int(r_.rest), int(r_.rid), r_.sub, "往日月潭" if r_.dir > 0 else "往臺中", byorder[int(r_.u)]["name"], int(r_.up), round(float(r_.sc), 4), cs[0], cs[1], cs[2], int(r_.y)])
                if n_ == "lookup":
                    tau_l = T["ops"]["5"]["lookup"]["threshold"]; gg = _ga.assign(mean=_g).reset_index(); gg = gg[gg["mean"] >= tau_l].reset_index().sort_values(["sub", "u", "s", "ub"])
                    with open(f"{out}/lookup_card_N5.csv", "x", newline="", encoding="utf-8-sig") as fc:
                        wc = csv.writer(fc); wc.writerow(["子路線", "上游站", "下游中途站", "上游載客區間", "平滑後達門檻比率（m=5）", "訓練期樣本數", f"提示門檻（比率≥{tau_l:.3f}；多個候選站取最高；表中沒有的組合不提示）"])
                        for sb_, u_, s2_, ub_, mn_, ct_ in zip(gg["sub"], gg["u"], gg["s"], gg["ub"], gg["mean"], gg["count"]): wc.writerow([sb_, byorder[int(u_)]["name"], byorder[int(s2_)]["name"], f"{int(ub_)*3}–{int(ub_)*3+2}" if ub_ < 16 else "48+", round(float(mn_), 3), int(ct_), ""])
                with open(f"{out}/ledger_41few_N5_{n_}.csv", "x", newline="", encoding="utf-8-sig") as fh:
                    w_ = csv.writer(fh); w_.writerow(["日期", "離站時刻", "休息日", "班次編號", "子路線", "方向", "離站站", "上游載客", "分數", "候選下游站1(實際載客)", "候選下游站2(實際載客)", "候選下游站3(實際載客)", "前3中途站是否任一達門檻"]); w_.writerows(rows_)
        # 逐站 k（第 1/2/3 個下游中途站）與提前量站對表
        T["by_k"] = {}
        for kk in (1, 2, 3):
            mk = (R.k.values == kk) & ho; yk = yv[mk]
            T["by_k"][str(kk)] = {"n": int(mk.sum()), "prev": float(yk.mean()), **{n_: {"precision": float(((s_[mk] >= (thr if n_ == "R" else T["models"][n_]["thr"])) & (yk == 1)).sum() / max(1, (s_[mk] >= (thr if n_ == "R" else T["models"][n_]["thr"])).sum())), "recall": float(((s_[mk] >= (thr if n_ == "R" else T["models"][n_]["thr"])) & (yk == 1)).sum() / max(1, yk.sum()))} for n_, s_ in (("R", Rs), ("lookup", lookup), ("lightgbm", sc))}}
        F5 = first_flag(Ah["lightgbm"], T["ops"]["5"]["lightgbm"]["threshold"]).sort_values("t"); _c5 = F5.groupby("date").cumcount(); F5 = F5[_c5 < 5]; F5 = F5[F5.y == 1].dropna(subset=["pos_key"]); F5 = F5.assign(pk=(F5.pos_key % 100).astype(int), pd_=(F5.pos_key // 100) / 1000.0)
        T["lead_pairs_model_N5"] = [{"from": byorder[int(u_)]["name"], "to": byorder[int(p_)]["name"], "n": int(len(g_)), "dist_km": float(g_.pd_.median()), "lead_min": {str(sp): float(g_.pd_.median() / sp) for sp in SPEEDS}} for (u_, p_), g_ in F5.groupby(["u", "pk"]) if len(g_) >= 5]
        T["lead_pairs_model_N5"].sort(key=lambda x: -x["n"])
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
dash["summary"] = {k: {"prev": v["prev"], "by_k": v["by_k"], "models": {m_: {x: v["models"][m_][x] for x in ("precision", "recall", "pr_auc")} for m_ in v["models"]}, "ops": v["ops"], "matched_volume": v["matched_volume"], "pos_runs_per_day": v["pos_runs_per_day"], "calibration": v["calibration"]} for k, v in res["tasks"].items()}
dash["counts"] = res["counts"]; json.dump(dash, open(f"{out}/dashboard_data.json", "x"), ensure_ascii=False); print("ok")
