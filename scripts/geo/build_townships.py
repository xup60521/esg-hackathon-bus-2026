"""Township polygons (MOI 1140318) clipped to the study bbox, simplified, WGS84.

usage: python -I build_townships.py <TOWN_MOI.shp> <out townships.geojson>
The shapefile is GCS_TWD97[2020] lon/lat, treated as WGS84 (sub-metre difference).
"""
import json, sys
import shapefile, shapely
from shapely.geometry import box, shape, mapping

sys.stdout.reconfigure(encoding="utf-8")
shp, out = sys.argv[1:3]
BBOX = (120.50, 23.78, 121.05, 24.30)
bb = box(*BBOX)
rd = shapefile.Reader(shp, encoding="utf-8")
items = []
for sr in rd.iterShapeRecords():
    g = shape(sr.shape.__geo_interface__)
    if not g.is_valid:
        g = shapely.make_valid(g)
    if not g.intersects(bb):
        continue
    c = g.intersection(bb)
    if c.is_empty:
        continue
    polys = [p for p in getattr(c, "geoms", [c]) if p.geom_type == "Polygon" and p.area > 0]
    if not polys:
        continue
    d = sr.record.as_dict()
    items.append((d["COUNTYNAME"], d["TOWNNAME"], shapely.MultiPolygon(polys)))
print(len(items), "townships intersect bbox")
geoms = [i[2] for i in items]
try:
    simp = list(shapely.coverage_simplify(geoms, 0.0005))
    print("coverage_simplify OK")
except Exception as e:
    print("coverage_simplify failed:", e, "-> per-polygon simplify")
    simp = [g.simplify(0.0005, preserve_topology=True) for g in geoms]

def rnd(c):
    if isinstance(c[0], (int, float)):
        return [round(c[0], 5), round(c[1], 5)]
    return [rnd(x) for x in c]

feats = []
for (county, town, _), g in zip(items, simp):
    g = shapely.set_precision(g, 0.00001) if not g.is_empty else g
    if g.is_empty:
        continue
    if g.geom_type == "MultiPolygon" and len(g.geoms) == 1:
        g = g.geoms[0]
    m = mapping(g)
    feats.append({"type": "Feature", "properties": {"county": county, "town": town},
                  "geometry": {"type": m["type"], "coordinates": rnd(m["coordinates"])}})
    print(f"  {county} {town}: {g.area*111.3*101.7:.0f} km2")
json.dump({"type": "FeatureCollection", "features": feats}, open(out, "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
