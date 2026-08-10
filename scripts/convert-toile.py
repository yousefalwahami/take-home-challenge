from PIL import Image
import os

"""
Convert the dark toile source into Castleton Green (#00563B) on white.
Usage: py -3 scripts/convert-toile.py
Expects public/images/toile-source.png
"""

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "images", "toile-source.png")
OUT_DIR = os.path.join(ROOT, "public", "images")

img = Image.open(SRC).convert("RGBA")
pixels = img.load()
w, h = img.size
CR, CG, CB = 0, 86, 59

transparent = Image.new("RGBA", (w, h), (0, 0, 0, 0))
tp = transparent.load()

for y in range(h):
    for x in range(w):
        r, g, b, a = pixels[x, y]
        lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        line = max(0.0, min(1.0, (lum - 5.0) / 100.0))
        green_strength = max(0.0, min(1.0, (g - max(r, b) * 0.25) / 90.0))
        strength = min(1.0, max(line, green_strength) ** 0.72 * 1.15)
        tp[x, y] = (CR, CG, CB, int(strength * 255))

white = Image.new("RGBA", (w, h), (255, 255, 255, 255))
composited = Image.alpha_composite(white, transparent)
transparent.save(os.path.join(OUT_DIR, "toile-castleton-transparent.png"))
composited.convert("RGB").save(
    os.path.join(OUT_DIR, "toile-castleton-white.png"), quality=95, optimize=True
)
print("wrote white + transparent Castleton toile", w, h)
