"""Convert the 6670 smart-card Excel exports into a clean UTF-8 CSV.

Usage:  uv run --with python-calamine python -I scripts/etl_excel.py <out.csv> <xlsx>...

Privacy: card numbers (卡號) and driver ids (司機編號) are dropped.
Times in the source are Taiwan local time (UTC+8).
"""
import csv, sys, collections
from datetime import datetime, timedelta, timezone
from python_calamine import CalamineWorkbook

sys.stdout.reconfigure(encoding="utf-8")
TW = timezone(timedelta(hours=8))

def s(v):
    if v is None: return ""
    if isinstance(v, float) and v.is_integer(): v = int(v)
    v = str(v).strip()
    return "" if v.upper() == "NULL" else v

def n(v):
    v = s(v)
    try: return int(float(v)) if v != "" else ""
    except ValueError: return ""

def ts(v):
    if isinstance(v, datetime):
        return int(v.replace(tzinfo=TW).timestamp())
    return ""

out_path, files = sys.argv[1], sys.argv[2:]
cols = ["issuer", "ticket_type", "subroute", "vehicle", "board_ts", "board_seq", "board_stop",
        "alight_ts", "alight_seq", "alight_stop", "fare_paid", "fare_full", "fare_discounted", "discount"]
stops = collections.Counter(); bad = 0; total = 0
with open(out_path, "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh); w.writerow(cols)
    for f in files:
        wb = CalamineWorkbook.from_path(f)
        for sheet in wb.sheet_names:
            rows = wb.get_sheet_by_name(sheet).to_python()
            for r in rows[1:]:
                if len(r) < 18: bad += 1; continue
                b, a = ts(r[8]), ts(r[11])
                if b == "": bad += 1; continue
                rec = [s(r[0]), s(r[4]), s(r[5]), s(r[7]), b, n(r[9]), s(r[10]),
                       a, n(r[12]), s(r[13]), n(r[14]), n(r[15]), n(r[16]), n(r[17])]
                stops[rec[6]] += 1; stops[rec[9]] += 1
                w.writerow(rec); total += 1
            print(f"{sheet}: {len(rows)-1} rows", flush=True)
print(f"total={total} skipped={bad}")
for k, v in stops.most_common(): print(f"STOP\t{k}\t{v}")
