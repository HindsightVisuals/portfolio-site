import { describe, expect, it } from 'vitest';
import { ease, logoPhase, rectCenter, rectLerp, trackProgress } from './logo-track';

const A = { x: 0, y: 0, width: 100, height: 50 };
const B = { x: 200, y: 400, width: 300, height: 150 };

describe('trackProgress', () => {
  it('is 0 before the handover starts', () => {
    expect(trackProgress(0, 500, 1500)).toBe(0);
    expect(trackProgress(499, 500, 1500)).toBe(0);
  });

  it('is 1 once the handover completes, and stays there', () => {
    expect(trackProgress(1500, 500, 1500)).toBe(1);
    expect(trackProgress(99999, 500, 1500)).toBe(1);
  });

  it('is linear in between', () => {
    expect(trackProgress(1000, 500, 1500)).toBeCloseTo(0.5, 6);
  });

  it('degenerates safely when the two anchors coincide', () => {
    expect(trackProgress(400, 500, 500)).toBe(0);
    expect(trackProgress(600, 500, 500)).toBe(1);
  });
});

describe('rectLerp', () => {
  it('returns each end exactly', () => {
    expect(rectLerp(A, B, 0)).toEqual(A);
    expect(rectLerp(A, B, 1)).toEqual(B);
  });

  it('interpolates every component at the midpoint', () => {
    expect(rectLerp(A, B, 0.5)).toEqual({ x: 100, y: 200, width: 200, height: 100 });
  });

  it('clamps rather than extrapolating past either anchor', () => {
    expect(rectLerp(A, B, 5)).toEqual(B);
    expect(rectLerp(A, B, -5)).toEqual(A);
  });
});

describe('ease', () => {
  it('pins both ends and passes through the middle', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 6);
  });

  it('starts and ends gently — that is the point of the handover', () => {
    expect(ease(0.1)).toBeLessThan(0.1);
    expect(ease(0.9)).toBeGreaterThan(0.9);
  });
});

describe('logoPhase', () => {
  it('is animating until the handover completes', () => {
    expect(logoPhase(0, 100, 100)).toBe('animating');
    expect(logoPhase(0.99, 100, 100)).toBe('animating');
  });

  it('is stuck once landed, while the strip is still at rest', () => {
    expect(logoPhase(1, 100, 100)).toBe('stuck');
  });

  it('is leaving once the strip has started travelling', () => {
    expect(logoPhase(1, -400, 100)).toBe('leaving');
  });

  it('ignores sub-pixel jitter in the panel position', () => {
    expect(logoPhase(1, 100.4, 100)).toBe('stuck');
  });
});

describe('rectCenter', () => {
  it('is the middle of the box', () => {
    expect(rectCenter(A)).toEqual({ x: 50, y: 25 });
  });
});
