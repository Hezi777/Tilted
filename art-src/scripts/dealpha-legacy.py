"""
Key the baked black background out of the original twelve chip characters.

They were generated as RGB with no alpha, so they arrived as a character sitting on a
black square. The new set is RGBA, and mixing the two puts black tiles in the picker.

A global "black becomes transparent" would punch holes through the characters, which
contain plenty of near-black themselves -- the black chip body, the eyes, every outline.
So the background is found by flooding inward from the four corners instead: only pixels
connected to the edge are removed, and anything enclosed by the character stays.

The flood leaves a dark fringe where the artwork was anti-aliased against black, so the
alpha is eroded by a pixel and the remaining edge is unpremultiplied against black to
pull that halo back out.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SENTINEL = (255, 0, 255)
FLOOD_THRESHOLD = 60


def dealpha(src: Path, dest: Path) -> None:
    original = Image.open(src).convert("RGB")
    flooded = original.copy()
    width, height = flooded.size

    for seed in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
        ImageDraw.floodfill(flooded, seed, SENTINEL, thresh=FLOOD_THRESHOLD)

    marked = np.array(flooded).astype(np.int16)
    background = np.all(np.abs(marked - np.array(SENTINEL)) < 12, axis=-1)

    alpha = Image.fromarray(np.where(background, 0, 255).astype(np.uint8))
    # MinFilter erodes: it pulls the edge in by a pixel, taking the darkest ring of
    # anti-aliased pixels with it.
    alpha = alpha.filter(ImageFilter.MinFilter(3))
    # Then soften what is left so the cut does not read as a stencil.
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.6))

    rgb = np.array(original).astype(np.float32)
    a = np.array(alpha).astype(np.float32) / 255.0

    # The edge pixels are the character blended with black. Dividing by the coverage
    # recovers the character's own colour, which is what stops a grey halo.
    with np.errstate(divide="ignore", invalid="ignore"):
        recovered = np.where(a[..., None] > 0.05, rgb / np.clip(a[..., None], 0.05, 1.0), rgb)
    recovered = np.clip(recovered, 0, 255).astype(np.uint8)

    out = np.dstack([recovered, (a * 255).astype(np.uint8)])
    Image.fromarray(out, "RGBA").save(dest)


if __name__ == "__main__":
    source_dir = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    for path in sorted(source_dir.glob("chip-*.png")):
        dealpha(path, out_dir / path.name)
        print("keyed", path.name)
