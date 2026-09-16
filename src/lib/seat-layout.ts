/**
 * The arc table's rail geometry, as pure maths -- no React, no DOM.
 *
 * Pulled out of `PokerTableArc` so the loading skeleton can lay its placeholder
 * seats out on the exact same curve the real table will settle into, instead of
 * guessing at a shape that jumps once the data lands.
 */

/** The rail, as a function of how many people are around it.
 *
 * A second row was the wrong answer. A real table does not grow a second rank of
 * chairs when a seventh person sits down -- you end up further from it, seeing
 * more of its surface, and everyone spreads further around the same rim. So the
 * table recedes progressively: the apex climbs, the ellipse narrows and deepens
 * (which is what "seeing more of its depth" means in projection), and the seats
 * reach further along a rail that now has the arc length to hold them.
 *
 * All values are percentages of the component's box.
 */
export function railGeometry(count: number) {
  // 0 at three or fewer, 1 at eight, so the change is gradual rather than a jump.
  const t = Math.min(1, Math.max(0, (count - 3) / 5));
  return {
    // The apex barely moves. Letting it climb was the obvious way to buy room and
    // it is the wrong one: the pot lives at the top of this screen, and a rail that
    // rises far enough to matter rises straight into it.
    apex: 30 - 4 * t,
    // Curvature comes from DEPTH, never from width. Narrowing the ellipse buys the
    // same curve and costs the thing that matters: measured on screen, a table
    // narrowed this way was still only 359px wide at the bottom of a 390px phone,
    // so it stopped being full-bleed and grew black wedges down both sides at
    // exactly the player counts that need the room most. Holding the width and
    // deepening instead keeps the felt edge-to-edge below the rim -- the rim still
    // curves away at the sides, which is what the reference does too.
    insetX: 35,
    height: 128 + 290 * t,
    // Capped so the outermost seat's amount pill -- which is wider than the avatar
    // it sits under -- still clears the edge of the box.
    reach: 26 + 10 * t,
    t,
  };
}

export type Rail = ReturnType<typeof railGeometry>;

/** The box's aspect, so a vertical percentage can be compared with a horizontal one. */
export const BOX_ASPECT = 1.18;

/**
 * Every seat's place on the rail, spaced evenly *along the curve*.
 *
 * Spacing them evenly in x is the obvious thing and it looks wrong: near the apex
 * the rail is flat, so neighbours get no vertical offset and end up visually
 * closer than the ones out on the shoulders, which have both. Walking the curve
 * and placing seats at equal arc length gives every neighbour the same gap.
 *
 * Derived from the ellipse the table is actually drawn with, so a seat cannot
 * drift off the rim when the geometry changes -- it is the same curve by
 * construction.
 */
export function railPoints(rail: Rail, count: number): { left: string; top: string }[] {
  const rx = 50 + rail.insetX;
  const ry = rail.height / 2;
  const sagAt = (dx: number) => ry * (1 - Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2)));

  const STEPS = 240;
  const xs: number[] = [];
  const lengths: number[] = [];
  let total = 0;
  for (let step = 0; step <= STEPS; step += 1) {
    const dx = -rail.reach + (2 * rail.reach * step) / STEPS;
    if (step > 0) {
      const previous = xs[step - 1];
      total += Math.hypot(dx - previous, (sagAt(dx) - sagAt(previous)) * BOX_ASPECT);
    }
    xs.push(dx);
    lengths.push(total);
  }

  return Array.from({ length: count }, (_, index) => {
    if (count === 1) return { left: "50%", top: `${rail.apex}%` };
    const target = (total * index) / (count - 1);
    let step = lengths.findIndex((length) => length >= target);
    if (step < 0) step = STEPS;
    const dx = xs[step];
    return { left: `${50 + dx}%`, top: `${rail.apex + sagAt(dx)}%` };
  });
}

/**
 * The narrowest screen this table is drawn on.
 *
 * `railPoints` returns percentages, and a percentage gap only becomes a tap target
 * once it has a width to be a percentage *of*. The container is
 * `w-full max-w-[450px]`, so the binding case is the narrow phone, not the cap.
 */
export const REFERENCE_WIDTH_PX = 390;

/**
 * Seats give up size only as fast as the rail actually runs out of room.
 *
 * This ladder is not a taste judgement, it is measured. `railPoints` spaces seats by
 * equal arc length, so the gap between adjacent centres shrinks with every player
 * added; a fixed per-tier width does not. The two used to be written independently and
 * they disagreed -- from six players up, adjacent seat buttons genuinely overlapped in
 * the DOM, both at `z-20`, so a tap in the overlap resolved to whichever painted later
 * rather than the one under the thumb. On the ordinary night, where the host enters
 * everyone else's rebuys from one phone, that credited the wrong player's money.
 *
 * So `width` here is the largest Tailwind step that still fits the closest adjacent
 * gap at that exact count, at `REFERENCE_WIDTH_PX`. `seat-layout.test.ts` re-derives
 * the gaps from `railPoints` and fails if any tier outgrows its room, which is what
 * stops the two drifting apart again.
 *
 * The avatar is allowed to overflow its own button at the tightest tiers: the button
 * is the tap target and must not overlap, while a few pixels of avatar spilling past
 * its rounded corner is only cosmetic and costs no correctness.
 *
 * Known limit, recorded rather than hidden: past six opponents the button drops below
 * the 48px floor in `docs/design-system.md`. Nine opponents leaves 27px of rail per
 * seat on a 390px phone, and no choice of width fixes that -- ten 44px targets need
 * more span than the screen has. Above seven players this arc needs to stop being an
 * arc; that is a product decision, not a geometry one.
 */
export function railTier(count: number): { avatar: string; width: string } {
  if (count <= 3) return { avatar: "size-16", width: "w-24" };
  if (count <= 4) return { avatar: "size-14", width: "w-17" };
  if (count <= 5) return { avatar: "size-10", width: "w-13" };
  if (count <= 6) return { avatar: "size-8", width: "w-11" };
  if (count <= 7) return { avatar: "size-6", width: "w-9" };
  if (count <= 8) return { avatar: "size-6", width: "w-7" };
  if (count <= 9) return { avatar: "size-6", width: "w-6" };
  if (count <= 11) return { avatar: "size-5", width: "w-5" };
  return { avatar: "size-4", width: "w-4" };
}

/** The drawn width of a tier, in px, for the test that checks it against the rail. */
export function railTierWidthPx(count: number): number {
  const step = Number(railTier(count).width.replace("w-", ""));
  return step * 4;
}

/**
 * The closest two adjacent seats come, horizontally, at `REFERENCE_WIDTH_PX`.
 *
 * Horizontal rather than straight-line on purpose: the pair that collides is always
 * the one straddling the apex, where the rail is flat and the vertical offset is
 * effectively zero, so the horizontal gap is the whole of the separation there.
 */
export function minAdjacentGapPx(count: number): number {
  if (count < 2) return Number.POSITIVE_INFINITY;
  const points = railPoints(railGeometry(count), count);
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    const here = Number.parseFloat(points[index].left);
    const next = Number.parseFloat(points[index + 1].left);
    closest = Math.min(closest, (Math.abs(next - here) / 100) * REFERENCE_WIDTH_PX);
  }
  return closest;
}
