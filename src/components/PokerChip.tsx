import {
  DEFAULT_SPOTS,
  deriveEdgeColor,
  faceColor,
  inlayFontSize,
  inlayInk,
  spotDashArray,
  SPOT_RADIUS,
  type ChipMould,
} from "@/lib/chip-art";
import { cn } from "@/lib/utils";

/**
 * A poker chip drawn from its two real colours.
 *
 * Replaces the fixed set of chip renders in public/art, which only covered
 * ₪20/₪30/₪50/₪100 — any other denomination fell back to the generic "+" chip, so a
 * five-denomination set rendered as four identical chips.
 *
 * Drawn as SVG rather than pulled from a chip library: a set may hold any colour the
 * host owns, so the artwork has to be generated from that colour rather than chosen
 * from a collection. Tinting a photographic master was the other candidate and fails
 * concretely — `hue-rotate` preserves saturation and lightness, so cream, black and
 * grey are unreachable, and it tints body and spots together, which is the one thing
 * this component exists to keep apart.
 *
 * Geometry sits on a 0 0 100 100 viewBox, so the chip scales by CSS width alone with no
 * `transform: scale()` to fight the layout. The whole edge mould is a single dashed
 * circle rather than N rotated rectangles — see `spotDashArray`.
 */
export function PokerChip({
  color,
  edgeColor,
  label,
  spots = DEFAULT_SPOTS,
  mould = "single",
  className,
}: {
  /** Body colour. Chip sets store #rrggbb. */
  color: string;
  /** Edge-spot colour. Null or omitted derives a contrasting one from the body. */
  edgeColor?: string | null;
  /**
   * Denomination on the inlay. Omit below about 32px, where it cannot be read and the
   * chip is doing the job of a colour token instead.
   */
  label?: string;
  spots?: number;
  mould?: ChipMould;
  className?: string;
}) {
  const body = color;
  const edge = edgeColor ?? deriveEdgeColor(body);
  const face = faceColor(body);
  const ink = inlayInk(body);

  // Deterministic so the markup is stable between server and client render. The
  // gradient body is identical for every chip, so two chips sharing an id share an
  // identical definition.
  const gradientId = `chip-sheen-${body.replace(/[^0-9a-z]/gi, "")}`;

  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={label ? `ז׳יטון ${label}` : "ז׳יטון"}
      className={cn("size-10 shrink-0", className)}
    >
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="50%" fx="35%" fy="28%" r="72%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
          <stop offset="62%" stopColor="#ffffff" stopOpacity="0.03" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.16" />
        </radialGradient>
      </defs>

      {/* The seat of the chip. Without it the disc reads as a sticker, not an object. */}
      <circle cx="50" cy="51.5" r="48" fill="rgb(0 0 0 / 0.35)" />
      <circle cx="50" cy="50" r="48" fill={body} />

      <circle
        cx="50"
        cy="50"
        r={SPOT_RADIUS}
        fill="none"
        stroke={edge}
        strokeWidth="11"
        strokeDasharray={spotDashArray(spots, mould)}
        /* Rotated so a spot never lands on the vertical axis, where it reads as a seam. */
        transform="rotate(15 50 50)"
      />

      <circle cx="50" cy="50" r="47.25" fill="none" stroke="rgb(0 0 0 / 0.25)" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="36.25" fill="none" stroke={edge} strokeWidth="1.5" opacity="0.9" />
      <circle cx="50" cy="50" r="30" fill={face} />
      <circle cx="50" cy="50" r="30" fill="none" stroke="rgb(0 0 0 / 0.22)" strokeWidth="1" />

      {label ? (
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          fill={ink}
          fontSize={inlayFontSize(label)}
          fontWeight="700"
          fontFamily="var(--font-numerals), ui-sans-serif, sans-serif"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {label}
        </text>
      ) : null}

      {/*
        The sheen is a physical offset and does not mirror under dir="rtl". The chip is
        radially symmetric, so that is harmless here — but it must never be paired with
        mirrored logical positioning.
      */}
      <circle cx="50" cy="50" r="48" fill={`url(#${gradientId})`} />
    </svg>
  );
}
