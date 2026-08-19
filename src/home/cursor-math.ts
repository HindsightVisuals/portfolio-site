/**
 * Pure math for the F15 cursor system — trail decay, smoothing, blur ramps and
 * the mount gate. Kept free of DOM and globals so the whole testable surface of
 * the feature lives in one place; cursor.ts is the untested DOM/RAF shell.
 *
 * Spec: docs/superpowers/specs/2026-08-14-f15-cursor-system-design.md
 *
 * Every constant here is tune-by-eye.
 */

/** How long a trail point survives, in ms. */
export const TRAIL_MS = 250;
/** Opacity of a point the instant it is left behind. It never exceeds this. */
export const TRAIL_PEAK_ALPHA = 0.2;
/** Stroke width at the head of the trail, in CSS px. */
export const TRAIL_HEAD_WIDTH = 10;
/** Stroke width at the tail of the trail, in CSS px. */
export const TRAIL_TAIL_WIDTH = 2;

/**
 * Peak per-band blur on the core trail, in CSS px.
 *
 * ZERO on purpose (Adam, 2026-08-18: "kill the blur on the mouse effect").
 * Kept as a constant rather than deleted because coreBlur() still shapes the
 * ramp and the value is the one dial that brings the softness back. It was also
 * the most expensive thing on the page: a canvas 2D blur filter per age band,
 * per frame, over a full-viewport canvas — at 4K that alone can cost the frame.
 */
export const CORE_MAX_BLUR_PX = 0;
/**
 * How many age bands the trail is drawn in. Each band is ONE stroke() call, so
 * a self-overlapping path composites once and cannot build up alpha at the
 * joins — the beading that made the old trail read as discrete frames. More
 * bands = smoother alpha ramp, more draw calls.
 */
export const TRAIL_BANDS = 12;
/** Catmull-Rom subdivisions per input segment. Turns the polyline into a curve. */
export const TRAIL_SUBDIVISIONS = 6;
/** The bleed layer's stroke width, as a multiple of the core width. Unused
 *  while the bleed canvas is gone — see cursor.ts. */
export const BLEED_WIDTH_MULT = 3.5;
/** The bleed layer's alpha, as a multiple of the core alpha. Unused, as above. */
export const BLEED_ALPHA_MULT = 0.75;

/** Age at which the glass frost is strongest — late, so it peaks as the green dies. */
export const GLASS_PEAK_AGE = 0.6;
/** Peak backdrop blur, in CSS px. */
export const GLASS_MAX_BLUR_PX = 5;

/* --- press-and-hold ---------------------------------------------------- */

/** Time to reach a full hold, in ms. Long on purpose — the pull is a slow
 * build, and the RD advection needs seconds of sim steps to accumulate. */
export const HOLD_RAMP_MS = 2800;
/**
 * Time for the CURSOR's shape morph to complete, in ms — deliberately much
 * shorter than HOLD_RAMP_MS.
 *
 * The two used to share one ramp, which meant the square took the RD's full
 * 5.5s to finish becoming a circle. The RD pull wants a long build (its
 * advection compounds over seconds of sim steps); the cursor wants to answer
 * the press straight away. So they are separate ramps over the same press:
 * shape lands early, the field keeps gathering underneath.
 */
export const HOLD_SHAPE_RAMP_MS = 2200;
/** Ease-out duration after release, in ms. */
export const HOLD_RELEASE_MS = 320;
/** Diameter at shape-morph 0 — matches the hover square so the morph is continuous. */
export const HOLD_MIN_SIZE = 32;
/** Diameter at a full hold, in CSS px. */
export const HOLD_MAX_SIZE = 150;
/** Green fill alpha at shape-morph 0 — matches the hover square's fill. */
export const HOLD_MIN_ALPHA = 0.35;
/** Green fill alpha at a full hold. */
export const HOLD_MAX_ALPHA = 0.85;
/**
 * Fraction of the shape ramp spent rounding the corners off.
 *
 * The morph is ordered, not simultaneous: the square rounds to a circle FIRST,
 * and only then scales up and greens. Keeping this well under 1 leaves most of
 * the ramp for the grow, so the shape reads as "a circle getting bigger" rather
 * than "a rounded rectangle inflating".
 */
export const HOLD_ROUND_FRACTION = 0.35;
/**
 * Where along the shape ramp the grow/colour stage starts. Slightly inside
 * HOLD_ROUND_FRACTION so the two stages overlap rather than visibly stagger.
 */
export const HOLD_GROW_START = 0.15;
/**
 * A press longer than this swallows its click, so you can hold on a reticle or
 * a WORK tile, watch the pull build, and release without navigating. Quick
 * clicks are untouched.
 */
export const CLICK_SUPPRESS_MS = 350;

/** Smoothstep — gradual in, gradual out. */
const smoothstep = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** Hold progress from how long the button has been down. Drives the RD pull. */
export function holdRamp(heldMs: number): number {
  return smoothstep(heldMs / HOLD_RAMP_MS);
}

/** Shape-morph progress from how long the button has been down. Drives the cursor. */
export function holdShapeRamp(heldMs: number): number {
  return smoothstep(heldMs / HOLD_SHAPE_RAMP_MS);
}

/** Hold progress while easing back out, from the value held at release. */
export function holdRelease(fromValue: number, sinceReleaseMs: number): number {
  const k = 1 - clamp01(sinceReleaseMs / HOLD_RELEASE_MS);
  return clamp01(fromValue) * smoothstep(k);
}

/**
 * Remaps a shape-morph progress onto the stage that runs from `start` to 1,
 * so an ordered morph can be expressed as two overlapping stages of one ramp.
 */
const stage = (progress: number, start: number): number =>
  clamp01((clamp01(progress) - start) / (1 - start));

/**
 * Corner radius as a PERCENTAGE of the box, for a shape-morph progress.
 *
 * Runs 0 -> 50% over the first HOLD_ROUND_FRACTION of the ramp and stays at 50
 * thereafter: the corners round off first, then the finished circle grows.
 * Percent rather than px because the box is scaling at the same time — a px
 * radius would un-round itself as the box got bigger.
 */
export function holdRadiusPct(progress: number): number {
  return 50 * smoothstep(clamp01(progress) / HOLD_ROUND_FRACTION);
}

/** Diameter for a shape-morph progress, in CSS px. Grows only after the round-off. */
export function holdSize(progress: number): number {
  return HOLD_MIN_SIZE + (HOLD_MAX_SIZE - HOLD_MIN_SIZE) * stage(progress, HOLD_GROW_START);
}

/** Green fill alpha for a shape-morph progress. Tracks the grow stage. */
export function holdAlpha(progress: number): number {
  return HOLD_MIN_ALPHA + (HOLD_MAX_ALPHA - HOLD_MIN_ALPHA) * stage(progress, HOLD_GROW_START);
}

/**
 * How far the stroke and fill have crossed from ink to green, 0..1.
 *
 * Shares the grow stage, so the cursor turns green as it swells rather than
 * before it. At 0 the square is exactly its resting ink colour, so a press that
 * starts from the rest state has nothing to jump over.
 */
export function holdColorMix(progress: number): number {
  return stage(progress, HOLD_GROW_START);
}

export interface TrailPoint {
  x: number;
  y: number;
  /** Timestamp the point was sampled, in ms (performance.now() domain). */
  t: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Drop points that have outlived the trail window. Order is preserved (oldest first). */
export function pruneTrail(points: TrailPoint[], now: number): TrailPoint[] {
  return points.filter((p) => now - p.t < TRAIL_MS);
}

/** Normalised age of a point: 0 = just sampled, 1 = expired. Clamped at both ends. */
export function pointAge(p: TrailPoint, now: number): number {
  return clamp01((now - p.t) / TRAIL_MS);
}

/** Linear 20% -> 0% opacity ramp across a point's life. */
export function trailAlpha(age: number): number {
  return TRAIL_PEAK_ALPHA * (1 - clamp01(age));
}

/** Linear taper from head width to tail width across a point's life. */
export function trailWidth(age: number): number {
  return TRAIL_HEAD_WIDTH + (TRAIL_TAIL_WIDTH - TRAIL_HEAD_WIDTH) * clamp01(age);
}

/**
 * Continuous blur ramp for the core trail. Eased so the head stays defined and
 * the tail blows out — the point bleeds outward as it dies rather than simply
 * dimming.
 */
export function coreBlur(age: number): number {
  const a = clamp01(age);
  return CORE_MAX_BLUR_PX * a * a;
}

/**
 * Backdrop-blur strength for the glass nodes: a triangular ramp that is zero at
 * birth, peaks at GLASS_PEAK_AGE, and returns to zero at expiry — so the frost
 * swells as the green fades and leaves nothing behind.
 */
export function glassStrength(age: number): number {
  const a = clamp01(age);
  const rising = a / GLASS_PEAK_AGE;
  const falling = (1 - a) / (1 - GLASS_PEAK_AGE);
  return GLASS_MAX_BLUR_PX * Math.min(rising, falling);
}

/**
 * Catmull-Rom subdivision through the sampled points. The raw samples are a
 * polyline whose corners are visible on a fast sweep; this resamples them onto
 * a smooth curve. Timestamps are interpolated linearly so every generated point
 * still ages correctly.
 *
 * Endpoints are duplicated as their own control neighbours, so the curve starts
 * and ends exactly on the first and last samples.
 */
export function smoothTrail(points: TrailPoint[], subdivisions = TRAIL_SUBDIVISIONS): TrailPoint[] {
  if (points.length < 2) return points.slice();
  const sub = Math.max(1, Math.floor(subdivisions));
  const out: TrailPoint[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];

    for (let s = 0; s < sub; s++) {
      const u = s / sub;
      const u2 = u * u;
      const u3 = u2 * u;
      // Standard Catmull-Rom basis (tension 0.5).
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * u +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * u +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
        t: p1.t + (p2.t - p1.t) * u,
      });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Contiguous index ranges covering a point list, one per age band. Adjacent
 * bands share an endpoint so the strokes join with no gap.
 */
export function bandSlices(count: number, bands = TRAIL_BANDS): Array<[number, number]> {
  if (count < 2) return [];
  const n = Math.max(1, Math.min(Math.floor(bands), count - 1));
  const slices: Array<[number, number]> = [];
  for (let b = 0; b < n; b++) {
    const start = Math.floor((b * (count - 1)) / n);
    const end = Math.floor(((b + 1) * (count - 1)) / n);
    if (end > start) slices.push([start, end]);
  }
  return slices;
}

/**
 * Whether the cursor system mounts at all. Touch and other coarse pointers have
 * no hover state and no visible cursor to replace, so the whole feature is gated
 * off there and the OS cursor is left alone (F19).
 */
export function shouldMount(finePointer: boolean): boolean {
  return finePointer;
}
