import { describe, it, expect } from 'vitest';
import { makePanelMaterial, EMISSION_COLOR } from './array-material';
import {
  CURSOR_RADIUS,
  EXPLODE_NEAR,
  EXPLODE_FAR,
  SCALE_MIN,
  GLOW_RADIUS,
  EMISSION_MAX,
  CENTRE_SCALE,
} from './array-math';

describe('makePanelMaterial', () => {
  it('exposes the uniforms the frame loop writes', () => {
    const h = makePanelMaterial();
    const u = h.material.uniforms;
    expect(u.uCursor).toBeDefined();
    expect(u.uCursorRadius.value).toBeCloseTo(CURSOR_RADIUS, 4);
    expect(u.uAmbient.value).toBe(0);
    expect(u.uCursorAmount.value).toBe(0);
    expect(u.uTime.value).toBe(0);
    h.dispose();
  });

  it('bakes the measured thresholds into the shader source, not magic numbers', () => {
    const h = makePanelMaterial();
    const src = h.material.vertexShader + h.material.fragmentShader;
    for (const v of [EXPLODE_NEAR, EXPLODE_FAR, SCALE_MIN, GLOW_RADIUS, EMISSION_MAX, CENTRE_SCALE]) {
      expect(src).toContain(String(v));
    }
    h.dispose();
  });

  it('emits float literals only — an int literal fails to compile in GLSL ES', () => {
    const h = makePanelMaterial();
    // `mix(0.57, 1, t)` is the exact shape that would break, and it would break
    // silently: without rAF no shader ever compiles in an occluded tab.
    expect(h.material.vertexShader).not.toMatch(/mix\([\d.]+,\s*1,/);
    h.dispose();
  });

  it('declares the baked island attribute', () => {
    const h = makePanelMaterial();
    expect(h.material.vertexShader).toContain('attribute vec3 aIslandC;');
    h.dispose();
  });

  it('writes the cursor uniform through setCursor', () => {
    const h = makePanelMaterial();
    h.setCursor(1, 2, 3);
    expect(h.material.uniforms.uCursor.value.toArray()).toEqual([1, 2, 3]);
    h.dispose();
  });

  it('clamps the two amplitudes to 0..1', () => {
    const h = makePanelMaterial();
    h.setAmbient(5);
    h.setCursorAmount(-2);
    expect(h.material.uniforms.uAmbient.value).toBe(1);
    expect(h.material.uniforms.uCursorAmount.value).toBe(0);
    h.dispose();
  });

  it('uses the rig emission colour', () => {
    expect(EMISSION_COLOR.r).toBeCloseTo(0.164, 3);
    expect(EMISSION_COLOR.g).toBeCloseTo(1, 3);
    expect(EMISSION_COLOR.b).toBeCloseTo(0.248, 3);
  });
});
