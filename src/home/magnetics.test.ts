import { describe, expect, it } from 'vitest';
import { magneticOffset } from './magnetics';

const OPTS = { radius: 120, bracketMax: 6, iconMax: 3 };
const CENTER = { x: 100, y: 100 };

describe('magneticOffset', () => {
  it('returns zero offsets outside the radius', () => {
    const s = magneticOffset({ x: 300, y: 100 }, CENTER, OPTS);
    expect(s.bracket).toEqual({ x: 0, y: 0 });
    expect(s.icon).toEqual({ x: 0, y: 0 });
    expect(s.proximity).toBe(0);
  });

  it('pulls toward the cursor, brackets leading the icon', () => {
    // cursor 30px to the right of center, well inside radius
    const s = magneticOffset({ x: 130, y: 100 }, CENTER, OPTS);
    expect(s.bracket.x).toBeGreaterThan(0);
    expect(s.bracket.y).toBeCloseTo(0, 5);
    expect(s.icon.x).toBeGreaterThan(0);
    expect(s.bracket.x).toBeGreaterThan(s.icon.x); // brackets lead
    expect(s.bracket.x).toBeLessThanOrEqual(OPTS.bracketMax);
  });

  it('is symmetric: cursor left of center pulls left', () => {
    const right = magneticOffset({ x: 130, y: 100 }, CENTER, OPTS);
    const left = magneticOffset({ x: 70, y: 100 }, CENTER, OPTS);
    expect(left.bracket.x).toBeCloseTo(-right.bracket.x, 5);
  });

  it('proximity grows as the cursor gets closer', () => {
    const far = magneticOffset({ x: 200, y: 100 }, CENTER, OPTS);
    const near = magneticOffset({ x: 120, y: 100 }, CENTER, OPTS);
    expect(near.proximity).toBeGreaterThan(far.proximity);
    expect(near.proximity).toBeLessThanOrEqual(1);
  });

  it('returns zero offsets when cursor sits exactly on center (no direction)', () => {
    const s = magneticOffset({ x: 100, y: 100 }, CENTER, OPTS);
    expect(s.bracket).toEqual({ x: 0, y: 0 });
    expect(s.icon).toEqual({ x: 0, y: 0 });
    expect(s.proximity).toBe(1);
  });
});
