import * as THREE from 'three';
import { onPageVisibility, pageVisible } from '../page-visibility';

export interface StageLayer {
  update?(dt: number): void;
  render(renderer: THREE.WebGLRenderer): void;
  resize?(width: number, height: number): void;
}

export interface StageOpts {
  reducedMotion: boolean;
}

export interface StageHandle {
  renderer: THREE.WebGLRenderer;
  addLayer(layer: StageLayer): void;
  onFrame(cb: (dt: number) => void): void;
  requestFrame(): void;
  start(): void;
  /**
   * Suspend the loop while something opaque covers the canvas — a 2D takeover.
   * The world is invisible then, and on a case study page it would otherwise be
   * the third renderer running simultaneously alongside the logo and the RD
   * field. Independent of the visibility gate; the loop runs only when neither
   * reason to idle applies.
   */
  setPaused(paused: boolean): void;
  destroy(): void;
}

const MAX_DT = 0.05; // clamp tab-switch time jumps

export function initStage(canvas: HTMLCanvasElement, opts: StageOpts): StageHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false;

  const layers: StageLayer[] = [];
  const frameCbs: Array<(dt: number) => void> = [];
  const clock = new THREE.Clock();

  const renderFrame = (dt: number): void => {
    for (const cb of frameCbs) cb(dt);
    for (const layer of layers) layer.update?.(dt);
    // clear() acts on the bound target — a layer's update() may leave one bound
    // (the RD sim's ping-pong buffer); rebind the canvas or we wipe its state
    renderer.setRenderTarget(null);
    renderer.clear(true, true, false);
    for (const layer of layers) {
      renderer.clearDepth();
      layer.render(renderer);
    }
  };

  const requestFrame = (): void => {
    renderFrame(0);
  };

  let raf = 0;
  let paused = false;
  let visible = pageVisible();
  let started = false;
  /** The loop runs only when nothing is asking it to idle. */
  const shouldRun = (): boolean => started && !paused && visible && !opts.reducedMotion;

  const loop = (): void => {
    raf = 0;
    // getDelta() is read even when stopping, so the clock does not accumulate
    // the idle period into the next frame's dt. MAX_DT is the backstop.
    renderFrame(Math.min(clock.getDelta(), MAX_DT));
    if (shouldRun()) raf = requestAnimationFrame(loop);
  };

  const sync = (): void => {
    if (shouldRun()) {
      if (!raf) {
        clock.getDelta(); // discard the idle gap
        raf = requestAnimationFrame(loop);
      }
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const offVisibility = onPageVisibility((v) => {
    visible = v;
    sync();
  });

  const onResize = (): void => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    for (const layer of layers) layer.resize?.(window.innerWidth, window.innerHeight);
    if (opts.reducedMotion) requestFrame();
  };
  window.addEventListener('resize', onResize);

  return {
    renderer,
    addLayer(layer: StageLayer): void {
      layers.push(layer);
    },
    onFrame(cb: (dt: number) => void): void {
      frameCbs.push(cb);
    },
    requestFrame,
    start(): void {
      started = true;
      // Always paint once, even if the page is currently hidden: a tab opened in
      // the background would otherwise show nothing at all until it is focused.
      // The visibility gate is about not running CONTINUOUSLY while unwatched,
      // not about withholding the first frame.
      renderFrame(0);
      if (!opts.reducedMotion) sync();
    },
    setPaused(v: boolean): void {
      if (v === paused) return;
      paused = v;
      // Paint one frame on resume even under reduced motion, so the world is
      // current the moment the takeover uncovers it.
      if (!v && opts.reducedMotion) renderFrame(0);
      sync();
    },
    destroy(): void {
      started = false;
      cancelAnimationFrame(raf);
      offVisibility();
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    },
  };
}
