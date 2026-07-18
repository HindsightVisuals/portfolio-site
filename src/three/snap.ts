/** Velocity magnitude below which direction bias is ignored (world units/s). */
const BIAS_THRESHOLD = 0.5;

/**
 * Choose the camera rest position to settle on: nearest rest, biased toward
 * the direction of travel so momentum carries you to the NEXT screen rather
 * than snapping backwards.
 */
export function resolveSnapTarget(z: number, velocity: number, restZs: number[]): number {
  const sorted = [...restZs].sort((a, b) => b - a); // descending: home first, deepest last
  let candidates = sorted;

  if (Math.abs(velocity) >= BIAS_THRESHOLD) {
    const ahead = sorted.filter((r) => (velocity < 0 ? r < z : r > z));
    if (ahead.length > 0) candidates = ahead;
  }

  let best = candidates[0];
  for (const r of candidates) {
    if (Math.abs(r - z) < Math.abs(best - z)) best = r;
  }
  return best;
}
