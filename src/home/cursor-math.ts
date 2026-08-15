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
 * Peak per-band blur on the core trail, in CSS px. Replaces the original
 * three-bucket quantisation, which was visible as banding.
 */
export const CORE_MAX_BLUR_PX = 7;
/**
 * How many age bands the trail is drawn in. Each band is ONE stroke() call, so
 * a self-overlapping path composites once and cannot build up alpha at the
 * joins — the beading that made the old trail read as discrete frames. More
 * bands = smoother alpha ramp, more draw calls.
 */
export const TRAIL_BANDS = 12;
/** Catmull-Rom subdivisions per input segment. Turns the polyline into a curve. */
export const TRAIL_SUBDIVISIONS = 6;
/** The bleed layer's stroke width, as a multiple of the core width. */
export const BLEED_WIDTH_MULT = 3.5;
/** The bleed layer's alpha, as a multiple of the core alpha. */
export const BLEED_ALPHA_MULT = 0.75;

/** Age at which the glass frost is strongest — late, so it peaks as the green dies. */
export const GLASS_PEAK_AGE = 0.6;
/** Peak backdrop blur, in CSS px. */
export const GLASS_MAX_BLUR_PX = 5;

/* --- press-and-hold ---------------------------------------------------- */

/** Time to reach a full hold, in ms. Long on purpose — the pull is a slow
 * build, and the RD advection needs seconds of sim steps to accumulate. */
export const HOLD_RAMP_MS = 5500;
/** Ease-out duration after release, in ms. */
export const HOLD_RELEASE_MS = 320;
/** Circle diameter at hold 0 — matches the hover square so the morph is continuous. */
export const HOLD_MIN_SIZE = 32;
/** Circle diameter at a full hold, in CSS px. */
export const HOLD_MAX_SIZE = 150;
/** Green fill alpha at hold 0 — matches the hover square's fill. */
export const HOLD_MIN_ALPHA = 0.35;
/** Green fill alpha at a full hold. */
export const HOLD_MAX_ALPHA = 0.85;
/** Edge blur at a full hold, in CSS px. Zero at hold 0, so it starts crisp. */
export const HOLD_MAX_EDGE_BLUR = 16;
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

/** Hold progress from how long the button has been down. */
export function holdRamp(heldMs: number): number {
  return smoothstep(heldMs / HOLD_RAMP_MS);
}

/** Hold progress while easing back out, from the value held at release. */
export function holdRelease(fromValue: number, sinceReleaseMs: number): number {
  const k = 1 - clamp01(sinceReleaseMs / HOLD_RELEASE_MS);
  return clamp01(fromValue) * smoothstep(k);
}

/** Circle diameter for a hold progress, in CSS px. */
export function holdSize(progress: number): number {
  return HOLD_MIN_SIZE + (HOLD_MAX_SIZE - HOLD_MIN_SIZE) * clamp01(progress);
}

/** Green fill alpha for a hold progress. */
export function holdAlpha(progress: number): number {
  return HOLD_MIN_ALPHA + (HOLD_MAX_ALPHA - HOLD_MIN_ALPHA) * clamp01(progress);
}

/** Edge blur for a hold progress, in CSS px. */
export function holdEdgeBlur(progress: number): number {
  return HOLD_MAX_EDGE_BLUR * clamp01(progress);
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
