import { describe, expect, it } from 'vitest';
import { cellScale, EMBLEM_CELLS, EMBLEM_ROWS, type EmblemCell } from './emblem-grid';

const ys = [...new Set(EMBLEM_CELLS.map((c) => c.y))].sort((a, b) => a - b);
const rowsOf = (n: number): EmblemCell[] => EMBLEM_CELLS.filter((c) => c.y === ys[n]);
const span = (vals: number[]): number => Math.max(...vals) - Math.min(...vals);

describe('EMBLEM_CELLS', () => {
  it('has the 25 cells the emblem is drawn from', () => {
    expect(EMBLEM_CELLS).toHaveLength(25);
  });

  it('lays them out in seven rows of 4-3-4-3-4-3-4', () => {
    expect(EMBLEM_ROWS).toBe(7);
    expect([0, 1, 2, 3, 4, 5, 6].map((r) => rowsOf(r).length)).toEqual([4, 3, 4, 3, 4, 3, 4]);
  });

  it('keeps every cell inside the emblem box', () => {
    for (const c of EMBLEM_CELLS) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(1);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThanOrEqual(1);
    }
  });

  it('reads square — the lattice spans the same distance across as it does down', () => {
    // Adam, on the first build: "I need this to be square. Currently it's
    // reading somewhat tall rectangular." It was: x spanned 0.75 of the box
    // (four columns at a quarter-pitch) while y spanned the whole 1.0.
    expect(span(EMBLEM_CELLS.map((c) => c.x))).toBeCloseTo(
      span(EMBLEM_CELLS.map((c) => c.y)),
      10,
    );
  });

  it('is centred in the box — equal margin on all four sides', () => {
    const xs = EMBLEM_CELLS.map((c) => c.x);
    const yy = EMBLEM_CELLS.map((c) => c.y);
    expect(Math.min(...xs)).toBeCloseTo(1 - Math.max(...xs), 10);
    expect(Math.min(...yy)).toBeCloseTo(1 - Math.max(...yy), 10);
    expect(Math.min(...xs)).toBeCloseTo(Math.min(...yy), 10);
  });

  it('steps down exactly as far as it steps across — a true 45-degree lattice', () => {
    // Rows are offset half a horizontal pitch from each other, so the vertical
    // pitch has to match that half-step or the diamonds shear. This is also
    // what lets the same tile geometry tile the plane edge-to-edge, which the
    // page transition relies on.
    const rowPitch = ys[1] - ys[0];
    const xs = rowsOf(0).map((c) => c.x).sort((a, b) => a - b);
    const halfStep = (xs[1] - xs[0]) / 2;
    expect(rowPitch).toBeCloseTo(halfStep, 10);
  });

  it('offsets each row half a step from the one above — a diagonal lattice, not a grid', () => {
    // If rows shared x positions this would be a square grid and the emblem
    // would read as a checkerboard rather than the diamond it is.
    const row0 = rowsOf(0).map((c) => c.x).sort();
    const row1 = rowsOf(1).map((c) => c.x).sort();
    for (const x of row1) expect(row0).not.toContain(x);
  });
});

describe('rest scale', () => {
  const centre = EMBLEM_CELLS.reduce((a, b) =>
    Math.hypot(a.x - 0.5, a.y - 0.5) < Math.hypot(b.x - 0.5, b.y - 0.5) ? a : b,
  );

  it('is largest at the middle', () => {
    for (const c of EMBLEM_CELLS) expect(c.restScale).toBeLessThanOrEqual(centre.restScale);
  });

  it('falls off with distance from the middle', () => {
    const far = EMBLEM_CELLS.reduce((a, b) =>
      Math.hypot(a.x - 0.5, a.y - 0.5) > Math.hypot(b.x - 0.5, b.y - 0.5) ? a : b,
    );
    expect(far.restScale).toBeLessThan(centre.restScale);
  });

  it('never rests at full scale — beat 2 fills them in, and that needs somewhere to go', () => {
    for (const c of EMBLEM_CELLS) expect(c.restScale).toBeLessThan(1);
  });

  it('never rests at zero — every cell is visible at rest', () => {
    for (const c of EMBLEM_CELLS) expect(c.restScale).toBeGreaterThan(0);
  });
});

describe('cellScale', () => {
  const OPTS = { radius: 90, boost: 0.6 };
  const cell: EmblemCell = { x: 0.5, y: 0.5, restScale: 0.5 };

  it('returns the rest scale with no pointer', () => {
    expect(cellScale(cell, null, OPTS)).toBeCloseTo(0.5, 10);
  });

  it('returns the rest scale for a pointer beyond the radius', () => {
    expect(cellScale(cell, { x: 1000, y: 1000 }, OPTS)).toBeCloseTo(0.5, 10);
  });

  it('raises a cell the pointer sits on', () => {
    // pointer given in the same normalised space as the cell, times 64
    expect(cellScale(cell, { x: 32, y: 32 }, OPTS)).toBeGreaterThan(0.5);
  });

  it('raises a near cell more than a far one', () => {
    const near = cellScale(cell, { x: 36, y: 32 }, OPTS);
    const far = cellScale(cell, { x: 70, y: 32 }, OPTS);
    expect(near).toBeGreaterThan(far);
  });

  it('never exceeds full scale, however close the pointer', () => {
    const hot: EmblemCell = { x: 0.5, y: 0.5, restScale: 0.95 };
    expect(cellScale(hot, { x: 32, y: 32 }, { radius: 90, boost: 5 })).toBeLessThanOrEqual(1);
  });

  it('is stable for a degenerate radius rather than dividing by zero', () => {
    expect(Number.isFinite(cellScale(cell, { x: 32, y: 32 }, { radius: 0, boost: 0.6 }))).toBe(true);
  });
});
