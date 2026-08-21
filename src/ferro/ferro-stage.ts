/**
 * The ferro stage — one viewport-sized canvas, renderer, scene and camera that
 * live for the whole session.
 *
 * There is exactly one of these. The blob moves between the nav, the corner of
 * a 2D page and the contact page's beat-4 frame; giving each home its own
 * canvas would mean resizing a drawing buffer mid-transition, which is the
 * expensive way to move a GL object. Here the buffer only ever tracks the
 * viewport and the object transform does the travelling.
 *
 * GL/DOM shell — no unit tests, per the repo's split (see `cursor-math.ts`).
 */

import * as THREE from 'three';
import { onPageVisibility, pageVisible } from '../page-visibility';
import { FERRO_DEFAULTS } from './ferro-field';
import '../styles/ferro.css';

/** Camera framing. Placement converts CSS rects against exactly these. */
export const FERRO_CAMERA = Object.freeze({ distance: 4.2, fovYDeg: 35 });

export interface FerroStage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  /** Register a per-frame callback. dt is seconds, clamped. */
  onFrame(cb: (dt: number) => void): void;
  /** Render one frame now — for reduced motion, and for resize repaints. */
  requestFrame(): void;
  /** Park the loop when the blob has no home on screen. */
  setActive(active: boolean): void;
  viewport(): { w: number; h: number };
  destroy(): void;
}

export interface FerroStageOpts {
  reducedMotion: boolean;
}

/**
 * The environment IS the look. A mirror with roughness 0 shows nothing but what
 * surrounds it, so this is what makes the blob read as black chrome.
 *
 * Built as a FLOAT DataTexture, not a canvas: an LDR canvas clamps at 1.0, and
 * a mirror reflecting a clamped white gives flat grey highlights instead of the
 * hard specular hits a real HDRI's >1 values produce.
 *
 * This is the lab's `darkEnv: false` white void — Adam's choice, matching the
 * site's ground rather than the blend file's dark studio.
 */
function buildWhiteVoid(): THREE.DataTexture {
  const W = 256;
  const H = 128;
  const data = new Float32Array(W * H * 4);
  const ambient = 0.85;
  // [x0, y0, x1, y1, intensity] in equirect space; y 0 = up.
  const boxes: Array<[number, number, number, number, number]> = [
    [0.05, 0.05, 0.35, 0.35, 6],
    [0.6, 0.08, 0.8, 0.3, 4],
  ];
  const soft = (v: number, e: number): number => Math.min(1, Math.max(0, v / e));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      // Floor bounce — studio HDRIs are brighter below the horizon.
      let lum = ambient + (v > 0.5 ? 0.25 * (v - 0.5) * 2 : 0);
      for (const [x0, y0, x1, y1, i] of boxes) {
        if (u > x0 && u < x1 && v > y0 && v < y1) {
          const fx = Math.min(soft(u - x0, 0.04), soft(x1 - u, 0.04));
          const fy = Math.min(soft(v - y0, 0.04), soft(y1 - v, 0.04));
          lum += i * fx * fy;
        }
      }
      const o = (y * W + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = lum;
      data[o + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  return tex;
}

export function initFerroStage(opts: FerroStageOpts): FerroStage | null {
  const canvas = document.createElement('canvas');
  canvas.className = 'ferro-stage ferro-stage--hidden';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    // No WebGL: the site is fully usable without the blob.
    canvas.remove();
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  // Blender is on Filmic / medium-high contrast. ACES is the closest thing
  // three ships; without any tone mapping the >1 softbox hits just clip white.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = FERRO_DEFAULTS.exposure;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FERRO_CAMERA.fovYDeg, 1, 0.1, 100);
  camera.position.z = FERRO_CAMERA.distance;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const src = buildWhiteVoid();
  const envRT = pmrem.fromEquirectangular(src);
  scene.environment = envRT.texture;
  src.dispose();

  let vw = 1;
  let vh = 1;
  const measure = (): void => {
    vw = Math.max(1, window.innerWidth);
    vh = Math.max(1, window.innerHeight);
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(vw, vh, false);
  };
  measure();

  const callbacks: Array<(dt: number) => void> = [];
  let visible = pageVisible();
  let active = false;
  let raf = 0;
  let last = performance.now();

  const step = (dt: number): void => {
    for (const cb of callbacks) cb(dt);
    renderer.render(scene, camera);
  };

  const frame = (): void => {
    raf = 0;
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    step(dt);
    if (visible && active && !opts.reducedMotion) raf = requestAnimationFrame(frame);
  };

  const start = (): void => {
    if (raf || opts.reducedMotion) return;
    if (!visible || !active) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const offVisibility = onPageVisibility((v) => {
    visible = v;
    if (v) start();
  });

  const onResize = (): void => {
    measure();
    // A parked stage still has to repaint, or a resize leaves a stale frame.
    if (!raf) step(0);
  };
  window.addEventListener('resize', onResize);

  return {
    scene,
    camera,
    renderer,
    canvas,
    onFrame(cb) {
      callbacks.push(cb);
    },
    requestFrame() {
      if (!raf) step(0);
    },
    setActive(next) {
      active = next;
      if (active) start();
      else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    viewport() {
      return { w: vw, h: vh };
    },
    destroy(): void {
      offVisibility();
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
      callbacks.length = 0;
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
