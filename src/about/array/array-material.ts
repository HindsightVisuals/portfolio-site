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
 * Scales the rig's peak emission of 4.6 before tone mapping.
 *
 * At full strength the emission is (0.75, 4.6, 1.14): green clips hard, blue
 * clips too, and AgX desaturates the result to cyan-white instead of the green
 * the rig renders. Pulling the peak under the clip keeps the hue.
 *
 * A TUNING VALUE — raise it for a hotter core, lower it for more colour.
 */
export const EMISSION_GAIN = 0.42;

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
varying vec3  vWorldPos;
varying vec2  vUv;

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

  vUv = uv;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorldPos = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
uniform vec3  uEmission;
uniform float uCursorAmount;
uniform float uEmissionGain;
uniform vec3  uLightPos[3];
uniform vec3  uLightCol[3];
uniform vec3  uCameraPos;
uniform sampler2D uScratch;
uniform float uScratchScale;

varying float vDist;
varying vec3  vNormalW;
varying vec3  vWorldPos;
varying vec2  vUv;

void main() {
  // Emission Map Range: 4.6 at the cursor surface, 0 past the glow shell. Much
  // tighter than the explode band, deliberately.
  float g = 1.0 - clamp(vDist / ${f(GLOW_RADIUS)}, 0.0, 1.0);
  float e = ${f(EMISSION_MAX)} * g * uCursorAmount * uEmissionGain;

  vec3 N = normalize(vNormalW);
  vec3 V = normalize(uCameraPos - vWorldPos);

  // Metallic 1 with NO environment light: on this surface essentially all the
  // visible structure is specular. Without it the 224 panels read as one
  // featureless plate, because at rest they touch and only the bevels
  // distinguish them.
  // Blender drives roughness from Scratches.jpeg through a ramp clamped at
  // 0.16, so the map mostly gates where highlights are ALLOWED to appear.
  float scr = texture2D(uScratch, vUv * uScratchScale).r;
  float gloss = mix(0.35, 1.0, smoothstep(0.0, 0.16, scr));

  vec3 spec = vec3(0.0);
  vec3 diff = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    vec3 L = uLightPos[i] - vWorldPos;
    float dist2 = max(dot(L, L), 1e-4);
    L = normalize(L);
    vec3 H = normalize(L + V);
    float ndl = max(dot(N, L), 0.0);
    float ndh = max(dot(N, H), 0.0);
    vec3 rad = uLightCol[i] / dist2;
    spec += rad * pow(ndh, mix(24.0, 110.0, gloss)) * 1.4 * gloss;
    diff += rad * ndl;
  }

  // A fresnel rim is what makes the bevelled panel edges catch at grazing
  // angles, which is most of what separates one tile from the next.
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);

  vec3 base = vec3(0.133) * (diff * 0.55 + 0.04) + spec + vec3(0.10) * fres;

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
  /** Camera world position — the specular term needs a real view vector. */
  setCameraPos(p: THREE.Vector3): void;
  /** Three world-space light positions and their pre-multiplied colours. */
  setLights(positions: THREE.Vector3[], colours: THREE.Color[]): void;
  dispose(): void;
}

export function makePanelMaterial(scratch: THREE.Texture | null = null): PanelMaterialHandle {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uCursor: { value: new THREE.Vector3(0, 0, 0) },
      uCursorRadius: { value: CURSOR_RADIUS },
      uCursorAmount: { value: 0 },
      uAmbient: { value: 0 },
      uTime: { value: 0 },
      uEmission: { value: EMISSION_COLOR },
      uEmissionGain: { value: EMISSION_GAIN },
      uCameraPos: { value: new THREE.Vector3() },
      uLightPos: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uLightCol: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color()] },
      uScratch: { value: scratch },
      uScratchScale: { value: 2.0 },
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
    setCameraPos(p) {
      (material.uniforms.uCameraPos.value as THREE.Vector3).copy(p);
    },
    setLights(positions, colours) {
      const P = material.uniforms.uLightPos.value as THREE.Vector3[];
      const C = material.uniforms.uLightCol.value as THREE.Color[];
      for (let i = 0; i < 3; i++) {
        if (positions[i]) P[i].copy(positions[i]);
        if (colours[i]) C[i].copy(colours[i]);
      }
    },
    dispose() {
      material.dispose();
    },
  };
}
