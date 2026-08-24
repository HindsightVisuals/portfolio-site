import { describe, expect, it } from 'vitest';
import {
  TILE_GROW,
  TILE_PITCH,
  TILE_REACH,
  tileField,
  tileScale,
  tileCycleScale,
} from './wipe-geometry';

const VIEWPORT = { w: 2560, h: 1249 };
const field = tileField(VIEWPORT);

/** Mirrors .wipe-tile::after's `inset` in emblem.css. */
const INNER_INSET = 0.44;

/** Reach of a drawn tile from its centre — corner rounding included. */
const REACH = TILE_REACH;

/** A rotated square is the set of points whose |dx| + |dy| is within its reach. */
const covers = (t: { x: number; y: number }, px: number, py: number): boolean =>
  Math.abs(px - t.x) + Math.abs(py - t.y) <= REACH + 1e-9;

describe('tileField', () => {
  it('sits on the emblem’s lattice — rows half a column-pitch apart, offset half a pitch across', () => {
    const ys = [...new Set(field.map((t) => t.y))].sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeCloseTo(TILE_PITCH, 10);

    const rowA = field.filter((t) => t.y === ys[0]).map((t) => t.x).sort((a, b) => a - b);
    const rowB = field.filter((t) => t.y === ys[1]).map((t) => t.x).sort((a, b) => a - b);
    expect(rowA[1] - rowA[0]).toBeCloseTo(TILE_PITCH * 2, 10); // two pitches within a row
    expect(Math.abs(rowB[0] - rowA[0])).toBeCloseTo(TILE_PITCH, 10); // rows half-offset
  });

  it('covers every part of the viewport once the tiles are full', () => {
    // The whole point of the lattice: at full scale the diamonds meet
    // edge-to-edge, so the incoming page can hide behind the field until the
    // last tile lands. A gap anywhere would flash the outgoing page through it.
    for (let px = 0; px <= VIEWPORT.w; px += 37) {
      for (let py = 0; py <= VIEWPORT.h; py += 37) {
        expect(field.some((t) => covers(t, px, py))).toBe(true);
      }
    }
  });

  it('covers the four corners, which the overshoot ring exists for', () => {
    const corners: [number, number][] = [
      [0, 0],
      [VIEWPORT.w, 0],
      [0, VIEWPORT.h],
      [VIEWPORT.w, VIEWPORT.h],
    ];
    for (const [px, py] of corners) expect(field.some((t) => covers(t, px, py))).toBe(true);
  });

  const nearest = (x: number, y: number) =>
    field.reduce((a, b) => (Math.hypot(a.x - x, a.y - y) < Math.hypot(b.x - x, b.y - y) ? a : b));

  it('builds out from the middle of the right edge', () => {
    const origin = nearest(VIEWPORT.w, VIEWPORT.h / 2);
    for (const t of field) expect(origin.order).toBeLessThanOrEqual(t.order);
  });

  it('reaches the far side last, and reaches it at both corners together', () => {
    // Taxicab distance from the middle of the right edge puts the two LEFT
    // corners equidistant. If they came in at different times the front would
    // be lopsided rather than a diamond.
    const topLeft = nearest(0, 0);
    const bottomLeft = nearest(0, VIEWPORT.h);
    expect(topLeft.order).toBeCloseTo(bottomLeft.order, 1);
    expect(topLeft.order).toBeGreaterThan(nearest(VIEWPORT.w / 2, VIEWPORT.h / 2).order);
  });

  it('travels right to left — a tile’s order tracks its distance from the right edge', () => {
    const midHeight = VIEWPORT.h / 2;
    const a = nearest(VIEWPORT.w - 300, midHeight);
    const b = nearest(VIEWPORT.w - 900, midHeight);
    const c = nearest(300, midHeight);
    expect(a.order).toBeLessThan(b.order);
    expect(b.order).toBeLessThan(c.order);
  });

  it('spreads as a diamond, not a circle — equal taxicab distance means equal order', () => {
    // Straight out from the origin vs the same taxicab distance taken
    // diagonally. A radial (circular) sweep would order these differently.
    const straight = nearest(VIEWPORT.w - 600, VIEWPORT.h / 2);
    const diagonal = nearest(VIEWPORT.w - 300, VIEWPORT.h / 2 - 300);
    expect(straight.order).toBeCloseTo(diagonal.order, 2);
  });

  it('runs the order over the full 0..1 range', () => {
    const orders = field.map((t) => t.order);
    expect(Math.min(...orders)).toBeCloseTo(0, 10);
    expect(Math.max(...orders)).toBeCloseTo(1, 10);
  });

  it('puts a whole diamond ring in the same band', () => {
    // Taxicab iso-lines run at 45 degrees and so does the lattice, so a ring of
    // tiles shares an order EXACTLY. That is what makes each ring land as one
    // clean diamond rather than as a stair-stepped approximation of one.
    const counts = new Map();
    for (const t of field) counts.set(t.order, (counts.get(t.order) ?? 0) + 1);
    // Rings, not tiles: a couple of dozen distinct arrival times across ~230 tiles.
    expect(counts.size).toBeLessThan(field.length / 4);
    expect(Math.max(...counts.values())).toBeGreaterThan(4);
  });

  it('scales its tile count with the viewport rather than fixing it', () => {
    expect(tileField({ w: 5000, h: 2500 }).length).toBeGreaterThan(field.length);
  });

  it('survives a degenerate viewport instead of looping forever', () => {
    expect(tileField({ w: 0, h: 0 }).length).toBeGreaterThan(0);
  });
});

describe('tileScale', () => {
  const orders = [0, 0.25, 0.5, 0.75, 1];

  it('starts every tile at nothing', () => {
    for (const o of orders) expect(tileScale(o, 0)).toBe(0);
  });

  it('ends every tile at full — including the very last one to start', () => {
    for (const o of orders) expect(tileScale(o, 1)).toBeCloseTo(1, 10);
  });

  it('never goes backwards as the timeline advances', () => {
    for (const o of orders) {
      let prev = -Infinity;
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const s = tileScale(o, t);
        expect(s).toBeGreaterThanOrEqual(prev);
        prev = s;
      }
    }
  });

  it('grows earlier tiles first — the whole point of the sequence', () => {
    const mid = 0.5;
    expect(tileScale(0, mid)).toBeGreaterThan(tileScale(0.5, mid));
    expect(tileScale(0.5, mid)).toBeGreaterThan(tileScale(1, mid));
  });

  it('finishes the first tile a whole grow-window before the timeline ends', () => {
    expect(tileScale(0, TILE_GROW)).toBeCloseTo(1, 10);
    expect(tileScale(1, 1 - TILE_GROW)).toBe(0);
  });

  it('clamps out-of-range input rather than flying off', () => {
    expect(tileScale(0.5, -1)).toBe(0);
    expect(tileScale(0.5, 2)).toBeCloseTo(1, 10);
    expect(tileScale(-1, 0.5)).toBe(tileScale(0, 0.5));
    expect(tileScale(2, 0.5)).toBe(tileScale(1, 0.5));
  });
});

describe('tileCycleScale', () => {
  it('is empty at both ends and full in the middle', () => {
    for (const o of [0, 0.5, 1]) {
      expect(tileCycleScale(o, 0)).toBe(0);
      expect(tileCycleScale(o, 1)).toBeCloseTo(1, 10);
      expect(tileCycleScale(o, 2)).toBeCloseTo(0, 10);
    }
  });

  it('leaves in the order it arrived, so the front never doubles back', () => {
    // First on, first off. Reversed, the last tile to arrive would be the first
    // to go and the front would bounce back toward the origin instead of
    // carrying on right to left.
    const early = 0.1;
    const late = 0.9;
    expect(tileCycleScale(early, 1.5)).toBeLessThan(tileCycleScale(late, 1.5));
    expect(tileCycleScale(early, 0.5)).toBeGreaterThan(tileCycleScale(late, 0.5));
  });

  it('hands over at full coverage — every tile is full at the halfway point', () => {
    // The page swap happens here, so a single tile short of full would flash
    // the outgoing page through the gap.
    for (let o = 0; o <= 1; o += 0.05) expect(tileCycleScale(o, 1)).toBeCloseTo(1, 10);
  });

  it('clamps past either end rather than inverting', () => {
    expect(tileCycleScale(0.5, -1)).toBe(0);
    expect(tileCycleScale(0.5, 3)).toBeCloseTo(0, 10);
  });
});

describe('tile sizing', () => {
  it('reaches past the lattice pitch even with its corners rounded off', () => {
    // Four tiles meet at their TIPS, and a rounded tip is short of where a
    // sharp one would be. Miss this and the field grows a grid of pinholes at
    // every four-way join, each showing the page it is supposed to be hiding.
    expect(TILE_REACH).toBeGreaterThan(TILE_PITCH);
  });

  it('keeps the inner square clear of where tiles overlap', () => {
    // The white square must never stray into the overlap, or one tile's white
    // would paint over its neighbour's black.
    const innerReach = (TILE_REACH * (1 - 2 * INNER_INSET)) / 1;
    expect(innerReach).toBeLessThan(TILE_PITCH);
  });
});
