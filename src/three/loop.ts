export const SPINE_PERIOD = 240;

/** Velocity magnitude below which direction bias is ignored (mirrors snap.ts). */
const BIAS_THRESHOLD = 0.5;

/** Shortest signed delta from -> to on a circle of the given period. */
export function wrapDelta(from: number, to: number, period = SPINE_PERIOD): number {
  const raw = (to - from) % period;
  const half = period / 2;
  if (raw > half) return raw - period;
  if (raw < -half) return raw + period;
  return raw;
}

/** The instance of `anchor` (anchor + k·period) nearest to `reference`. */
export function nearestWrapped(anchor: number, reference: number, period = SPINE_PERIOD): number {
  return anchor + period * Math.round((reference - anchor) / period);
}

/** True when a and b refer to the same spine position across wraps. */
export function sameSpot(a: number, b: number, period = SPINE_PERIOD, eps = 0.5): boolean {
  return Math.abs(wrapDelta(a, b, period)) < eps;
}

/**
 * Circular snap resolver: nearest rest by wrapped distance, biased toward the
 * travel direction. Returns an ABSOLUTE z near the query position.
 */
export function resolveSnapTargetLooped(
  z: number,
  velocity: number,
  restZs: number[],
  period = SPINE_PERIOD,
): number {
  let candidates = restZs.map((r) => ({ r, d: wrapDelta(z, nearestWrapped(r, z, period), period) }));

  if (Math.abs(velocity) >= BIAS_THRESHOLD) {
    // ahead = in the direction of travel; when a rest's nearest instance is
    // behind, its instance one period along in the travel direction is ahead.
    candidates = candidates.map(({ r, d }) => {
      if (velocity < 0 && d > 0) return { r, d: d - period };
      if (velocity > 0 && d < 0) return { r, d: d + period };
      return { r, d };
    });
    const ahead = candidates.filter(({ d }) => (velocity < 0 ? d <= 0 : d >= 0));
    if (ahead.length > 0) candidates = ahead;
  }

  let best = candidates[0];
  for (const c of candidates) {
    if (Math.abs(c.d) < Math.abs(best.d)) best = c;
  }
  return z + best.d;
}
