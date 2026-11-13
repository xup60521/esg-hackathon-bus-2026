# 由三條分析線的結果產生單檔離線營運儀表板 index.html（無外部資源）
import json, os
A = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "submission", "analysis")
ld = lambda p: json.load(open(os.path.join(A, p)))
disp = ld("dispatch/v3/out/dashboard_data.json")
alert_d = ld("alert/v5/out/dashboard_data.json")
fc = ld("forecast/v2/dashboard_data.json"); fcm = ld("forecast/v2/metrics.json")
data = {"conc": {"41": disp["cap41"], "37": disp["cap37"]}, "scenB": disp["scenario_b"], "carbon": disp["carbon_breakeven"], "route": disp["route"],
        "cost": disp["cost_per_run_wan_assumed"]}
data["alert"] = {"summary": alert_d["summary"], "counts": alert_d["counts"]}
data["replays"] = alert_d["replays"]
hold = [h for h in fc["holdout"] if h["route"] == "total" and h["model"] == "lightgbm"]
data["fc"] = {"daily": [[h["date"], round(h["pred"], 1), h["actual"]] for h in hold], "holidays": fc["holidays"]}
tpl = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "template.html")).read()
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html"), "w").write(tpl.replace("/*DATA*/null", json.dumps(data, ensure_ascii=False, separators=(",", ":"))))
print("ok")
