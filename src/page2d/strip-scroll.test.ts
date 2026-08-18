import { describe, expect, it } from 'vitest';
import { stripScrollLength, stripTransform } from './strip-scroll';

const STRIP = 8165;
const VP = 1920;
const LEN = STRIP - VP; // 6245

describe('stripScrollLength', () => {
  it('is the strip overrun beyond one viewport', () => {
    expect(stripScrollLength(STRIP, VP)).toBe(LEN);
  });

  it('is zero when the strip already fits', () => {
    expect(stripScrollLength(800, VP)).toBe(0);
  });
});

describe('stripTransform', () => {
  it('sits at the start before the section is reached', () => {
    expect(stripTransform(0, 5000, STRIP, VP)).toEqual({ x: 0, progress: 0 });
  });

  it('is halfway through its travel at half progress', () => {
    const r = stripTransform(5000 + LEN / 2, 5000, STRIP, VP);
    expect(r.progress).toBeCloseTo(0.5, 6);
    expect(r.x).toBeCloseTo(-LEN / 2, 6);
  });

  it('finishes travelling exactly as the section finishes scrolling', () => {
    const r = stripTransform(5000 + LEN, 5000, STRIP, VP);
    expect(r.progress).toBe(1);
    expect(r.x).toBe(-LEN);
  });

  it('parks at the end rather than running off when scrolled past', () => {
    const r = stripTransform(5000 + LEN * 3, 5000, STRIP, VP);
    expect(r.progress).toBe(1);
    expect(r.x).toBe(-LEN);
  });

  it('never moves a strip that already fits the viewport', () => {
    expect(stripTransform(9999, 0, 800, VP)).toEqual({ x: 0, progress: 0 });
  });

  it('is monotonic across the whole travel', () => {
    let prev = 1;
    for (let i = 0; i <= 20; i++) {
      const { x } = stripTransform(5000 + (i / 20) * LEN, 5000, STRIP, VP);
      expect(x).toBeLessThanOrEqual(prev);
      prev = x;
    }
  });
});
