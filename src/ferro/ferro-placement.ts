import { worldPerPx } from '../three/framing';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Placement { x: number; y: number; scale: number }

export interface PlacementOpts {
  /** Camera distance from the z=0 plane the object sits on. */
  distance: number;
  fovYDeg: number;
  /** Object-space radius of the blob at scale 1, displacement included. */
  boundingRadius: number;
}

/**
 * A CSS rect in viewport pixels → the object transform that renders into it.
 *
 * Everything the blob does — corner, nav, beat 4, and the travel between them —
 * is expressed this way, so the WebGL drawing buffer never resizes. Resizing it
 * per frame during a transition is the expensive way to move a GL object.
 */
export function placementFor(rect: Rect, viewport: { w: number; h: number }, opts: PlacementOpts): Placement {
  const wpp = worldPerPx(opts.distance, opts.fovYDeg, viewport.h);
  if (!Number.isFinite(wpp) || wpp <= 0 || viewport.w <= 0) return { x: 0, y: 0, scale: 0 };

  // Fit the smaller dimension: the blob is round, so the tighter axis governs.
  // Beat 4's frame is 713x664 — fitting width there would overflow it vertically.
  const fitPx = Math.min(rect.w, rect.h);
  const scale = (fitPx * wpp) / (2 * opts.boundingRadius);

  // Screen y grows downward, world y grows upward.
  const dx = rect.x + rect.w / 2 - viewport.w / 2;
  const dy = rect.y + rect.h / 2 - viewport.h / 2;
  return { x: dx * wpp, y: -dy * wpp, scale };
}
