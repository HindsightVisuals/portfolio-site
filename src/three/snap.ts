/** Velocity magnitude below which direction bias is ignored (world units/s). */
const BIAS_THRESHOLD = 0.5;

/**
 * Quiet period after the last wheel event that counts as "the user stopped
 * scrolling", in ms.
 *
 * Comfortably longer than the gap between events inside a continuous gesture —
 * a trackpad delivers roughly every 16ms, a mouse-wheel notch train roughly
 * every 50ms — so sustained scrolling never trips it and you can ride straight
 * through to a further page. Short enough that letting go feels answered
 * immediately.
 */
export const SCROLL_IDLE_MS = 100;

/**
 * Whether the camera should stop coasting and settle onto a rest.
 *
 * Two independent triggers, either of which fires:
 *
 *  1. **Scroll-end** — the wheel has been quiet for SCROLL_IDLE_MS. This is the
 *     one that matters. Settling used to wait solely on trigger 2, and with
 *     velocity decaying at exp(-2.2t) a hard scroll coasted well over a second
 *     before the snap even began. Now the moment you stop, it goes.
 *  2. **Velocity floor** — momentum has died on its own below `snapBelow`. A
 *     safety net for the coast that runs out before the idle timer notices, and
 *     for any caller that never stamps a scroll time.
 *
 * A camera that is not moving at all has nothing to settle, so zero velocity is
 * always false — otherwise a resting camera would re-settle every frame.
 */
export function shouldSnapNow(
  velocity: number,
  msSinceLastScroll: number,
  snapBelow: number,
  idleMs = SCROLL_IDLE_MS,
): boolean {
  if (velocity === 0) return false;
  if (msSinceLastScroll >= idleMs) return true;
  return Math.abs(velocity) < snapBelow;
}

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
