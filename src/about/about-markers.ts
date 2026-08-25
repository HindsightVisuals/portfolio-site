import type { BlenderVec } from './about-coords';

/**
 * The beats the scrub travels through. 'anchor' is not a beat anyone sees — it
 * is the Work Page marker, where the path attaches to the site (see D2).
 */
export type BeatId =
  | 'anchor' | 'transition' | 'lander' | 'team'
  | 'clientWall' | 'capabilities' | 'contact' | 'ai';

export interface AboutMarker {
  id: BeatId;
  /** Blender frame, 30fps. Used only as the path's parameter axis. */
  frame: number;
  /** Camera position in Blender's own space, verbatim from the inventory. */
  blender: BlenderVec;
  /** Blender camera pitch in degrees. 90 is level; 180 looks straight up. */
  pitchDeg: number;
}

/**
 * Where the path attaches to the site's world (D2). Frame 64 is the last marker
 * with a level camera, so handover costs no orientation jump — the site's
 * camera is already level when it arrives at About.
 */
export const ANCHOR_FRAME = 64;

/**
 * Measured 2026-08-21 from `00_Blend\01_Comms\Threejs Flow.blend`; the full
 * 44-object survey is in docs/research/about-blender-inventory.md.
 *
 * Every marker sits at x = 0 and carries pitch only — no yaw, no roll. That is
 * why about-coords exposes pitchToQuaternion rather than a full euler.
 */
export const ABOUT_MARKERS: readonly AboutMarker[] = Object.freeze([
  { id: 'anchor',       frame: 64,  blender: { x: 0, y: 29.74, z: 0     }, pitchDeg: 90.0  },
  { id: 'transition',   frame: 89,  blender: { x: 0, y: 34.73, z: 0.31  }, pitchDeg: 105.3 },
  { id: 'lander',       frame: 105, blender: { x: 0, y: 36.83, z: 6.02  }, pitchDeg: 179.9 },
  { id: 'team',         frame: 121, blender: { x: 0, y: 36.84, z: 12.15 }, pitchDeg: 179.9 },
  { id: 'clientWall',   frame: 149, blender: { x: 0, y: 36.84, z: 17.27 }, pitchDeg: 179.9 },
  { id: 'capabilities', frame: 204, blender: { x: 0, y: 39.26, z: 18.23 }, pitchDeg: 89.9  },
  { id: 'contact',      frame: 231, blender: { x: 0, y: 45.93, z: 18.23 }, pitchDeg: 89.9  },
  { id: 'ai',           frame: 258, blender: { x: 0, y: 55.46, z: 18.23 }, pitchDeg: 89.9  },
]);
