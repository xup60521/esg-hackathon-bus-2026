"""Road-following paths between stop pairs seen in trips.csv, via public OSRM.

usage: python -I build_routes.py <stops.json> <trips.csv> <cache_dir> <routes.json> <route-network.geojson>
"""
import csv, json, os, subprocess, sys, time
from shapely.geometry import LineString, MultiLineString, mapping
from shapely.ops import linemerge, unary_union

sys.stdout.reconfigure(encoding="utf-8")
stops_path, trips_path, cache_dir, routes_out, net_out = sys.argv[1:6]
os.makedirs(cache_dir, exist_ok=True)

stops = {s["name"]: s for s in json.load(open(stops_path, encoding="utf-8"))}
pairs = set()
with open(trips_path, encoding="utf-8", newline="") as f:
    for r in csv.DictReader(f):
        a, b = r["board_stop"], r["alight_stop"]
        if a and b and a != b:
            assert a in stops and b in stops, (a, b)
            pairs.add(tuple(sorted((a, b), key=lambda n: stops[n]["order"])))
print(len(pairs), "unordered pairs")

def fetch(a, b):
    sa, sb = stops[a], stops[b]
    url = (f"https://router.project-osrm.org/route/v1/driving/"
           f"{sa['lon']},{sa['lat']};{sb['lon']},{sb['lat']}?overview=full&geometries=geojson")
    path = os.path.join(cache_dir, f"{sa['id']}__{sb['id']}.json")
    if os.path.exists(path):
        return json.load(open(path, encoding="utf-8"))
    for attempt in range(5):
        try:
            # curl (system trust store): Python's cert chain rejects the OSRM cert on this machine
            txt = subprocess.run(["curl", "-sS", "-m", "60", "-A", "esg-hackathon-geo-build/1.0", url],
                                 capture_output=True, check=True).stdout.decode("utf-8")
            data = json.loads(txt)
            break
        except Exception as e:
            print("  retry", a, b, e)
            time.sleep(3 * (attempt + 1))
    else:
        raise SystemExit(f"failed {a} {b}")
    json.dump(data, open(path, "w", encoding="utf-8"))
    time.sleep(1.1)
    return data

def r5(c):
    return [round(c[0], 5), round(c[1], 5)]

out, full_lines = {}, []
for a, b in sorted(pairs):
    d = fetch(a, b)
    if d.get("code") != "Ok":
        raise SystemExit(f"OSRM {a}-{b}: {d.get('code')}")
    rt = d["routes"][0]
    coords = rt["geometry"]["coordinates"]
    full_lines.append(coords)
    ln = LineString(coords).simplify(0.0001, preserve_topology=False)
    simp = [r5(c) for c in ln.coords]
    out[f"{a}|{b}"] = {"coords": simp, "distance": round(rt["distance"])}
    out[f"{b}|{a}"] = {"coords": simp[::-1], "distance": round(rt["distance"])}
    print(f"{a} -> {b}: {rt['distance']/1000:.1f} km, {len(coords)} -> {len(simp)} pts, "
          f"waypoint snap {d['waypoints'][0]['distance']:.0f}/{d['waypoints'][1]['distance']:.0f} m")

json.dump({"pairs": out}, open(routes_out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

# deduplicated network: unique undirected segments from full-resolution geometry
segs = set()
for coords in full_lines:
    pts = [tuple(r5(c)) for c in coords]
    for p, q in zip(pts, pts[1:]):
        if p != q:
            segs.add((p, q) if p <= q else (q, p))
merged = linemerge(unary_union([LineString(s) for s in segs]))
merged = merged.simplify(0.0001, preserve_topology=True)
lines = list(merged.geoms) if hasattr(merged, "geoms") else [merged]
feat = {"type": "FeatureCollection", "features": [{
    "type": "Feature", "properties": {"name": "route-network"},
    "geometry": {"type": "MultiLineString",
                 "coordinates": [[r5(c) for c in l.coords] for l in lines]}}]}
json.dump(feat, open(net_out, "w"), separators=(",", ":"))
print("network lines:", len(lines))
