import { describe, expect, it } from 'vitest';
import { normalizeWheelDelta } from './wheel';

describe('normalizeWheelDelta', () => {
  it('passes pixel deltas through (deltaMode 0)', () => {
    expect(normalizeWheelDelta(120, 0)).toBe(120);
  });
  it('converts line deltas (deltaMode 1)', () => {
    expect(normalizeWheelDelta(3, 1)).toBe(48);
  });
  it('converts page deltas (deltaMode 2)', () => {
    expect(normalizeWheelDelta(1, 2)).toBe(800);
  });
});
