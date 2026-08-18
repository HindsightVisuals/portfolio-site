/**
 * The WORK tiles' material: a project thumbnail that can be greyed out and
 * faded independently.
 *
 * Why not MeshBasicMaterial — it has no saturation control, and the wall's whole
 * hover language is "grey until you point at it". Why a hand-written shader
 * rather than onBeforeCompile — the injection points three exposes are
 * version-sensitive, and this repo already writes raw GLSL in background.ts.
 *
 * The colorspace_fragment include is load-bearing. three only injects output
 * encoding automatically for its own materials; a raw ShaderMaterial that skips
 * it writes linear values into an sRGB target and every tile renders washed out.
 */

import * as THREE from 'three';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = `
uniform sampler2D uMap;
uniform float uSat;
uniform float uFade;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float l = dot(t.rgb, vec3(0.2126, 0.7152, 0.0722)); // Rec.709 luma
  gl_FragColor = vec4(mix(vec3(l), t.rgb, uSat), t.a * uFade);
  #include <colorspace_fragment>
}
`;

export interface TileMaterialHandle {
  material: THREE.ShaderMaterial;
  /** 0 = fully grey, 1 = full colour. */
  setSaturation(v: number): void;
  /** Materialize opacity, 0..1 — the same fade the label screens use. */
  setFade(v: number): void;
  dispose(): void;
}

export function makeTileMaterial(map: THREE.Texture): TileMaterialHandle {
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uSat: { value: 0 }, // the wall arrives grey
      uFade: { value: 1 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
  });

  return {
    material,
    setSaturation(v: number): void {
      material.uniforms.uSat.value = clamp01(v);
    },
    setFade(v: number): void {
      material.uniforms.uFade.value = clamp01(v);
    },
    dispose(): void {
      material.dispose();
    },
  };
}
