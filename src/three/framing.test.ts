import { describe, expect, it } from 'vitest';
import { distanceForFraming, effectiveMarginPx, worldPerPx } from './framing';

describe('effectiveMarginPx', () => {
  it('returns 248 when 248*2 does not exceed 55% of smaller viewport dimension', () => {
    // 2560x1440: smaller=1440, 248*2=496, 55% of 1440=792, 496 < 792 -> 248
    expect(effectiveMarginPx(2560, 1440)).toBe(248);
  });

  it('returns computed margin when 248*2 exceeds 55% of smaller viewport dimension', () => {
    // 800x600: smaller=600, 248*2=496, 55% of 600=330, 496 > 330 -> Math.max(32, 0.12*600) = 72
    expect(effectiveMarginPx(800, 600)).toBe(72);
  });
});

describe('distanceForFraming', () => {
  it('height-constrains a square-ish plane in a wide viewport', () => {
    const planeW = 1920;
    const planeH = 1080;
    const vpW = 2560;
    const vpH = 1440;
    const fovYDeg = 75;
    const marginPx = 248;

    const distance = distanceForFraming(planeW, planeH, vpW, vpH, fovYDeg, marginPx);

    // Verify the relation: planeH / (2·d·tan(fovY/2)) === (vpH - 2·margin)/vpH
    const fovY = (fovYDeg * Math.PI) / 180;
    const expectedHeightFraction = (vpH - 2 * marginPx) / vpH;
    const actualHeightFraction = planeH / (2 * distance * Math.tan(fovY / 2));

    expect(actualHeightFraction).toBeCloseTo(expectedHeightFraction, 9);
  });

  it('width-constrains a wide plane in a tall viewport', () => {
    const planeW = 3840;
    const planeH = 1080;
    const vpW = 1440;
    const vpH = 2560;
    const fovYDeg = 75;
    const marginPx = 248;

    const distance = distanceForFraming(planeW, planeH, vpW, vpH, fovYDeg, marginPx);

    // Verify the width constraint
    const fovY = (fovYDeg * Math.PI) / 180;
    const aspect = vpW / vpH;
    const expectedWidthFraction = (vpW - 2 * marginPx) / vpW;
    const actualWidthFraction = planeW / (2 * distance * Math.tan(fovY / 2) * aspect);

    expect(actualWidthFraction).toBeCloseTo(expectedWidthFraction, 9);
  });
});

describe('worldPerPx', () => {
  it('scales linearly with distance — twice as far, twice as much world per pixel', () => {
    expect(worldPerPx(20, 45, 1080)).toBeCloseTo(worldPerPx(10, 45, 1080) * 2, 10);
  });

  it('scales inversely with viewport height', () => {
    expect(worldPerPx(10, 45, 1080)).toBeCloseTo(worldPerPx(10, 45, 2160) * 2, 10);
  });

  it('matches the frustum height at a known distance', () => {
    // At distance d the visible height is 2*d*tan(fov/2); across vpH pixels
    // that is the per-pixel size.
    const d = 34;
    const expected = (2 * d * Math.tan((45 * Math.PI) / 180 / 2)) / 1080;
    expect(worldPerPx(d, 45, 1080)).toBeCloseTo(expected, 12);
  });

  it('is zero-safe on a degenerate viewport rather than returning Infinity', () => {
    expect(Number.isFinite(worldPerPx(34, 45, 0))).toBe(true);
    expect(worldPerPx(34, 45, 0)).toBe(0);
  });
});
