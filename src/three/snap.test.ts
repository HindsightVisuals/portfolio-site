import { describe, expect, it } from 'vitest';
import { resolveSnapTarget } from './snap';

const RESTS = [34, -26, -86, -146]; // home, work, about, contact camera rests

describe('resolveSnapTarget', () => {
  it('returns the nearest rest when still', () => {
    expect(resolveSnapTarget(30, 0, RESTS)).toBe(34);
    expect(resolveSnapTarget(-30, 0, RESTS)).toBe(-26);
  });

  it('biases toward travel direction when moving', () => {
    // just past home, moving deeper (negative v): prefer work even though home is nearer
    expect(resolveSnapTarget(20, -5, RESTS)).toBe(-26);
    // between about and work, moving back out (positive v): prefer work
    expect(resolveSnapTarget(-60, 5, RESTS)).toBe(-26);
  });

  it('ignores direction bias below the bias threshold', () => {
    expect(resolveSnapTarget(20, -0.2, RESTS)).toBe(34);
  });

  it('clamps at the ends (no target beyond the spine)', () => {
    expect(resolveSnapTarget(50, 5, RESTS)).toBe(34);
    expect(resolveSnapTarget(-160, -5, RESTS)).toBe(-146);
  });
});
