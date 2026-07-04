# يولّد أيقونات موحّدة (ميزان عدل) بهوية الكحلي/الذهبي — للسحاب (public) وأندرويد (mipmap).
# التشغيل: python3 scripts/make_all_icons.py

from PIL import Image, ImageDraw
import os

NAVY = (18, 41, 77)        # #12294d
NAVY_DK = (12, 28, 56)     # #0c1c38
GOLD = (212, 175, 55)      # #d4af37
WHITE = (245, 245, 240)

ROOT = os.path.join(os.path.dirname(__file__), "..")
PUB = os.path.join(ROOT, "public")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")


def draw_scales(d, S, color, lw, ox=0, oy=0):
    cx = S / 2 + ox
    top = S * 0.20 + oy
    beam_y = S * 0.30 + oy
    bx = S * 0.22
    pan_y = S * 0.56 + oy
    base_y = S * 0.80 + oy
    d.line([(cx, top), (cx, base_y)], fill=color, width=lw)
    d.line([(cx - bx, beam_y), (cx + bx, beam_y)], fill=color, width=lw)
    r = S * 0.025
    d.ellipse([cx - r, top - r, cx + r, top + r], fill=color)
    pan_w = S * 0.16
    for sign in (-1, 1):
        ex = cx + sign * bx
        d.line([(ex, beam_y), (ex - pan_w, pan_y)], fill=color, width=max(2, lw // 2))
        d.line([(ex, beam_y), (ex + pan_w, pan_y)], fill=color, width=max(2, lw // 2))
        d.arc([ex - pan_w, pan_y - pan_w * 0.5, ex + pan_w, pan_y + pan_w * 0.9],
              start=10, end=170, fill=color, width=lw)
    base_w = S * 0.16
    d.line([(cx - base_w, base_y), (cx + base_w, base_y)], fill=color, width=lw)
    d.line([(cx - base_w * 0.6, base_y), (cx, base_y - S * 0.04)], fill=color, width=lw)
    d.line([(cx + base_w * 0.6, base_y), (cx, base_y - S * 0.04)], fill=color, width=lw)


def full_icon(S, shape="rounded"):
    """أيقونة كاملة: خلفية كحلي + حلقة ذهبية + ميزان أبيض."""
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if shape == "circle":
        d.ellipse([0, 0, S - 1, S - 1], fill=NAVY)
    elif shape == "square":
        d.rectangle([0, 0, S, S], fill=NAVY)
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=NAVY)
    # حلقة ذهبية زخرفية
    m = int(S * 0.06)
    if shape == "circle":
        d.ellipse([m, m, S - m, S - m], outline=GOLD, width=max(2, int(S * 0.012)))
    else:
        d.rounded_rectangle([m, m, S - m, S - m], radius=int(S * 0.16),
                            outline=GOLD, width=max(2, int(S * 0.012)))
    draw_scales(d, S, WHITE, max(3, int(S * 0.022)))
    return img


def foreground_icon(S):
    """أيقونة تكيّفية أمامية: شفافة + ميزان أبيض في المنطقة الآمنة الوسطى (~62%)."""
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    inner = int(S * 0.62)
    sub = Image.new("RGBA", (inner, inner), (0, 0, 0, 0))
    ds = ImageDraw.Draw(sub)
    draw_scales(ds, inner, WHITE, max(3, int(inner * 0.03)))
    img.paste(sub, ((S - inner) // 2, (S - inner) // 2), sub)
    return img


# ——— أيقونات السحاب (public) ———
full_icon(192, "rounded").save(os.path.join(PUB, "icon-192x192.png"))
full_icon(512, "rounded").save(os.path.join(PUB, "icon-512x512.png"))
full_icon(512, "square").save(os.path.join(PUB, "icon-maskable-512.png"))
full_icon(180, "rounded").save(os.path.join(PUB, "apple-icon.png"))
full_icon(32, "rounded").save(os.path.join(PUB, "favicon-32.png"))
print("✓ أيقونات السحاب (public)")

# ——— أيقونات أندرويد ———
DENS = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FG = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
for dens, sz in DENS.items():
    outdir = os.path.join(RES, f"mipmap-{dens}")
    os.makedirs(outdir, exist_ok=True)
    full_icon(sz, "rounded").save(os.path.join(outdir, "ic_launcher.png"))
    full_icon(sz, "circle").save(os.path.join(outdir, "ic_launcher_round.png"))
    foreground_icon(FG[dens]).save(os.path.join(outdir, "ic_launcher_foreground.png"))
print("✓ أيقونات أندرويد (كل الكثافات + التكيّفية)")

# ——— خلفية الأيقونة التكيّفية = كحلي ———
bg_xml = os.path.join(RES, "values", "ic_launcher_background.xml")
with open(bg_xml, "w", encoding="utf-8") as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
            '    <color name="ic_launcher_background">#12294d</color>\n</resources>\n')
print("✓ خلفية تكيّفية كحلي #12294d")
