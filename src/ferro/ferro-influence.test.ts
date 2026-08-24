import { describe, expect, it } from 'vitest';
import { countWords, driftSteer, wordStrength } from './ferro-influence';

const RECT = { x: 100, y: 100, w: 200, h: 200 }; // centre 200,200

describe('driftSteer', () => {
  it('is neutral with no pointer — the ambient drift is unsteered', () => {
    expect(driftSteer(null, RECT, 300)).toEqual({ x: 0, y: 0 });
  });

  it('is neutral at the exact centre rather than dividing by zero', () => {
    const s = driftSteer({ x: 200, y: 200 }, RECT, 300);
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
  });

  it('steers +x when the pointer is to the right', () => {
    expect(driftSteer({ x: 320, y: 200 }, RECT, 300).x).toBeGreaterThan(0);
  });

  it('steers +y in world space when the pointer is ABOVE — screen y is flipped', () => {
    expect(driftSteer({ x: 200, y: 80 }, RECT, 300).y).toBeGreaterThan(0);
  });

  it('falls to zero beyond the radius', () => {
    const s = driftSteer({ x: 200 + 400, y: 200 }, RECT, 300);
    expect(s.x).toBeCloseTo(0, 10);
    expect(s.y).toBeCloseTo(0, 10);
  });

  it('never exceeds unit magnitude', () => {
    for (const p of [{ x: 500, y: 500 }, { x: -100, y: -100 }, { x: 201, y: 200 }]) {
      const s = driftSteer(p, RECT, 300);
      expect(Math.hypot(s.x, s.y)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('countWords', () => {
  it('counts only completed words — a trailing partial does not count yet', () => {
    expect(countWords('hello wor')).toBe(1);
    expect(countWords('hello world ')).toBe(2);
  });

  it('is zero for empty and whitespace-only input', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\t ')).toBe(0);
  });

  it('collapses runs of whitespace', () => {
    expect(countWords('a    b\n\nc ')).toBe(3);
  });
});

describe('wordStrength', () => {
  it('starts at the base strength with nothing typed', () => {
    expect(wordStrength(0, { base: 1.05, max: 1.8, halfLife: 25 })).toBeCloseTo(1.05, 6);
  });

  it('rises monotonically as words accumulate', () => {
    let prev = -Infinity;
    for (const n of [0, 1, 5, 20, 60, 200]) {
      const v = wordStrength(n);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('saturates below the ceiling however much is typed', () => {
    expect(wordStrength(100000, { base: 1.05, max: 1.8, halfLife: 25 })).toBeLessThanOrEqual(1.8);
  });

  it('treats negative or non-finite counts as zero', () => {
    expect(wordStrength(-5)).toBeCloseTo(wordStrength(0), 10);
    expect(Number.isFinite(wordStrength(Number.NaN))).toBe(true);
  });
});
