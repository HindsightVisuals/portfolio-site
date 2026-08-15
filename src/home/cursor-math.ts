/**
 * Pure math for the F15 cursor system — trail decay, blur ramps and the mount
 * gate. Kept free of DOM and globals so the whole testable surface of the
 * feature lives in one place; cursor.ts is the untested DOM/RAF shell around it.
 *
 * Spec: docs/superpowers/specs/2026-08-14-f15-cursor-system-design.md
 *
 * Every constant here is tune-by-eye — the values are a starting point for
 * review, not a tuned result.
 */

/** How long a trail point survives, in ms. Short by direction: a smear, not a ribbon. */
export const TRAIL_MS = 250;
/** Opacity of a point the instant it is left behind. It never exceeds this. */
export const TRAIL_PEAK_ALPHA = 0.2;
/** Stroke width at the head of the trail, in CSS px. */
export const TRAIL_HEAD_WIDTH = 10;
/** Stroke width at the tail of the trail, in CSS px. */
export const TRAIL_TAIL_WIDTH = 2;
/** Age at which the glass frost is strongest — late, so it peaks as the green dies. */
export const GLASS_PEAK_AGE = 0.6;
/** Peak backdrop blur, in CSS px. "Very lightly" per the direction. */
export const GLASS_MAX_BLUR_PX = 2;

export interface TrailPoint {
  x: number;
  y: number;
  /** Timestamp the point was sampled, in ms (performance.now() domain). */
  t: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Drop points that have outlived the trail window. Order is preserved (oldest first). */
export function pruneTrail(points: TrailPoint[], now: number): TrailPoint[] {
  return points.filter((p) => now - p.t < TRAIL_MS);
}

/** Normalised age of a point: 0 = just sampled, 1 = expired. Clamped at both ends. */
export function pointAge(p: TrailPoint, now: number): number {
  return clamp01((now - p.t) / TRAIL_MS);
}

/** Linear 20% -> 0% opacity ramp across a point's life. */
export function trailAlpha(age: number): number {
  return TRAIL_PEAK_ALPHA * (1 - clamp01(age));
}

/** Linear taper from head width to tail width across a point's life. */
export function trailWidth(age: number): number {
  return TRAIL_HEAD_WIDTH + (TRAIL_TAIL_WIDTH - TRAIL_HEAD_WIDTH) * clamp01(age);
}

/**
 * Blur for a point, quantised into thirds of its life. Bucketing rather than a
 * continuous ramp bounds the number of canvas filter state changes per frame —
 * three `ctx.filter` writes instead of one per segment.
 */
export function blurBucket(age: number): 0 | 1.5 | 3 {
  const a = clamp01(age);
  if (a < 1 / 3) return 0;
  if (a < 2 / 3) return 1.5;
  return 3;
}

/**
 * Backdrop-blur strength for the glass nodes: a triangular ramp that is zero at
 * birth, peaks at GLASS_PEAK_AGE, and returns to zero at expiry — so the frost
 * swells as the green fades and leaves nothing behind.
 */
export function glassStrength(age: number): number {
  const a = clamp01(age);
  const rising = a / GLASS_PEAK_AGE;
  const falling = (1 - a) / (1 - GLASS_PEAK_AGE);
  return GLASS_MAX_BLUR_PX * Math.min(rising, falling);
}

/**
 * Whether the cursor system mounts at all. Touch and other coarse pointers have
 * no hover state and no visible cursor to replace, so the whole feature is gated
 * off there and the OS cursor is left alone (F19).
 */
export function shouldMount(finePointer: boolean): boolean {
  return finePointer;
}
