# Avatar character set — generation prompts

Twelve characters. Each is rendered **on a transparent background** and composited in the app
onto a saturated disc whose colour comes from the chip the person picked in their profile, so
twelve files cover 144 distinct avatars and a person's chip and face are the same choice.

Target size in the UI is 40–80px, so silhouette and one accessory carry the whole
identification. Detail below that threshold is wasted.

---

## Shared style block

Prepend this to every character prompt.

```
3D character bust, stylised and clean, rendered in soft matte clay-plastic with gentle
subsurface warmth. Slightly oversized head, rounded simplified forms, no sharp edges.
Soft three-quarter studio key light from upper left with broad fill and gentle ambient
occlusion; no harsh speculars, no rim glow, no reflections. Facing camera straight on,
calm confident expression, mouth closed. Cropped at mid-chest, centred, head occupying
the upper two thirds of the frame. Limited palette of two or three clothing colours plus
skin. Flat even shading, no texture noise, no fabric weave.

Fully transparent background. No circle, no backdrop, no ground shadow, no platform.
Square 1:1 frame with even margin around the bust.
```

## Negative prompt

```
text, letters, numbers, logos, watermark, signature, playing cards, poker chips, casino
imagery, dice, money, background circle, background colour, gradient backdrop, drop
shadow on background, ground plane, photorealism, hyperrealistic skin pores, harsh rim
light, neon, glow, lens flare, busy pattern, extra limbs, deformed hands, hands in frame,
full body, side profile, looking away, open mouth, teeth, tongue
```

## Output spec

- 1024 × 1024 PNG, **transparent background**, no padding beyond the even margin.
- Deterministic filenames: `public/art/avatar-01.png` … `avatar-12.png`.
- Generate `avatar-01` first and pass it back as a style reference for the other eleven, so
  the set reads as one hand.
- Downscale to 256 × 256 and convert to WebP before committing. At 80px on screen, 256 is
  already 3× and anything larger is bytes nobody sees.

---

## The twelve

Each differs by **exactly one accessory** plus its silhouette. That constraint is what keeps
them readable at 44px — two accessories at that size become a smudge.

| # | Character | The one accessory | Clothing |
|---|---|---|---|
| 01 | Young woman, dark bob | Round wire glasses | Cream crewneck |
| 02 | Older man, grey swept-back hair | Thick moustache | Charcoal shirt, collar open |
| 03 | Young man, buzz cut | Over-ear headphones round his neck | Navy hoodie |
| 04 | Woman, long auburn hair | Wide-brim flat cap | Rust knit sweater |
| 05 | Man, bald, full dark beard | Toothpick at the corner of the mouth | Olive work jacket |
| 06 | Woman, curly hair tied up | Large hoop earrings | Deep teal blouse |
| 07 | Young man, curtain hair | Beanie pulled low | Mustard sweatshirt |
| 08 | Woman, sleek ponytail | Aviator sunglasses pushed up on the head | Black turtleneck |
| 09 | Older woman, silver pixie cut | Reading glasses on a chain | Plum cardigan |
| 10 | Man, box braids | Gold stud earring | Slate zip jacket |
| 11 | Woman, blunt fringe | Chunky scarf | Forest green coat |
| 12 | Man, neat side part | Bow tie | Burgundy waistcoat over white shirt |

Full prompt for one, as the pattern:

```
<shared style block>

A young woman with a dark chin-length bob, round thin wire glasses, wearing a plain cream
crewneck sweater. Warm mid skin tone.
```

---

## Why transparent rather than a baked circle

The reference bakes a flat saturated circle behind each character. Baking it here would fix
each face to one colour and make the profile's chip picker meaningless — the person would
choose a chip colour and then wear an unrelated disc. Compositing in code keeps one asset per
character, lets the disc take the chosen chip colour, and means a new colour never needs new
art.

Contrast is the one thing to watch: the character must read against every disc colour in
`CHIP_PRESETS`. Keeping clothing values mid-to-dark and skin warm handles that, which is why
no character above wears the same value as any preset.
