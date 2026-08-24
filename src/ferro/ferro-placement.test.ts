import { describe, expect, it } from 'vitest';
import { placementFor } from './ferro-placement';

const VP = { w: 1920, h: 1080 };
const OPTS = { distance: 4.2, fovYDeg: 35, boundingRadius: 1 };

describe('placementFor', () => {
  it('centres an object whose rect is centred', () => {
    const p = placementFor({ x: 860, y: 440, w: 200, h: 200 }, VP, OPTS);
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.y).toBeCloseTo(0, 10);
  });

  it('moves right for a rect right of centre', () => {
    const p = placementFor({ x: 1500, y: 440, w: 200, h: 200 }, VP, OPTS);
    expect(p.x).toBeGreaterThan(0);
  });

  it('moves DOWN in world -y for a rect below centre — screen y is flipped', () => {
    const p = placementFor({ x: 860, y: 900, w: 100, h: 100 }, VP, OPTS);
    expect(p.y).toBeLessThan(0);
  });

  it('doubles scale when the rect doubles in size', () => {
    const a = placementFor({ x: 0, y: 0, w: 200, h: 200 }, VP, OPTS);
    const b = placementFor({ x: 0, y: 0, w: 400, h: 400 }, VP, OPTS);
    expect(b.scale / a.scale).toBeCloseTo(2, 6);
  });

  it('fits the SMALLER dimension so the blob never overflows its rect', () => {
    const wide = placementFor({ x: 0, y: 0, w: 400, h: 100 }, VP, OPTS);
    const tall = placementFor({ x: 0, y: 0, w: 100, h: 400 }, VP, OPTS);
    expect(wide.scale).toBeCloseTo(tall.scale, 6);
  });

  it('ignores growth on the longer axis alone — the tight axis governs', () => {
    const square = placementFor({ x: 0, y: 0, w: 200, h: 200 }, VP, OPTS);
    const wide = placementFor({ x: 0, y: 0, w: 400, h: 200 }, VP, OPTS);
    expect(wide.scale).toBeCloseTo(square.scale, 10);
  });

  it('returns a zero scale for a degenerate viewport rather than Infinity', () => {
    const p = placementFor({ x: 0, y: 0, w: 100, h: 100 }, { w: 0, h: 0 }, OPTS);
    expect(p.scale).toBe(0);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });

  it('is independent of where the rect sits when sizing', () => {
    const a = placementFor({ x: 0, y: 0, w: 300, h: 300 }, VP, OPTS);
    const b = placementFor({ x: 900, y: 500, w: 300, h: 300 }, VP, OPTS);
    expect(a.scale).toBeCloseTo(b.scale, 10);
  });
});
