import type { AboutPath } from './about-path';

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

/**
 * The VISUAL half of the same handover: how opaque the Work wall still is at
 * path parameter `t`.
 *
 * The wall is the only anchored root left on the spine, and at t = 0 it sits
 * 34 units dead ahead of the camera at full opacity, full scale, centre of
 * frame — where world.ts's own materializeAmount returns exactly 1. So
 * setAboutMode(true)'s hard hide, which is right for the rest of the corridor,
 * is wrong for its first stretch: it blinks the wall away in one frame the
 * instant forward scroll crosses the handover. And the wall does have to go:
 * the corridor's opening beat is level travel straight TOWARD it.
 *
 * So it fades instead, reaching zero by the 'transition' beat — the last
 * moment the camera is still level and pointed at the wall, after which the
 * path pitches up and climbs and the hard hide is both fine and correct.
 *
 * Inverted smoothstep, matching materializeAmount's own curve, so the fade
 * reads as the same treatment the wall gets everywhere else rather than as a
 * second, linear one.
 */
export function workWallFadeAt(t: number, path: AboutPath): number {
  const end = path.tForBeat('transition');
  if (!(end > 0) || !Number.isFinite(t)) return 0;
  const k = Math.min(1, Math.max(0, t / end));
  return 1 - k * k * (3 - 2 * k);
}
