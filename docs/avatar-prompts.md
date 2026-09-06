# Avatar character set — generation prompts

Twelve characters, one per player seat. These are the app's **only** avatar system: the
profile picks one of these, and the same image renders at the table, in history and on the
share card. Nothing else draws a face.

The disc is **baked into the image**, not composited in code. That was the right call when the
avatar had to follow a chip colour the player chose; now the character *is* the choice, so a
second colour system underneath it only adds a thing that can disagree with itself.

Target size is 40–96px. Silhouette plus one accessory carries the whole identification —
anything finer is invisible at the size this ships.

---

## Shared style block

Prepend to every character prompt, unchanged.

```
3D character bust, stylised and clean, rendered in soft matte clay-plastic with gentle
subsurface warmth and no gloss. Slightly oversized head, rounded simplified forms, no
sharp edges, no sculpted detail finer than a fingertip.

Lighting: broad soft key from the upper left, deep ambient fill, and a subtle cool violet
rim light along the upper right edge of the head and shoulder. No harsh speculars, no
neon, no glow, no lens effects.

Composition: facing camera straight on, calm confident expression, mouth closed, cropped
at mid-chest, centred, head occupying the upper two thirds. The bust sits on a flat,
fully saturated circular background that fills the square frame edge to edge, with the
shoulders cropped by the circle's lower edge. No shadow cast onto the circle, no
gradient, no vignette, no texture in the background — one flat colour only.

Palette: two or three clothing colours plus skin. Muted, desaturated clothing so the
character reads against its own saturated backdrop.
```

## Negative prompt

```
text, letters, numbers, logos, watermark, signature, playing cards, poker chips, casino
imagery, dice, money, gradient background, textured background, vignette, drop shadow,
ground plane, glossy skin, photorealism, skin pores, harsh rim light, neon, glow, lens
flare, busy pattern, extra limbs, deformed hands, hands in frame, full body, side
profile, three-quarter turn, looking away, open mouth, teeth, tongue, hat brim covering
eyes
```

## Output spec

- 1024 × 1024 PNG, the circle filling the frame edge to edge.
- Filenames `avatar-01.png` … `avatar-12.png`.
- **Generate `avatar-01` first and pass it back as a style reference for the other
  eleven.** Without that, twelve prompts produce twelve unrelated illustration styles.
- Downscale to 256 × 256 and convert to WebP before committing. At 96px on screen that is
  still better than 2×, and the current PNG set is 3.2 MB for the same job.

---

## The twelve

The disc colour is part of the identity, so it is fixed per character. These twelve are
saturated enough to be the only saturated thing on a charcoal screen, and distinct from each
other at thumbnail size — no two adjacent hues.

| # | Disc | Character | The one accessory | Clothing |
|---|---|---|---|---|
| 01 | `#F2795B` coral | Young woman, dark bob | Round wire glasses | Bone crewneck |
| 02 | `#F5C542` amber | Older man, grey swept-back hair | Thick moustache | Charcoal shirt |
| 03 | `#7B5CFF` violet | Young man, buzz cut | Headphones round the neck | Slate hoodie |
| 04 | `#3DDC97` mint | Woman, long auburn hair | Flat cap | Warm grey knit |
| 05 | `#FF4D6A` rose | Bald man, full dark beard | Toothpick at the mouth | Olive jacket |
| 06 | `#22B8FF` sky | Woman, curls tied up | Large hoop earrings | Deep teal blouse |
| 07 | `#FF8A3D` tangerine | Young man, curtain hair | Beanie pulled low | Sand sweatshirt |
| 08 | `#1FB97A` jade | Woman, sleek ponytail | Aviators pushed up on the head | Black turtleneck |
| 09 | `#B9A5FF` lilac | Older woman, silver pixie cut | Reading glasses on a chain | Plum cardigan |
| 10 | `#4ECDC4` teal | Man, box braids | Single gold stud earring | Slate zip jacket |
| 11 | `#E8556B` raspberry | Woman, blunt fringe | Chunky scarf | Forest green coat |
| 12 | `#F5D06A` sand | Man, neat side part | Bow tie | Burgundy waistcoat |

Full prompt for one, as the pattern:

```
<shared style block>

A young woman with a dark chin-length bob and round thin wire glasses, wearing a plain
bone-coloured crewneck sweater. Warm mid skin tone. Flat saturated coral #F2795B circular
background.
```

---

## Why one accessory, and why muted clothing

At 44px a second accessory becomes a smudge, so the set stops being tellable apart exactly
where it matters most — the seats around a live table. And because each character sits on its
own saturated disc, saturated clothing on top of it produces two competing colours in a 44px
circle; keeping the clothing muted lets the disc do the identifying and the face do the
recognising.

## What replaces what

`public/art/chip-01.png` … `chip-12.png` are the previous set. They move to
`public/art/_archive/` in the same commit that points `ChipAvatar` at the new files —
archiving them before the replacements exist would 404 every avatar in the app.
