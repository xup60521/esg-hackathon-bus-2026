"""Light-theme stylized basemap texture (4096 px, same grid/bounds as terrain-texture.webp).

usage: python -I build_terrain_light.py <dem_20m.tif> <out_dir> [streets_minor.npz]
Writes <out_dir>/terrain-texture-light.webp and adds {"textureLight": ...} to <out_dir>/terrain.json
(read-modify-write, only that key). The dark texture / elevation PNGs are produced by build_terrain.py and untouched.

Style: warm-paper lowlands, sage/olive mid elevations, stone-gray highlands, soft multi-directional hillshade with
cool blue-gray shadows, Sun Moon Lake mid-blue with a darker shoreline, pale blue-gray sea, thin gray baked streets.
"""
import json, sys, os
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_bounds
from rasterio.windows import from_bounds as win_from_bounds
from pyproj import Transformer
from scipy import ndimage as ndi
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
dem_path, out_dir = sys.argv[1:3]
STREETS = sys.argv[3] if len(sys.argv) > 3 else None
WT = 4096
WEST, SOUTH, EAST, NORTH = 120.50, 23.78, 121.05, 24.30
W = WT
H = round(W * (NORTH - SOUTH) / (EAST - WEST))
SEED = (120.91, 23.86)
NODATA = -32767.0

src = rasterio.open(dem_path)
to3826 = Transformer.from_crs(4326, 3826, always_xy=True)
xs, ys = zip(*[to3826.transform(x, y) for x in (WEST, EAST) for y in (SOUTH, NORTH)])
pad = 200
win = win_from_bounds(min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad, src.transform)
win = win.round_offsets().round_lengths()
z_src = src.read(1, window=win).astype(np.float32)
src_tf = src.window_transform(win)
dst_tf = from_bounds(WEST, SOUTH, EAST, NORTH, W, H)
print("texture grid", W, H, "src window", z_src.shape)

z = np.full((H, W), NODATA, np.float32)
reproject(z_src, z, src_transform=src_tf, src_crs=src.crs, dst_transform=dst_tf, dst_crs="EPSG:4326",
          src_nodata=NODATA, dst_nodata=NODATA, resampling=Resampling.bilinear)
nodata = (z == NODATA) | (z <= -1000)
z[nodata] = 0.0
z = np.clip(z, 0, None)

# ---- flat-water detection on the native DEM (identical to build_terrain.py) ----
zs = z_src.copy()
zs[zs == NODATA] = np.nan
zn = np.nan_to_num(zs, nan=-9999)
rng3 = ndi.maximum_filter(zn, 3) - ndi.minimum_filter(zn, 3)
sx, sy = to3826.transform(*SEED)
c, r = ~src_tf * (sx, sy)
c, r = int(c), int(r)
box = zs[r - 75:r + 75, c - 75:c + 75]
vals, cnt = np.unique(box[~np.isnan(box)], return_counts=True)
e0 = float(vals[np.argmax(cnt)])
cand = (zn >= e0 - 1.5) & (zn <= e0 + 1.5) & (rng3 <= 1.01)
cand = ndi.binary_opening(cand, iterations=1)
lab, n = ndi.label(cand)
rr, cc = np.ogrid[:cand.shape[0], :cand.shape[1]]
near = (rr - r) ** 2 + (cc - c) ** 2 < 150 ** 2
sizes = ndi.sum(cand & near, lab, range(1, n + 1))
lake = lab == (int(np.argmax(sizes)) + 1)
lake = ndi.binary_fill_holes(lake)
print("Sun Moon Lake flat region: %.2f km2 (level %.0f)" % (lake.sum() * 400 / 1e6, e0))

lake_dist = ndi.distance_transform_edt(lake)           # native px from shore (inside)
lake_alpha = np.zeros((H, W), np.float32)
reproject(lake.astype(np.float32), lake_alpha, src_transform=src_tf, src_crs=src.crs, dst_transform=dst_tf,
          dst_crs="EPSG:4326", src_nodata=None, dst_nodata=0, resampling=Resampling.bilinear)
lake_depth = np.zeros((H, W), np.float32)
reproject(lake_dist.astype(np.float32), lake_depth, src_transform=src_tf, src_crs=src.crs, dst_transform=dst_tf,
          dst_crs="EPSG:4326", src_nodata=None, dst_nodata=0, resampling=Resampling.bilinear)
lake_alpha = np.clip((lake_alpha - 0.15) / 0.7, 0, 1)

# ---- soft multi-directional hillshade ----
mid_lat = (NORTH + SOUTH) / 2
dx = (EAST - WEST) / W * 111320 * np.cos(np.radians(mid_lat))
dy = (NORTH - SOUTH) / H * 110574
zsm = ndi.gaussian_filter(z, 1.3 * W / 2048)
VE = 1.6
gy, gx = np.gradient(zsm * VE, dy, dx)
slope = np.arctan(np.hypot(gx, gy))
aspect = np.arctan2(-gx, gy)
def hs(az_deg, alt_deg):
    az, alt = np.radians(az_deg), np.radians(alt_deg)
    a = (np.pi / 2 - az) % (2 * np.pi)
    asp = (np.pi / 2 - aspect) % (2 * np.pi)
    return np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(a - asp)
dirs = [(315, 40, 0.38), (270, 45, 0.22), (225, 45, 0.15), (360, 40, 0.15), (30, 50, 0.10)]
shade = sum(w * hs(az, alt) for az, alt, w in dirs) / sum(w for *_, w in dirs)
flat_level = sum(w * np.sin(np.radians(alt)) for az, alt, w in dirs) / sum(w for *_, w in dirs)
d_sh = (shade - flat_level) * 1.5                       # signed, 0 on flat ground
d_sh = ndi.gaussian_filter(d_sh, 0.6)
d_sh = np.clip(d_sh, -0.5, 0.45)[..., None]

# ---- hypsometric tint (light theme) ----
ramp = [  # elevation m, RGB
    (0,    (238, 235, 227)),   # warm paper lowland  #eeebe3
    (80,   (237, 235, 225)),
    (220,  (228, 230, 213)),   # first hint of green
    (450,  (214, 222, 194)),   # soft sage
    (800,  (198, 210, 174)),   # olive-sage
    (1200, (196, 204, 172)),
    (1700, (206, 207, 190)),   # transition olive -> stone
    (2300, (218, 217, 210)),   # light stone
    (3000, (232, 231, 228)),
    (3600, (238, 238, 236)),
]
ze = np.array([p[0] for p in ramp], float)
col = np.stack([np.interp(z, ze, [p[1][i] for p in ramp]) for i in range(3)], -1)

# shadows: multiply toward a cool blue-gray (R darkens most, B least); highlights: gentle warm-white lift
neg = np.clip(-d_sh, 0, None)
pos = np.clip(d_sh, 0, None)
# (blend toward a cool light blue-gray instead of multiplying -> shadows stay airy, never black)
shadow_col = np.array([128, 146, 170], np.float32)
sa = np.clip(neg * 0.95, 0, 0.5)
img = col * (1 - sa) + shadow_col * sa
img = img * (1 - 0.25 * neg)
img = img + pos * np.array([34.0, 33.0, 30.0]) * (1 - img / 255.0)
img = np.clip(img, 0, 255)

# subtle contour lines (every 100 m, index every 500 m) from the smoothed DEM
zc = ndi.gaussian_filter(z, 2.0)
lv = np.floor(zc / 100.0)
edge = np.zeros((H, W), bool)
edge[:, 1:] |= lv[:, 1:] != lv[:, :-1]
edge[1:, :] |= lv[1:, :] != lv[:-1, :]
edge &= zc > 30
idx = np.zeros((H, W), bool)
l5 = np.floor(zc / 500.0)
idx[:, 1:] |= l5[:, 1:] != l5[:, :-1]
idx[1:, :] |= l5[1:, :] != l5[:-1, :]
cont_a = ndi.gaussian_filter(edge.astype(np.float32), 0.6) * 0.9 * 0.10 \
       + ndi.gaussian_filter(idx.astype(np.float32), 0.7) * 0.9 * 0.12
cont_col = np.array([126, 128, 104], np.float32)
img = img * (1 - cont_a[..., None]) + cont_col * cont_a[..., None]

# sea / nodata, with a faint coastline
sea_col = np.array([223, 231, 236], np.float32)
sea_a = ndi.gaussian_filter(nodata.astype(np.float32), 0.8)[..., None]
img = img * (1 - sea_a) + sea_col * sea_a
coast = (sea_a * (1 - sea_a) * 4) * 0.45
img = img * (1 - coast) + np.array([176, 192, 204], np.float32) * coast

# Sun Moon Lake: clear mid blue, slightly darker shoreline (inside) + faint outer halo
lake_a = lake_alpha[..., None]
dpt = np.clip(lake_depth / 18.0, 0, 1)[..., None]
water = np.array([146, 200, 234], np.float32) * (1 - dpt) + np.array([136, 192, 230], np.float32) * dpt
water = water * (0.985 + 0.03 * (d_sh + 0.1).clip(-0.3, 0.3))     # whisper of relief-shade glint
ring_in = np.clip(1 - lake_depth / 2.2, 0, 1)[..., None] * lake_a      # ~2 native px inside the shore
water = water * (1 - 0.85 * ring_in) + np.array([96, 158, 206], np.float32) * (0.85 * ring_in)
img = img * (1 - lake_a) + water * lake_a
halo = ndi.gaussian_filter(lake_alpha, 2.5)
halo = (halo * (1 - lake_alpha))[..., None] * 0.9
img = img * (1 - halo * 0.5) + np.array([120, 170, 208], np.float32) * halo * 0.5

# ---- baked minor streets: thin mid-gray lines, visible but subordinate ----
if STREETS:
    from PIL import ImageDraw
    d = np.load(STREETS)
    coords, offs, wid = d["coords"], d["offs"], d["width"]
    SS = 2
    mask_im = Image.new("L", (W * SS, H * SS), 0)
    dr = ImageDraw.Draw(mask_im)
    xs = (coords[:, 0] - WEST) / (EAST - WEST) * W * SS
    ys = (NORTH - coords[:, 1]) / (NORTH - SOUTH) * H * SS
    xy = np.stack([xs, ys], -1)
    for i in range(len(offs) - 1):
        pts = [tuple(p) for p in xy[offs[i]:offs[i + 1]]]
        w = wid[i]
        if w >= 12:   val, lw = 255, 3
        elif w >= 6:  val, lw = 235, 2
        else:         val, lw = 190, 2
        dr.line(pts, fill=val, width=lw)
    m = np.asarray(mask_im.reduce(SS), np.float32) / 255.0
    del mask_im, dr
    m *= (1 - lake_alpha) * (1 - sea_a[..., 0])
    k = (0.34 * m)[..., None]
    img = img * (1 - k) + np.array([112, 114, 118], np.float32) * k
    print("baked %d street polylines" % (len(offs) - 1))

out = os.path.join(out_dir, "terrain-texture-light.webp")
Image.fromarray(np.clip(img + 0.5, 0, 255).astype(np.uint8), "RGB").save(out, quality=82, method=6)
print("wrote", out, os.path.getsize(out), "bytes")

# add only our key to terrain.json (re-read right before writing)
tj = os.path.join(out_dir, "terrain.json")
meta = json.load(open(tj, encoding="utf-8"))
meta["textureLight"] = "terrain-texture-light.webp"
json.dump(meta, open(tj, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("done")
