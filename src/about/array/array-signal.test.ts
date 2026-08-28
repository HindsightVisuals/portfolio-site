import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  SIGNAL_GREEN,
  SIGNAL_PALE,
  SIGNAL_DISPLACE,
  makeSignalMaterial,
} from './array-signal';
import { signalFalloff } from './array-math';

describe('signal colours match the rig', () => {
  it('carries ColorRamp.003 verbatim — green core to pale end', () => {
    expect(SIGNAL_GREEN.toArray().map((v) => +v.toFixed(3))).toEqual([0.091, 1, 0.193]);
    expect(SIGNAL_PALE.toArray().map((v) => +v.toFixed(3))).toEqual([0.657, 1, 0.378]);
  });

  it('uses the modifier strength from the Blender Displace', () => {
    expect(SIGNAL_DISPLACE).toBeCloseTo(2.04, 3);
  });
});

describe('makeSignalMaterial', () => {
  it('is additive and does not write depth — it is a glow, not a solid', () => {
    const h = makeSignalMaterial();
    expect(h.material.transparent).toBe(true);
    expect(h.material.depthWrite).toBe(false);
    expect(h.material.blending).toBe(THREE.AdditiveBlending);
    h.dispose();
  });

  it('samples the noise in the CURSOR space, so the beam writhes as it moves', () => {
    // Blender's Displace uses texture_coords = OBJECT -> Cursor. Sampling in
    // the beam's own space would give a beam that only churns in place.
    const h = makeSignalMaterial();
    expect(h.material.vertexShader).toContain('position - uCursorLocal');
    h.dispose();
  });

  it('drives strength by the rig quartic falloff', () => {
    const h = makeSignalMaterial();
    h.setCursorDistance(0);
    expect(h.material.uniforms.uStrength.value).toBeCloseTo(1, 6);
    h.setCursorDistance(1);
    expect(h.material.uniforms.uStrength.value).toBeCloseTo(signalFalloff(1) / 10, 6);
    // Blazes close, dies fast.
    h.setCursorDistance(3);
    expect(h.material.uniforms.uStrength.value).toBeLessThan(0.02);
    h.dispose();
  });

  it('writes the cursor and time uniforms', () => {
    const h = makeSignalMaterial();
    h.setCursorLocal(new THREE.Vector3(1, 2, 3));
    h.setTime(4.5);
    expect(h.material.uniforms.uCursorLocal.value.toArray()).toEqual([1, 2, 3]);
    expect(h.material.uniforms.uTime.value).toBe(4.5);
    h.dispose();
  });
});
