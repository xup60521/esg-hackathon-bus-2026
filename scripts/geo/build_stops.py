"""Build public/geo/stops.json from the official 台灣好行 stop CSV + 20 m DEM.

usage: python -I build_stops.py <shuttle.csv> <dem_20m.tif> <out stops.json>
"""
import csv, json, math, sys
import numpy as np
import rasterio
from pyproj import Transformer

sys.stdout.reconfigure(encoding="utf-8")
shuttle_csv, dem_path, out_path = sys.argv[1:4]

# data fare-stage name -> (slug, official stop name)
MAP = {
    "臺中": ("taichung", "臺中干城站"),
    "高鐵臺中站": ("thsr", "高鐵臺中站"),
    "埔里站": ("puli", "埔里轉運站"),
    "日月潭": ("sunmoonlake", "日月潭"),
    "崎下": ("qixia", "崎下"),
    "魚池": ("yuchi", "魚池"),
    "暨南大學校內": ("jnu_campus", "暨南大學(校內)"),
    "暨南大學": ("jnu", "暨南大學(校外)"),
    "九族文化村": ("formosan", "九族文化村(部分班次停靠)"),
    "向山行政中心": ("xiangshan", "向山行政中心(部分班次停靠)"),
    "日月老茶廠": ("tea", "日月老茶場"),
    "大雁": ("dayan", "大雁(澀水社區)"),
    "桃米坑": ("taomi", "桃米坑(紙教堂)"),
    "牛耳石雕公園": ("niuer", "牛耳石雕公園"),
    "水社": ("shuishe", "水社"),
    "台中航空站": ("airport", "台中航空站"),
}
BBOX = (120.50, 23.78, 121.05, 24.30)

rows = {"去程": {}, "回程": {}}
with open(shuttle_csv, encoding="utf-8-sig", newline="") as f:
    for r in csv.DictReader(f):
        if r["路線名稱"] != "日月潭線":
            continue
        try:
            lat, lon = float(r["緯度"]), float(r["經度"])
        except ValueError:
            continue
        rows[r["方向性"]][r["站牌名稱"]] = (int(r["站序"]), lat, lon)

def ok(lat, lon):
    return BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]

to3826 = Transformer.from_crs(4326, 3826, always_xy=True)
src = rasterio.open(dem_path)
a = src.read(1, window=rasterio.windows.Window(0, 0, 1, 1))  # touch file

def sample(lon, lat):
    x, y = to3826.transform(lon, lat)
    col = (x - src.transform.c) / src.transform.a - 0.5
    row = (y - src.transform.f) / src.transform.e - 0.5
    c0, r0 = int(math.floor(col)), int(math.floor(row))
    win = rasterio.windows.Window(c0, r0, 2, 2)
    z = src.read(1, window=win).astype(float)
    z[z == src.nodata] = np.nan
    fx, fy = col - c0, row - r0
    w = np.array([[(1 - fx) * (1 - fy), fx * (1 - fy)], [(1 - fx) * fy, fx * fy]])
    m = ~np.isnan(z)
    if not m.any():
        return None
    return float((np.nan_to_num(z) * w * m).sum() / (w * m).sum())

out = []
for name, (slug, official) in MAP.items():
    o = rows["去程"].get(official)
    b = rows["回程"].get(official)
    pick, src_dir = None, None
    if o and ok(o[1], o[2]):
        pick, src_dir = o, "去程"
    elif b and ok(b[1], b[2]):
        pick, src_dir = b, "回程"
    assert pick, official
    diff = ""
    if o and b:
        dx = (o[2] - b[2]) * 111320 * math.cos(math.radians(o[1]))
        dy = (o[1] - b[1]) * 110540
        diff = f"{math.hypot(dx, dy):.0f} m 去程/回程 diff"
    seq, lat, lon = pick
    elev = sample(lon, lat)
    out.append({"id": slug, "name": name, "officialName": official,
                "lat": round(lat, 6), "lon": round(lon, 6),
                "elevation": round(elev, 1) if elev is not None else None,
                "seq": rows["去程"][official][0] if official in rows["去程"] else None,
                "coordSource": src_dir})
    print(f"{slug:12s} {name:8s} {official:16s} seq={out[-1]['seq']:>2} {lat:.5f},{lon:.5f} elev={elev:.1f} [{src_dir}] {diff}")

out.sort(key=lambda s: s["seq"])
for i, s in enumerate(out, 1):
    s["order"] = i
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("wrote", out_path)
