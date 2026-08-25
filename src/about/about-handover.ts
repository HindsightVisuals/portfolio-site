/**
 * When the wheel changes owner.
 *
 * The corridor's t = 0 IS the Work rest — the camera path is anchored at the
 * Blender Work Page marker, the last marker with a level camera. So there is
 * no threshold to cross and no gap to interpolate: at the rest, forward scroll
 * belongs to the corridor and backward scroll belongs to the director. The
 * same camera, the same pose, a different owner.
 *
 * Pure and directional. The controller asks; this decides.
 *
 * Sign convention: a positive deltaPx is scrolling DOWN, which travels FORWARD
 * (deeper, -z). camera-director encodes the same rule as
 * `velocity -= pixels * SCROLL_GAIN`.
 */

/**
 * How close to the rest counts as "at" it, in world units.
 *
 * The settle tween lands on the rest to within a fraction of a unit and then
 * stops updating, so requiring exact equality would mean the corridor could
 * never be entered at all. 1.0 is comfortably larger than any residual the
 * settle leaves and far smaller than SPACING, so it cannot be reached from the
 * Home side.
 */
export const ENTER_EPS = 1.0;

const forward = (deltaPx: number): boolean => Number.isFinite(deltaPx) && deltaPx > 0;
const backward = (deltaPx: number): boolean => Number.isFinite(deltaPx) && deltaPx < 0;

export function shouldEnterCorridor(o: {
  open: boolean;
  cameraZ: number;
  restZ: number;
  deltaPx: number;
}): boolean {
  if (o.open || !forward(o.deltaPx)) return false;
  // At the rest OR already past it. "Past" matters: a hard flick can carry the
  // camera beyond the rest before the settle catches it, and beyond the rest
  // there is nothing left on the spine to travel to.
  return o.cameraZ <= o.restZ + ENTER_EPS;
}

export function shouldLeaveCorridor(o: { open: boolean; t: number; deltaPx: number }): boolean {
  return o.open && backward(o.deltaPx) && o.t <= 0;
}
