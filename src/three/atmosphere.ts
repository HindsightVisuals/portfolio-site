import * as THREE from 'three';

/** Dot field bounds (world units). Z spans past both ends of the page spine. */
const COUNT = 220;
const SPREAD_X = 90;
const SPREAD_Y = 55;
const Z_FROM = 60;
const Z_TO = -240;
const SIZE_MIN = 2;
const SIZE_MAX = 7;
/** Velocity (units/s) at which streaking reaches full strength. */
const WARP_FULL_VELOCITY = 80;
const INK = 0.07; // near-black dot luminance

const VERT = /* glsl */ `
uniform float uPixelRatio;
uniform float uTime;
uniform float uWarp;
attribute float aSize;
attribute float aSeed;
varying float vDepthFade;
varying vec2 vRadial;

void main() {
  vec3 p = position;
  // slow idle drift, unique per dot
  p.x += sin(uTime * 0.05 + aSeed * 6.2831) * 2.0;
  p.y += cos(uTime * 0.04 + aSeed * 12.566) * 1.5;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  gl_PointSize = aSize * uPixelRatio * (140.0 / max(dist, 1.0)) * (1.0 + uWarp * 2.0);

  // fake depth-of-field: fade far dots out, kill dots about to hit the camera
  vDepthFade = smoothstep(200.0, 40.0, dist) * smoothstep(2.0, 12.0, dist);

  vec4 ndc = projectionMatrix * mv;
  vRadial = normalize(ndc.xy / max(ndc.w, 0.0001) + vec2(1e-5));
  gl_Position = ndc;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uWarp;
varying float vDepthFade;
varying vec2 vRadial;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  // streak: elongate the soft disc along the screen-radial direction
  float along = dot(p, vRadial);
  float perp = length(p - vRadial * along);
  float d = length(vec2(along / (1.0 + uWarp * 6.0), perp));
  float alpha = (1.0 - smoothstep(0.35, 1.0, d)) * vDepthFade * 0.85;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vec3(${INK.toFixed(2)}), alpha);
}
`;

export interface Atmosphere {
  object: THREE.Points;
  update(dt: number, velocity: number): void;
  destroy(): void;
}

export function initAtmosphere(): Atmosphere {
  const positions = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const seeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() * 2 - 1) * SPREAD_X;
    positions[i * 3 + 1] = (Math.random() * 2 - 1) * SPREAD_Y;
    positions[i * 3 + 2] = Z_FROM + Math.random() * (Z_TO - Z_FROM);
    sizes[i] = SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN);
    seeds[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uTime: { value: 0 },
      uWarp: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
  });

  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;

  return {
    object,
    update(dt: number, velocity: number): void {
      material.uniforms.uTime.value += dt;
      const warp = Math.min(Math.abs(velocity) / WARP_FULL_VELOCITY, 1);
      // ease toward target so streaks don't pop
      material.uniforms.uWarp.value += (warp - material.uniforms.uWarp.value) * Math.min(dt * 8, 1);
    },
    destroy(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
