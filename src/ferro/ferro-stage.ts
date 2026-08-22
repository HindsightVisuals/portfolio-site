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
  /**
   * Fires whenever the canvas's box changes, i.e. whenever `viewport()` starts
   * returning something new. Anything that converted a CSS rect into world
   * units against the old viewport has to redo that conversion — see ferro.ts.
   */
  onViewportChange(cb: () => void): void;
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
  // Lowered from 0.85. Ambient is what a mirror returns where it sees nothing
  // in particular, so it sets the blob's floor value — high ambient washes the
  // whole surface to mid-grey and there is no contrast left for a highlight to
  // register against. The reference is near-black with hard bright hits.
  const ambient = 0.18;
  // [x0, y0, x1, y1, intensity] in equirect space; y 0 = up.
  //
  // Revised for "glossier" (Adam, 2026-08-21). Roughness is already 0, so gloss
  // cannot come from the material — in a mirror it comes entirely from what
  // there is to reflect. Two broad soft boxes gave broad soft sheens; these are
  // smaller and far brighter, which is what produces a compact, hard-edged
  // specular hit per lobe, plus the small bright dots the reference shows.
  const boxes: Array<[number, number, number, number, number]> = [
    [0.06, 0.06, 0.2, 0.26, 26], // key
    [0.62, 0.1, 0.72, 0.24, 18], // fill, opposite side
    [0.38, 0.02, 0.46, 0.1, 34], // small hot source — the bright speckles
    [0.84, 0.42, 0.9, 0.52, 12], // low kicker, catches the underside lobes
  ];
  const soft = (v: number, e: number): number => Math.min(1, Math.max(0, v / e));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      // Floor bounce — studio HDRIs are brighter below the horizon. Scaled back
      // with the ambient: at the old 0.85 ambient a 0.25 lift was a nudge, but
      // against 0.18 it would be the brightest broad area in the map and undo
      // the contrast the smaller, hotter sources are there to create.
      let lum = ambient + (v > 0.5 ? 0.12 * (v - 0.5) * 2 : 0);
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
  // The generator's own GL resources aren't needed past this call — the
  // baked environment texture (envRT) is retained separately for the
  // session and disposed in destroy() below.
  pmrem.dispose();

  let vw = 1;
  let vh = 1;
  /**
   * Measure the CANVAS'S OWN BOX, not `window.innerWidth/innerHeight`.
   *
   * This used to trust the window and re-read it only on a `resize` event, and
   * that shipped a real bug: on a display at 150% scaling the boot measurement
   * cached roughly 1707x870 while the element was really 2560x1305, and no
   * resize ever fired to correct it. Everything downstream is derived from this
   * pair — `worldPerPx` in ferro-placement.ts divides by the height — so a
   * viewport 1.5x too small rendered the blob 1.5x too large and threw its
   * screen position out by the same factor, parking it near the bottom-middle
   * of the viewport instead of inside its frame.
   *
   * The element is what the projection actually maps onto, so measuring it is
   * both more direct and self-correcting: whatever makes the box change —
   * scaling, zoom, a resize the listener missed, a stylesheet — the numbers
   * follow. The ResizeObserver below is what closes the loop.
   */
  const measure = (): void => {
    const box = canvas.getBoundingClientRect();
    // Fall back to the window only if the element has no box yet (not laid out).
    vw = Math.max(1, Math.round(box.width || window.innerWidth));
    vh = Math.max(1, Math.round(box.height || window.innerHeight));
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

  const viewportCbs: Array<() => void> = [];

  const onResize = (): void => {
    const beforeW = vw;
    const beforeH = vh;
    measure();
    // Only notify on an actual change: the observer fires on observe() and on
    // every layout pass that touches the box, and re-placing the blob on a
    // no-op would restart its travel tween mid-flight.
    if (vw !== beforeW || vh !== beforeH) {
      for (const cb of viewportCbs) cb();
    }
    // A parked-but-ACTIVE stage still has to repaint, or a resize leaves a
    // stale frame (e.g. the <=1200px contact stack, where the frame's CSS
    // box changes size but nothing else re-triggers a render). An inactive
    // stage — the common case, since the blob has no home on the homepage —
    // has nothing worth painting; skipping the 84,500-triangle repaint there
    // avoids a resize cost the homepage was paying for a hidden canvas.
    if (!raf && active) step(0);
  };
  window.addEventListener('resize', onResize);

  /**
   * The real guarantee. A `resize` listener only fires when the WINDOW changes,
   * and the bug this fixes was a canvas box that disagreed with the cached size
   * without any window resize ever happening. Observing the element itself
   * catches every cause — display scaling, zoom, a late layout, a stylesheet
   * arriving — because it watches the thing the projection maps onto rather
   * than a proxy for it.
   *
   * The observer fires once on observe(), which also re-measures after first
   * layout: at initFerroStage() time the canvas has just been appended and may
   * still report a zero or provisional box.
   */
  const boxObserver = new ResizeObserver(() => onResize());
  boxObserver.observe(canvas);

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
    onViewportChange(cb) {
      viewportCbs.push(cb);
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
      boxObserver.disconnect();
      viewportCbs.length = 0;
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
      callbacks.length = 0;
      envRT.dispose();
      // pmrem itself is already disposed right after fromEquirectangular() above.
      renderer.dispose();
      canvas.remove();
    },
  };
}
