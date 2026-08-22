/**
 * The wipe's geometry, in viewport percentages.
 *
 * Direction: the panel enters from the RIGHT and its leading edge travels LEFT.
 * The Figma annotation says "swipes right", but the beat-3 render shows black on
 * the right with white to its left, and the emblem it grows from sits at the
 * top-right of the nav. The render and the emblem's position agree; the wording
 * does not. See the spec, §3.
 */

/** Teeth down the leading edge. Eight reads as a sawtooth at 1080p without
 *  turning into a comb. */
export const WIPE_TEETH = 8;

/** How far a tooth juts, in viewport-width percent. */
const TOOTH_DEPTH = 6;

/** Overshoot at each end so the edge fully clears the viewport. */
const LEAD_IN = 100 + TOOTH_DEPTH;
const LEAD_OUT = -TOOTH_DEPTH;

const clamp01 = (t: number): number => (Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0);

/**
 * The panel's clip at `progress` (0 = nothing revealed, 1 = fully covering).
 *
 * Point count is FIXED at 2*WIPE_TEETH+3 for every progress, because GSAP tweens
 * a polygon by interpolating its numbers pairwise — a polygon that gains or
 * loses a point mid-tween hard-swaps instead of animating.
 *
 * The first two points are the right-hand corners; everything after is the
 * sawtooth edge, walked bottom to top.
 */
export function sawtoothClip(progress: number): string {
  const t = clamp01(progress);
  const edge = LEAD_IN + (LEAD_OUT - LEAD_IN) * t;
  const pts: string[] = ['100% 0%', '100% 100%'];
  const steps = 2 * WIPE_TEETH;
  for (let i = 0; i <= steps; i++) {
    const y = 100 - (100 * i) / steps;
    // Odd points jut left, even points sit on the edge — the alternation IS the
    // sawtooth.
    const x = edge + (i % 2 === 1 ? -TOOTH_DEPTH : 0);
    pts.push(`${x.toFixed(3)}% ${y.toFixed(3)}%`);
  }
  return `polygon(${pts.join(', ')})`;
}

export interface FlyingCell {
  /** Viewport percent. */
  x: number;
  y: number;
  /** CSS px. */
  size: number;
  /** Degrees. */
  rotate: number;
}

/**
 * Cells that break off and run ahead of the edge. Deterministic — a fixed table,
 * not randomness — so the DOM nodes can be built once and only their transforms
 * updated, and so the tests can assert real behaviour.
 *
 * Bigger cells lead; smaller ones trail further into the outgoing page, which is
 * what makes the edge read as breaking apart rather than sliding.
 */
const FLYERS: ReadonlyArray<{ y: number; size: number; lead: number; rotate: number }> =
  Object.freeze([
    { y: 12, size: 96, lead: 10, rotate: -45 },
    { y: 30, size: 64, lead: 20, rotate: 45 },
    { y: 48, size: 120, lead: 6, rotate: -45 },
    { y: 66, size: 72, lead: 17, rotate: 45 },
    { y: 84, size: 88, lead: 12, rotate: -45 },
  ]);

export function flyingCells(progress: number): FlyingCell[] {
  const t = clamp01(progress);
  const edge = LEAD_IN + (LEAD_OUT - LEAD_IN) * t;
  return FLYERS.map((f) => ({
    x: edge - f.lead,
    y: f.y,
    size: f.size,
    rotate: f.rotate,
  }));
}
