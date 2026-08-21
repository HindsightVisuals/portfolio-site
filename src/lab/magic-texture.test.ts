import { describe, expect, it } from 'vitest';
import { magic } from './magic-texture';

/**
 * Ground truth sampled from the live blend file
 * (`00_Blend/01_Comms/Contact Object Ferro.blend`) via Blender's own
 * `Texture.evaluate()`, at that texture's settings: depth 1, turbulence
 * 4.10002. RGBA, where A is Blender's intensity (`tin`) — the channel the
 * Displace modifier reads.
 *
 * These numbers are the contract. If the port drifts from Blender, the
 * ferrofluid in the browser stops being the ferrofluid Adam art-directed.
 */
const DEPTH = 1;
const TURBULENCE = 4.10002;

const BLENDER_SAMPLES: Array<{ p: [number, number, number]; rgba: [number, number, number, number] }> =
  [
    { p: [0, 0, 0], rgba: [0.5, 0.46542, 1, 0.65514] },
    { p: [0.5, 0, 0], rgba: [0.20076, 0.38415, 0.09943, 0.22811] },
    { p: [0, 0.5, 0], rgba: [0.20076, 0.38415, 0.09943, 0.22811] },
    { p: [0, 0, 0.5], rgba: [0.20076, 0.38415, 0.09943, 0.22811] },
    { p: [0.3, -0.2, 0.7], rgba: [0.8784, 0.91376, 0.005, 0.59905] },
    { p: [1, 1, 1], rgba: [0.17486, 0.99884, 0.64183, 0.60518] },
    { p: [-0.4, 0.9, -0.6], rgba: [0.73971, 0.99388, 0.85433, 0.86264] },
    { p: [0.84, 0, 0], rgba: [0.93579, 0.99801, 0.25487, 0.72955] },
    { p: [0, 0, -6.28], rgba: [0.49204, 0.47204, 0.99994, 0.65467] },
    { p: [0.2, 0.2, 10], rgba: [0.00669, 0.92816, 0.17993, 0.37159] },
  ];

describe('magic — Blender parity', () => {
  for (const { p, rgba } of BLENDER_SAMPLES) {
    it(`matches Blender at (${p.join(', ')})`, () => {
      const got = magic(p[0], p[1], p[2], DEPTH, TURBULENCE);
      expect(got.r).toBeCloseTo(rgba[0], 4);
      expect(got.g).toBeCloseTo(rgba[1], 4);
      expect(got.b).toBeCloseTo(rgba[2], 4);
      expect(got.intensity).toBeCloseTo(rgba[3], 4);
    });
  }

  it('is symmetric across the three axes at equal displacement', () => {
    // Blender returned identical values for (0.5,0,0), (0,0.5,0), (0,0,0.5);
    // the first sine term is p.x+p.y+p.z, so that symmetry is structural.
    const a = magic(0.5, 0, 0, DEPTH, TURBULENCE);
    const b = magic(0, 0.5, 0, DEPTH, TURBULENCE);
    const c = magic(0, 0, 0.5, DEPTH, TURBULENCE);
    expect(a.intensity).toBeCloseTo(b.intensity, 10);
    expect(b.intensity).toBeCloseTo(c.intensity, 10);
  });

  it('stays inside the 0..1 band the Displace mid-level assumes', () => {
    for (let i = 0; i < 400; i++) {
      const t = i / 40;
      const { intensity } = magic(Math.sin(t) * 3, Math.cos(t * 1.7) * 3, t - 5, DEPTH, TURBULENCE);
      expect(intensity).toBeGreaterThanOrEqual(0);
      expect(intensity).toBeLessThanOrEqual(1);
    }
  });
});
