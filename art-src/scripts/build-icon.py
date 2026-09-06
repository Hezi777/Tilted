"""
Build the shipped icons from the one master mark.

The master is already drawn in the app's own tokens -- the tower is --light #F5F6F7 and
the clock face is --ink-950 #0B0B0F -- on a transparent ground, so nothing here recolours
anything. It only crops, scales and composites.

Three outputs, because they have three different jobs:

  mark.webp        the tower alone, tightly cropped, for the masthead. Transparent, so it
                   sits on whatever the page is.
  icon-512.png     the launcher icon: the mark on the app's own ground.
  icon-maskable.png the same, with the mark at 56% instead of 76%. Android clips roughly a
                   fifth off every edge of an adaptive icon, and an icon drawn to the edge
                   loses its roof to that.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "art-src/masters/icon.png"
OUT = ROOT / "public/art"
GROUND = (11, 11, 15, 255)  # --ink-950


def cropped_mark() -> Image.Image:
    """The mark with its transparent margin removed, so layout can trust its box."""
    mark = Image.open(MASTER).convert("RGBA")
    box = mark.getbbox()
    if box is None:
        raise SystemExit("the master is empty")
    return mark.crop(box)


def composite(mark: Image.Image, size: int, coverage: float) -> Image.Image:
    """The mark centred on the app's ground, scaled to `coverage` of the shorter side."""
    canvas = Image.new("RGBA", (size, size), GROUND)
    target = int(size * coverage)
    scale = target / max(mark.size)
    scaled = mark.resize(
        (max(1, round(mark.width * scale)), max(1, round(mark.height * scale))),
        Image.LANCZOS,
    )
    canvas.alpha_composite(
        scaled,
        ((size - scaled.width) // 2, (size - scaled.height) // 2),
    )
    return canvas


if __name__ == "__main__":
    mark = cropped_mark()
    print(f"mark cropped to {mark.size}")

    # 512 tall is well past 2x anywhere the masthead renders it.
    height = 512
    mark.resize(
        (round(mark.width * height / mark.height), height), Image.LANCZOS
    ).save(OUT / "mark.webp", quality=90, method=6)

    composite(mark, 512, 0.76).convert("RGB").save(OUT / "icon-512.png")
    composite(mark, 512, 0.56).convert("RGB").save(OUT / "icon-maskable.png")
    print("wrote mark.webp, icon-512.png, icon-maskable.png")
