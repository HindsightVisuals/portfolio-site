import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The stage's frame clear must hit the canvas (default framebuffer), never a
// render target a layer left bound during update() — regression guard for the
// RD sim state being wiped every frame.
vi.mock('three', () => {
  class WebGLRenderer {
    autoClear = true;
    target: unknown = null;
    clearTargets: unknown[] = [];
    setPixelRatio(): void {}
    setSize(): void {}
    setRenderTarget(t: unknown): void {
      this.target = t;
    }
    clear(): void {
      this.clearTargets.push(this.target);
    }
    clearDepth(): void {}
    render(): void {}
    dispose(): void {}
  }
  class Clock {
    getDelta(): number {
      return 0.016;
    }
  }
  return { WebGLRenderer, Clock };
});

import { initStage } from './stage';

type MockRenderer = {
  target: unknown;
  clearTargets: unknown[];
  setRenderTarget(t: unknown): void;
};

beforeEach(() => {
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('initStage frame clear', () => {
  it('clears the default framebuffer even when a layer leaves a render target bound', () => {
    const stage = initStage({} as HTMLCanvasElement, { reducedMotion: false });
    const renderer = stage.renderer as unknown as MockRenderer;
    const simTarget = { isSimTarget: true };

    stage.addLayer({
      // mimics the RD background: sim steps leave a ping-pong target bound
      update: () => renderer.setRenderTarget(simTarget),
      render: () => renderer.setRenderTarget(null),
    });

    stage.requestFrame();

    expect(renderer.clearTargets).toEqual([null]);
    stage.destroy();
  });
});
