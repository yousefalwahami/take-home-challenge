from PIL import Image, ImageFilter
import os

"""
Split the original toile into left/right panels for edge-pinned landing art.

Usage: py -3 scripts/convert-toile.py
Expects: public/images/toile-source.png
Writes:  public/images/toile-left.png, public/images/toile-right.png
"""

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "images", "toile-source.png")
OUT_DIR = os.path.join(ROOT, "public", "images")
SCALE = 3

img = Image.open(SRC).convert("RGBA")
w, h = img.size
px = img.load()

transparent = Image.new("RGBA", (w, h), (0, 0, 0, 0))
tp = transparent.load()

for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if lum <= 6:
            continue
        t = min(1.0, (lum - 6) / 90.0)
        alpha = int(min(255, (0.35 + 0.65 * (t ** 0.7)) * 255))
        tp[x, y] = (r, g, b, alpha)

# Crop through the empty center so each panel is only its side cluster
left = transparent.crop((0, 0, 470, h))
right = transparent.crop((590, 0, w, h))

left_hq = left.resize((left.width * SCALE, left.height * SCALE), Image.Resampling.LANCZOS)
right_hq = right.resize((right.width * SCALE, right.height * SCALE), Image.Resampling.LANCZOS)
left_hq = left_hq.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=2))
right_hq = right_hq.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=2))

left_hq.save(os.path.join(OUT_DIR, "toile-left.png"), "PNG", optimize=True)
right_hq.save(os.path.join(OUT_DIR, "toile-right.png"), "PNG", optimize=True)
print("left", left_hq.size, "right", right_hq.size)
