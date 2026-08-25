import * as THREE from 'three';
import { blenderToWorld, BLENDER_TO_WORLD } from './about-coords';
import { ABOUT_MARKERS } from './about-markers';

/**
 * The ferro blob's own path through the corridor.
 *
 * Measured 2026-08-25 from `00_Blend\01_Comms\Threejs Flow1.blend`, object
 * `Ferro Fluid`. Adam: "I'd like the ferro to first appear in the scroll
 * transition from frame 160 and beyond… and begin to come into frame and follow
 * the movement path that it has animated."
 *
 * It drops in from above, settles to mezzanine height, then travels forward
 * with the camera holding roughly 3-4.5 units ahead of it. Two flat holds — the
 * capabilities and contact beats — are where it waits for you.
 *
 * The blob is not a world object: it renders on its own canvas and is placed by
 * CSS rect. These points are projected through the corridor camera to produce
 * that rect (see about-project.ts), which is what makes a flat shader appear to
 * occupy a place in the world.
 */

const FIRST = ABOUT_MARKERS[0];
const LAST = ABOUT_MARKERS[ABOUT_MARKERS.length - 1];
/** Frames to `t`, the same mapping the camera path uses. */
const frameToT = (f: number): number => (f - FIRST.frame) / (LAST.frame - FIRST.frame);

interface Key { t: number; x: number; y: number; z: number }

/** Blender-space keys, verbatim. x/y/z are Blender axes; the conversion is below. */
const KEYS: readonly Key[] = Object.freeze([
  { t: frameToT(157), x: -0.014, y: 36.840, z: 27.332 },
  { t: frameToT(165), x: -0.014, y: 37.176, z: 20.043 },
  { t: frameToT(172), x: -0.676, y: 41.457, z: 21.785 },
  { t: frameToT(177), x: -1.075, y: 43.792, z: 18.186 },
  { t: frameToT(209), x: -1.075, y: 43.792, z: 18.186 },
  { t: frameToT(228), x: -0.635, y: 50.484, z: 18.186 },
  { t: frameToT(236), x: -0.635, y: 50.484, z: 18.186 },
  { t: frameToT(257), x:  0.002, y: 58.131, z: 18.245 },
]);

/** Where it first exists, and where the fade begins. */
export const FERRO_ARRIVE_T = KEYS[0].t;
/** Where the fade completes — the same key the descent lands on. */
const FERRO_VISIBLE_T = KEYS[1].t;

/**
 * Object-space radius in world units. Blender dimensions are 0.58 across, so
 * 0.29 in radius, at the same scale everything else converts by.
 */
export const FERRO_RADIUS = 0.29 * BLENDER_TO_WORLD;

/**
 * Tolerance, in `t`, for snapping a query onto a measured keyframe.
 *
 * Callers derive `t` from `frame` via division (see frameToT), so a query
 * meant for an exact frame can land a few ten-thousandths short of that key's
 * `t` from float rounding. Inside a fast-moving segment that shortfall reads
 * as a real position error rather than the rounding noise it is — most
 * visibly at the start of a hold, where the segment just before it is not
 * flat. Snapping anything this close directly onto the key it's aimed at
 * fixes that without touching the measured values themselves.
 */
const T_EPSILON = 1e-3;

/**
 * Its world position at `t`, anchored the way the camera path is: offsets from
 * the anchor marker, so Blender's absolute placement is discarded.
 */
export function ferroWorldAt(t: number, anchor: THREE.Vector3, into?: THREE.Vector3): THREE.Vector3 {
  const out = into ?? new THREE.Vector3();
  const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;

  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  let local = 1;

  const snapped = KEYS.find((k) => Math.abs(clamped - k.t) <= T_EPSILON);
  if (snapped) {
    a = b = snapped;
    local = 0;
  } else if (clamped <= KEYS[0].t) {
    a = b = KEYS[0];
    local = 0;
  } else {
    for (let i = 1; i < KEYS.length; i++) {
      if (clamped <= KEYS[i].t) {
        a = KEYS[i - 1];
        b = KEYS[i];
        const span = b.t - a.t;
        local = span > 0 ? (clamped - a.t) / span : 0;
        break;
      }
    }
  }

  const bx = a.x + (b.x - a.x) * local;
  const by = a.y + (b.y - a.y) * local;
  const bz = a.z + (b.z - a.z) * local;

  const world = blenderToWorld({
    x: bx - FIRST.blender.x,
    y: by - FIRST.blender.y,
    z: bz - FIRST.blender.z,
  });
  return out.copy(world).add(anchor);
}

const smoothstep = (v: number): number => {
  const c = Math.min(1, Math.max(0, v));
  return c * c * (3 - 2 * c);
};

/**
 * Opacity at `t`. Zero until it arrives, then up across the descent so the
 * fade and the drop are one move — Adam's call over a blur, which reads as a
 * lens effect rather than distance and costs a full-viewport filter per frame.
 */
export function ferroFadeAt(t: number): number {
  if (!Number.isFinite(t) || t < FERRO_ARRIVE_T) return 0;
  return smoothstep((t - FERRO_ARRIVE_T) / (FERRO_VISIBLE_T - FERRO_ARRIVE_T));
}
