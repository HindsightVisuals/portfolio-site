import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeTileMaterial } from './tile-material';

const tex = (): THREE.Texture => new THREE.Texture();

describe('makeTileMaterial', () => {
  it('starts fully desaturated and fully faded in', () => {
    const h = makeTileMaterial(tex());
    expect(h.material.uniforms.uSat.value).toBe(0);
    expect(h.material.uniforms.uFade.value).toBe(1);
    h.dispose();
  });

  it('writes saturation and fade through to the uniforms', () => {
    const h = makeTileMaterial(tex());
    h.setSaturation(0.5);
    h.setFade(0.25);
    expect(h.material.uniforms.uSat.value).toBe(0.5);
    expect(h.material.uniforms.uFade.value).toBe(0.25);
    h.dispose();
  });

  it('clamps out-of-range values rather than passing them to the shader', () => {
    const h = makeTileMaterial(tex());
    h.setSaturation(5);
    h.setFade(-2);
    expect(h.material.uniforms.uSat.value).toBe(1);
    expect(h.material.uniforms.uFade.value).toBe(0);
    h.dispose();
  });

  it('is transparent, so the materialize fade can actually show', () => {
    const h = makeTileMaterial(tex());
    expect(h.material.transparent).toBe(true);
    h.dispose();
  });

  it('decodes the map as sRGB and re-encodes the output', () => {
    const t = tex();
    const h = makeTileMaterial(t);
    expect(t.colorSpace).toBe(THREE.SRGBColorSpace);
    // Without this include a raw ShaderMaterial writes linear values straight
    // to an sRGB target and every tile renders washed out.
    expect(h.material.fragmentShader).toContain('<colorspace_fragment>');
    h.dispose();
  });
});
