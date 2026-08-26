import * as THREE from 'three';
import {
  CENTRE_SCALE,
  CURSOR_RADIUS,
  EMISSION_MAX,
  EXPLODE_FAR,
  EXPLODE_NEAR,
  GLOW_RADIUS,
  SCALE_MIN,
  clamp01,
} from './array-math';

/**
 * The rig's emission colour, LINEAR — a near-sibling of the F15 cursor green.
 * Written straight into a Color without conversion because the shader outputs
 * linear and the renderer handles the transfer.
 */
export const EMISSION_COLOR = new THREE.Color(0.164, 1.0, 0.248);

/**
 * Format a number as a GLSL float literal.
 *
 * Necessary, not decorative: `SCALE_MAX` is exactly 1, and interpolating it
 * raw emits `mix(0.57, 1, t)` — an int literal, which is a compile error in
 * GLSL ES. A hidden one, too: without rAF a shader never compiles in an
 * occluded tab, so it would look fine right up until it was looked at.
 */
const f = (n: number): string => n.toFixed(2);

const VERT = /* glsl */ `
attribute vec3 aIslandC;

uniform vec3  uCursor;
uniform float uCursorRadius;
uniform float uCursorAmount;
uniform float uAmbient;
uniform float uTime;

varying float vDist;
varying vec3  vNormalW;

// Cheap value noise — the ambient keep-alive only needs low-frequency drift.
float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}
float noise3(vec3 p) {
  vec3 i = floor(p), fr = fract(p);
  fr = fr * fr * (3.0 - 2.0 * fr);
  return mix(
    mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), fr.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), fr.x), fr.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), fr.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), fr.x), fr.y), fr.z);
}

void main() {
  vec3 toC = aIslandC - uCursor;
  float len = length(toC);
  float d = len - uCursorRadius;
  vDist = d;

  // Scale Elements, FACE domain, Uniform: near the cursor panels SHRINK.
  float t = clamp((d - ${f(EXPLODE_NEAR)}) / (${f(EXPLODE_FAR)} - ${f(EXPLODE_NEAR)}), 0.0, 1.0);
  float s = mix(${f(SCALE_MIN)}, 1.0, t);
  s = mix(1.0, s, uCursorAmount);

  // The scale centre is the nearest point on the cursor sphere, pushed out by
  // 1.5. That offset is what makes the shrink read as displacement rather than
  // a uniform pucker.
  vec3 nearest = uCursor + (toC / max(len, 1e-6)) * uCursorRadius;
  vec3 centre = nearest * ${f(CENTRE_SCALE)};

  vec3 p = centre + (position - centre) * s;

  // Ambient drift, sampled per ISLAND so panels move as units rather than
  // wobbling internally.
  vec3 drift = vec3(
    noise3(aIslandC * 3.1 + vec3(uTime * 0.13, 0.0, 0.0)),
    noise3(aIslandC * 3.1 + vec3(0.0, uTime * 0.11, 0.0)),
    noise3(aIslandC * 3.1 + vec3(0.0, 0.0, uTime * 0.17))
  ) - 0.5;
  p += drift * 0.012 * uAmbient;

  vNormalW = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3  uEmission;
uniform float uCursorAmount;

varying float vDist;
varying vec3  vNormalW;

void main() {
  // Emission Map Range: 4.6 at the cursor surface, 0 past the glow shell. Much
  // tighter than the explode band, deliberately.
  float g = 1.0 - clamp(vDist / ${f(GLOW_RADIUS)}, 0.0, 1.0);
  float e = ${f(EMISSION_MAX)} * g * uCursorAmount;

  // Metallic 1, base 0.133 grey, and no environment light in this scene — so
  // the panels are near-black except where the emission catches them.
  float facing = clamp(dot(normalize(vNormalW), vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
  vec3 base = vec3(0.133) * (0.25 + 0.75 * facing);

  gl_FragColor = vec4(base + uEmission * e, 1.0);
}
`;

export interface PanelMaterialHandle {
  material: THREE.ShaderMaterial;
  /** Cursor centre, in the DISC'S LOCAL SPACE. */
  setCursor(localX: number, localY: number, localZ: number): void;
  setCursorRadius(r: number): void;
  setAmbient(v: number): void;
  setCursorAmount(v: number): void;
  setTime(t: number): void;
  dispose(): void;
}

export function makePanelMaterial(): PanelMaterialHandle {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uCursor: { value: new THREE.Vector3(0, 0, 0) },
      uCursorRadius: { value: CURSOR_RADIUS },
      uCursorAmount: { value: 0 },
      uAmbient: { value: 0 },
      uTime: { value: 0 },
      uEmission: { value: EMISSION_COLOR },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });

  return {
    material,
    setCursor(x, y, z) {
      (material.uniforms.uCursor.value as THREE.Vector3).set(x, y, z);
    },
    setCursorRadius(r) {
      material.uniforms.uCursorRadius.value = r;
    },
    setAmbient(v) {
      material.uniforms.uAmbient.value = clamp01(v);
    },
    setCursorAmount(v) {
      material.uniforms.uCursorAmount.value = clamp01(v);
    },
    setTime(t) {
      material.uniforms.uTime.value = t;
    },
    dispose() {
      material.dispose();
    },
  };
}
