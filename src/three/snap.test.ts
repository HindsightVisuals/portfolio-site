import { describe, expect, it } from 'vitest';
import { resolveSnapTarget, shouldSnapNow, SCROLL_IDLE_MS } from './snap';

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

describe('shouldSnapNow', () => {
  const SNAP_BELOW = 2.0;

  it('snaps as soon as the wheel goes quiet, however fast the camera is still moving', () => {
    expect(shouldSnapNow(-60, SCROLL_IDLE_MS, SNAP_BELOW)).toBe(true);
    expect(shouldSnapNow(200, SCROLL_IDLE_MS + 50, SNAP_BELOW)).toBe(true);
  });

  it('holds off mid-gesture so a sustained scroll can ride through to a further page', () => {
    // trackpad cadence ~16ms, wheel-notch train ~50ms — both well inside the window
    expect(shouldSnapNow(-60, 16, SNAP_BELOW)).toBe(false);
    expect(shouldSnapNow(-60, 50, SNAP_BELOW)).toBe(false);
    expect(shouldSnapNow(-60, SCROLL_IDLE_MS - 1, SNAP_BELOW)).toBe(false);
  });

  it('still snaps mid-gesture once momentum has died on its own', () => {
    expect(shouldSnapNow(-1.5, 16, SNAP_BELOW)).toBe(true);
    expect(shouldSnapNow(0.5, 0, SNAP_BELOW)).toBe(true);
  });

  it('never fires on a camera that is not moving', () => {
    expect(shouldSnapNow(0, 10_000, SNAP_BELOW)).toBe(false);
  });

  it('respects a caller-supplied idle window', () => {
    expect(shouldSnapNow(-60, 120, SNAP_BELOW, 250)).toBe(false);
    expect(shouldSnapNow(-60, 250, SNAP_BELOW, 250)).toBe(true);
  });
});
