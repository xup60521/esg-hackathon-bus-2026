"""分母＝上車前車上已有乘客（load>0）的到站；n_all 為含零人數列的到站數。以南投客運提供、已由本團隊整理成到站列的 6670 資料，依官方車型席位（41／37 席）重算「座位不多」代理。
輸入：public/data/lab/seats/{summary.json,arrivals-*.json}、public/data/lab/visualization/calendar.json（唯讀）。
輸出：JSON 到 stdout。python3 -I 執行。"""
import json, glob, sys, collections
root = sys.argv[1] if len(sys.argv) > 1 else "."
S = json.load(open(f"{root}/public/data/lab/seats/summary.json"))
cal = json.load(open(f"{root}/public/data/lab/visualization/calendar.json"))["days"]
stops = S["stops"]; subs = S["subroutes"]; dirs = S["directions"]
name = lambda s: s if isinstance(s, str) else s.get("name")
stopn = [name(s) for s in stops]
MID = {"桃米坑","暨南大學","暨南大學校內","九族文化村","崎下","大雁","牛耳石雕公園","魚池","日月老茶廠","向山行政中心","水社","埔里站"}
res = collections.defaultdict(lambda: collections.Counter())
dates = S["dates"]
for f in sorted(glob.glob(f"{root}/public/data/lab/seats/arrivals-*.json")):
    d = json.load(open(f)); month = d["month"]
    for day, stop, minute, sub, di, load, boarded in d["rows"]:
        date = f"{month}-{day:02d}"
        rest = cal[date]["rest"]
        sn = stopn[stop]
        if sn not in MID: continue
        for cap in (41, 37):
            near = load >= cap - 5
            full = load >= cap
            h = minute // 60
            for key in (("stop", sn, rest, cap), ("sub", subs[sub], rest, cap), ("hour", h, rest, cap), ("sub_hour", subs[sub], h, rest, cap)):
                res[key]["n_all"] += 1
                if load > 0:  # 上車前車上已有乘客的到站（排除班次起點等零人數列）
                    res[key]["n"] += 1; res[key]["near"] += near; res[key]["full"] += full
out = {str(k): dict(v) for k, v in res.items()}
json.dump(out, sys.stdout, ensure_ascii=False)
