# Art source

Nothing in here is served. Everything under `public/` is, so 1024px masters and retired
assets live outside it — otherwise a phone on an apartment connection pays for artwork it
never displays.

- `masters/` — the 1024px PNGs the generator produced, plus the original twelve chip
  characters at full size. Regenerate a WebP from these rather than from a WebP.
- `retired/` — superseded by the current visual system. Kept because generating them again
  is not free, and a retired asset is occasionally the fastest answer to "what did this used
  to look like".

## Producing a shipped file

```
sips -Z 512 masters/avatar-aner.png --out /tmp/a.png
cwebp -q 82 -resize 256 0 /tmp/a.png -o ../public/art/avatar-aner.webp
```

256px covers the largest place an avatar renders (96px at 2×). The state illustrations go to
320px because they render up to 112px.

Prompts for every one of these live in `docs/art-prompts.md`.
