import { describe, expect, it } from 'vitest';
import { iconIndexAt, CYCLE_MS, PHASE_OFFSET } from './cycle';

describe('iconIndexAt', () => {
  it('exposes the binding constants', () => {
    expect(CYCLE_MS).toBe(500);
    expect(PHASE_OFFSET).toBe(0.37);
  });

  it('at t=0, index varies by reticle index (phase offset desyncs reticles)', () => {
    const at0 = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => iconIndexAt(0, i, 8));
    // reticle 0 sits at floor(0) = 0; later reticles are phase-shifted forward.
    expect(at0[0]).toBe(0);
    expect(at0).not.toEqual(at0.map(() => at0[0])); // not all identical
  });

  it('advancing by CYCLE_MS increments the index by 1 (mod count)', () => {
    const i0 = iconIndexAt(1000, 2, 8);
    const i1 = iconIndexAt(1000 + CYCLE_MS, 2, 8);
    expect(i1).toBe((i0 + 1) % 8);
  });

  it('wraps around at count', () => {
    // pick a t where the raw (pre-mod) value is exactly count, i.e. index should wrap to 0
    const t = CYCLE_MS * 8; // reticleIndex 0 -> floor(t/CYCLE_MS) = 8 -> 8 % 8 = 0
    expect(iconIndexAt(t, 0, 8)).toBe(0);
  });

  it('matches the exact binding formula', () => {
    const t = 1234;
    const i = 3;
    const count = 8;
    expect(iconIndexAt(t, i, count)).toBe(Math.floor(t / CYCLE_MS + i * PHASE_OFFSET) % count);
  });

  it('never returns a negative index for non-negative inputs', () => {
    for (let t = 0; t <= 5000; t += 137) {
      for (let i = 0; i < 8; i++) {
        expect(iconIndexAt(t, i, 8)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
