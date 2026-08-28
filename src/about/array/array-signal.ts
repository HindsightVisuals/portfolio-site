import * as THREE from 'three';
import { signalFalloff } from './array-math';

/**
 * The beam's two emission colours, from the `Signal` material's ColorRamp.003.
 * Linear, straight from the rig: a saturated green core running out to a pale
 * yellow-green at the hot end.
 */
export const SIGNAL_GREEN = new THREE.Color(0.091, 1.0, 0.193);
export const SIGNAL_PALE = new THREE.Color(0.657, 1.0, 0.378);

/**
 * Displace strength on the beam, from the Blender modifier.
 *
 * The rig uses a CLOUDS texture sampled in the CURSOR's object space, so moving
 * the cursor slides the noise field through the cylinder and the beam writhes.
 * Reproduced as 3D noise in the same space rather than as a texture.
 */
export const SIGNAL_DISPLACE = 2.04;

/** Scroll rate of the wave bands — `frame / 5` at 30fps in the rig. */
export const SIGNAL_SCROLL = 6.0;
/** Evolution rate of the 4D noise — `frame / 200` at 30fps. */
export const SIGNAL_EVOLVE = 0.15;

const VERT = /* glsl */ `
uniform vec3  uCursorLocal;
uniform float uDisplace;
uniform float uTime;

varying vec2 vUv;
varying vec3 vWorldPos;

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}

void main() {
  vUv = uv;

  // Blender's Displace modifier with texture_coords = OBJECT -> Cursor: the
  // noise is sampled in the CURSOR's space, so moving the cursor drags the
  // field through the beam and it writhes. Sampling in the beam's own space
  // instead would give a beam that only ever churns in place.
  vec3 q = position - uCursorLocal;
  float n = noise3(q * 1.31 + vec3(0.0, uTime * 0.35, 0.0));
  vec3 p = position + normal * (n - 0.5) * uDisplace * 0.06;

  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorldPos = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
uniform vec3  uGreen;
uniform vec3  uPale;
uniform float uStrength;
uniform float uTime;
uniform vec3  uCameraPos;
uniform float uFogNear;
uniform float uFogFar;

varying vec2 vUv;
varying vec3 vWorldPos;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise2(p); p *= 2.0; a *= 0.5; }
  return v;
}

void main() {
  // The rig screens two Wave textures together and subtracts a stretched 4D
  // noise, then hard-thresholds the result into alpha. That reads as filaments
  // streaming along the beam, which is what the reference render shows.
  vec2 q = vec2(vUv.x * 7.8, vUv.y);

  float flow = vUv.y * 6.0 - uTime * ${SIGNAL_SCROLL.toFixed(2)};
  float w1 = sin((q.x + fbm(q * 2.0 + vec2(0.0, flow * 0.2)) * 4.0) * 6.28318);
  float w2 = sin((q.x * -1.4 + fbm(q * 3.1 + vec2(0.0, flow * 0.3)) * 5.0) * 6.28318);
  float bands = max(w1, w2) * 0.5 + 0.5;

  float grain = fbm(vec2(q.x * 0.6, q.y * 3.0 - uTime * ${SIGNAL_EVOLVE.toFixed(2)} * 6.0));
  float mask = bands - grain * 0.55;

  // ColorRamp.002 is a near-step at 0.677..1.0 — filaments with hard edges and
  // clean gaps, not a soft glow.
  float alpha = smoothstep(0.30, 0.62, mask);
  if (alpha < 0.01) discard;

  // Green at the thin edges running to pale at the dense core, as ColorRamp.003
  // does over the same factor.
  vec3 col = mix(uGreen, uPale, smoothstep(0.35, 0.95, mask));

  // Additive blending means fogging toward black would ADD black, i.e. do
  // nothing. The beam has to be faded out instead.
  float depth = length(uCameraPos - vWorldPos);
  float fog = clamp((depth - uFogNear) / max(uFogFar - uFogNear, 1e-4), 0.0, 1.0);

  gl_FragColor = vec4(col * uStrength, alpha * (1.0 - fog));
}
`;

export interface SignalMaterialHandle {
  material: THREE.ShaderMaterial;
  /** The cursor, in the BEAM's local space — the noise field's origin. */
  setCursorLocal(v: THREE.Vector3): void;
  /** World distance from cursor to beam; drives the rig's `10 / (d^4 + 1)`. */
  setCursorDistance(d: number): void;
  setTime(t: number): void;
  setCameraPos(p: THREE.Vector3): void;
  /** Linear fog. Additive geometry fades out rather than mixing to the fog colour. */
  setFog(near: number, far: number): void;
  dispose(): void;
}

export function makeSignalMaterial(): SignalMaterialHandle {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uCursorLocal: { value: new THREE.Vector3() },
      uDisplace: { value: SIGNAL_DISPLACE },
      uTime: { value: 0 },
      uGreen: { value: SIGNAL_GREEN },
      uPale: { value: SIGNAL_PALE },
      uStrength: { value: 1 },
      uCameraPos: { value: new THREE.Vector3() },
      uFogNear: { value: 1e9 },
      uFogFar: { value: 1e9 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  return {
    material,
    setCursorLocal(v) {
      (material.uniforms.uCursorLocal.value as THREE.Vector3).copy(v);
    },
    setCursorDistance(d) {
      // The rig's scripted driver, normalised: 10 at zero distance, so divide
      // back down to keep the shader's own scale around 1.
      material.uniforms.uStrength.value = signalFalloff(d) / 10;
    },
    setTime(t) {
      material.uniforms.uTime.value = t;
    },
    setCameraPos(p) {
      (material.uniforms.uCameraPos.value as THREE.Vector3).copy(p);
    },
    setFog(near, far) {
      material.uniforms.uFogNear.value = near;
      material.uniforms.uFogFar.value = far;
    },
    dispose() {
      material.dispose();
    },
  };
}
