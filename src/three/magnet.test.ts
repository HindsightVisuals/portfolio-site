import { describe, expect, it } from 'vitest';
import {
  approachExp,
  magnetTarget,
  FOCUS_MAGNET_SCALE,
  MAGNET_EASE,
  MAGNET_X,
  MAGNET_Y,
} from './magnet';

describe('magnetTarget', () => {
  it('scales pointer x by the full range at rest', () => {
    const t = magnetTarget(1, 0, { suspended: false, focused: false });
    expect(t.x).toBeCloseTo(MAGNET_X);
  });

  it('inverts y — pointer coords run downward, world y runs up', () => {
    const t = magnetTarget(0, 1, { suspended: false, focused: false });
    expect(t.y).toBeCloseTo(-MAGNET_Y);
  });

  it('softens to FOCUS_MAGNET_SCALE while focused', () => {
    const t = magnetTarget(1, -1, { suspended: false, focused: true });
    expect(t.x).toBeCloseTo(MAGNET_X * FOCUS_MAGNET_SCALE);
    expect(t.y).toBeCloseTo(MAGNET_Y * FOCUS_MAGNET_SCALE);
  });

  it('collapses to zero while suspended, whatever the pointer is doing', () => {
    expect(magnetTarget(1, 1, { suspended: true, focused: false })).toEqual({ x: 0, y: 0 });
    expect(magnetTarget(-1, -1, { suspended: true, focused: true })).toEqual({ x: 0, y: 0 });
  });

  it('is centred when the pointer is centred', () => {
    const t = magnetTarget(0, 0, { suspended: false, focused: false });
    expect(t.x).toBeCloseTo(0);
    expect(t.y).toBeCloseTo(0);
  });
});

describe('approachExp', () => {
  it('moves toward the target without overshooting on a normal frame', () => {
    const next = approachExp(0, 10, 1 / 60);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(10);
  });

  it('lands exactly on target — never past it — when dt*rate exceeds 1', () => {
    expect(approachExp(0, 10, 5, MAGNET_EASE)).toBe(10);
    expect(approachExp(10, -10, 5, MAGNET_EASE)).toBe(-10);
  });

  it('does not move on a zero-length frame', () => {
    expect(approachExp(3, 10, 0)).toBe(3);
  });

  it('converges: repeated steps close the gap monotonically', () => {
    let v = 0;
    let prevGap = Infinity;
    for (let i = 0; i < 300; i++) {
      v = approachExp(v, 5, 1 / 60);
      const gap = Math.abs(5 - v);
      expect(gap).toBeLessThan(prevGap);
      prevGap = gap;
    }
    expect(v).toBeCloseTo(5, 2);
  });

  it('treats a negative dt as no movement rather than running backwards', () => {
    expect(approachExp(3, 10, -1)).toBe(3);
  });
});
