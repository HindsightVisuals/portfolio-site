import { describe, it, expect } from 'vitest';
import {
  TRAIL_MS,
  TRAIL_PEAK_ALPHA,
  TRAIL_HEAD_WIDTH,
  TRAIL_TAIL_WIDTH,
  GLASS_PEAK_AGE,
  GLASS_MAX_BLUR_PX,
  CORE_MAX_BLUR_PX,
  TRAIL_BANDS,
  HOLD_RAMP_MS,
  HOLD_SHAPE_RAMP_MS,
  HOLD_RELEASE_MS,
  HOLD_MIN_SIZE,
  HOLD_MAX_SIZE,
  HOLD_MIN_ALPHA,
  HOLD_MAX_ALPHA,
  HOLD_ROUND_FRACTION,
  HOLD_GROW_START,
  holdRamp,
  holdShapeRamp,
  holdRelease,
  holdSize,
  holdAlpha,
  holdRadiusPct,
  holdColorMix,
  pruneTrail,
  pointAge,
  trailAlpha,
  trailWidth,
  coreBlur,
  glassStrength,
  smoothTrail,
  bandSlices,
  shouldMount,
  type TrailPoint,
} from './cursor-math';

const pt = (t: number, x = 0, y = 0): TrailPoint => ({ x, y, t });

describe('pruneTrail', () => {
  it('drops points older than the trail window and keeps order', () => {
    const now = 1000;
    const points = [pt(now - 400), pt(now - 300), pt(now - 100), pt(now - 10)];
    const kept = pruneTrail(points, now);
    expect(kept).toHaveLength(2);
    expect(kept[0].t).toBe(now - 100);
    expect(kept[1].t).toBe(now - 10);
  });

  it('drops a point that has reached exactly the window length', () => {
    const now = 1000;
    expect(pruneTrail([pt(now - TRAIL_MS)], now)).toHaveLength(0);
  });

  it('handles an empty trail', () => {
    expect(pruneTrail([], 1000)).toEqual([]);
  });

  it('keeps every point when all are fresh', () => {
    const now = 1000;
    const points = [pt(now - 20), pt(now - 10), pt(now)];
    expect(pruneTrail(points, now)).toHaveLength(3);
  });
});

describe('pointAge', () => {
  it('is 0 for a point stamped now', () => {
    expect(pointAge(pt(500), 500)).toBe(0);
  });

  it('is 1 for a point at exactly the window length', () => {
    expect(pointAge(pt(500), 500 + TRAIL_MS)).toBe(1);
  });

  it('clamps beyond the window instead of exceeding 1', () => {
    expect(pointAge(pt(500), 500 + TRAIL_MS * 4)).toBe(1);
  });

  it('clamps a future timestamp to 0', () => {
    expect(pointAge(pt(600), 500)).toBe(0);
  });

  it('is linear at the midpoint', () => {
    expect(pointAge(pt(0), TRAIL_MS / 2)).toBeCloseTo(0.5, 6);
  });
});

describe('trailAlpha', () => {
  it('starts at the peak alpha and never exceeds it', () => {
    expect(trailAlpha(0)).toBeCloseTo(TRAIL_PEAK_ALPHA, 6);
    for (let i = 0; i <= 20; i++) {
      expect(trailAlpha(i / 20)).toBeLessThanOrEqual(TRAIL_PEAK_ALPHA + 1e-9);
    }
  });

  it('reaches zero at full age', () => {
    expect(trailAlpha(1)).toBeCloseTo(0, 6);
  });

  it('decreases monotonically', () => {
    let prev = Infinity;
    for (let i = 0; i <= 20; i++) {
      const v = trailAlpha(i / 20);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
  });

  it('never goes negative', () => {
    expect(trailAlpha(1)).toBeGreaterThanOrEqual(0);
  });
});

describe('trailWidth', () => {
  it('tapers from head width to tail width', () => {
    expect(trailWidth(0)).toBeCloseTo(TRAIL_HEAD_WIDTH, 6);
    expect(trailWidth(1)).toBeCloseTo(TRAIL_TAIL_WIDTH, 6);
  });

  it('stays within the taper bounds and decreases', () => {
    let prev = Infinity;
    for (let i = 0; i <= 20; i++) {
      const w = trailWidth(i / 20);
      expect(w).toBeLessThanOrEqual(TRAIL_HEAD_WIDTH + 1e-9);
      expect(w).toBeGreaterThanOrEqual(TRAIL_TAIL_WIDTH - 1e-9);
      expect(w).toBeLessThan(prev);
      prev = w;
    }
  });
});

describe('coreBlur', () => {
  it('is sharp at the head and maximal at the tail', () => {
    expect(coreBlur(0)).toBeCloseTo(0, 6);
    expect(coreBlur(1)).toBeCloseTo(CORE_MAX_BLUR_PX, 6);
  });

  it('is off — Adam asked for the blur to go (2026-08-18)', () => {
    for (let i = 0; i <= 10; i++) expect(coreBlur(i / 10)).toBe(0);
  });

  it.skip('increases continuously — no buckets, no banding', () => {
    let prev = -1;
    for (let i = 0; i <= 50; i++) {
      const v = coreBlur(i / 50);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it.skip('is eased so the head stays defined longer than a linear ramp would', () => {
    // at half age an eased ramp must be below the linear midpoint
    expect(coreBlur(0.5)).toBeLessThan(CORE_MAX_BLUR_PX * 0.5);
  });

  it('clamps out-of-range ages into the valid blur span', () => {
    expect(coreBlur(-1)).toBeCloseTo(0, 6);
    expect(coreBlur(4)).toBeCloseTo(CORE_MAX_BLUR_PX, 6);
  });
});

describe('smoothTrail', () => {
  it('passes short inputs through untouched', () => {
    expect(smoothTrail([])).toEqual([]);
    const one = [pt(0, 5, 5)];
    expect(smoothTrail(one)).toEqual(one);
  });

  it('emits (n-1)*sub + 1 points', () => {
    const pts = [pt(0, 0, 0), pt(10, 10, 0), pt(20, 20, 0), pt(30, 30, 0)];
    expect(smoothTrail(pts, 6)).toHaveLength(3 * 6 + 1);
    expect(smoothTrail(pts, 1)).toHaveLength(4);
  });

  it('starts and ends exactly on the original endpoints', () => {
    const pts = [pt(0, 1, 2), pt(10, 40, 9), pt(20, 90, 3)];
    const out = smoothTrail(pts, 5);
    expect(out[0].x).toBeCloseTo(1, 6);
    expect(out[0].y).toBeCloseTo(2, 6);
    expect(out[out.length - 1].x).toBeCloseTo(90, 6);
    expect(out[out.length - 1].y).toBeCloseTo(3, 6);
  });

  it('keeps timestamps non-decreasing so every generated point ages correctly', () => {
    const pts = [pt(0, 0, 0), pt(50, 30, 10), pt(100, 60, 40), pt(150, 10, 80)];
    const out = smoothTrail(pts, 6);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].t).toBeGreaterThanOrEqual(out[i - 1].t);
    }
  });

  it('reproduces a straight line without wandering off it', () => {
    const pts = [pt(0, 0, 0), pt(10, 10, 0), pt(20, 20, 0), pt(30, 30, 0)];
    for (const p of smoothTrail(pts, 8)) {
      expect(p.y).toBeCloseTo(0, 6); // all input y are 0
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x).toBeLessThanOrEqual(30 + 1e-9);
    }
  });

  it('produces monotonic x for a monotonic input sweep', () => {
    const pts = [pt(0, 0, 0), pt(10, 25, 0), pt(20, 60, 0), pt(30, 110, 0)];
    const out = smoothTrail(pts, 6);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].x).toBeGreaterThanOrEqual(out[i - 1].x - 1e-9);
    }
  });
});

describe('bandSlices', () => {
  it('returns nothing for a degenerate trail', () => {
    expect(bandSlices(0)).toEqual([]);
    expect(bandSlices(1)).toEqual([]);
  });

  it('covers the whole index range with no gaps', () => {
    const slices = bandSlices(100, TRAIL_BANDS);
    expect(slices[0][0]).toBe(0);
    expect(slices[slices.length - 1][1]).toBe(99);
    for (let i = 1; i < slices.length; i++) {
      // adjacent bands share an endpoint, so the strokes join seamlessly
      expect(slices[i][0]).toBe(slices[i - 1][1]);
    }
  });

  it('never emits an empty slice', () => {
    for (const count of [2, 3, 5, 13, 47, 200]) {
      for (const [a, b] of bandSlices(count)) expect(b).toBeGreaterThan(a);
    }
  });

  it('cannot ask for more bands than there are segments', () => {
    expect(bandSlices(3, 50).length).toBeLessThanOrEqual(2);
  });
});

describe('glassStrength', () => {
  it('is zero at both ends of a point life', () => {
    expect(glassStrength(0)).toBeCloseTo(0, 6);
    expect(glassStrength(1)).toBeCloseTo(0, 6);
  });

  it('peaks at the configured age, at the max blur', () => {
    expect(glassStrength(GLASS_PEAK_AGE)).toBeCloseTo(GLASS_MAX_BLUR_PX, 6);
  });

  it('never exceeds the max blur anywhere in the range', () => {
    for (let i = 0; i <= 100; i++) {
      const a = i / 100;
      expect(glassStrength(a)).toBeLessThanOrEqual(GLASS_MAX_BLUR_PX + 1e-9);
      expect(glassStrength(a)).toBeGreaterThanOrEqual(0);
    }
  });

  it('rises before the peak and falls after it', () => {
    expect(glassStrength(0.2)).toBeLessThan(glassStrength(0.4));
    expect(glassStrength(0.8)).toBeLessThan(glassStrength(0.7));
  });

  it('clamps out-of-range ages to zero rather than going negative', () => {
    expect(glassStrength(1.5)).toBeCloseTo(0, 6);
    expect(glassStrength(-0.5)).toBeCloseTo(0, 6);
  });
});

describe('holdRamp', () => {
  it('starts at zero and reaches full at the ramp duration', () => {
    expect(holdRamp(0)).toBeCloseTo(0, 6);
    expect(holdRamp(HOLD_RAMP_MS)).toBeCloseTo(1, 6);
  });

  it('saturates instead of running away on a very long hold', () => {
    expect(holdRamp(HOLD_RAMP_MS * 50)).toBeCloseTo(1, 6);
  });

  it('increases monotonically', () => {
    let prev = -1;
    for (let i = 0; i <= 40; i++) {
      const v = holdRamp((i / 40) * HOLD_RAMP_MS);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('eases in rather than starting linearly', () => {
    // smoothstep is below linear in the first half
    expect(holdRamp(HOLD_RAMP_MS * 0.25)).toBeLessThan(0.25);
  });
});

describe('holdRelease', () => {
  it('returns the held value at the instant of release', () => {
    expect(holdRelease(0.8, 0)).toBeCloseTo(0.8, 6);
  });

  it('reaches zero by the end of the release window', () => {
    expect(holdRelease(0.8, HOLD_RELEASE_MS)).toBeCloseTo(0, 6);
    expect(holdRelease(1, HOLD_RELEASE_MS * 3)).toBeCloseTo(0, 6);
  });

  it('decays monotonically and never exceeds the value it started from', () => {
    let prev = Infinity;
    for (let i = 0; i <= 20; i++) {
      const v = holdRelease(0.6, (i / 20) * HOLD_RELEASE_MS);
      expect(v).toBeLessThanOrEqual(0.6 + 1e-9);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });

  it('releasing from zero stays at zero', () => {
    expect(holdRelease(0, 0)).toBeCloseTo(0, 6);
    expect(holdRelease(0, 100)).toBeCloseTo(0, 6);
  });
});

describe('hold shape ramp', () => {
  it('still completes before the RD pull, but the two now overlap', () => {
    // Retuned 2026-08-18: the circle expands slower (900 -> 2200ms) and the
    // pull ramps faster (5500 -> 2800ms), so they run together rather than the
    // shape finishing while the pull has barely started.
    expect(HOLD_SHAPE_RAMP_MS).toBeLessThan(HOLD_RAMP_MS);
    expect(holdShapeRamp(HOLD_SHAPE_RAMP_MS)).toBeCloseTo(1, 6);
    // The pull is well under way by the time the shape lands — that overlap is
    // the point, not a regression.
    expect(holdRamp(HOLD_SHAPE_RAMP_MS)).toBeGreaterThan(0.5);
  });

  it('starts at zero and saturates', () => {
    expect(holdShapeRamp(0)).toBeCloseTo(0, 6);
    expect(holdShapeRamp(HOLD_SHAPE_RAMP_MS * 10)).toBeCloseTo(1, 6);
  });
});

describe('hold visuals', () => {
  it('starts at the hover square size and alpha, so the morph is continuous', () => {
    expect(holdSize(0)).toBeCloseTo(HOLD_MIN_SIZE, 6);
    expect(holdAlpha(0)).toBeCloseTo(HOLD_MIN_ALPHA, 6);
  });

  it('starts square and ends fully round', () => {
    expect(holdRadiusPct(0)).toBeCloseTo(0, 6);
    expect(holdRadiusPct(1)).toBeCloseTo(50, 6);
  });

  it('rounds the corners BEFORE it grows — the order Adam asked for', () => {
    // by the end of the round-off stage the shape is a circle...
    expect(holdRadiusPct(HOLD_ROUND_FRACTION)).toBeCloseTo(50, 6);
    // ...while the box is still much nearer its start size than its end size
    const grownByThen = (holdSize(HOLD_ROUND_FRACTION) - HOLD_MIN_SIZE) / (HOLD_MAX_SIZE - HOLD_MIN_SIZE);
    expect(grownByThen).toBeLessThan(0.35);
  });

  it('stays a circle for the whole grow stage — no un-rounding as the box scales', () => {
    for (let i = 0; i <= 10; i++) {
      const p = HOLD_ROUND_FRACTION + (i / 10) * (1 - HOLD_ROUND_FRACTION);
      expect(holdRadiusPct(p)).toBeCloseTo(50, 6);
    }
  });

  it('greens as it swells, not before', () => {
    expect(holdColorMix(0)).toBeCloseTo(0, 6);
    expect(holdColorMix(HOLD_GROW_START)).toBeCloseTo(0, 6);
    expect(holdColorMix(1)).toBeCloseTo(1, 6);
  });

  it('grows and saturates together across the hold', () => {
    let ps = -1;
    let pa = -1;
    for (let i = 0; i <= 20; i++) {
      const p = HOLD_GROW_START + (i / 20) * (1 - HOLD_GROW_START);
      const s = holdSize(p);
      const a = holdAlpha(p);
      expect(s).toBeGreaterThan(ps);
      expect(a).toBeGreaterThan(pa);
      ps = s;
      pa = a;
    }
  });

  it('never goes backwards anywhere on the ramp', () => {
    let ps = -1;
    let pr = -1;
    for (let i = 0; i <= 40; i++) {
      const p = i / 40;
      expect(holdSize(p)).toBeGreaterThanOrEqual(ps);
      expect(holdRadiusPct(p)).toBeGreaterThanOrEqual(pr);
      ps = holdSize(p);
      pr = holdRadiusPct(p);
    }
  });

  it('clamps out-of-range progress rather than overshooting', () => {
    expect(holdSize(5)).toBeCloseTo(HOLD_MAX_SIZE, 6);
    expect(holdSize(-5)).toBeCloseTo(HOLD_MIN_SIZE, 6);
    expect(holdAlpha(5)).toBeCloseTo(HOLD_MAX_ALPHA, 6);
    expect(holdRadiusPct(5)).toBeCloseTo(50, 6);
    expect(holdRadiusPct(-5)).toBeCloseTo(0, 6);
    expect(holdColorMix(-5)).toBeCloseTo(0, 6);
    expect(holdColorMix(5)).toBeCloseTo(1, 6);
  });
});

describe('shouldMount', () => {
  it('mounts for a fine pointer', () => {
    expect(shouldMount(true)).toBe(true);
  });

  it('does not mount for a coarse pointer', () => {
    expect(shouldMount(false)).toBe(false);
  });
});
