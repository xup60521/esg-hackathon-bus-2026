"""Write a raw little-endian Int16 heightmap (metres) for the browser terrain mesh.

Usage: uv run --with pillow --with numpy python -I scripts/geo/build_heightmap_bin.py [width]

Why: decoding Terrarium PNGs needs canvas getImageData, which privacy-hardened browsers
(Brave, Helium, ...) deliberately perturb -> ±256 m spikes. A raw binary avoids the canvas.
Source grid: public/geo/terrain-elevation.png (same bounds as terrain.json).
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[2] / "public" / "geo"
width = int(sys.argv[1]) if len(sys.argv) > 1 else 768
rgb = np.asarray(Image.open(root / "terrain-elevation.png").convert("RGB")).astype(np.float64)
elev = rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768
h0, w0 = elev.shape
height = round(width * h0 / w0)
small = np.asarray(Image.fromarray(elev.astype(np.float32), mode="F").resize((width, height), Image.BOX))
out = np.clip(np.round(small), -32768, 32767).astype("<i2")
name = f"terrain-height-{width}.i16"
out.tofile(root / name)

meta_path = root / "terrain.json"
meta = json.loads(meta_path.read_text(encoding="utf-8"))  # re-read right before writing
meta["heightmap"] = {"file": name, "width": width, "height": height, "dtype": "int16le", "units": "m",
                     "order": "row-major, north to south, west to east"}
meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
print(name, width, height, out.min(), out.max(), (root / name).stat().st_size, "bytes")
