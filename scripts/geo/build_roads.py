"""Road network -> public/geo/roads.json (+ road-labels.json) and a work file with minor streets for texture baking.

usage: python -I build_roads.py <nlsc_guosheng.shp> <taichung_centerline.shp> <osm_ref_ways.json> <out_dir> <work_dir>

Sources (see public/geo/SOURCES.md):
  freeway / expressway / provincial  <- 內政部國土測繪中心 國道及省道(含快速公路以上等級)道路中線 (OFFICIAL)
  county (縣道) / local (鄉道, 區道)   <- OpenStreetMap ways with a Taiwan route `ref` (ODbL); no official vector open
                                       data for 縣道/鄉道 could be downloaded without registration
  local (also)                        <- 臺中市政府 道路中心線 (114年) arterials, width >= 20 m (OFFICIAL, Taichung only)
  baked minor streets (texture)       <- 臺中市政府 道路中心線 (114年), everything not already drawn as vector
"""
import json, os, re, sys
import numpy as np
import geopandas as gpd
import shapely
from shapely.geometry import box, LineString
from shapely.ops import linemerge, unary_union
from pyproj import Transformer

sys.stdout.reconfigure(encoding="utf-8")
nlsc_shp, tc_shp, osm_json, out_dir, work_dir = sys.argv[1:6]
os.makedirs(work_dir, exist_ok=True)
W, S, E, N = 120.50, 23.78, 121.05, 24.30
BB = box(W, S, E, N)
t = Transformer.from_crs(4326, 3826, always_xy=True)
x0, y0 = t.transform(W - 0.02, S - 0.02)
x1, y1 = t.transform(E + 0.02, N + 0.02)
tm2_bbox = (x0, y0, x1, y1)
BUF = 0.00012  # ~12 m, used to drop duplicates between sources
CLASSES = ["freeway", "expressway", "provincial", "county", "local"]


def lines_of(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == "LineString":
        return [g]
    if g.geom_type in ("MultiLineString", "GeometryCollection"):
        return [x for p in g.geoms for x in lines_of(p)]
    return []


def merge(geoms, tol, min_len=0.0):
    u = unary_union([g for g in geoms if g is not None and not g.is_empty])
    ls = lines_of(shapely.line_merge(u) if u.geom_type != "LineString" else u)
    out = []
    for l in ls:
        l = l.simplify(tol, preserve_topology=True)
        if l.length >= min_len and len(l.coords) >= 2:
            out.append(l)
    return out


def load(path):
    try:
        g = gpd.read_file(path, bbox=tm2_bbox)
    except Exception as e:  # e.g. stale .sbn spatial index in the Taichung shapefile -> full read + filter
        print("bbox read failed (", str(e)[:60], ") -> full read")
        g = gpd.read_file(path)
        g = g.cx[tm2_bbox[0]:tm2_bbox[2], tm2_bbox[1]:tm2_bbox[3]]
    g = g.to_crs(4326)
    g["geometry"] = shapely.force_2d(g.geometry.clip_by_rect(W, S, E, N).values)
    return g[g.geometry.notna() & ~g.geometry.is_empty].copy()


# ---------- official: national / provincial ----------
off = load(nlsc_shp)
print("NLSC segments in bbox:", len(off))
cls_of = {"HW": 0, "HU": 0, "1E": 1, "1U": 2, "1W": 2}
off["cls"] = off.ROADCLASS1.map(cls_of)
assert off.cls.notna().all(), off.ROADCLASS1.unique()
TOL = {0: 0.0001, 1: 0.0001, 2: 0.00015, 3: 0.0002, 4: 0.0003}
res = {i: [] for i in range(5)}
for c in (0, 1, 2):
    res[c] = merge(list(off[off.cls == c].geometry), TOL[c])
off_all = unary_union([g for c in (0, 1, 2) for g in res[c]])
off_buf = off_all.buffer(BUF)
shapely.prepare(off_buf)

# ---------- OSM: county / township roads ----------
osm = json.load(open(osm_json, encoding="utf-8"))
county, local = [], []
for el in osm["elements"]:
    tg = el["tags"]; ref = tg.get("ref", ""); hw = tg["highway"]
    geom = el.get("geometry")
    if not geom or len(geom) < 2 or hw == "primary":
        continue
    ln = LineString([(p["lon"], p["lat"]) for p in geom])
    if re.fullmatch(r"\d+(-\d+)?", ref) and hw in ("secondary", "tertiary"):
        county.append(ln)
    elif re.match(r"^(中|彰|投|苗|雲)\d", ref) and not re.match(r"^(中專|中苗專|農)", ref):
        local.append(ln)
print("OSM ways: county", len(county), "local", len(local))
county = [lines_of(g.intersection(BB)) for g in county]
county = [x for l in county for x in l]
local = [x for l in [lines_of(g.intersection(BB)) for g in local] for x in l]
county = [x for l in (lines_of(g.difference(off_buf)) for g in county) for x in l]
local = [x for l in (lines_of(g.difference(off_buf)) for g in local) for x in l]
res[3] = merge(county, TOL[3], 0.0008)
cbuf = unary_union(res[3]).buffer(BUF)
local = [x for l in (lines_of(g.difference(cbuf)) for g in local) for x in l]
res[4] = merge(local, TOL[4], 0.0008)

# ---------- official: Taichung centerlines ----------
tc = load(tc_shp)
tc["w"] = gpd.pd.to_numeric(tc.R2J, errors="coerce").fillna(0)
tc["k"] = gpd.pd.to_numeric(tc.R2K, errors="coerce")
print("Taichung centerline segments in bbox:", len(tc))
vec_buf = unary_union([off_buf, cbuf, unary_union(res[4]).buffer(BUF)])
shapely.prepare(vec_buf)
arter = tc[(tc.k <= 3) & (tc.w >= 20) & (tc.R2B != "無名路") & (tc.R2S != "自行車專用道")]
ag = [x for l in (lines_of(g.difference(vec_buf)) for g in arter.geometry) for x in l]
art_lines = merge(ag, TOL[4], 0.0008)
print("Taichung arterial pieces:", len(art_lines))
res[4] = res[4] + art_lines

# ---------- minor streets to bake into the texture (not already vector) ----------
vec_all = unary_union([vec_buf, unary_union(art_lines).buffer(BUF)])
shapely.prepare(vec_all)
minor = tc[(tc.R2S != "自行車專用道")]
geoms = np.array(minor.geometry.values)
covered = shapely.covered_by(geoms, vec_all)
# also drop segments mostly covered (centrelines of duplicated carriageways)
keep = ~covered
minor_g = geoms[keep]; minor_w = minor.w.values[keep]; minor_k = minor.k.values[keep]
print("minor street segments to bake:", len(minor_g), "(dropped", int(covered.sum()), "covered by vector roads)")
coords, offs, ws, ks = [], [0], [], []
for g, w, k in zip(minor_g, minor_w, minor_k):
    for l in lines_of(g):
        c = np.asarray(l.coords)[:, :2]
        coords.append(c); offs.append(offs[-1] + len(c)); ws.append(w); ks.append(k)
np.savez(os.path.join(work_dir, "streets_minor.npz"), coords=np.concatenate(coords), offs=np.array(offs),
         width=np.array(ws, np.float32), level=np.array(ks, np.float32))

# ---------- roads.json ----------
def rnd(l):
    pts = [[round(x, 5), round(y, 5)] for x, y in l.coords]
    out = [pts[0]]
    for p in pts[1:]:
        if p != out[-1]:
            out.append(p)
    return out


lines = []
for c in range(5):
    cnt = 0
    for l in res[c]:
        pts = rnd(l)
        if len(pts) >= 2:
            lines.append([c, pts]); cnt += 1
    km = sum(l.length for l in res[c]) * 111.0 * 0.91
    print(f"class {c} {CLASSES[c]:10s}: {cnt:5d} lines  ~{km:6.0f} km")
roads = {"classes": CLASSES, "lines": lines,
         "attribution": "freeway/expressway/provincial: 內政部國土測繪中心 國道及省道道路中線 (政府資料開放授權條款第1版); "
                        "county/local: © OpenStreetMap contributors (ODbL) + 臺中市政府 道路中心線 114年 (政府資料開放授權條款第1版)"}
p = os.path.join(out_dir, "roads.json")
json.dump(roads, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("roads.json bytes:", os.path.getsize(p))

# ---------- road-labels.json (route numbers of 國道/快速公路/省道) ----------
M = 0.01
lab_box = box(W + M, S + M, E - M, N - M)
labels = []
main = off[off.ROADCLASS1 != "HU"]  # ignore interchange ramps
for num, grp in main.groupby("ROADNUM"):
    c = int(grp.cls.iloc[0])
    u = unary_union(list(grp.geometry))
    comps = lines_of(shapely.line_merge(u) if u.geom_type != "LineString" else u)
    comps.sort(key=lambda l: -l.length)
    placed = []  # route pieces are fragmented at interchanges/dual carriageways: greedy, >= ~12 km apart
    for l in comps:
        km = l.length * 101.0
        if km < 1.5 :
            continue
        for f in ((0.5,) if km < 30 else (0.2, 0.5, 0.8)):
            pt = l.interpolate(f, normalized=True)
            if lab_box.contains(pt) and all(pt.distance(q) > 0.12 for q in placed):
                placed.append(pt)
                labels.append({"name": num, "lon": round(pt.x, 5), "lat": round(pt.y, 5), "cls": c})
json.dump(labels, open(os.path.join(out_dir, "road-labels.json"), "w", encoding="utf-8"), ensure_ascii=False,
          separators=(",", ":"))
print("road labels:", len(labels), sorted({l['name'] for l in labels}))
