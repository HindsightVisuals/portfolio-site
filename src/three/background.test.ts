import { describe, expect, it } from 'vitest';
import { viewToSimUV } from './background';

describe('viewToSimUV', () => {
  it('is identity at zoom 1 with no offset', () => {
    expect(viewToSimUV(0.3, 0.7, 1, 0, 0)).toEqual({ u: 0.3, v: 0.7 });
  });

  it('keeps the screen center fixed under zoom', () => {
    expect(viewToSimUV(0.5, 0.5, 1.06, 0, 0)).toEqual({ u: 0.5, v: 0.5 });
  });

  it('zoom > 1 samples a smaller central region (overscan margin at the edges)', () => {
    const { u } = viewToSimUV(0, 0.5, 1.03, 0, 0);
    expect(u).toBeGreaterThan(0);
    expect(u).toBeLessThan(0.5);
  });

  it('parallax offset shifts sampling uniformly, including at center', () => {
    const { u, v } = viewToSimUV(0.5, 0.5, 1, 0.012, -0.008);
    expect(u).toBeCloseTo(0.512, 10);
    expect(v).toBeCloseTo(0.492, 10);
  });
});
