import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { initAtmosphere } from './atmosphere';

const inkUniform = (a: { object: THREE.Points }): { value: number } =>
  (a.object.material as THREE.ShaderMaterial).uniforms.uInk as { value: number };

// This suite runs under vitest's default node environment (no jsdom in this
// repo — see stage.test.ts for the same pattern), so `window` needs a stub:
// initAtmosphere reads window.devicePixelRatio.
beforeEach(() => {
  vi.stubGlobal('window', { devicePixelRatio: 1 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('initAtmosphere', () => {
  it('defaults to the 0.07 ink every existing page was tuned against', () => {
    const a = initAtmosphere();
    expect(inkUniform(a).value).toBeCloseTo(0.07, 6);
    a.destroy();
  });

  it('exposes ink as a uniform so the palette can drive it', () => {
    const a = initAtmosphere();
    a.setInk(0.82);
    expect(inkUniform(a).value).toBeCloseTo(0.82, 6);
    a.destroy();
  });

  it('clamps out-of-range ink instead of writing an invalid colour', () => {
    const a = initAtmosphere();
    a.setInk(4);
    expect(inkUniform(a).value).toBe(1);
    a.setInk(-1);
    expect(inkUniform(a).value).toBe(0);
    a.destroy();
  });

  it('no longer bakes the ink into the fragment source', () => {
    const a = initAtmosphere();
    const frag = (a.object.material as THREE.ShaderMaterial).fragmentShader;
    expect(frag).toContain('uInk');
    expect(frag).not.toContain('vec3(0.07)');
    a.destroy();
  });
});
