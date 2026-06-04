from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSETS_DIR = ROOT / "assets"
STATIC_IMAGES_DIR = ROOT / "static" / "images"
PNG_PATH = ASSETS_DIR / "app-icon.png"
ICO_PATH = ASSETS_DIR / "app-icon.ico"
FAVICON_PATH = STATIC_IMAGES_DIR / "logo.png"
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)


def points_on_infinity(size: int) -> list[tuple[float, float]]:
    cx = cy = size / 2
    x_radius = size * 0.285
    y_radius = size * 0.205
    return [
        (
            cx + math.sin(t) * x_radius,
            cy + math.sin(2 * t) * y_radius,
        )
        for t in [2 * math.pi * i / 240 for i in range(241)]
    ]


def draw_smooth_polyline(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[float, float]],
    *,
    fill: tuple[int, int, int, int],
    width: int,
) -> None:
    radius = width / 2
    for start, end in zip(points, points[1:]):
        draw.line((start, end), fill=fill, width=width)
    for x, y in points:
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def draw_rounded_square(draw: ImageDraw.ImageDraw, size: int) -> None:
    pad = size * 0.105
    rect = (pad, pad, size - pad, size - pad)
    radius = size * 0.185
    shadow_offset = size * 0.018

    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_rect = (
        rect[0],
        rect[1] + shadow_offset,
        rect[2],
        rect[3] + shadow_offset,
    )
    shadow_draw.rounded_rectangle(shadow_rect, radius=radius, fill=(15, 23, 42, 42))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(1, size * 0.018)))
    draw.bitmap((0, 0), shadow)

    draw.rounded_rectangle(rect, radius=radius, fill=(252, 253, 255, 255))
    draw.rounded_rectangle(rect, radius=radius, outline=(210, 222, 238, 255), width=max(1, round(size * 0.012)))


def render_icon(size: int) -> Image.Image:
    scale = 4
    canvas_size = size * scale
    image = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    draw_rounded_square(draw, canvas_size)

    path = points_on_infinity(canvas_size)
    stroke = max(2 * scale, round(canvas_size * 0.092))
    draw_smooth_polyline(draw, path, fill=(15, 23, 42, 255), width=stroke)

    node_specs = [
        (0.145, (35, 184, 217, 255), 1.02),
        (0.355, (20, 184, 166, 255), 0.9),
        (0.650, (37, 99, 235, 255), 0.9),
        (0.855, (35, 184, 217, 255), 1.02),
    ]
    node_radius = max(2 * scale, round(canvas_size * 0.041))
    for offset, color, multiplier in node_specs:
        x, y = path[round(offset * (len(path) - 1))]
        radius = node_radius * multiplier
        draw.ellipse(
            (x - radius, y - radius, x + radius, y + radius),
            fill=color,
            outline=(255, 255, 255, 255),
            width=max(1 * scale, round(canvas_size * 0.012)),
        )

    return image.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    STATIC_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    icon_images = [render_icon(size) for size in ICO_SIZES]
    source = render_icon(1024)
    source.save(PNG_PATH)
    source.save(FAVICON_PATH)
    icon_images[-1].save(ICO_PATH, sizes=[(size, size) for size in ICO_SIZES])

    print(f"Wrote {PNG_PATH}")
    print(f"Wrote {ICO_PATH}")
    print(f"Wrote {FAVICON_PATH}")


if __name__ == "__main__":
    main()
