import { describe, it, expect } from 'vitest';
import {
  EXPLODE_NEAR,
  EXPLODE_FAR,
  SCALE_MIN,
  SCALE_MAX,
  GLOW_RADIUS,
  EMISSION_MAX,
  CURSOR_RADIUS,
  clamp01,
  surfaceDistance,
  panelScale,
  emissionStrength,
  signalFalloff,
} from './array-math';

describe('constants match the Blender rig', () => {
  it('carries the measured thresholds verbatim', () => {
    expect(EXPLODE_NEAR).toBe(0.2);
    expect(EXPLODE_FAR).toBe(0.41);
    expect(SCALE_MIN).toBe(0.57);
    expect(SCALE_MAX).toBe(1);
    expect(GLOW_RADIUS).toBe(0.11);
    expect(EMISSION_MAX).toBe(4.6);
    expect(CURSOR_RADIUS).toBeCloseTo(0.3421, 4);
  });
});

describe('surfaceDistance', () => {
  it('subtracts the sphere radius from the centre distance', () => {
    expect(surfaceDistance(1, 0.25)).toBeCloseTo(0.75, 6);
  });

  it('goes negative inside the sphere', () => {
    expect(surfaceDistance(0.1, 0.25)).toBeCloseTo(-0.15, 6);
  });
});

describe('panelScale', () => {
  it('is fully shrunk at and inside the near threshold', () => {
    expect(panelScale(EXPLODE_NEAR)).toBeCloseTo(SCALE_MIN, 6);
    expect(panelScale(0)).toBeCloseTo(SCALE_MIN, 6);
    expect(panelScale(-5)).toBeCloseTo(SCALE_MIN, 6);
  });

  it('is closed at and beyond the far threshold', () => {
    expect(panelScale(EXPLODE_FAR)).toBeCloseTo(SCALE_MAX, 6);
    expect(panelScale(10)).toBeCloseTo(SCALE_MAX, 6);
  });

  it('is linear across the band', () => {
    const mid = (EXPLODE_NEAR + EXPLODE_FAR) / 2;
    expect(panelScale(mid)).toBeCloseTo((SCALE_MIN + SCALE_MAX) / 2, 6);
  });
});

describe('emissionStrength', () => {
  it('peaks against the cursor surface', () => {
    expect(emissionStrength(0)).toBeCloseTo(EMISSION_MAX, 6);
  });

  it('reaches zero at the glow shell edge and stays there', () => {
    expect(emissionStrength(GLOW_RADIUS)).toBeCloseTo(0, 6);
    expect(emissionStrength(1)).toBeCloseTo(0, 6);
  });

  it('is tighter than the explode band — the ratio that makes it read', () => {
    expect(emissionStrength(EXPLODE_NEAR)).toBe(0);
  });
});

describe('signalFalloff', () => {
  it('is 10 at zero distance', () => {
    expect(signalFalloff(0)).toBeCloseTo(10, 6);
  });

  it('is quartic — half strength at unit distance', () => {
    expect(signalFalloff(1)).toBeCloseTo(5, 6);
    expect(signalFalloff(2)).toBeCloseTo(10 / 17, 6);
  });
});

describe('clamp01', () => {
  it('clamps both ends and passes the middle', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });
});
