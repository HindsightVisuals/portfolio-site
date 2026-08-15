import { describe, expect, it } from 'vitest';
import { viewToSimUV, travelStretch, stretchedZoom } from './background';

describe('viewToSimUV', () => {
  it('is identity at zoom 1 with no offset', () => {
    expect(viewToSimUV(0.3, 0.7, 1, 1, 0, 0)).toEqual({ u: 0.3, v: 0.7 });
  });

  it('keeps the screen center fixed under zoom', () => {
    expect(viewToSimUV(0.5, 0.5, 1.06, 1.06, 0, 0)).toEqual({ u: 0.5, v: 0.5 });
  });

  it('zoom > 1 samples a smaller central region (overscan margin at the edges)', () => {
    const { u } = viewToSimUV(0, 0.5, 1.03, 1.03, 0, 0);
    expect(u).toBeGreaterThan(0);
    expect(u).toBeLessThan(0.5);
  });

  it('parallax offset shifts sampling uniformly, including at center', () => {
    const { u, v } = viewToSimUV(0.5, 0.5, 1, 1, 0.012, -0.008);
    expect(u).toBeCloseTo(0.512, 10);
    expect(v).toBeCloseTo(0.492, 10);
  });

  it('maps the axes independently so the brush tracks an anisotropic stretch', () => {
    const iso = viewToSimUV(0.2, 0.2, 1.1, 1.1, 0, 0);
    const aniso = viewToSimUV(0.2, 0.2, 1.1, 1.3, 0, 0);
    expect(aniso.u).toBeCloseTo(iso.u, 10); // x untouched by a y-only stretch
    expect(aniso.v).not.toBeCloseTo(iso.v, 6);
    // stretching y samples a narrower band, so v moves toward centre
    expect(Math.abs(aniso.v - 0.5)).toBeLessThan(Math.abs(iso.v - 0.5));
  });

  it('still keeps the centre fixed when the axes disagree', () => {
    expect(viewToSimUV(0.5, 0.5, 1.02, 1.4, 0, 0)).toEqual({ u: 0.5, v: 0.5 });
  });
});

describe('travelStretch', () => {
  it('is zero at rest', () => {
    expect(travelStretch(0)).toBe(0);
  });

  it('is symmetric — only the axis of travel matters, not the direction along it', () => {
    expect(travelStretch(20)).toBeCloseTo(travelStretch(-20), 12);
  });

  it('grows with speed and then saturates rather than running away', () => {
    expect(travelStretch(10)).toBeGreaterThan(travelStretch(4));
    const peak = travelStretch(35);
    expect(travelStretch(200)).toBeCloseTo(peak, 12);
    expect(travelStretch(1e9)).toBeCloseTo(peak, 12);
  });

  it('stays a slight effect at full speed', () => {
    expect(travelStretch(1e9)).toBeLessThanOrEqual(0.06);
    expect(travelStretch(1e9)).toBeGreaterThan(0);
  });

  it('survives a non-finite velocity without poisoning the uniform', () => {
    expect(travelStretch(Number.NaN)).toBe(0);
    expect(travelStretch(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('stretchedZoom', () => {
  it('is a no-op at zero stretch', () => {
    const z = stretchedZoom(1.03, 0);
    expect(z.x).toBeCloseTo(1.03, 12);
    expect(z.y).toBeCloseTo(1.03, 12);
  });

  it('magnifies vertically', () => {
    const z = stretchedZoom(1.03, 0.06);
    expect(z.y).toBeGreaterThan(1.03);
  });

  it('never narrows x — that would spend the overscan margin parallax needs', () => {
    for (const stretch of [0, 0.01, 0.06, 0.5, 1]) {
      expect(stretchedZoom(1.03, stretch).x).toBeGreaterThanOrEqual(1.03);
    }
  });

  it('keeps the left edge inside the texture at full stretch and full parallax', () => {
    // mirrors VIEW_FRAG: uvZ.x = (vUv.x - 0.5) / zoom.x + 0.5 + offU
    const MAX_OFF_U = 0.01 * 1.2; // PARALLAX_UV_PER_UNIT * MAGNET_X
    const { x } = stretchedZoom(1.03, 0.06);
    expect((0 - 0.5) / x + 0.5 - MAX_OFF_U).toBeGreaterThan(0);
  });

  it('scales with the base zoom rather than replacing it', () => {
    const a = stretchedZoom(1.0, 0.05);
    const b = stretchedZoom(2.0, 0.05);
    expect(b.y / a.y).toBeCloseTo(2, 12);
    expect(b.x / a.x).toBeCloseTo(2, 12);
  });

  it('never inverts the axis, even at an absurd stretch', () => {
    const z = stretchedZoom(1.03, 1);
    expect(z.x).toBeGreaterThan(0);
    expect(z.y).toBeGreaterThan(0);
  });
});
