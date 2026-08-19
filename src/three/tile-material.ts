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

/** Border colour. Ink, matching the site's hairlines. */
const STROKE_COLOR = 0x141414;

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
uniform float uStroke;   // stroke width as a fraction of tile HEIGHT, 0 = none
uniform float uAspect;   // tile w/h, so the stroke is even on all four sides
uniform vec3 uStrokeCol;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float l = dot(t.rgb, vec3(0.2126, 0.7152, 0.0722)); // Rec.709 luma
  vec3 col = mix(vec3(l), t.rgb, uSat);

  // Inset border. Distance to the nearest edge, measured in HEIGHT units on
  // both axes so a wide tile does not get a thinner left/right edge.
  float dx = min(vUv.x, 1.0 - vUv.x) * uAspect;
  float dy = min(vUv.y, 1.0 - vUv.y);
  float edge = min(dx, dy);
  // Antialiased across roughly one pixel of the smaller dimension.
  float aa = fwidth(edge);
  float border = 1.0 - smoothstep(uStroke - aa, uStroke + aa, edge);
  col = mix(col, uStrokeCol, border * step(0.0001, uStroke));

  gl_FragColor = vec4(col, t.a * uFade);
  #include <colorspace_fragment>
}
`;

export interface TileMaterialHandle {
  material: THREE.ShaderMaterial;
  /** 0 = fully grey, 1 = full colour. */
  setSaturation(v: number): void;
  /** Border width in px, converted internally against the tile's pixel height. */
  setStrokePx(px: number, tilePxHeight: number): void;
  /** Materialize opacity, 0..1 — the same fade the label screens use. */
  setFade(v: number): void;
  dispose(): void;
}

export function makeTileMaterial(map: THREE.Texture, aspect = 1): TileMaterialHandle {
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uSat: { value: 0 }, // the wall arrives grey
      uFade: { value: 1 },
      uStroke: { value: 0 },
      uAspect: { value: aspect },
      uStrokeCol: { value: new THREE.Color(STROKE_COLOR) },
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
    setStrokePx(px: number, tilePxHeight: number): void {
      material.uniforms.uStroke.value = tilePxHeight > 0 ? Math.max(0, px) / tilePxHeight : 0;
    },
    setFade(v: number): void {
      material.uniforms.uFade.value = clamp01(v);
    },
    dispose(): void {
      material.dispose();
    },
  };
}
