import { describe, expect, it } from 'vitest';
import { ENTER_EPS, shouldEnterCorridor, shouldLeaveCorridor } from './about-handover';

const REST = -26;

describe('shouldEnterCorridor', () => {
  it('enters on a forward scroll at the Work rest', () => {
    expect(shouldEnterCorridor({ open: false, cameraZ: REST, restZ: REST, deltaPx: 120 })).toBe(true);
  });

  it('does not enter on a backward scroll at the rest', () => {
    // Scrolling up at the Work rest belongs to the director — it travels back
    // toward Home. This is the whole point of the handover being directional.
    expect(shouldEnterCorridor({ open: false, cameraZ: REST, restZ: REST, deltaPx: -120 })).toBe(false);
  });

  it('does not enter while still short of the rest', () => {
    // Mid-flight from Home. The director owns the camera until it settles.
    expect(shouldEnterCorridor({ open: false, cameraZ: REST + 20, restZ: REST, deltaPx: 120 })).toBe(false);
  });

  it('enters from within a small epsilon, not only from an exact match', () => {
    // The settle lands "on" the rest to within a fraction of a unit; requiring
    // exact equality would mean the corridor could never be entered.
    expect(shouldEnterCorridor({ open: false, cameraZ: REST + ENTER_EPS / 2, restZ: REST, deltaPx: 120 })).toBe(true);
    expect(ENTER_EPS).toBeGreaterThan(0);
    expect(ENTER_EPS).toBeLessThan(5);
  });

  it('enters when already past the rest — momentum must not skip the corridor', () => {
    // A hard flick can carry the camera beyond the rest before the settle
    // catches it. Without this the wheel would keep feeding the director into
    // empty space where two destinations used to be.
    expect(shouldEnterCorridor({ open: false, cameraZ: REST - 8, restZ: REST, deltaPx: 120 })).toBe(true);
  });

  it('never enters when already open', () => {
    expect(shouldEnterCorridor({ open: true, cameraZ: REST, restZ: REST, deltaPx: 120 })).toBe(false);
  });

  it('ignores a zero or non-finite delta', () => {
    expect(shouldEnterCorridor({ open: false, cameraZ: REST, restZ: REST, deltaPx: 0 })).toBe(false);
    expect(shouldEnterCorridor({ open: false, cameraZ: REST, restZ: REST, deltaPx: NaN })).toBe(false);
  });
});

describe('shouldLeaveCorridor', () => {
  it('leaves on a backward scroll at the very start', () => {
    expect(shouldLeaveCorridor({ open: true, t: 0, deltaPx: -120 })).toBe(true);
  });

  it('does not leave on a backward scroll mid-corridor', () => {
    expect(shouldLeaveCorridor({ open: true, t: 0.4, deltaPx: -120 })).toBe(false);
  });

  it('does not leave on a forward scroll at the start', () => {
    expect(shouldLeaveCorridor({ open: true, t: 0, deltaPx: 120 })).toBe(false);
  });

  it('never leaves when closed', () => {
    expect(shouldLeaveCorridor({ open: false, t: 0, deltaPx: -120 })).toBe(false);
  });

  it('ignores a zero or non-finite delta', () => {
    expect(shouldLeaveCorridor({ open: true, t: 0, deltaPx: 0 })).toBe(false);
    expect(shouldLeaveCorridor({ open: true, t: 0, deltaPx: NaN })).toBe(false);
  });
});
