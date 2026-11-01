"""District / county labels and county border lines from the MOI township shapefile (TOWN_MOI_1140318).

usage: python -I build_districts.py <TOWN_MOI.shp> <out_dir>
Writes district-labels.json, county-labels.json, counties.geojson (inter-county border lines only).
Label points are poles of inaccessibility (shapely.polylabel, computed in TWD97 TM2 metres) of the largest part of
each polygon *clipped to the bbox*, so they sit inside the visible polygon.  area_km2 is the full township area.
"""
import json, os, sys
import shapefile, shapely
from shapely.geometry import box, shape, mapping, MultiLineString
from shapely.ops import unary_union, linemerge, transform, polylabel
from pyproj import Transformer

sys.stdout.reconfigure(encoding="utf-8")
shp, out_dir = sys.argv[1:3]
BBOX = (120.50, 23.78, 121.05, 24.30)
bb = box(*BBOX)
to_m = Transformer.from_crs(4326, 3826, always_xy=True).transform
to_ll = Transformer.from_crs(3826, 4326, always_xy=True).transform


def polys_of(g):
    return [p for p in getattr(g, "geoms", [g]) if p.geom_type == "Polygon" and not p.is_empty]


def pole(g):
    """pole of inaccessibility of the largest polygon part of g (lon/lat in, lon/lat out)"""
    best = max(polys_of(g), key=lambda p: p.area)
    pt = polylabel(transform(to_m, best), tolerance=20)
    x, y = to_ll(pt.x, pt.y)
    assert best.contains(shapely.Point(x, y)), "label point outside polygon"
    return x, y


rd = shapefile.Reader(shp, encoding="utf-8")
towns = []   # (county, town, full geom, clipped geom)
for sr in rd.iterShapeRecords():
    g = shape(sr.shape.__geo_interface__)
    if not g.is_valid:
        g = shapely.make_valid(g)
    if not g.intersects(bb):
        continue
    c = g.intersection(bb)
    if c.is_empty or not polys_of(c):
        continue
    d = sr.record.as_dict()
    towns.append((d["COUNTYNAME"], d["TOWNNAME"], g, shapely.MultiPolygon(polys_of(c))))

# ---- district labels ----
labels = []
for county, town, full, clip in towns:
    clip_km2 = transform(to_m, clip).area / 1e6
    if clip_km2 < 1.0:      # sliver at the bbox edge: no label
        print(f"  skip {county}{town}: only {clip_km2:.2f} km2 inside bbox")
        continue
    lon, lat = pole(clip)
    labels.append({"town": town, "county": county, "lon": round(lon, 5), "lat": round(lat, 5),
                   "area_km2": round(transform(to_m, full).area / 1e6, 1)})
json.dump(labels, open(os.path.join(out_dir, "district-labels.json"), "w", encoding="utf-8"), ensure_ascii=False,
          separators=(",", ":"))
print(len(labels), "district labels")

# ---- counties: dissolve, labels, inter-county borders ----
by_county = {}
for county, _, _, clip in towns:
    by_county.setdefault(county, []).append(clip)
cgeom = {c: shapely.make_valid(unary_union(gs)) for c, gs in by_county.items()}
clabels = []
for c, g in cgeom.items():
    km2 = transform(to_m, g).area / 1e6
    print(f"  county {c}: {km2:.0f} km2 inside bbox")
    if km2 < 10:
        continue
    lon, lat = pole(g)
    clabels.append({"county": c, "lon": round(lon, 5), "lat": round(lat, 5)})
json.dump(clabels, open(os.path.join(out_dir, "county-labels.json"), "w", encoding="utf-8"), ensure_ascii=False,
          separators=(",", ":"))

names = sorted(cgeom)
feats = []
for i, a in enumerate(names):
    for b in names[i + 1:]:
        shared = cgeom[a].boundary.intersection(cgeom[b].boundary)
        if shared.length < 1e-4:   # fall back to a tolerance if vertices differ slightly
            shared = cgeom[a].boundary.intersection(cgeom[b].buffer(2e-5))
        lines = [l for l in getattr(shared, "geoms", [shared]) if l.geom_type == "LineString" and l.length > 0]
        if not lines:
            continue
        m = linemerge(lines)
        m = m.simplify(0.0004, preserve_topology=True)
        parts = [l for l in getattr(m, "geoms", [m]) if l.geom_type == "LineString"]
        coords = [[[round(x, 5), round(y, 5)] for x, y in l.coords] for l in parts]
        print(f"  border {a} | {b}: {len(parts)} line(s), {sum(l.length for l in parts) * 101:.0f} km")
        geom = ({"type": "LineString", "coordinates": coords[0]} if len(coords) == 1
                else {"type": "MultiLineString", "coordinates": coords})
        feats.append({"type": "Feature", "properties": {"county": a, "neighbor": b}, "geometry": geom})
json.dump({"type": "FeatureCollection", "features": feats},
          open(os.path.join(out_dir, "counties.geojson"), "w", encoding="utf-8"), ensure_ascii=False,
          separators=(",", ":"))
print(len(feats), "border features;", len(clabels), "county labels")
