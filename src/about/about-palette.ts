// src/about/about-palette.ts
import * as THREE from 'three';
import type { AboutPath } from './about-path';

/** Near-black. The corridor's default; matches the case study pages' dark ground. */
export const NIGHT_GROUND = '#0b0b0b';
/** Pale. The capabilities beat flips light — spec §Beats 5. */
export const DAY_GROUND = '#fdfdfd';

/**
 * Atmosphere particle ink, per ground. The value shipped hard-coded in
 * atmosphere.ts as 0.07, which is correct on the pale ground it was authored
 * against; on near-black it disappears entirely, so night raises it.
 */
export const DAY_INK = 0.07;
export const NIGHT_INK = 0.82;

export interface AboutPalette {
  /** CSS colour for the page ground. */
  ground: string;
  /** Atmosphere ink, 0..1, fed to the uInk uniform. */
  ink: number;
  /** Whether the cursor should switch to its on-dark treatment. */
  onDark: boolean;
}

/**
 * How much of the beat either side of a flip the crossfade occupies. Kept well
 * inside the beat so the change never coincides with a marker: landing a
 * palette flip exactly on the pose the camera settles at reads as a cut, which
 * is the one thing the spec rules out.
 */
const FADE = 0.6;

const smoothstep = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

const nightC = new THREE.Color(NIGHT_GROUND);
const dayC = new THREE.Color(DAY_GROUND);
const mixed = new THREE.Color();

/**
 * Ground brightness at `t`: 0 = night, 1 = day.
 *
 * Night from the start, up through the client wall; day across capabilities;
 * night again from contact onward. Both transitions are ramps placed in the
 * approach, so the world dims and brightens as a property of position rather
 * than as an event.
 */
function dayAmount(t: number, path: AboutPath): number {
  const wall = path.tForBeat('clientWall');
  const caps = path.tForBeat('capabilities');
  const contact = path.tForBeat('contact');

  const upStart = wall + (caps - wall) * (1 - FADE);
  const downEnd = contact + (path.tForBeat('ai') - contact) * FADE;

  if (t <= upStart) return 0;
  if (t < caps) return smoothstep((t - upStart) / (caps - upStart));
  if (t <= contact) return 1;
  if (t < downEnd) return 1 - smoothstep((t - contact) / (downEnd - contact));
  return 0;
}

export function paletteAt(t: number, path: AboutPath): AboutPalette {
  const d = dayAmount(t, path);
  mixed.copy(nightC).lerp(dayC, d);
  return {
    ground: `#${mixed.getHexString()}`,
    ink: NIGHT_INK + (DAY_INK - NIGHT_INK) * d,
    // Flip the cursor at the midpoint of the crossfade, which is also where the
    // ground crosses mid-grey.
    onDark: d < 0.5,
  };
}
