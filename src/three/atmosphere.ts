import * as THREE from 'three';

const COUNT = 220;
const RANGE_X = 180;   // wrap ranges (centered on 0 for x/y, on camera for z)
const RANGE_Y = 110;
const RANGE_Z = 300;
const SIZE_MIN = 2;
const SIZE_MAX = 7;
const DRIFT_MAX = 1.6;          // units/s — slow wander
const STREAK_GAIN = 0.12;       // apparent-motion -> capsule half-length
const STREAK_MAX = 2.5;         // cap (sprite-local units); full lightspeed would be ~6
const VELOCITY_EASE = 8;        // how fast streaks respond to speed changes
const INK = 0.07;

const VERT = /* glsl */ `
uniform float uPixelRatio;
uniform float uTime;
uniform float uVelocity;
uniform float uCameraZ;
attribute float aSize;
attribute vec3 aDrift;
varying float vDepthFade;
varying vec2 vRadial;
varying float vStretch;

float wrap1(float v, float range) {
  return mod(v + range * 0.5, range) - range * 0.5;
}

void main() {
  vec3 p = position + aDrift * uTime;
  p.x = wrap1(p.x, ${RANGE_X.toFixed(1)});
  p.y = wrap1(p.y, ${RANGE_Y.toFixed(1)});
  p.z = uCameraZ + wrap1(p.z - uCameraZ, ${RANGE_Z.toFixed(1)});

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  vec4 ndc = projectionMatrix * mv;
  vec2 ndcXY = ndc.xy / max(ndc.w, 0.0001);
  float ndcR = clamp(length(ndcXY), 0.0, 1.5);
  vRadial = normalize(ndcXY + vec2(1e-5));

  // apparent screen motion under camera dolly: faster when near and off-center
  float apparent = abs(uVelocity) * ndcR * (60.0 / max(dist, 2.0));
  float stretch = clamp(apparent * ${STREAK_GAIN.toFixed(2)}, 0.0, ${STREAK_MAX.toFixed(1)});
  vStretch = stretch * sign(uVelocity);

  vDepthFade = smoothstep(200.0, 40.0, dist) * smoothstep(2.0, 12.0, dist);
  gl_PointSize = aSize * uPixelRatio * (140.0 / max(dist, 1.0)) * (1.0 + stretch);
  gl_Position = ndc;
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying float vDepthFade;
varying vec2 vRadial;
varying float vStretch;

void main() {
  float stretch = abs(vStretch);
  vec2 p = (gl_PointCoord * 2.0 - 1.0) * (1.0 + stretch);
  // tail trails the apparent motion: toward screen center when flying forward
  vec2 tailDir = vRadial * sign(vStretch - 1e-6);
  float along = dot(p, tailDir);
  float onTail = clamp(along, 0.0, stretch);
  float d = length(p - tailDir * onTail);
  float core = 1.0 - smoothstep(0.35, 0.9, d);
  float taper = mix(1.0, 0.2, stretch > 0.0 ? onTail / max(stretch, 1e-4) : 0.0);
  float alpha = core * taper * vDepthFade * 0.85;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vec3(${INK.toFixed(2)}), alpha);
}
`;

export interface Atmosphere {
  object: THREE.Points;
  update(dt: number, velocity: number, cameraZ: number): void;
  destroy(): void;
}

export function initAtmosphere(): Atmosphere {
  const positions = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const drifts = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * RANGE_X;
    positions[i * 3 + 1] = (Math.random() - 0.5) * RANGE_Y;
    positions[i * 3 + 2] = (Math.random() - 0.5) * RANGE_Z;
    sizes[i] = SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN);
    drifts[i * 3] = (Math.random() - 0.5) * DRIFT_MAX;
    drifts[i * 3 + 1] = (Math.random() - 0.5) * DRIFT_MAX;
    drifts[i * 3 + 2] = (Math.random() - 0.5) * DRIFT_MAX * 0.5;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aDrift', new THREE.BufferAttribute(drifts, 3));

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uTime: { value: 0 },
      uVelocity: { value: 0 },
      uCameraZ: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
  });

  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;

  return {
    object,
    update(dt: number, velocity: number, cameraZ: number): void {
      material.uniforms.uTime.value += dt;
      material.uniforms.uCameraZ.value = cameraZ;
      const current = material.uniforms.uVelocity.value as number;
      material.uniforms.uVelocity.value = current + (velocity - current) * Math.min(dt * VELOCITY_EASE, 1);
    },
    destroy(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
