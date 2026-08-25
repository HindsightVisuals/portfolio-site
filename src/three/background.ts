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
/* Masked-surface tone ramp. These are FOREGROUND values and have nothing to do
 * with the near-invisible EDGE/CENTER/PATTERN ramp above, which exists to make
 * the full-bleed background disappear. A masked surface is a thing you are
 * meant to see; reusing the background's ramp for one produces ~6% contrast on
 * a white page. Defaults match the shipped case study footer mark. */
const MASK_GROUND = 0.3;
const MASK_INK = 0.95;
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

/** Camera z speed (world units/s) at which the travel stretch saturates. */
const STRETCH_REF_SPEED = 35;
/** Peak vertical magnification from travel. 0.1 = 10% taller at full speed. */
export const STRETCH_MAX = 0.1;
/* No horizontal squash, deliberately. Narrowing x samples a WIDER region, which
 * eats the BASE_OVERSCAN margin that exists to keep parallax off the clamped
 * texture edge. Measured: at full parallax the left edge sits at uv.x 0.0026
 * today, and a 45% squash drives it to -0.0109 — past the edge, which smears.
 * The stretch is vertical-only; y magnifies, so it gains margin rather than
 * spending it. Revisit only alongside a BASE_OVERSCAN increase. */
/** Exponential approach rate (per second) for the stretch — eases in and out
 * instead of snapping to whatever the velocity happens to be this frame. */
const STRETCH_SMOOTH_RATE = 6;

/**
 * Per-SIM-STEP sample expansion at a full press-and-hold. This compounds: the
 * field contracts by roughly (1 + rate)^steps near the anchor, and the sim runs
 * STEPS_PER_FRAME steps per frame, so small numbers go a long way. At 0.0009
 * and 60fps a full-strength hold pulls the centre in ~2x per second.
 * (Like the rest of the sim, this is per-frame rather than per-second, so it
 * runs faster on a high-refresh display — a pre-existing property of the loop.)
 */
const PULL_RATE_MAX = 0.0009;
/**
 * Shapes how the pull rate grows across the hold (Adam, 2026-08-18: "double as
 * intense, and have it peak at almost 4x as much at the end of its ramp").
 *
 * Deliberately super-linear: 2x the old rate through the middle of the ramp,
 * reaching 4x at a full hold. Remember this compounds — the rate is applied per
 * sim step, 6 steps a frame — so 4x the rate is far more than 4x the final
 * deformation. This is the first dial to turn down if it gets violent.
 */
const pullCurve = (pull: number): number => 2 * pull * (1 + pull);
/** Radius of the pull lens, in aspect-corrected sim UV. */
const PULL_RADIUS = 0.38;

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
uniform float uPullRate;  // per-step advection toward the cursor; 0 = off
uniform float uPullRadius;
uniform float uAspect;    // width/height, so the pull lens stays circular
uniform vec2 uAdvect;     // per-step uv drift; scroll travel, 0 = off
uniform sampler2D uMask;  // 1 = reaction allowed, 0 = forbidden
uniform float uUseMask;   // 0 = unmasked field (the homepage background)
uniform float uMaskMix;   // 0 = mask has no hold, 1 = full confinement

void main() {
  // Press-and-hold pull, applied INSIDE the feedback loop rather than to the
  // finished image: each step reads its state from slightly farther out, so
  // the pattern is genuinely carried inward and the next step reacts from the
  // moved state. The effect compounds over steps and, unlike a view warp, the
  // deformation is real — it stays after release and heals organically the way
  // the erase brush does. Per-step displacement is tiny (radius * rate), so
  // the read never lands far enough out to matter at the texture edge.
  // Scroll travel, applied the same way the pull is: inside the loop, so the
  // pattern is genuinely carried rather than the finished image being slid
  // about. Every Laplacian tap below reads from the advected uv, so the next
  // step reacts from the moved state and the drift persists in the field.
  vec2 uv = vUv + uAdvect;
  if (uPullRate > 0.0) {
    vec2 dd = uv - uMouse;
    float dist = length(vec2(dd.x * uAspect, dd.y));
    float fall = 1.0 - smoothstep(0.0, uPullRadius, dist);
    uv = uMouse + dd * (1.0 + uPullRate * fall);
  }

  vec2 c = texture2D(uState, uv).rg;
  vec2 lap = -c;
  lap += 0.2 * texture2D(uState, uv + vec2(uTexel.x, 0.0)).rg;
  lap += 0.2 * texture2D(uState, uv - vec2(uTexel.x, 0.0)).rg;
  lap += 0.2 * texture2D(uState, uv + vec2(0.0, uTexel.y)).rg;
  lap += 0.2 * texture2D(uState, uv - vec2(0.0, uTexel.y)).rg;
  lap += 0.05 * texture2D(uState, uv + uTexel).rg;
  lap += 0.05 * texture2D(uState, uv - uTexel).rg;
  lap += 0.05 * texture2D(uState, uv + vec2(uTexel.x, -uTexel.y)).rg;
  lap += 0.05 * texture2D(uState, uv + vec2(-uTexel.x, uTexel.y)).rg;

  float A = c.r;
  float B = c.g;
  float reaction = A * B * B;
  float nextA = A + (1.0 * lap.r - reaction + uFeed * (1.0 - A));
  float nextB = B + (0.5 * lap.g + reaction - (uKill + uFeed) * B);

  // Confinement mask. Zeroing B outside the shape every step makes the
  // boundary ABSORBING: the reaction can diffuse up to the edge and then dies,
  // so the pattern is genuinely grown inside the shape rather than being a
  // window cropped out of a larger field. A is pinned to 1 (fully fed) outside
  // so nothing can seed there either.
  //
  // uMaskMix ramps that hold on and off. At 0 the mask has no grip and the
  // field is unbounded; at 1 it is fully confined. Because the boundary is
  // absorbing rather than a crop, ramping the mix IS the morph: raise it and
  // the pattern dies back into the shape, lower it and the reaction grows
  // back out of it. Neither direction is animated by hand.
  if (uUseMask > 0.5) {
    float allow = mix(1.0, texture2D(uMask, vUv).r, uMaskMix);
    nextB *= allow;
    nextA = mix(1.0, nextA, allow);
  }

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
uniform float uInvert;
uniform vec2 uZoom;   // per-axis; x != y is the travel stretch
uniform vec2 uOffset;
uniform sampler2D uMask;
uniform float uUseMask;
uniform float uMaskMix;
uniform float uMaskGround;  // masked-branch tone where there is no pattern
uniform float uMaskInk;     // …and where there is

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
  // The case study page inverts the site palette, so the same sim has to read
  // as a light pattern on a dark ground rather than the other way round.
  // Continuous, not a flip. The About corridor crossfades the ground while the
  // camera is travelling, and a threshold here reads as a cut mid-move.
  lum = mix(lum, 1.0 - lum, clamp(uInvert, 0.0, 1.0));
  // Masked surfaces carry their shape in the alpha channel, so the letterforms
  // ARE the output rather than something composited over it afterwards. They
  // also get their own tone ramp: the page gradient above is built for a
  // full-bleed background, and inside letterforms sitting on a near-black page
  // it left the word all but invisible. A mid-grey body that the pattern
  // lightens matches how the mark is drawn in Figma.
  // Tone blends by uMaskMix so a morph crossfades instead of popping — but
  // ALPHA NEVER DOES. Ramping alpha from 1 meant the whole rect went partly
  // opaque mid-morph, painting a translucent box around the letterforms.
  // The shape is always exactly the mask.
  if (uUseMask > 0.5) {
    float body = mix(uMaskGround, uMaskInk, mask);
    gl_FragColor = vec4(vec3(mix(lum, body, uMaskMix)), texture2D(uMask, vUv).r);
    return;
  }
  gl_FragColor = vec4(vec3(lum), 1.0);
}
`;

export interface BackgroundOpts {
  reducedMotion: boolean;
  debug: boolean;
  /** Render as a light pattern on a dark ground — the case study page. */
  invert?: boolean;
  /**
   * Size the sim grid and the aspect correction from the render surface rather
   * than the window.
   *
   * The full-bleed background IS the window, so it leaves this off. Anything
   * drawn into a small element must turn it on, or it runs a window-shaped
   * simulation sampled into an element-shaped box: the pattern's feature scale
   * comes out wrong for the element and `uAspect` ovals the pull lens.
   *
   * Opt-in rather than automatic so the shipped case study footer mark, which
   * was tuned against the window-sized behaviour, does not change underfoot.
   */
  fitToCanvas?: boolean;
}

export interface BackgroundLayer extends StageLayer {
  destroy(): void;
  setCameraProvider(fn: () => { x: number; y: number; z: number }): void;
  /** Signed camera-z velocity (world units/s) driving the travel stretch. */
  setVelocityProvider(fn: () => number): void;
  /** 0..1 press-and-hold progress driving the cursor-anchored pull. */
  setPullProvider(fn: () => number): void;
  /** Per-step uv drift fed into the sim — the case study's scroll travel. */
  setAdvectProvider(fn: () => { x: number; y: number }): void;
  /**
   * Confine the reaction to a shape. The texture's red channel is the mask:
   * 1 where the pattern may grow, 0 where it may not. Passing null returns the
   * field to an unbounded one.
   *
   * This is not a crop — the mask is applied inside the feedback loop, so the
   * reaction genuinely dies at the boundary rather than continuing unseen.
   */
  setMask(mask: THREE.Texture | null): void;
  /**
   * How much grip the mask has, 0..1. Defaults to 1, so setMask() alone
   * confines fully and existing callers are unaffected.
   *
   * Ramping this IS the morph. The mask boundary is absorbing, so raising the
   * mix makes the field die back into the shape and lowering it lets the
   * reaction grow back out — organic in both directions, with no keyframes.
   * Non-finite values are ignored rather than written.
   */
  setMaskMix(mix: number): void;
  /**
   * Flip between dark-pattern-on-light and light-pattern-on-dark at runtime.
   *
   * Applies to the UNMASKED field only. The masked branch of the view shader
   * never reads `lum`, so this is a no-op on a fully-masked surface — use
   * setMaskTone to move a masked surface between grounds.
   */
  setInvert(on: boolean): void;
  /** 0 = normal, 1 = fully inverted; clamped. The continuous form of setInvert. */
  setInvertAmount(t: number): void;
  /**
   * Tone ramp for a MASKED surface: `ground` where the field is empty, `ink`
   * where the pattern is, both 0..1 luminance. Defaults to the case study
   * footer's values.
   *
   * A masked surface needs its own ramp because the background's exists to be
   * invisible — inheriting it puts a foreground control at ~6% contrast on a
   * white page, which is exactly how the first contact mark shipped.
   */
  setMaskTone(ground: number, ink: number): void;
  /**
   * Inject B in a circle at a sim uv — the same mechanism the spontaneous
   * reseed uses, aimed by a caller. Active for one sim step, then the pattern
   * propagates outward on its own.
   *
   * Applied by the next update(), so it does nothing under reduced motion,
   * where the sim never steps.
   */
  splatAt(u: number, v: number, radius?: number): void;
}

/** Screen UV → sim UV under the view shader's zoom + parallax offset.
 * Mirrors VIEW_FRAG's uvZ so the erase brush lands under the cursor.
 * Zoom is per-axis: travel stretches the field vertically, so the brush has to
 * follow the same anisotropic mapping or it drifts off the pointer while moving. */
export function viewToSimUV(
  u: number,
  v: number,
  zoomX: number,
  zoomY: number,
  offU: number,
  offV: number,
): { u: number; v: number } {
  return { u: (u - 0.5) / zoomX + 0.5 + offU, v: (v - 0.5) / zoomY + 0.5 + offV };
}

/**
 * Travel stretch from camera speed: 0 at rest, rising to STRETCH_MAX at
 * STRETCH_REF_SPEED and clamped there. Uses speed, not signed velocity — a
 * scale is symmetric about the centre, so only the axis of travel matters, not
 * which way along it the camera is going.
 */
export function travelStretch(velocity: number): number {
  const speed = Math.abs(velocity);
  if (!Number.isFinite(speed)) return 0;
  return STRETCH_MAX * Math.min(1, speed / STRETCH_REF_SPEED);
}

/** Per-axis zoom for a given base zoom and stretch: taller along the axis of
 * travel, x untouched, so the field elongates rather than simply scaling up. */
export function stretchedZoom(baseZoom: number, stretch: number): { x: number; y: number } {
  return {
    x: baseZoom,
    y: baseZoom * (1 + Math.max(0, stretch)),
  };
}

/**
 * How far the sampled UV may shift on one axis before it runs off the clamped
 * texture edge.
 *
 * The view shader samples `(vUv - 0.5) / zoom + 0.5 + offset`, so the screen
 * edges land at `0.5 * (1 +/- 1/zoom) + offset` and the overscan therefore
 * leaves `0.5 * (1 - 1/zoom)` of room on each side. At the 1.03 base that is
 * about 1.5% of the texture. A zoom of 1 or less has no room at all.
 */
export function parallaxMargin(zoom: number): number {
  return Number.isFinite(zoom) && zoom > 1 ? 0.5 * (1 - 1 / zoom) : 0;
}

/**
 * Hold the parallax offset inside that margin.
 *
 * PARALLAX_UV_PER_UNIT was tuned against the pointer magnet, which deflects the
 * camera by a fraction of a world unit — "full magnet deflection ~= 1% of
 * screen", per its own comment — and BASE_OVERSCAN's 3% was sized to cover
 * exactly that, with the explicit note that it "must leave more margin than the
 * max parallax offset".
 *
 * Then the About corridor climbed the camera 31 world units off the spine. That
 * asks for a 31% shift against a 1.5% margin, and the field smeared along its
 * clamped edge for the whole climb (Adam, on seeing it: "the texture in the
 * background starts to glitch out once its going vertical").
 *
 * Clamping rather than rescaling is deliberate: the parallax stays exactly as
 * tuned for every camera near the spine, and simply saturates once one travels
 * far enough that the effect would tear. The alternative — scaling the rate
 * down to fit the worst case — would make the magnet imperceptible everywhere
 * to accommodate a place the magnet never goes.
 */
export function clampParallax(
  offU: number,
  offV: number,
  zoomX: number,
  zoomY: number,
): { u: number; v: number } {
  const clamp = (v: number, m: number): number =>
    Number.isFinite(v) ? Math.min(m, Math.max(-m, v)) : 0;
  return {
    u: clamp(offU, parallaxMargin(zoomX)),
    v: clamp(offV, parallaxMargin(zoomY)),
  };
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

  // The surface the sim is shaped by. Tracks the window unless the layer is
  // fitted to its canvas, in which case resize() supplies the element's box.
  let surfaceW = window.innerWidth;
  let surfaceH = window.innerHeight;

  let { w: simW, h: simH } = computeSimDims(surfaceW, surfaceH);
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
      uPullRate: { value: 0 },
      uPullRadius: { value: PULL_RADIUS },
      uAdvect: { value: new THREE.Vector2(0, 0) },
      uMask: { value: null },
      uUseMask: { value: 0 },
      uMaskMix: { value: 1 },
      uAspect: { value: window.innerWidth / window.innerHeight },
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
      uInvert: { value: opts.invert ? 1 : 0 },
      // Defaults are the values the case study footer mark was tuned with.
      uMaskGround: { value: MASK_GROUND },
      uMaskInk: { value: MASK_INK },
      uMask: { value: null },
      uUseMask: { value: 0 },
      uMaskMix: { value: 1 },
      uZoom: { value: new THREE.Vector2(BASE_OVERSCAN, BASE_OVERSCAN) },
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
    const dims = computeSimDims(surfaceW, surfaceH);
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
  let curZoomX = BASE_OVERSCAN;
  let curZoomY = BASE_OVERSCAN;
  let curOffU = 0;
  let curOffV = 0;

  // Travel stretch (set by main.ts once the camera director exists)
  let velocityProvider: (() => number) | null = null;
  let curStretch = 0;

  // Press-and-hold pull (set by main.ts from the cursor system)
  let pullProvider: (() => number) | null = null;
  let advectProvider: (() => { x: number; y: number }) | null = null;

  // Mouse → sim UV for the erase brush, mapped through the same zoom/offset
  // as the view shader so the brush stays under the cursor.
  let rawU = 0;
  let rawV = 0;
  let cursorActive = false;
  const syncMouseUniform = (): void => {
    if (!cursorActive) return;
    const { u, v } = viewToSimUV(rawU, rawV, curZoomX, curZoomY, curOffU, curOffV);
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
    update(dt: number): void {
      if (opts.reducedMotion) return;
      // Ease the stretch toward the speed-derived target. dt is 0 on the
      // reduced-motion requestFrame() path, which leaves the stretch untouched.
      if (velocityProvider && dt > 0) {
        const target = travelStretch(velocityProvider());
        curStretch += (target - curStretch) * (1 - Math.exp(-STRETCH_SMOOTH_RATE * dt));
      }
      syncMouseUniform(); // camera drift moves the sampled region under a still cursor

      // Pull is set BEFORE the step loop so this frame's steps advect with it.
      // uMouse doubles as the anchor, which guarantees the pull centres exactly
      // where the erase brush is. The brush itself fades out as the hold builds
      // — it exists to part the pattern around the cursor, and a hole there
      // would eat the very pattern the pull is gathering.
      const advect = advectProvider?.() ?? { x: 0, y: 0 };
      simMaterial.uniforms.uAdvect.value.set(advect.x, advect.y);
      const pull = pullProvider && cursorActive ? Math.max(0, Math.min(1, pullProvider())) : 0;
      simMaterial.uniforms.uPullRate.value = PULL_RATE_MAX * pullCurve(pull);
      simMaterial.uniforms.uBrushR.value = BRUSH_RADIUS * (1 - pull);

      simClock += 1 / 60;
      if (simClock >= nextSeedAt) {
        // Pin the radius too: splatAt() borrows this uniform, and without this
        // its radius would persist into every spontaneous reseed thereafter.
        simMaterial.uniforms.uSeedR.value = RESEED_RADIUS;
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
      }
      // Applied outside the cameraProvider guard so the axes stay in sync with
      // curZoom even before a provider is attached.
      const z = stretchedZoom(curZoom, curStretch);
      curZoomX = z.x;
      curZoomY = z.y;
      // Clamped only once the zoom is known, since the margin depends on it —
      // and written BACK into curOffU/curOffV rather than only into the
      // uniform, because viewToSimUV reads those same two values to map a
      // pointer into the sim. Clamping one and not the other would put the
      // brush where the field is not.
      const off = clampParallax(curOffU, curOffV, curZoomX, curZoomY);
      curOffU = off.u;
      curOffV = off.v;
      viewMaterial.uniforms.uOffset.value.set(curOffU, curOffV);
      viewMaterial.uniforms.uZoom.value.set(curZoomX, curZoomY);
      viewMaterial.uniforms.uState.value = read.texture;
      r.setRenderTarget(null);
      r.render(viewScene, camera);
    },
    resize(width?: number, height?: number): void {
      if (opts.fitToCanvas) {
        // A zero-sized box happens while an element is still laying out or is
        // display:none; taking it would divide by zero and blank the surface.
        if (width && height && width > 0 && height > 0) {
          surfaceW = width;
          surfaceH = height;
        }
      } else {
        surfaceW = window.innerWidth;
        surfaceH = window.innerHeight;
      }
      // Aspect is applied immediately, not debounced: it only keeps the pull
      // lens circular, and a stale value would visibly oval it mid-hold.
      simMaterial.uniforms.uAspect.value = surfaceW / surfaceH;
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
    setVelocityProvider(fn: () => number): void {
      velocityProvider = fn;
    },
    setAdvectProvider(fn: () => { x: number; y: number }): void {
      advectProvider = fn;
    },
    setMask(mask: THREE.Texture | null): void {
      simMaterial.uniforms.uMask.value = mask;
      simMaterial.uniforms.uUseMask.value = mask ? 1 : 0;
      viewMaterial.uniforms.uMask.value = mask;
      viewMaterial.uniforms.uUseMask.value = mask ? 1 : 0;
      // The view now writes real alpha, so it has to blend rather than
      // overwrite whatever is behind it.
      viewMaterial.transparent = !!mask;
      viewMaterial.needsUpdate = true;
    },
    setMaskMix(mix: number): void {
      if (!Number.isFinite(mix)) return;
      const v = Math.min(1, Math.max(0, mix));
      simMaterial.uniforms.uMaskMix.value = v;
      viewMaterial.uniforms.uMaskMix.value = v;
    },
    setInvert(on: boolean): void {
      viewMaterial.uniforms.uInvert.value = on ? 1 : 0;
    },
    setInvertAmount(t: number): void {
      viewMaterial.uniforms.uInvert.value = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
    },
    setMaskTone(ground: number, ink: number): void {
      if (!Number.isFinite(ground) || !Number.isFinite(ink)) return;
      viewMaterial.uniforms.uMaskGround.value = ground;
      viewMaterial.uniforms.uMaskInk.value = ink;
    },
    splatAt(u: number, v: number, radius: number = RESEED_RADIUS): void {
      if (!Number.isFinite(u) || !Number.isFinite(v) || !Number.isFinite(radius)) return;
      simMaterial.uniforms.uSeedR.value = radius;
      simMaterial.uniforms.uSeedPos.value.set(u, v);
    },
    setPullProvider(fn: () => number): void {
      pullProvider = fn;
    },
  };
}
