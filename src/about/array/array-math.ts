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

/**
 * How far an idling panel drifts, in the disc's local units.
 *
 * Sixteen times the original 0.012. The ambient is meant to read as the array
 * breathing, and it kept coming back as too subtle.
 */
export const AMBIENT_AMPLITUDE = 0.192;

/**
 * How fast the ambient noise field evolves.
 *
 * Now roughly 2x the original 0.13/0.11/0.17, after two rounds of it reading
 * as too slow. Paired with a 16x amplitude, so the panels travel a long way
 * AND get there briskly.
 */
export const AMBIENT_RATE_X = 0.252;
export const AMBIENT_RATE_Y = 0.216;
export const AMBIENT_RATE_Z = 0.33;

/**
 * Time constant for the cursor's follow, in seconds.
 *
 * The sphere chases the pointer rather than snapping to it: roughly 63% of the
 * remaining distance is covered each `tau`. A TUNING VALUE — larger is heavier.
 */
export const CURSOR_TAU = 0.22;

/**
 * The signed shortest way from `from` to `to`, in radians, always in (-PI, PI].
 *
 * The cursor lives on a closed ring, so the naive difference would send it the
 * long way round whenever it crosses the seam — a full lap of the dish instead
 * of a nudge.
 */
export function shortestAngleDelta(from: number, to: number): number {
  const TWO_PI = Math.PI * 2;
  let d = (to - from) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d <= -Math.PI) d += TWO_PI;
  return d;
}

/**
 * Ease an angle toward a target, framerate-independently.
 *
 * Uses `1 - exp(-dt/tau)` rather than a fixed lerp factor, so the motion is the
 * same at 30fps and 144fps. A fixed factor would make the cursor heavier on a
 * slow machine, which is exactly backwards.
 */
export function dampAngle(current: number, target: number, dt: number, tau: number): number {
  if (tau <= 0 || dt <= 0) return tau <= 0 ? target : current;
  return current + shortestAngleDelta(current, target) * (1 - Math.exp(-dt / tau));
}

/**
 * The vertex displacement, in local units, that drives emission to full.
 *
 * Emission follows how far a panel has actually MOVED, not just how near the
 * cursor is — so ambient drift lights panels the same way the sphere does.
 *
 * Sized for the ambient, not the explode: the explode moves a vertex several
 * times further, so a reference scaled to it would leave the ambient's
 * contribution invisible. The explode simply saturates instead.
 */
export const DISPLACE_GLOW_REF = 0.12;

/**
 * A small constant lift on every surface.
 *
 * The rig has world strength 0, so unlit faces render at literally nothing and
 * the dish loses its silhouette against the background. This is a viewing
 * concession, not something measured from Blender — keep it low enough that the
 * scene still reads as lit by its own emission.
 */
export const AMBIENT_LIGHT = 0.22;

/**
 * Black distance fog, as multiples of the camera-to-dish distance.
 *
 * The terrain runs about 12 units back; crushing it stops the far hills
 * competing with the array for attention. NEAR sits past the dish so the
 * subject itself is never veiled.
 */
export const FOG_NEAR_SCALE = 1.15;
export const FOG_FAR_SCALE = 3.1;

/**
 * How finely the scratch map tiles across the dish.
 *
 * The coord is the rest position in local XZ, and the dish spans about 2 units,
 * so this is roughly "tiles across the diameter, halved".
 *
 * LARGER MEANS FINER, which is the opposite of how it gets described: to make
 * the scratches BIGGER, turn this DOWN. 9.0 read as obvious tiling, 4.5 still
 * too fine.
 */
export const SCRATCH_SCALE = 1.125;

/**
 * Strength of the fake environment the metals reflect.
 *
 * A PBR metal has NO diffuse response — it can only show reflections — so
 * `metalness: 1` with no environment map renders BLACK, and ambient light does
 * nothing for it. The rig's world strength is 0, so there is no HDRI to lean
 * on; a tiny procedural gradient stands in.
 */
export const ENV_INTENSITY = 1.1;
/** The ground is textured, so it needs far less help than bare metal. */
export const ENV_INTENSITY_GROUND = 0.45;

/**
 * Base colour of the tower, struts and stand.
 *
 * Much lighter than it looks like it should be, because for a METAL the base
 * colour IS the reflectance — there is no diffuse term to fall back on. At
 * 0x1a1a1a the structure reflected under 1% of anything and rendered pure
 * black however much light was added; measured 0 lit pixels against 6499 for a
 * flat-white control.
 */
export const METAL_COLOR = 0x6e6e6e;

/**
 * Not quite 1. A hair of diffuse gives the ambient light something to act on,
 * which matters in a scene this dark — a pure metal ignores it entirely.
 */
export const METAL_METALNESS = 0.88;

/**
 * Time constant for the dish's lean, in seconds.
 *
 * Four times the cursor's, so the dish swings with real weight behind the
 * pointer instead of tracking it rigidly.
 */
export const DISC_TAU = CURSOR_TAU * 4;
