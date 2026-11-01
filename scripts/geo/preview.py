"""Overlay roads (by class) + district labels + township borders + stops + bus route on terrain-texture.webp.
Also round-trips the Terrarium PNGs (2048 and 1024) at the stops.
usage: python -I preview.py <public/geo dir> <out preview.png>
Writes <out>, <out>_taichung.png, <out>_sunmoon.png (zoomed crops at full texture resolution).
"""
import json, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.stdout.reconfigure(encoding="utf-8")
d, out = sys.argv[1:3]
rj = lambda n: json.load(open(os.path.join(d, n), encoding="utf-8"))
meta = rj("terrain.json")
w0, s0, e0, n0 = meta["bounds"]
img = Image.open(os.path.join(d, meta.get("texture", "terrain-texture.png"))).convert("RGB")
W, H = img.size
print("texture", W, H)
def px(lon, lat): return ((lon - w0) / (e0 - w0) * W, (n0 - lat) / (n0 - s0) * H)
dr = ImageDraw.Draw(img, "RGBA")
try:
    font = ImageFont.truetype("C:/Windows/Fonts/msjh.ttc", 30)
    font_s = ImageFont.truetype("C:/Windows/Fonts/msjh.ttc", 22)
    font_c = ImageFont.truetype("C:/Windows/Fonts/msjhbd.ttc", 44)
except Exception:
    font = font_s = font_c = None

for f in rj("townships.geojson")["features"]:
    g = f["geometry"]; polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    for p in polys:
        for ring in p:
            dr.line([px(*c) for c in ring], fill=(255, 255, 255, 40), width=1)
for f in rj("counties.geojson")["features"]:
    g = f["geometry"]; ls = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
    for l in ls:
        dr.line([px(*c) for c in l], fill=(255, 255, 255, 170), width=4)

roads = rj("roads.json")
STYLE = {  # class -> (rgba, width)
    "local": ((150, 172, 184, 200), 1), "county": ((205, 205, 195, 230), 2), "provincial": ((245, 225, 120, 255), 3),
    "expressway": ((255, 160, 60, 255), 4), "freeway": ((255, 110, 80, 255), 5)}
by_cls = {}
for ci, pts in roads["lines"]:
    by_cls.setdefault(roads["classes"][ci], []).append(pts)
for name in ("local", "county", "provincial", "expressway", "freeway"):   # minor first
    col, wd = STYLE[name]
    for pts in by_cls.get(name, []):
        dr.line([px(*c) for c in pts], fill=col, width=wd)
    print(f"{name:10s} {len(by_cls.get(name, [])):5d} lines")

net = rj("route-network.geojson")
for f in net["features"]:
    for l in f["geometry"]["coordinates"]:
        dr.line([px(*c) for c in l], fill=(0, 255, 230, 255), width=2)

def label(x, y, t, fnt, fill=(255, 255, 255, 255)):
    dr.text((x, y), t, fill=fill, font=fnt, anchor="mm", stroke_width=3, stroke_fill=(0, 0, 0, 230))
for l in rj("road-labels.json"):
    label(*px(l["lon"], l["lat"]), l["name"], font_s, (255, 235, 150, 255))
for l in rj("district-labels.json"):
    label(*px(l["lon"], l["lat"]), l["town"], font, (235, 245, 250, 255))
for l in rj("county-labels.json"):
    label(*px(l["lon"], l["lat"]), l["county"], font_c, (255, 200, 120, 255))

stops = rj("stops.json")
t2 = np.asarray(Image.open(os.path.join(d, "terrain-elevation.png"))).astype(float)
t1 = np.asarray(Image.open(os.path.join(d, meta.get("elevationSmall", "terrain-elevation.png")))).astype(float)
dec = lambda t, lon, lat: (lambda a: a[0] * 256 + a[1] + a[2] / 256 - 32768)(
    t[min(t.shape[0] - 1, int((n0 - lat) / (n0 - s0) * t.shape[0])), min(t.shape[1] - 1, int((lon - w0) / (e0 - w0) * t.shape[1]))])
for s in stops:
    x, y = px(s["lon"], s["lat"])
    dr.ellipse([x - 7, y - 7, x + 7, y + 7], fill=(255, 60, 90, 255), outline=(255, 255, 255, 255), width=2)
    dr.text((x + 11, y - 12), s["name"], fill=(255, 255, 255, 255), font=font_s, stroke_width=2, stroke_fill=(0, 0, 0, 255))
    print(f"{s['name']:8s} DEM {s['elevation']:7.1f} m   2048px {dec(t2, s['lon'], s['lat']):7.1f} m   1024px {dec(t1, s['lon'], s['lat']):7.1f} m")
img.resize((W // 2, H // 2), Image.LANCZOS).save(out)
def crop(lon0, lat0, lon1, lat1, name):
    (x0, y1_), (x1, y0_) = px(lon0, lat1), px(lon1, lat0)
    img.crop((int(x0), int(y1_), int(x1), int(y0_))).save(out.replace(".png", f"_{name}.png"))
crop(120.55, 24.08, 120.78, 24.24, "taichung")     # Taichung urban core
crop(120.82, 23.80, 121.00, 23.98, "sunmoon")      # Puli - Sun Moon Lake
crop(120.78, 24.00, 120.98, 24.15, "puli")         # Guoxing - Puli corridor (國6)
