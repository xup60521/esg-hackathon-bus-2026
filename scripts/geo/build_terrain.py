"""DEM -> WGS84 grid -> Terrarium elevation PNGs (2048 + 1024 px) + stylized dark-theme texture
(terrain-texture.png at 2048 px = legacy, terrain-texture.webp at 4096 px incl. baked minor streets).

usage: python -I build_terrain.py <dem_20m.tif> <out_dir> [streets_minor.npz]
The DEM is a TWD97 / TM2 zone 121 (EPSG:3826) int16 raster, 20 m, nodata -32767.
streets_minor.npz (from build_roads.py) holds finer street centrelines drawn faintly into the 4096 texture.
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
W = 2048                      # elevation grid (kept)
WT = 4096                     # texture grid
WEST, SOUTH, EAST, NORTH = 120.50, 23.78, 121.05, 24.30
H = round(W * (NORTH - SOUTH) / (EAST - WEST))
SEED = (120.91, 23.86)  # 日月潭 approx (lon, lat)
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
print("grid", W, H, "src window", z_src.shape)

# ---- elevation grid (bilinear, nodata aware) ----
z = np.full((H, W), NODATA, np.float32)
reproject(z_src, z, src_transform=src_tf, src_crs=src.crs, dst_transform=dst_tf, dst_crs="EPSG:4326",
          src_nodata=NODATA, dst_nodata=NODATA, resampling=Resampling.bilinear)
nodata = (z == NODATA) | (z <= -1000)
z[nodata] = 0.0
z = np.clip(z, 0, None)
zmin, zmax = float(z.min()), float(z.max())
print("elev range", zmin, zmax, "nodata frac", nodata.mean())

# Terrarium encode
def terrarium(zz):
    v = np.round((zz + 32768.0) * 8) / 8   # 1/8 m steps keep the PNG small (source DEM is integer metres)
    R = np.floor(v / 256.0)
    G = np.floor(v) % 256
    B = np.floor((v - np.floor(v)) * 256.0)
    return np.stack([R, G, B], -1).astype(np.uint8)

Image.fromarray(terrarium(z), "RGB").save(os.path.join(out_dir, "terrain-elevation.png"), optimize=True)
# lighter mesh: exact 2x2 area average of the 2048 grid (H is even) -> 1024 px, same bounds
assert H % 2 == 0 and W % 2 == 0
z_small = z.reshape(H // 2, 2, W // 2, 2).mean(axis=(1, 3))
Image.fromarray(terrarium(z_small), "RGB").save(os.path.join(out_dir, "terrain-elevation-1024.png"), optimize=True)
# merge into any existing terrain.json so keys written by other scripts
# (heightmap from build_heightmap_bin.py, textureLight from build_terrain_light.py) survive
_meta_path = os.path.join(out_dir, "terrain.json")
_meta = json.load(open(_meta_path, encoding="utf-8")) if os.path.exists(_meta_path) else {}
_meta.update({"bounds": [WEST, SOUTH, EAST, NORTH], "width": W, "height": H, "encoding": "terrarium",
           "minElevation": round(zmin, 1), "maxElevation": round(zmax, 1),
           "source": "內政部國土測繪中心 20m DEM (data.gov.tw 35430), EPSG:3826 reprojected to WGS84, bilinear; "
                     "nodata/sea = 0 m",
           "elevationSmall": "terrain-elevation-1024.png", "elevationSmallSize": [W // 2, H // 2],
           "texture": "terrain-texture.webp", "textureSize": [WT, round(WT * (NORTH - SOUTH) / (EAST - WEST))]})
json.dump(_meta, open(_meta_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ---- texture grid (4096 px): re-reproject the DEM at texture resolution ----
H0, W0 = H, W
W = WT
H = round(W * (NORTH - SOUTH) / (EAST - WEST))
dst_tf = from_bounds(WEST, SOUTH, EAST, NORTH, W, H)
z = np.full((H, W), NODATA, np.float32)
reproject(z_src, z, src_transform=src_tf, src_crs=src.crs, dst_transform=dst_tf, dst_crs="EPSG:4326",
          src_nodata=NODATA, dst_nodata=NODATA, resampling=Resampling.bilinear)
nodata = (z == NODATA) | (z <= -1000)
z[nodata] = 0.0
z = np.clip(z, 0, None)
print("texture grid", W, H)

# ---- flat-water detection on the native DEM ----
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
print("lake surface level (mode near seed):", e0)
cand = (zn >= e0 - 1.5) & (zn <= e0 + 1.5) & (rng3 <= 1.01)   # surface spans 2 integer levels in this DEM
cand = ndi.binary_opening(cand, iterations=1)
lab, n = ndi.label(cand)
# component nearest/containing the seed: pick the largest within 3 km of seed
rr, cc = np.ogrid[:cand.shape[0], :cand.shape[1]]
near = (rr - r) ** 2 + (cc - c) ** 2 < 150 ** 2
sizes = ndi.sum(cand & near, lab, range(1, n + 1))
lake = lab == (int(np.argmax(sizes)) + 1)
lake = ndi.binary_fill_holes(lake)
print("Sun Moon Lake flat region: %.2f km2" % (lake.sum() * 400 / 1e6))

# other large flat reservoirs: report only (not painted) unless clearly a lake
rng5 = ndi.maximum_filter(zn, 5) - ndi.minimum_filter(zn, 5)
flat5 = (rng5 <= 0) & (zn > 0) & ~lake
lab5, n5 = ndi.label(flat5)
sz5 = ndi.sum(flat5, lab5, range(1, n5 + 1))
for k in np.argsort(-sz5)[:6]:
    yy, xx = np.where(lab5 == k + 1)
    lon, lat = Transformer.from_crs(3826, 4326, always_xy=True).transform(*(src_tf * (xx.mean(), yy.mean())))
    print("  flat candidate %.2f km2 at lon %.4f lat %.4f elev %.0f" % (sz5[k] * 4e-4, lon, lat, zn[lab5 == k + 1].mean()))

lake_f = lake.astype(np.float32)
lake_dist = ndi.distance_transform_edt(lake)  # px from shore, native 20 m
lake_alpha = np.zeros((H, W), np.float32)
reproject(lake_f, lake_alpha, src_transform=src_tf, src_crs=src.crs, dst_transform=dst_tf, dst_crs="EPSG:4326",
          src_nodata=None, dst_nodata=0, resampling=Resampling.bilinear)
lake_depth = np.zeros((H, W), np.float32)
reproject(lake_dist.astype(np.float32), lake_depth, src_transform=src_tf, src_crs=src.crs, dst_transform=dst_tf,
          dst_crs="EPSG:4326", src_nodata=None, dst_nodata=0, resampling=Resampling.bilinear)
lake_alpha = np.clip((lake_alpha - 0.15) / 0.7, 0, 1)  # slightly crisp edge

# ---- hillshade (multi-directional) ----
mid_lat = (NORTH + SOUTH) / 2
dx = (EAST - WEST) / W * 111320 * np.cos(np.radians(mid_lat))
dy = (NORTH - SOUTH) / H * 110574
zsm = ndi.gaussian_filter(z, 1.3 * W / W0)           # kill 1 m terracing of the integer DEM
VE = 1.8
gy, gx = np.gradient(zsm * VE, dy, dx)       # rows go south -> dy positive downwards
slope = np.arctan(np.hypot(gx, gy))
aspect = np.arctan2(-gx, gy)                 # downslope direction, 0 = north
def hs(az_deg, alt_deg):
    az, alt = np.radians(az_deg), np.radians(alt_deg)
    # azimuth measured clockwise from north; aspect = direction slope faces
    a = np.pi / 2 - az
    a = a % (2 * np.pi)
    asp = (np.pi / 2 - aspect) % (2 * np.pi)
    return np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(a - asp)
dirs = [(315, 40, 0.38), (270, 45, 0.22), (225, 45, 0.15), (360, 40, 0.15), (30, 50, 0.10)]
shade = sum(w * hs(az, alt) for az, alt, w in dirs) / sum(w for *_, w in dirs)
flat_level = sum(w * np.sin(np.radians(alt)) for az, alt, w in dirs) / sum(w for *_, w in dirs)
shade = np.clip(0.5 + (shade - flat_level) * 2.4, 0, 1)

# ---- hypsometric tint (dark theme) ----
ramp = [  # elevation m, RGB
    (0,    (10, 28, 46)),     # deep navy lowland
    (60,   (13, 40, 58)),
    (200,  (19, 58, 70)),     # teal
    (450,  (33, 80, 82)),
    (800,  (62, 101, 96)),    # muted sage
    (1300, (98, 120, 118)),   # slate
    (1900, (150, 164, 162)),
    (2600, (208, 216, 214)),  # pale highlands
    (3600, (240, 243, 242)),
]
ze = np.array([p[0] for p in ramp], float)
col = np.stack([np.interp(z, ze, [p[1][i] for p in ramp]) for i in range(3)], -1)

# light multiply + soft-light-ish lift: valleys darker, sun-facing slopes brighter
lum = (0.45 + 0.95 * shade)[..., None]
img = col * lum
img += (shade[..., None] - 0.5).clip(0, None) * 38 * (0.4 + 0.6 * np.clip(z / 1500, 0, 1))[..., None]

# sea / nodata
sea_col = np.array([6, 12, 24], float)
sea_a = ndi.gaussian_filter(nodata.astype(np.float32), 0.8)[..., None]
img = img * (1 - sea_a) + sea_col * sea_a

# lake: deeper centre, lighter rim, faint sun glint from the same shade field
d = np.clip(lake_depth / 18.0, 0, 1)[..., None]    # 0 at shore -> 1 at >360 m offshore
shore, deep = np.array([74, 164, 214], float), np.array([30, 108, 176], float)
water = shore * (1 - d) + deep * d
water = water * (0.96 + 0.08 * shade[..., None])
a = lake_alpha[..., None]
img = img * (1 - a) + water * a

# ---- minor streets (Taichung city centrelines not already drawn as vector roads): faint pale hairlines ----
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
        elif w >= 6:  val, lw = 200, 2
        else:         val, lw = 120, 1
        dr.line(pts, fill=val, width=lw)
    m = np.asarray(mask_im.reduce(SS), np.float32) / 255.0
    del mask_im, dr
    m *= (1 - lake_alpha) * (1 - sea_a[..., 0])          # never over water / sea
    street_col = np.array([158, 184, 196], np.float32)
    k = (0.34 * m)[..., None]
    img = img * (1 - k) + street_col * k
    print("baked %d street polylines" % (len(offs) - 1))

Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").save(os.path.join(out_dir, "terrain-texture.webp"),
                                                                 quality=82, method=6)
print("done")
