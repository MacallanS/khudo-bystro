"""Build PWA install icons from a full-bleed master.

- any (192/512): content ~82% of canvas, cream to the edges
- maskable (512): content ~56% (safe zone for circle masks)
- apple-touch-icon: 180 full-bleed any-style
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

CREAM = (255, 253, 248, 255)
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public"
MASTER_CANDIDATES = [
    OUT / "logo-chosen.jpg",
    OUT / "logo-chosen.png",
    OUT / "logo-source.png",
    Path(r"C:\Users\Tema\.cursor\projects\d-RussM\assets\khudo-icon-fullbleed.jpg"),
    OUT / "logo-source.jpg",
]


def is_paper_pixel(r: int, g: int, b: int, a: int) -> bool:
    """Outer white + warm cream card fill (not pencil graphite / blue trail)."""
    if a < 16:
        return True
    if r > 248 and g > 248 and b > 248:
        return True
    # Warm eggshell of the chosen logo card (~253,246,230)
    if r >= 240 and g >= 228 and b >= 210 and (r - b) <= 45 and abs(r - g) <= 30:
        return True
    if abs(r - CREAM[0]) <= 18 and abs(g - CREAM[1]) <= 18 and abs(b - CREAM[2]) <= 18:
        return True
    return False


def flatten_paper_bg(img: Image.Image) -> Image.Image:
    """Flood-fill from corners through paper → cream. Keeps enclosed wood tip."""
    w, h = img.size
    px = img.load()
    seen = bytearray(w * h)
    stack: list[tuple[int, int]] = [
        (0, 0),
        (w - 1, 0),
        (0, h - 1),
        (w - 1, h - 1),
        (w // 2, 0),
        (w // 2, h - 1),
        (0, h // 2),
        (w - 1, h // 2),
    ]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        r, g, b, a = px[x, y]
        if not is_paper_pixel(r, g, b, a):
            continue
        px[x, y] = CREAM
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return img


def load_master() -> Image.Image:
    src = next((p for p in MASTER_CANDIDATES if p.exists()), None)
    if src is None:
        raise SystemExit("No master logo found")
    print("master:", src)
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    side = min(w, h)
    img = img.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))
    flatten_paper_bg(img)
    base = Image.new("RGBA", (side, side), CREAM)
    base.paste(img, (0, 0), img)
    return base


def content_bbox(img: Image.Image, threshold: int = 12) -> tuple[int, int, int, int]:
    """Bounding box of non-cream pixels."""
    px = img.load()
    w, h = img.size
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            if abs(r - CREAM[0]) <= threshold and abs(g - CREAM[1]) <= threshold and abs(
                b - CREAM[2]
            ) <= threshold:
                continue
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
    if max_x < 0:
        return (0, 0, w, h)
    # small padding around artwork
    pad = max(2, side_pad := int(min(w, h) * 0.02))
    del side_pad
    return (
        max(0, min_x - pad),
        max(0, min_y - pad),
        min(w, max_x + 1 + pad),
        min(h, max_y + 1 + pad),
    )


def place_on_cream(art: Image.Image, canvas: int, fill_ratio: float) -> Image.Image:
    out = Image.new("RGBA", (canvas, canvas), CREAM)
    target = max(1, int(canvas * fill_ratio))
    aw, ah = art.size
    scale = min(target / aw, target / ah)
    nw, nh = max(1, int(aw * scale)), max(1, int(ah * scale))
    scaled = art.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (canvas - nw) // 2
    y = (canvas - nh) // 2
    out.paste(scaled, (x, y), scaled)
    # hard cream edges (no anti-alias fringe of wrong color)
    for i in range(canvas):
        out.putpixel((i, 0), CREAM)
        out.putpixel((i, canvas - 1), CREAM)
        out.putpixel((0, i), CREAM)
        out.putpixel((canvas - 1, i), CREAM)
    return out


def round_corners(img: Image.Image, radius_ratio: float = 0.22) -> Image.Image:
    """Bake soft rounded corners; outside = transparent (looks right in browser tabs)."""
    size = img.size[0]
    radius = max(1, int(size * radius_ratio))
    # Slightly inset so AA doesn't leave a hard square fringe
    inset = 0 if size <= 16 else 0
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (inset, inset, size - 1 - inset, size - 1 - inset),
        radius=radius,
        fill=255,
    )
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def save_png(img: Image.Image, path: Path) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    try:
        img.save(tmp, "PNG", optimize=True)
        tmp.replace(path)
    finally:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
    c = img.getpixel((0, 0))
    print(f"wrote {path.name} {img.size} corner={c}")


def preview_circle(img: Image.Image, path: Path) -> None:
    """Optional visual check: circular crop like Android."""
    size = img.size[0]
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    bg = Image.new("RGBA", (size, size), (230, 230, 230, 255))
    layered = Image.composite(img, bg, mask)
    save_png(layered, path)


def main() -> None:
    master = load_master()
    box = content_bbox(master)
    art = master.crop(box)
    print("content bbox:", box, "art:", art.size)

    # any icons — larger mark
    for size, name in [(192, "pwa-192.png"), (512, "pwa-512.png")]:
        save_png(place_on_cream(art, size, 0.82), OUT / name)

    # maskable — safe zone ~56%
    save_png(place_on_cream(art, 512, 0.56), OUT / "pwa-512-maskable.png")

    # Apple
    save_png(place_on_cream(art, 180, 0.82), OUT / "apple-touch-icon.png")

    # Tab favicons — rounded, transparent corners (not a raw square in the tab)
    fav16 = round_corners(place_on_cream(art, 16, 0.9), 0.28)
    fav32 = round_corners(place_on_cream(art, 32, 0.9), 0.24)
    fav48 = round_corners(place_on_cream(art, 48, 0.9), 0.22)
    save_png(fav16, OUT / "favicon-16.png")
    save_png(fav32, OUT / "favicon-32.png")
    save_png(fav48, OUT / "favicon-48.png")
    ico_path = OUT / "favicon.ico"
    # Multi-size ICO; rebuild each size rounded then pack via append_images
    ico16 = round_corners(place_on_cream(art, 16, 0.9), 0.28)
    ico32 = round_corners(place_on_cream(art, 32, 0.9), 0.24)
    ico48 = round_corners(place_on_cream(art, 48, 0.9), 0.22)
    ico48.save(
        ico_path,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[ico16, ico32],
    )
    print(f"wrote {ico_path.name} {ico_path.stat().st_size}b corner={ico48.getpixel((0, 0))}")

    # Clean square master for PWA rebuilds (opaque cream)
    save_png(place_on_cream(art, 1024, 0.88), OUT / "logo-source.png")

    # Home mark: transparent background, tight crop, larger on the sheet
    home = Image.new("RGBA", art.size, (0, 0, 0, 0))
    home.paste(art, (0, 0), art)
    # drop residual cream fringes inside art bbox
    px = home.load()
    for y in range(home.height):
        for x in range(home.width):
            r, g, b, a = px[x, y]
            if a and is_paper_pixel(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)
    # pad a little transparent margin for soft edges
    canvas = 1024
    home_out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    target = int(canvas * 0.92)
    scale = min(target / home.width, target / home.height)
    nw, nh = max(1, int(home.width * scale)), max(1, int(home.height * scale))
    scaled = home.resize((nw, nh), Image.Resampling.LANCZOS)
    home_out.paste(scaled, ((canvas - nw) // 2, (canvas - nh) // 2), scaled)
    save_png(home_out, OUT / "logo-home.png")

    # Previews outside public/ so they never ship to Pages
    prev = ROOT / "scripts" / "_icon-preview"
    prev.mkdir(exist_ok=True)
    preview_circle(Image.open(OUT / "pwa-512.png").convert("RGBA"), prev / "any-circle.png")
    preview_circle(
        Image.open(OUT / "pwa-512-maskable.png").convert("RGBA"),
        prev / "maskable-circle.png",
    )


if __name__ == "__main__":
    main()
