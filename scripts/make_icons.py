# يولّد أيقونات PWA لتطبيق Yemeni Laws: ميزان عدل أبيض/ذهبي على خلفية فيروزية.
# يُنتج public/icon-192x192.png و icon-512x512.png و apple-icon.png و icon-maskable-512.png

from PIL import Image, ImageDraw
import os

TEAL = (14, 107, 94)       # #0e6b5e
TEAL_DK = (9, 74, 65)
GOLD = (212, 175, 55)      # ذهبي
WHITE = (245, 245, 240)
OUT = os.path.join(os.path.dirname(__file__), "..", "public")
os.makedirs(OUT, exist_ok=True)


def draw_scales(d, S, color, lw):
    cx = S / 2
    top = S * 0.20          # أعلى العمود
    beam_y = S * 0.30       # ارتفاع العارضة
    bx = S * 0.22           # نصف عرض العارضة
    pan_y = S * 0.56        # ارتفاع الكفّتين
    base_y = S * 0.80       # القاعدة

    # العمود الرأسي
    d.line([(cx, top), (cx, base_y)], fill=color, width=lw)
    # العارضة الأفقية
    d.line([(cx - bx, beam_y), (cx + bx, beam_y)], fill=color, width=lw)
    # حلقة علوية
    r = S * 0.025
    d.ellipse([cx - r, top - r, cx + r, top + r], fill=color)

    # خيوط وكفّتان على الجانبين
    pan_w = S * 0.16
    for sign in (-1, 1):
        ex = cx + sign * bx
        # خيطان مائلان إلى مركز الكفّة
        d.line([(ex, beam_y), (ex - pan_w, pan_y)], fill=color, width=max(2, lw // 2))
        d.line([(ex, beam_y), (ex + pan_w, pan_y)], fill=color, width=max(2, lw // 2))
        # الكفّة (قوس سفلي)
        d.arc([ex - pan_w, pan_y - pan_w * 0.5, ex + pan_w, pan_y + pan_w * 0.9],
              start=10, end=170, fill=color, width=lw)

    # القاعدة
    base_w = S * 0.16
    d.line([(cx - base_w, base_y), (cx + base_w, base_y)], fill=color, width=lw)
    d.line([(cx - base_w * 0.6, base_y), (cx, base_y - S * 0.04)], fill=color, width=lw)
    d.line([(cx + base_w * 0.6, base_y), (cx, base_y - S * 0.04)], fill=color, width=lw)


def make(size, fname, rounded=True, bg_pad=0.0):
    S = size
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # الخلفية (مربّع كامل للأيقونات maskable، أو حواف مدوّرة)
    if rounded:
        rad = int(S * 0.22)
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=rad, fill=TEAL)
    else:
        d.rectangle([0, 0, S, S], fill=TEAL)
    # حلقة ذهبية خفيفة كزخرفة
    m = int(S * 0.06)
    d.rounded_rectangle([m, m, S - m, S - m], radius=int(S * 0.16),
                        outline=GOLD, width=max(2, int(S * 0.012)))
    draw_scales(d, S, WHITE, max(3, int(S * 0.022)))
    img.save(os.path.join(OUT, fname))
    print("✓", fname, f"{S}x{S}")


make(192, "icon-192x192.png", rounded=True)
make(512, "icon-512x512.png", rounded=True)
make(512, "icon-maskable-512.png", rounded=False)   # maskable: مربّع كامل
make(180, "apple-icon.png", rounded=True)
make(32, "favicon-32.png", rounded=True)
