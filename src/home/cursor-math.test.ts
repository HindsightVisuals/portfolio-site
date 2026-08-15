import { describe, it, expect } from 'vitest';
import {
  TRAIL_MS,
  TRAIL_PEAK_ALPHA,
  TRAIL_HEAD_WIDTH,
  TRAIL_TAIL_WIDTH,
  GLASS_PEAK_AGE,
  GLASS_MAX_BLUR_PX,
  pruneTrail,
  pointAge,
  trailAlpha,
  trailWidth,
  blurBucket,
  glassStrength,
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

describe('blurBucket', () => {
  it('is sharp for the newest third', () => {
    expect(blurBucket(0)).toBe(0);
    expect(blurBucket(0.32)).toBe(0);
  });

  it('is mid-blur for the middle third', () => {
    expect(blurBucket(1 / 3)).toBe(1.5);
    expect(blurBucket(0.65)).toBe(1.5);
  });

  it('is full blur for the oldest third', () => {
    expect(blurBucket(2 / 3)).toBe(3);
    expect(blurBucket(1)).toBe(3);
  });

  it('never returns a value outside the three buckets', () => {
    for (let i = 0; i <= 50; i++) {
      expect([0, 1.5, 3]).toContain(blurBucket(i / 50));
    }
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

describe('shouldMount', () => {
  it('mounts for a fine pointer', () => {
    expect(shouldMount(true)).toBe(true);
  });

  it('does not mount for a coarse pointer', () => {
    expect(shouldMount(false)).toBe(false);
  });
});
