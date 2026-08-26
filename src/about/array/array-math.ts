/**
 * Curves for the communications array, lifted verbatim from the Blender rig.
 *
 * Every distance here is in the DISC'S LOCAL SPACE — the GN group's
 * `Object Info` used transform space RELATIVE, so proximity was measured after
 * the cursor was brought into `Circle`'s space. The disc's world scale is
 * 0.732 and its local radius is about 1.611; converting any of these to world
 * units breaks all of them at once.
 */

/** Map Range "From Min" on the explode band. */
export const EXPLODE_NEAR = 0.2;
/** Map Range "From Max" on the explode band. */
export const EXPLODE_FAR = 0.41;
/** Scale Elements output at the near threshold — panels shrink toward the cursor. */
export const SCALE_MIN = 0.57;
/** Scale Elements output past the far threshold — the closed, rest state. */
export const SCALE_MAX = 1;

/**
 * The emission Map Range's "From Max".
 *
 * Deliberately far tighter than the explode band: the glow is a thin shell
 * against the cursor while the geometry opens over a much wider radius. That
 * separation is what makes the effect read as focused attention rather than a
 * soft blob — preserve the ratio when tuning.
 */
export const GLOW_RADIUS = 0.11;
/** Emission strength at zero surface distance. */
export const EMISSION_MAX = 4.6;

/** The Vector Math MULTIPLY feeding Scale Elements' Center input. */
export const CENTRE_SCALE = 1.5;

/**
 * The cursor sphere's radius expressed in the disc's local space.
 *
 * Measured: world radius 0.2504 against the disc's world scale of 0.732.
 */
export const CURSOR_RADIUS = 0.3421;

/**
 * The cursor sphere's radius in WORLD units.
 *
 * The disc-local value above is this divided by the disc's world scale of
 * 0.732. Any other mesh running the panel shader — the scaffold disc, which
 * has its own transform — needs its own division, so the world figure is the
 * one that travels.
 */
export const CURSOR_WORLD_RADIUS = 0.2504;

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Distance from a point to the cursor sphere's SURFACE, not its centre.
 *
 * Blender's Geometry Proximity measured against the sphere's mesh; against a
 * 512-face UV sphere the faceting error is well under 1% of radius, so the
 * closed form stands in exactly.
 */
export function surfaceDistance(centreDist: number, radius: number = CURSOR_RADIUS): number {
  return centreDist - radius;
}

/** Panel scale from surface distance. Near the cursor panels SHRINK, opening gaps. */
export function panelScale(d: number): number {
  const t = clamp01((d - EXPLODE_NEAR) / (EXPLODE_FAR - EXPLODE_NEAR));
  return SCALE_MIN + (SCALE_MAX - SCALE_MIN) * t;
}

/** Emission strength from surface distance — 4.6 at the surface, 0 past the shell. */
export function emissionStrength(d: number): number {
  return EMISSION_MAX * (1 - clamp01(d / GLOW_RADIUS));
}

/**
 * Signal beam emission, `10 / (d^4 + 1)`.
 *
 * A scripted driver in the Blender file, with `d` a LOC_DIFF between Cursor and
 * Cylinder in WORLD space — the one distance here that is not disc-local.
 */
export function signalFalloff(d: number): number {
  return 10 / (d ** 4 + 1);
}
