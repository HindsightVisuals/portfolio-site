import { describe, it, expect } from 'vitest';
import { clusterIslandCentres } from './array-geometry';

describe('clusterIslandCentres', () => {
  it('collapses Draco jitter so one island has ONE exact centre', () => {
    // Two islands, three verts each, each vert jittered a little.
    const raw = new Float32Array([
      1.0, 2.0, 3.0, 1.0002, 1.9998, 3.0001, 0.9999, 2.0001, 2.9998, -4.0, 0.5, 0.0, -3.9998,
      0.5002, 0.0001, -4.0001, 0.4999, -0.0002,
    ]);
    const { centres, count } = clusterIslandCentres(raw);

    expect(count).toBe(2);
    for (let i = 0; i < 3; i++) {
      expect(centres[i * 3 + 0]).toBe(centres[0]);
      expect(centres[i * 3 + 1]).toBe(centres[1]);
      expect(centres[i * 3 + 2]).toBe(centres[2]);
    }
    for (let i = 3; i < 6; i++) {
      expect(centres[i * 3 + 0]).toBe(centres[9]);
      expect(centres[i * 3 + 1]).toBe(centres[10]);
      expect(centres[i * 3 + 2]).toBe(centres[11]);
    }
  });

  it('puts each cluster at the mean of its members', () => {
    const raw = new Float32Array([0, 0, 0, 0.002, 0, 0]);
    const { centres, count } = clusterIslandCentres(raw, 0.01);
    expect(count).toBe(1);
    expect(centres[0]).toBeCloseTo(0.001, 5);
  });

  it('keeps genuinely distinct islands apart', () => {
    const raw = new Float32Array([0, 0, 0, 0.5, 0, 0, 1.0, 0, 0]);
    expect(clusterIslandCentres(raw).count).toBe(3);
  });

  it('returns a new array and does not touch the input', () => {
    const raw = new Float32Array([1, 1, 1, 1.0001, 1, 1]);
    const copy = Float32Array.from(raw);
    const { centres } = clusterIslandCentres(raw);
    expect(raw).toEqual(copy);
    expect(centres).not.toBe(raw);
  });

  it('handles an empty input', () => {
    const { centres, count } = clusterIslandCentres(new Float32Array(0));
    expect(count).toBe(0);
    expect(centres.length).toBe(0);
  });
});
