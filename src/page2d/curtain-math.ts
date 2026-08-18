/**
 * Pure geometry for the curtain wave. No DOM, so the shape, its idle warp and
 * the pointer-crossing test are all testable without a browser.
 *
 * The rest shape is sampled from the Figma vector `24:1174`: a 1920x1081 frame
 * whose filled region sits below the wave, dipping to roughly 109px at x≈1019
 * and returning to ~0 at both edges.
 */

/** The SVG user-space the path is authored in. Scaled to the viewport by CSS. */
export const CURTAIN_VIEW_W = 1920;
export const CURTAIN_VIEW_H = 200;

/** How far the wave dips below the top edge at rest, in view units. */
const REST_DIP = 109;
/** Idle warp amplitude — deliberately tiny; this is keep-alive, not decoration. */
export const WARP_AMPLITUDE = 6;
/** How far the whole curve drops when the region above it is hovered. */
export const HOVER_PULL = 26;
/** Horizontal samples used to draw the curve. Enough to read as smooth at 1920. */
const SAMPLES = 96;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The rest curve, fitted to the Figma path: near zero at both edges, with the
 * dip weighted toward the right of centre where Figma's control points bunch.
 */
const smoothstep = (t: number): number => {
  const v = clamp01(t);
  return v * v * (3 - 2 * v);
};

/** Where the curve leaves and rejoins the top edge, and where it bottoms out —
 *  read off Figma's control points (flat until x≈270, deepest at x≈1020,
 *  back to the edge by x≈1650, of a 1920 frame). */
const CURVE_START = 270 / CURTAIN_VIEW_W;
const CURVE_PEAK = 1020 / CURTAIN_VIEW_W;
const CURVE_END = 1650 / CURTAIN_VIEW_W;

function restY(x: number): number {
  const u = clamp01(x / CURTAIN_VIEW_W);
  // Flat tails either side, a single asymmetric dip between — the longer run
  // out to the right is what gives Figma's curve its lean.
  if (u <= CURVE_START || u >= CURVE_END) return 0;
  const t =
    u < CURVE_PEAK
      ? (u - CURVE_START) / (CURVE_PEAK - CURVE_START)
      : (CURVE_END - u) / (CURVE_END - CURVE_PEAK);
  return REST_DIP * smoothstep(t);
}

/**
 * Height of the wave at `x`, in view units, measured down from the top edge.
 *
 * `t` is elapsed seconds. `pull` is 0..1 for the elastic hover drop. Two sine
 * terms at unrelated frequencies keep the idle warp from reading as a loop.
 */
export function curtainY(x: number, t: number, pull = 0): number {
  const warp =
    WARP_AMPLITUDE * Math.sin(x * 0.0031 + t * 0.21) +
    WARP_AMPLITUDE * 0.55 * Math.sin(x * 0.0072 - t * 0.13);
  return restY(x) + warp + HOVER_PULL * clamp01(pull);
}

/**
 * The filled path: down the right edge, across the bottom, up the left edge,
 * then back along the wave. Filled below the wave, so the region above it is
 * the window onto the 3D world.
 */
export function curtainPath(t: number, pull = 0): string {
  const pts: string[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const x = (i / SAMPLES) * CURTAIN_VIEW_W;
    pts.push(`${x.toFixed(2)} ${curtainY(x, t, pull).toFixed(2)}`);
  }
  // Start bottom-right so the wave is traversed left-to-right on the way back.
  return `M${CURTAIN_VIEW_W} ${CURTAIN_VIEW_H} L0 ${CURTAIN_VIEW_H} L${pts[0]} ${pts
    .slice(1)
    .map((p) => `L${p}`)
    .join(' ')} Z`;
}

/**
 * Whether a pointer move crossed the wave, and where.
 *
 * Detected as a sign change of (pointerY - curtainY) between two frames, which
 * hands back the crossing x for free — that is where the ripple gets centred.
 * Returns null when the move stayed on one side.
 */
export function crossedCurtain(
  prev: { x: number; y: number },
  next: { x: number; y: number },
  t: number,
  pull = 0,
): { x: number; speed: number } | null {
  const before = prev.y - curtainY(prev.x, t, pull);
  const after = next.y - curtainY(next.x, t, pull);
  if (before === 0 || (before < 0) === (after < 0)) return null;
  // Linear interpolation to the zero crossing.
  const f = before / (before - after);
  return {
    x: prev.x + (next.x - prev.x) * f,
    speed: Math.hypot(next.x - prev.x, next.y - prev.y),
  };
}
