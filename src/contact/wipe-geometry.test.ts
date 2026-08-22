import { describe, expect, it } from 'vitest';
import { flyingCells, sawtoothClip, WIPE_TEETH } from './wipe-geometry';

const points = (clip: string): number[][] =>
  clip
    .replace(/^polygon\(/, '')
    .replace(/\)$/, '')
    .split(',')
    .map((p) => p.trim().split(/\s+/).map((v) => parseFloat(v)));

describe('sawtoothClip', () => {
  it('is a polygon() clip-path', () => {
    expect(sawtoothClip(0.5)).toMatch(/^polygon\(/);
  });

  it('keeps a CONSTANT point count at every progress — GSAP cannot tween a changing polygon', () => {
    const counts = [0, 0.01, 0.25, 0.5, 0.75, 0.99, 1].map((t) => points(sawtoothClip(t)).length);
    expect(new Set(counts).size).toBe(1);
  });

  it('has two points per tooth plus the closing edge', () => {
    expect(points(sawtoothClip(0.5)).length).toBe(2 * WIPE_TEETH + 3);
  });

  it('reveals nothing at progress 0 — every edge point is at or past the right edge', () => {
    for (const [x] of points(sawtoothClip(0)).slice(2)) expect(x).toBeGreaterThanOrEqual(100);
  });

  it('covers everything at progress 1 — every edge point is at or past the left edge', () => {
    for (const [x] of points(sawtoothClip(1)).slice(2)) expect(x).toBeLessThanOrEqual(0);
  });

  it('advances monotonically — the edge only ever moves left', () => {
    let prev = Infinity;
    for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const lead = Math.min(...points(sawtoothClip(t)).slice(2).map(([x]) => x));
      expect(lead).toBeLessThanOrEqual(prev);
      prev = lead;
    }
  });

  it('alternates in and out so the edge is a sawtooth rather than a straight line', () => {
    const edge = points(sawtoothClip(0.5)).slice(2);
    const xs = edge.map(([x]) => x);
    expect(new Set(xs).size).toBeGreaterThan(1);
  });

  it('spans the full height — the first and last edge points sit on the top and bottom', () => {
    const edge = points(sawtoothClip(0.5)).slice(2);
    const ys = edge.map(([, y]) => y);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...ys)).toBeCloseTo(100, 6);
  });

  it('clamps out-of-range progress rather than flying off', () => {
    expect(sawtoothClip(-1)).toBe(sawtoothClip(0));
    expect(sawtoothClip(2)).toBe(sawtoothClip(1));
  });
});

describe('flyingCells', () => {
  it('returns a stable set of cells — the DOM nodes are built once and reused', () => {
    expect(flyingCells(0.2).length).toBe(flyingCells(0.9).length);
  });

  it('is deterministic: the same progress gives the same cells', () => {
    expect(flyingCells(0.4)).toEqual(flyingCells(0.4));
  });

  it('moves the cells leftward as the wipe advances, like the edge', () => {
    const early = flyingCells(0.2);
    const late = flyingCells(0.8);
    for (let i = 0; i < early.length; i++) expect(late[i].x).toBeLessThan(early[i].x);
  });

  it('gives every cell a positive size and a rotation near the emblem’s 45 degrees', () => {
    for (const c of flyingCells(0.5)) {
      expect(c.size).toBeGreaterThan(0);
      expect(Math.abs(c.rotate)).toBeGreaterThan(30);
      expect(Math.abs(c.rotate)).toBeLessThan(60);
    }
  });

  it('spreads them down the height rather than stacking them on one line', () => {
    const ys = flyingCells(0.5).map((c) => c.y);
    expect(new Set(ys).size).toBe(ys.length);
  });
});
