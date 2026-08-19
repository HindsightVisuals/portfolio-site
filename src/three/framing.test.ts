import { describe, expect, it } from 'vitest';
import { distanceForFraming, effectiveMarginPx, worldPerPx } from './framing';

describe('effectiveMarginPx', () => {
  // Retuned 2026-08-18: a fixed 248px margin looked right on 4K but left the
  // focused tile ~25% too small at 1080p, because the same inset eats far more
  // of a shorter viewport. Now lerped between two measured anchors.
  it('keeps the 4K margin that already looked right', () => {
    expect(effectiveMarginPx(3840, 2160)).toBeCloseTo(248, 6);
  });

  it('tightens to 175 at 1080p, which is the ~25% larger tile Adam asked for', () => {
    expect(effectiveMarginPx(1920, 1080)).toBeCloseTo(175, 6);
  });

  it('interpolates between the two anchors rather than stepping', () => {
    const m = effectiveMarginPx(2560, 1440);
    expect(m).toBeGreaterThan(175);
    expect(m).toBeLessThan(248);
  });

  it('never widens past the 4K anchor on an enormous viewport', () => {
    expect(effectiveMarginPx(7680, 4320)).toBeCloseTo(248, 6);
  });

  it('falls back to a proportional margin well below the 1080 anchor', () => {
    // 800x600 -> 0.17 * 600 = 102, which is tighter than the 175 floor.
    expect(effectiveMarginPx(800, 600)).toBeCloseTo(102, 6);
  });

  it('keeps a usable margin on a very small viewport', () => {
    expect(effectiveMarginPx(320, 180)).toBe(32);
  });

  it('is driven by the SHORTER edge, so orientation does not flip it', () => {
    expect(effectiveMarginPx(1080, 1920)).toBeCloseTo(effectiveMarginPx(1920, 1080), 6);
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
