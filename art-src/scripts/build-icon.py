"""
Build every shipped icon from the one master mark.

The master is already drawn in the app's own tokens -- the tower is --light #F5F6F7 and
the clock face is --ink-950 #0B0B0F -- on a transparent ground, so nothing here recolours
anything. It crops, scales and composites.

The three platforms want different things and none of them is the default:

  any        512 and 192, the mark full size on the app's ground. Chrome's install prompt
             requires a 192; the 512 drives the splash.
  maskable   the same, with the mark small enough to survive an adaptive launcher. Android
             clips to a circle, a squircle or a square depending on the device, and the
             guaranteed-safe region is a circle of 80% diameter. The mark is tall and
             narrow, so fitting its *corners* inside that circle -- not just its height --
             puts the ceiling at 74%. 72% leaves a hair of margin.
  apple      180, opaque, and declared with a <link>: iOS ignores the manifest entirely,
             and an icon with transparency renders as a black slab. iOS rounds the corners
             itself, so the mark is inset rather than full-bleed.
"""

import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "art-src/masters/icon.png"
OUT = ROOT / "public/art"
GROUND = (11, 11, 15, 255)  # --ink-950

# Android's guaranteed-safe region is a circle of 80% diameter. A tall mark scaled to 80%
# of the height still pushes its corners outside that circle, so the real ceiling is
# whatever keeps the half-diagonal inside the radius.
MASKABLE_SAFE_DIAMETER = 0.80


def cropped_mark() -> Image.Image:
    mark = Image.open(MASTER).convert("RGBA")
    box = mark.getbbox()
    if box is None:
        raise SystemExit("the master is empty")
    return mark.crop(box)


def maskable_ceiling(mark: Image.Image) -> float:
    """The largest height fraction whose corners still sit inside the safe circle."""
    aspect = mark.width / mark.height
    half_diagonal_per_height = math.hypot(aspect / 2, 0.5)
    return (MASKABLE_SAFE_DIAMETER / 2) / half_diagonal_per_height


def composite(mark: Image.Image, size: int, coverage: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), GROUND)
    scale = (size * coverage) / max(mark.size)
    scaled = mark.resize(
        (max(1, round(mark.width * scale)), max(1, round(mark.height * scale))),
        Image.LANCZOS,
    )
    canvas.alpha_composite(
        scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2)
    )
    return canvas.convert("RGB")


if __name__ == "__main__":
    mark = cropped_mark()
    ceiling = maskable_ceiling(mark)
    print(f"mark {mark.size}, maskable ceiling {ceiling:.3f}")
    assert ceiling > 0.72, "the mark got wider; re-check the maskable coverage"

    for size in (192, 512):
        composite(mark, size, 0.80).save(OUT / f"icon-{size}.png")
        composite(mark, size, 0.72).save(OUT / f"icon-maskable-{size}.png")

    # iOS rounds the corners itself, so the mark is inset rather than full-bleed.
    composite(mark, 180, 0.72).save(OUT / "apple-touch-icon.png")
    print("wrote icon-192, icon-512, icon-maskable-192, icon-maskable-512, apple-touch-icon")
