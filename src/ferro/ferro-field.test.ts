import { describe, expect, it } from 'vitest';
import { driftUnitsPerSec, FERRO_DEFAULTS, FERRO_GLSL } from './ferro-field';

describe('driftUnitsPerSec', () => {
  it('holds turnover TIME constant as the texture scale changes', () => {
    // A turnover is 1/texScale units, so seconds-per-turnover must not drift.
    const a = driftUnitsPerSec(0.5, 12);
    const b = driftUnitsPerSec(1.0, 12);
    expect(1 / 0.5 / a).toBeCloseTo(12, 10);
    expect(1 / 1.0 / b).toBeCloseTo(12, 10);
  });

  it('reproduces the blend file rate: 3 units/sec at scale 1 is ~0.5s per turnover', () => {
    expect(driftUnitsPerSec(1, 1 / 3)).toBeCloseTo(3, 10);
  });

  it('returns 0 for a non-positive duration rather than dividing by zero', () => {
    expect(driftUnitsPerSec(0.5, 0)).toBe(0);
    expect(driftUnitsPerSec(0.5, -4)).toBe(0);
  });

  it('survives a non-finite scale without emitting NaN', () => {
    expect(Number.isFinite(driftUnitsPerSec(Number.NaN, 12))).toBe(true);
  });
});

describe('FERRO_DEFAULTS', () => {
  it("carries Adam's tuned look, not Blender parity", () => {
    expect(FERRO_DEFAULTS.strength).toBeCloseTo(1.05, 6);
    expect(FERRO_DEFAULTS.texScale).toBeCloseTo(0.5, 6);
    expect(FERRO_DEFAULTS.driftSeconds).toBe(12);
    expect(FERRO_DEFAULTS.detail).toBe(64);
    expect(FERRO_DEFAULTS.recalcNormals).toBe(false);
    expect(FERRO_DEFAULTS.exposure).toBeCloseTo(0.5, 6);
  });
});

describe('FERRO_GLSL', () => {
  it('declares the entry points the material patch replaces includes with', () => {
    expect(FERRO_GLSL).toContain('float ferroDisp(');
    expect(FERRO_GLSL).toContain('vec3 ferroNormal(');
  });
});
