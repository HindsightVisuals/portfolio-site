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
  shortestAngleDelta,
  dampAngle,
  CURSOR_TAU,
  AMBIENT_AMPLITUDE,
  AMBIENT_RATE_X,
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

describe('shortestAngleDelta', () => {
  it('takes the short way across the seam', () => {
    // The ring is closed, so a naive difference would send the cursor a full
    // lap round the dish instead of a nudge.
    const d = shortestAngleDelta(0.1, Math.PI * 2 - 0.1);
    expect(d).toBeCloseTo(-0.2, 6);
  });

  it('is signed and within (-PI, PI]', () => {
    for (const [a, b] of [
      [0, 1],
      [1, 0],
      [-3, 3],
      [3, -3],
      [0, Math.PI],
    ]) {
      const d = shortestAngleDelta(a, b);
      expect(d).toBeGreaterThan(-Math.PI - 1e-9);
      expect(d).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });

  it('is zero for equal angles, and for a full turn apart', () => {
    expect(shortestAngleDelta(1.2, 1.2)).toBeCloseTo(0, 9);
    expect(shortestAngleDelta(1.2, 1.2 + Math.PI * 2)).toBeCloseTo(0, 9);
  });
});

describe('dampAngle', () => {
  it('covers about 63% of the gap in one tau', () => {
    const out = dampAngle(0, 1, 0.22, 0.22);
    expect(out).toBeCloseTo(1 - Math.exp(-1), 5);
  });

  it('converges without overshooting', () => {
    let a = 0;
    for (let i = 0; i < 200; i++) a = dampAngle(a, 1, 1 / 60, CURSOR_TAU);
    expect(a).toBeCloseTo(1, 4);
    expect(a).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('is framerate-independent — same place after the same real time', () => {
    // A fixed lerp factor would make the cursor heavier on a slow machine,
    // which is exactly backwards.
    let slow = 0;
    for (let i = 0; i < 30; i++) slow = dampAngle(slow, 1, 1 / 30, CURSOR_TAU);
    let fast = 0;
    for (let i = 0; i < 144; i++) fast = dampAngle(fast, 1, 1 / 144, CURSOR_TAU);
    expect(slow).toBeCloseTo(fast, 3);
  });

  it('goes the short way when damping across the seam', () => {
    const out = dampAngle(0.1, Math.PI * 2 - 0.1, 1 / 60, CURSOR_TAU);
    expect(out).toBeLessThan(0.1); // moved backwards, not forwards
  });

  it('is a big slow drift, not vibration', () => {
    // Amplitude went up 8x; the rates came DOWN, so the panels travel further
    // and take longer doing it.
    expect(AMBIENT_AMPLITUDE).toBeCloseTo(0.012 * 8, 6);
    expect(AMBIENT_RATE_X).toBeLessThan(0.13);
  });
});
