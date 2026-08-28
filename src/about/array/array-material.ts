import * as THREE from 'three';
import {
  AMBIENT_AMPLITUDE,
  AMBIENT_RATE_X,
  AMBIENT_RATE_Y,
  AMBIENT_RATE_Z,
  AMBIENT_LIGHT,
  SCRATCH_SCALE,
  CENTRE_SCALE,
  DISPLACE_GLOW_REF,
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
/** Same, at three places — the ambient rates are small enough that two rounds to zero. */
const f3 = (n: number): string => n.toFixed(3);

const VERT = /* glsl */ `
attribute vec3 aIslandC;

uniform vec3  uCursor;
uniform float uCursorRadius;
uniform float uCursorAmount;
uniform float uAmbient;
uniform float uTime;
uniform float uScratchScale;

varying float vDist;
varying float vDisplace;
varying vec3  vNormalW;
varying vec3  vWorldPos;
varying vec2  vUv;
varying vec2  vScratchUv;

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
  // wobbling internally, and gated by the SAME falloff as the explode so it
  // only breathes where the sphere is. Ungated it stirred the whole dish at
  // once, which reads as noise rather than as the array reacting.
  float influence = 1.0 - t;
  vec3 drift = vec3(
    noise3(aIslandC * 3.1 + vec3(uTime * ${f3(AMBIENT_RATE_X)}, 0.0, 0.0)),
    noise3(aIslandC * 3.1 + vec3(0.0, uTime * ${f3(AMBIENT_RATE_Y)}, 0.0)),
    noise3(aIslandC * 3.1 + vec3(0.0, 0.0, uTime * ${f3(AMBIENT_RATE_Z)}))
  ) - 0.5;
  p += drift * ${f3(AMBIENT_AMPLITUDE)} * uAmbient * influence;

  // How far this vertex actually moved. Emission reads from this rather than
  // from proximity alone, so a panel pushed by the ambient lights up the same
  // way one pushed by the sphere does.
  vDisplace = length(p - position);

  vUv = uv;

  // The dish ships with NO usable UVs — every vertex reports the same
  // coordinate, so a uv-sampled map is a single texel stretched over 224
  // panels. Project from the REST position instead: the dish is a disc in
  // local XZ, so that plane is the natural unwrap. Rest, not displaced, or the
  // scratches would swim across the metal as the panels move.
  vScratchUv = position.xz * uScratchScale;

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
uniform float uAmbientLight;
uniform vec3  uFogColor;
uniform float uFogNear;
uniform float uFogFar;

varying float vDist;
varying float vDisplace;
varying vec3  vNormalW;
varying vec3  vWorldPos;
varying vec2  vUv;
varying vec2  vScratchUv;

void main() {
  // Emission has two drivers, and takes whichever is stronger.
  //
  // PROXIMITY — the rig's own Map Range: 4.6 at the cursor surface, 0 past the
  // glow shell, and much tighter than the explode band. This is the hot core
  // right under the sphere.
  float g = 1.0 - clamp(vDist / ${f(GLOW_RADIUS)}, 0.0, 1.0);

  // DISPLACEMENT — how far the panel actually moved. This is what lets the
  // ambient drift light panels on its own, with no cursor term: the more a
  // panel is pushed, the harder it glows, whatever pushed it.
  float dispDrive = clamp(vDisplace / ${f(DISPLACE_GLOW_REF)}, 0.0, 1.0);

  float drive = max(g * uCursorAmount, dispDrive);
  float e = ${f(EMISSION_MAX)} * drive * uEmissionGain;

  vec3 N = normalize(vNormalW);
  vec3 V = normalize(uCameraPos - vWorldPos);

  // Metallic 1 with NO environment light: on this surface essentially all the
  // visible structure is specular. Without it the 224 panels read as one
  // featureless plate, because at rest they touch and only the bevels
  // distinguish them.
  // Blender's ColorRamp.001 maps the scratch image to ROUGHNESS: 0 -> 0.187
  // (glossy) and anything past 0.16 -> 1.0 (matte). The image is mostly dark --
  // measured mean 0.083, 90% of pixels below 0.16 -- so the metal reads glossy
  // with matte scratch marks through it, not the other way round.
  float scr = texture2D(uScratch, vScratchUv).r;
  float rough = mix(0.187, 1.0, smoothstep(0.0, 0.16, scr));
  float gloss = 1.0 - rough;

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
    spec += rad * pow(ndh, mix(9.0, 130.0, gloss)) * mix(0.30, 1.7, gloss);
    diff += rad * ndl;
  }

  // A fresnel rim is what makes the bevelled panel edges catch at grazing
  // angles, which is most of what separates one tile from the next.
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);

  // Ambient is added OUTSIDE the 0.133 base rather than inside it. Folded in,
  // it was being attenuated to about a sixth before it reached the pixel, so
  // raising the constant barely moved the picture.
  vec3 base = vec3(0.133) * (diff * 0.55 + 0.04)
            + vec3(0.133) * uAmbientLight * 3.0
            + spec + vec3(0.10) * fres;

  vec3 col = base + uEmission * e;

  // Fog by hand: a raw ShaderMaterial gets none of Three's fog chunks, so
  // without this the dish would stay crisp while the terrain around it receded.
  float depth = length(uCameraPos - vWorldPos);
  float fog = clamp((depth - uFogNear) / max(uFogFar - uFogNear, 1e-4), 0.0, 1.0);
  gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
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
  /** Linear black fog, matching the scene's own. */
  setFog(color: THREE.Color, near: number, far: number): void;
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
      uScratchScale: { value: SCRATCH_SCALE },
      uAmbientLight: { value: AMBIENT_LIGHT },
      uFogColor: { value: new THREE.Color(0x000000) },
      uFogNear: { value: 1e9 },
      uFogFar: { value: 1e9 },
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
    setFog(color, near, far) {
      (material.uniforms.uFogColor.value as THREE.Color).copy(color);
      material.uniforms.uFogNear.value = near;
      material.uniforms.uFogFar.value = far;
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
