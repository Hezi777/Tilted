/**
 * The colour and geometry maths behind a rendered chip.
 *
 * Kept out of the component so it can be tested without a DOM, and so the rules that
 * matter — which ink survives on a face, how many spots fit a rim — are stated once.
 *
 * A chip has exactly three visual parts, and the trade has names for them:
 *   - the **body**, the field colour ("a red chip"),
 *   - the **edge spots** (inserts), the contrasting bands on the rim that let a stack
 *     be read edge-on,
 *   - the **inlay**, the pressed centre face carrying the denomination.
 *
 * Only the first two are chosen. The inlay tint and its ink are derived, because they
 * are entirely determined by the two colours in front of them.
 */

/** Where the spot band is stroked, in viewBox units. */
export const SPOT_RADIUS = 42.5;

/** Circumference of the spot band; the dash maths divides this. */
export const SPOT_CIRCUMFERENCE = 2 * Math.PI * SPOT_RADIUS;

export const MIN_SPOTS = 3;
export const MAX_SPOTS = 8;
export const DEFAULT_SPOTS = 6;

/** The edge-spot arrangement. Real chips call this the mould. */
export type ChipMould = "single" | "double";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parses `#rrggbb` (the only form the database stores). Null on anything else. */
export function parseHex(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

/** WCAG relative luminance. Unparseable input reads as dark, the safer default. */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const channel = (raw: number) => {
    const part = raw / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
  );
}

/** True for a chip pale enough to need dark ink and dark spots. */
export function isLight(hex: string): boolean {
  return luminance(hex) > 0.35;
}

/** Blends towards `target` by `amount` (0–1), returning `#rrggbb`. */
export function mix(hex: string, target: string, amount: number): string {
  const from = parseHex(hex);
  const to = parseHex(target);
  if (!from || !to) return hex;
  const channel = (a: number, b: number) =>
    Math.round(a + (b - a) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(from.r, to.r)}${channel(from.g, to.g)}${channel(from.b, to.b)}`;
}

/**
 * The spot colour for a set that has not chosen one.
 *
 * Real chips put cream spots on a dark body and dark spots on a pale one. Deriving the
 * spot from the body alone made a white chip's spots white, so it rendered as a blank
 * disc — hence the contrast flip rather than a straight tint.
 */
export function deriveEdgeColor(body: string): string {
  return isLight(body) ? "#3B2F2C" : "#F5EDE6";
}

/** The contrast the denomination must clear against its own face. */
const MIN_INLAY_CONTRAST = 4.5;

/** How hard the face is pushed away from the body, tried in order. */
const FACE_PUSH_STEPS = [0.14, 0.22, 0.3, 0.38, 0.46] as const;

/**
 * The inlay tint: the face pushed further from mid-tone than the body it sits in.
 *
 * Two jobs at once — lift the face off the body so it reads as a pressed disc, and give
 * the numeral printed on it something to contrast against. A fixed push serves neither
 * reliably: mid-tone bodies (the green and the pink are the awkward ones) sit far enough
 * from both inks that a small nudge leaves the number under 4.5:1. So the push grows
 * until the better ink clears the bar, which makes the rule self-tuning for whatever
 * colour a host picks rather than tuned per preset.
 */
export function faceColor(body: string): string {
  const target = isLight(body) ? "#ffffff" : "#000000";
  let face = mix(body, target, FACE_PUSH_STEPS[0]);
  for (const amount of FACE_PUSH_STEPS) {
    face = mix(body, target, amount);
    const best = Math.max(...INLAY_INKS.map((ink) => contrastRatio(face, ink)));
    if (best >= MIN_INLAY_CONTRAST) return face;
  }
  return face;
}

/** Contrast ratio between two colours, WCAG 2.x. */
export function contrastRatio(a: string, b: string): number {
  const high = Math.max(luminance(a), luminance(b));
  const low = Math.min(luminance(a), luminance(b));
  return (high + 0.05) / (low + 0.05);
}

/** The two inks a chip face is ever printed in. */
const INLAY_INKS = ["#1A1512", "#F5EDE6"] as const;

/**
 * The denomination ink. Derived from the face, never stored.
 *
 * Picks whichever ink actually wins on this face rather than splitting on a single
 * luminance threshold: a mid-tone body (the green at #14713D is the awkward one) sits
 * close enough to the boundary that a fixed cutoff hands it the weaker of the two.
 */
export function inlayInk(body: string): string {
  const face = faceColor(body);
  return INLAY_INKS.reduce((best, ink) =>
    contrastRatio(face, ink) > contrastRatio(face, best) ? ink : best,
  );
}

/**
 * The whole mould as one `stroke-dasharray`.
 *
 * Drawing N rotated rectangles is the obvious approach and the wrong one: a single
 * stroked circle, dashed at the right pitch, is the same picture in one attribute and
 * stays correct at any radius.
 *
 * Pitch is `circumference / count`; a single-spot mould fills half of each pitch, and a
 * double splits that half into two bars with a thin gap between them.
 */
export function spotDashArray(
  count: number,
  mould: ChipMould = "single",
): string {
  const clamped = Math.min(MAX_SPOTS, Math.max(MIN_SPOTS, Math.round(count)));
  const half = SPOT_CIRCUMFERENCE / clamped / 2;
  if (mould === "double") {
    const innerGap = half * 0.19;
    const bar = (half - innerGap) / 2;
    return `${bar.toFixed(3)} ${innerGap.toFixed(3)} ${bar.toFixed(3)} ${half.toFixed(3)}`;
  }
  return `${half.toFixed(3)} ${half.toFixed(3)}`;
}

/** Font size for the inlay, stepped down as the denomination gets longer. */
export function inlayFontSize(label: string): number {
  if (label.length <= 2) return 26;
  if (label.length === 3) return 22;
  return 17;
}

/**
 * The colours a real chip tray comes in.
 *
 * There is no formal standard, but the North American cash-game convention is
 * near-universal at the low end — black at $100 is the most consistent of all. Home sets
 * ship these colours with no printed value and the host assigns denominations, which is
 * exactly this product's situation: offer the convention, let the host rebind freely.
 *
 * The values are deliberately not attached. The same colour means different money in
 * different rooms, which is why the denomination row carries the amount.
 *
 * Note the trap these pairs encode: real chip colours do not rise in luminance with
 * value, so colour can never signal magnitude on its own.
 */
export const CHIP_PRESETS = [
  { name: "לבן", body: "#F4F1E8", edge: "#C1121F", convention: "$1" },
  { name: "אדום", body: "#C1121F", edge: "#F4F1E8", convention: "$5" },
  { name: "כחול", body: "#1D4E89", edge: "#F4F1E8", convention: "$10" },
  { name: "ירוק", body: "#14713D", edge: "#F4F1E8", convention: "$25" },
  { name: "שחור", body: "#14110F", edge: "#F4F1E8", convention: "$100" },
  { name: "סגול", body: "#5B2C83", edge: "#F4F1E8", convention: "$500" },
  { name: "צהוב", body: "#E8B21C", edge: "#14110F", convention: "$1000" },
  { name: "כתום", body: "#C4622D", edge: "#F4F1E8", convention: "" },
  { name: "ורוד", body: "#C9628A", edge: "#F4F1E8", convention: "" },
  { name: "תכלת", body: "#5FA8C7", edge: "#14110F", convention: "" },
  { name: "בורדו", body: "#8E1631", edge: "#F4F1E8", convention: "" },
  { name: "אפור", body: "#7A6B67", edge: "#F4F1E8", convention: "" },
] as const;

/** The colour a fresh denomination row starts on. */
export const DEFAULT_CHIP_BODY = "#C1121F";
export const DEFAULT_CHIP_EDGE = "#F4F1E8";
