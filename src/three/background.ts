import * as THREE from 'three';
import type { StageLayer } from './stage';

/** Longest edge of the simulation grid — RD runs low-res and upscales soft. */
const SIM_MAX = 512;
/** Sim steps per rendered frame; higher = faster evolution. */
const STEPS_PER_FRAME = 6;
/** One-time steps at init so the pattern is developed at first paint. */
const BURN_IN_STEPS = 300;

/* Gray-Scott "coral growth" regime — slowly evolving organic maze. */
const FEED = 0.0545;
const KILL = 0.062;

/* Compositing shades (0–1 luminance). Pattern is ONE fixed shade slightly
 * darker than the gradient edge, so it reads in the white center band and
 * almost disappears into the grey edges. */
const EDGE_GREY = 0.949; // ≈ #f2f2f2, matches Figma gradient stops
const CENTER_WHITE = 1.0;
const PATTERN_SHADE = 0.91; // ≈ 9% darker than white
/** Global pattern visibility: scales the pattern-vs-gradient contrast (1 = full). */
const PATTERN_OPACITY = 0.5;
/** Mouse erase brush radius, in sim-grid pixels. Pattern parts around the
 * cursor and heals behind it as the sim keeps running. */
const BRUSH_RADIUS = 16;

/** Spontaneous re-seeding: average seconds between blooms. */
const RESEED_BASE_S = 4;
/** Jitter on reseed interval (±s). */
const RESEED_JITTER_S = 2;
/** Spontaneous seed radius in sim pixels. */
const RESEED_RADIUS = 5;
/** Zoom parallax amplitude (proportional to spine distance from HOME_SPINE_REF). */
const ZOOM_MAX = 0.06;
/** Home spine Z position reference for zoom parallax (mirrors HOME_REST_Z). */
const HOME_SPINE_REF = 34;
/** Mouse-magnet parallax: UV shift per world unit of camera lateral offset.
 * Kept well below the dots' apparent motion so the RD reads as the farthest
 * layer (full magnet deflection ≈ 1% of screen vs several % for near dots). */
const PARALLAX_UV_PER_UNIT = 0.01;
/** Permanent slight overscan so parallax + edge clamping never smears the
 * texture border; must leave more margin than the max parallax offset. */
const BASE_OVERSCAN = 1.03;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SIM_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uFeed;
uniform float uKill;
uniform vec2 uMouse;      // cursor in sim UV space; (-10,-10) = inactive
uniform vec2 uSimDims;    // sim grid size in px, for circular brush distance
uniform float uBrushR;    // erase radius in sim px
uniform vec2 uSeedPos;    // sim UV; (-10,-10) = inactive
uniform float uSeedR;     // radius in sim px

void main() {
  vec2 c = texture2D(uState, vUv).rg;
  vec2 lap = -c;
  lap += 0.2 * texture2D(uState, vUv + vec2(uTexel.x, 0.0)).rg;
  lap += 0.2 * texture2D(uState, vUv - vec2(uTexel.x, 0.0)).rg;
  lap += 0.2 * texture2D(uState, vUv + vec2(0.0, uTexel.y)).rg;
  lap += 0.2 * texture2D(uState, vUv - vec2(0.0, uTexel.y)).rg;
  lap += 0.05 * texture2D(uState, vUv + uTexel).rg;
  lap += 0.05 * texture2D(uState, vUv - uTexel).rg;
  lap += 0.05 * texture2D(uState, vUv + vec2(uTexel.x, -uTexel.y)).rg;
  lap += 0.05 * texture2D(uState, vUv + vec2(-uTexel.x, uTexel.y)).rg;

  float A = c.r;
  float B = c.g;
  float reaction = A * B * B;
  float nextA = A + (1.0 * lap.r - reaction + uFeed * (1.0 - A));
  float nextB = B + (0.5 * lap.g + reaction - (uKill + uFeed) * B);

  // Mouse erase: suppress B near the cursor; the sim heals the gap organically.
  float d = length((vUv - uMouse) * uSimDims);
  float erase = 1.0 - smoothstep(uBrushR * 0.4, uBrushR, d);
  nextB = mix(nextB, 0.0, erase);

  // Spontaneous seed splat: inject B in a circular region (active for one step only).
  float ds = length((vUv - uSeedPos) * uSimDims);
  float splat = 1.0 - smoothstep(uSeedR * 0.3, uSeedR, ds);
  nextB = max(nextB, splat * 0.9);

  gl_FragColor = vec4(clamp(nextA, 0.0, 1.0), clamp(nextB, 0.0, 1.0), 0.0, 1.0);
}
`;

const VIEW_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uState;
uniform float uEdge;
uniform float uCenter;
uniform float uShade;
uniform float uOpacity;
uniform float uDebug;
uniform float uZoom;
uniform vec2 uOffset;

void main() {
  // grey -> white -> grey across x
  float grad = mix(uEdge, uCenter, sin(vUv.x * 3.14159265));
  // Tight threshold band on the upscaled field = crisp organic edges
  // (wide band reads soft/blurry; keep ~0.04 width for antialiasing).
  // Pattern sample zooms + parallax-shifts; gradient keeps raw vUv.x;
  // debug keeps raw vUv (unaffected by both).
  vec2 uvZ = (vUv - 0.5) / uZoom + 0.5 + uOffset;
  float B = texture2D(uState, uvZ).g;
  float mask = smoothstep(0.18, 0.22, B);
  float lum = mix(grad, uShade, mask * uOpacity);
  if (uDebug > 0.5) lum = 1.0 - texture2D(uState, vUv).g * 3.0; // raw sim, no zoom
  gl_FragColor = vec4(vec3(lum), 1.0);
}
`;

export interface BackgroundOpts {
  reducedMotion: boolean;
  debug: boolean;
}

export interface BackgroundLayer extends StageLayer {
  destroy(): void;
  setCameraProvider(fn: () => { x: number; y: number; z: number }): void;
}

/** Screen UV → sim UV under the view shader's zoom + parallax offset.
 * Mirrors VIEW_FRAG's uvZ so the erase brush lands under the cursor. */
export function viewToSimUV(
  u: number,
  v: number,
  zoom: number,
  offU: number,
  offV: number,
): { u: number; v: number } {
  return { u: (u - 0.5) / zoom + 0.5 + offU, v: (v - 0.5) / zoom + 0.5 + offV };
}

function makeSeedTexture(w: number, h: number): THREE.DataTexture {
  const data = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = 1.0; // A = 1 everywhere
    data[i * 4 + 3] = 1.0;
  }
  // sprinkle ~40 random square spots of B
  for (let s = 0; s < 40; s++) {
    const cx = Math.floor(Math.random() * w);
    const cy = Math.floor(Math.random() * h);
    const r = 2 + Math.floor(Math.random() * 3);
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        data[(y * w + x) * 4 + 1] = 1.0; // B = 1
      }
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  tex.needsUpdate = true;
  return tex;
}

/** Sim grid dims for a given viewport, capped to SIM_MAX on the longest edge. */
function computeSimDims(width: number, height: number): { w: number; h: number } {
  const aspect = width / height;
  const w = aspect >= 1 ? SIM_MAX : Math.round(SIM_MAX * aspect);
  const h = aspect >= 1 ? Math.round(SIM_MAX / aspect) : SIM_MAX;
  return { w, h };
}

export function initBackgroundLayer(
  renderer: THREE.WebGLRenderer,
  opts: BackgroundOpts,
  onNeedsFrame?: () => void,
): BackgroundLayer {
  const targetOpts: THREE.RenderTargetOptions = {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  };

  /** Builds a fresh ping-pong pair + seed texture for the given sim grid. */
  const buildSimTargets = (
    w: number,
    h: number,
  ): { read: THREE.WebGLRenderTarget; write: THREE.WebGLRenderTarget; seed: THREE.DataTexture } => ({
    read: new THREE.WebGLRenderTarget(w, h, targetOpts),
    write: new THREE.WebGLRenderTarget(w, h, targetOpts),
    seed: makeSeedTexture(w, h),
  });

  let { w: simW, h: simH } = computeSimDims(window.innerWidth, window.innerHeight);
  let { read, write, seed } = buildSimTargets(simW, simH);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.PlaneGeometry(2, 2);

  const simMaterial = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: SIM_FRAG,
    uniforms: {
      uState: { value: seed },
      uTexel: { value: new THREE.Vector2(1 / simW, 1 / simH) },
      uFeed: { value: FEED },
      uKill: { value: KILL },
      uMouse: { value: new THREE.Vector2(-10, -10) },
      uSimDims: { value: new THREE.Vector2(simW, simH) },
      uBrushR: { value: BRUSH_RADIUS },
      uSeedPos: { value: new THREE.Vector2(-10, -10) },
      uSeedR: { value: RESEED_RADIUS },
    },
  });
  const simScene = new THREE.Scene();
  simScene.add(new THREE.Mesh(quad, simMaterial));

  const viewMaterial = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: VIEW_FRAG,
    uniforms: {
      uState: { value: read.texture },
      uEdge: { value: EDGE_GREY },
      uCenter: { value: CENTER_WHITE },
      uShade: { value: PATTERN_SHADE },
      uOpacity: { value: PATTERN_OPACITY },
      uDebug: { value: opts.debug ? 1 : 0 },
      uZoom: { value: BASE_OVERSCAN },
      uOffset: { value: new THREE.Vector2(0, 0) },
    },
  });
  const viewScene = new THREE.Scene();
  viewScene.add(new THREE.Mesh(quad, viewMaterial));

  const step = (): void => {
    renderer.setRenderTarget(write);
    renderer.render(simScene, camera);
    const swap = read;
    read = write;
    write = swap;
    simMaterial.uniforms.uState.value = read.texture;
  };

  // burn-in so the field is developed at first paint
  for (let i = 0; i < BURN_IN_STEPS; i++) step();

  const rebuildSimIfNeeded = (): void => {
    const dims = computeSimDims(window.innerWidth, window.innerHeight);
    if (dims.w !== simW || dims.h !== simH) {
      simW = dims.w;
      simH = dims.h;

      read.dispose();
      write.dispose();
      seed.dispose();

      ({ read, write, seed } = buildSimTargets(simW, simH));
      simMaterial.uniforms.uState.value = seed;
      simMaterial.uniforms.uTexel.value.set(1 / simW, 1 / simH);
      simMaterial.uniforms.uSimDims.value.set(simW, simH);

      for (let i = 0; i < BURN_IN_STEPS; i++) step();
    }
    onNeedsFrame?.();
  };

  let resizeTimeout: number | undefined;

  // Spontaneous re-seeding: track time and schedule the next seed event
  let simClock = 0;
  let nextSeedAt = RESEED_BASE_S + Math.random() * RESEED_JITTER_S;

  // Camera provider for zoom + mouse-magnet parallax (set by main.ts after world creation)
  let cameraProvider: (() => { x: number; y: number; z: number }) | null = null;
  let curZoom = BASE_OVERSCAN;
  let curOffU = 0;
  let curOffV = 0;

  // Mouse → sim UV for the erase brush, mapped through the same zoom/offset
  // as the view shader so the brush stays under the cursor.
  let rawU = 0;
  let rawV = 0;
  let cursorActive = false;
  const syncMouseUniform = (): void => {
    if (!cursorActive) return;
    const { u, v } = viewToSimUV(rawU, rawV, curZoom, curOffU, curOffV);
    simMaterial.uniforms.uMouse.value.set(u, v);
  };
  const onMouseMove = (e: MouseEvent): void => {
    rawU = e.clientX / window.innerWidth;
    rawV = 1 - e.clientY / window.innerHeight;
    cursorActive = true;
    syncMouseUniform();
  };
  const onMouseLeave = (): void => {
    cursorActive = false;
    simMaterial.uniforms.uMouse.value.set(-10, -10);
  };
  if (!opts.reducedMotion) {
    window.addEventListener('mousemove', onMouseMove);
    document.documentElement.addEventListener('mouseleave', onMouseLeave);
  }

  return {
    update(): void {
      if (opts.reducedMotion) return;
      syncMouseUniform(); // camera drift moves the sampled region under a still cursor
      simClock += 1 / 60;
      if (simClock >= nextSeedAt) {
        simMaterial.uniforms.uSeedPos.value.set(Math.random(), Math.random());
        nextSeedAt = simClock + RESEED_BASE_S + Math.random() * RESEED_JITTER_S;
      }
      for (let i = 0; i < STEPS_PER_FRAME; i++) {
        step();
        simMaterial.uniforms.uSeedPos.value.set(-10, -10); // active for one step only
      }
    },
    render(r: THREE.WebGLRenderer): void {
      if (cameraProvider) {
        const cam = cameraProvider();
        const progress = (((HOME_SPINE_REF - cam.z) % 240) + 240) % 240 / 240;
        curZoom = BASE_OVERSCAN + (ZOOM_MAX / 2) * (1 - Math.cos(progress * Math.PI * 2));
        curOffU = PARALLAX_UV_PER_UNIT * cam.x;
        curOffV = PARALLAX_UV_PER_UNIT * cam.y;
        viewMaterial.uniforms.uZoom.value = curZoom;
        viewMaterial.uniforms.uOffset.value.set(curOffU, curOffV);
      }
      viewMaterial.uniforms.uState.value = read.texture;
      r.setRenderTarget(null);
      r.render(viewScene, camera);
    },
    resize(): void {
      // debounce internally exactly as before, but only rebuild the sim grid —
      // renderer sizing is the stage's job now
      if (resizeTimeout !== undefined) window.clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(rebuildSimIfNeeded, 150);
    },
    destroy(): void {
      if (resizeTimeout !== undefined) window.clearTimeout(resizeTimeout);
      window.removeEventListener('mousemove', onMouseMove);
      document.documentElement.removeEventListener('mouseleave', onMouseLeave);
      read.dispose();
      write.dispose();
      seed.dispose();
      quad.dispose();
      simMaterial.dispose();
      viewMaterial.dispose();
    },
    setCameraProvider(fn: () => { x: number; y: number; z: number }): void {
      cameraProvider = fn;
    },
  };
}
