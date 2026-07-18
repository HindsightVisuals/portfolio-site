import * as THREE from 'three';

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
  const loop = (): void => {
    renderFrame(Math.min(clock.getDelta(), MAX_DT));
    raf = requestAnimationFrame(loop);
  };

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
      if (opts.reducedMotion) renderFrame(0);
      else loop();
    },
    destroy(): void {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    },
  };
}
