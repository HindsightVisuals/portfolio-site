import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The mask-mix surface of the background layer, exercised against a mocked
 * three so the uniforms are readable without a GL context. Mirrors the
 * mock-renderer approach in stage.test.ts: the mock RECORDS what the code
 * built, and the test asserts on that — no test-only hooks on the layer.
 */
const materials: Array<{ uniforms: Record<string, { value: unknown }> }> = [];

vi.mock('three', () => {
  class Vector2 {
    x = 0;
    y = 0;
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }
    set(x: number, y: number): this {
      this.x = x;
      this.y = y;
      return this;
    }
  }
  class WebGLRenderTarget {
    texture = { name: 'rt' };
    dispose(): void {}
  }
  class DataTexture {
    needsUpdate = false;
    dispose(): void {}
  }
  class ShaderMaterial {
    uniforms: Record<string, { value: unknown }>;
    transparent = false;
    needsUpdate = false;
    constructor(params: { uniforms: Record<string, { value: unknown }> }) {
      this.uniforms = params.uniforms;
      materials.push(this);
    }
    dispose(): void {}
  }
  class Scene {
    add(): void {}
  }
  class Mesh {}
  class OrthographicCamera {}
  class PlaneGeometry {
    dispose(): void {}
  }
  class Texture {}
  class WebGLRenderer {
    setRenderTarget(): void {}
    render(): void {}
  }
  return {
    Vector2,
    WebGLRenderTarget,
    DataTexture,
    ShaderMaterial,
    Scene,
    Mesh,
    OrthographicCamera,
    PlaneGeometry,
    Texture,
    WebGLRenderer,
    HalfFloatType: 'HalfFloatType',
    FloatType: 'FloatType',
    LinearFilter: 'LinearFilter',
    ClampToEdgeWrapping: 'ClampToEdgeWrapping',
    RGBAFormat: 'RGBAFormat',
  };
});

const { initBackgroundLayer } = await import('./background');
const THREE = await import('three');

/** The two materials are told apart by uniforms only they carry. */
const simMat = () => materials.find((m) => 'uFeed' in m.uniforms)!;
const viewMat = () => materials.find((m) => 'uInvert' in m.uniforms)!;
const simMix = () => simMat().uniforms.uMaskMix.value as number;
const viewMix = () => viewMat().uniforms.uMaskMix.value as number;

function makeLayer(
  opts: { invert?: boolean; reducedMotion?: boolean; fitToCanvas?: boolean } = {},
) {
  const renderer = new THREE.WebGLRenderer() as unknown as import('three').WebGLRenderer;
  return initBackgroundLayer(renderer, { reducedMotion: true, debug: false, ...opts });
}

const someTexture = (): import('three').Texture => ({}) as unknown as import('three').Texture;

beforeEach(() => {
  materials.length = 0;
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    // Synchronous, so the sim-grid rebuild the layer debounces lands before the
    // assertion. The debounce itself is not what these tests are about.
    setTimeout: (fn: () => void) => {
      fn();
      return 0;
    },
    clearTimeout: vi.fn(),
  });
  vi.stubGlobal('document', {
    documentElement: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('setMaskMix', () => {
  it('clamps above 1 — a mix beyond full confinement is meaningless', () => {
    makeLayer().setMaskMix(4.2);
    expect(simMix()).toBe(1);
    expect(viewMix()).toBe(1);
  });

  it('clamps below 0 — a negative mix would invert the mask', () => {
    makeLayer().setMaskMix(-3);
    expect(simMix()).toBe(0);
    expect(viewMix()).toBe(0);
  });

  it('passes an in-range value through to both materials', () => {
    makeLayer().setMaskMix(0.4);
    expect(simMix()).toBeCloseTo(0.4, 12);
    expect(viewMix()).toBeCloseTo(0.4, 12);
  });

  it('survives a non-finite value without poisoning the uniform', () => {
    const layer = makeLayer();
    layer.setMaskMix(0.5);
    layer.setMaskMix(Number.NaN);
    expect(Number.isFinite(simMix())).toBe(true);
    expect(Number.isFinite(viewMix())).toBe(true);
  });
});

describe('setMask default confinement', () => {
  it('confines fully the moment a mask is set — the shipped logotype must not change', () => {
    makeLayer().setMask(someTexture());
    expect(simMix()).toBe(1);
    expect(viewMix()).toBe(1);
  });

  it('leaves a caller-set mix alone when the mask is replaced mid-morph', () => {
    const layer = makeLayer();
    layer.setMask(someTexture());
    layer.setMaskMix(0.3);
    layer.setMask(someTexture());
    expect(simMix()).toBeCloseTo(0.3, 12);
  });
});

describe('splatAt', () => {
  const seedPos = () => simMat().uniforms.uSeedPos.value as { x: number; y: number };
  const seedR = () => simMat().uniforms.uSeedR.value as number;

  it('arms a splat at the given sim uv', () => {
    makeLayer().splatAt(0.25, 0.75, 8);
    expect(seedPos().x).toBeCloseTo(0.25, 12);
    expect(seedPos().y).toBeCloseTo(0.75, 12);
    expect(seedR()).toBe(8);
  });

  it('ignores a non-finite position rather than arming a splat at NaN', () => {
    const layer = makeLayer();
    layer.splatAt(Number.NaN, 0.5, 8);
    expect(Number.isFinite(seedPos().x)).toBe(true);
    expect(seedPos().x).not.toBeCloseTo(0.5, 12);
  });

  it('does not leak its radius into later spontaneous reseeds', () => {
    const layer = makeLayer({ reducedMotion: false });
    layer.splatAt(0.5, 0.5, 99);
    // Far enough past RESEED_BASE_S + RESEED_JITTER_S for a spontaneous seed to fire.
    for (let i = 0; i < 500; i++) layer.update?.(1 / 60);
    expect(seedR()).not.toBe(99);
  });
});

describe('fitToCanvas sizing', () => {
  const aspect = () => simMat().uniforms.uAspect.value as number;
  const dims = () => simMat().uniforms.uSimDims.value as { x: number; y: number };

  it('sizes the sim from the window when not fitted — the full-bleed background', () => {
    const layer = makeLayer();
    layer.resize?.(147, 39);
    // window stub is 1280x720
    expect(aspect()).toBeCloseTo(1280 / 720, 6);
  });

  it('sizes the sim from the element when fitted', () => {
    const layer = makeLayer({ fitToCanvas: true });
    layer.resize?.(147, 39);
    expect(aspect()).toBeCloseTo(147 / 39, 6);
  });

  it('rebuilds the sim grid to the element aspect, not the window aspect', () => {
    const layer = makeLayer({ fitToCanvas: true });
    layer.resize?.(400, 100);
    // 4:1 wide → longest edge capped at SIM_MAX, short edge scaled down
    expect(dims().x / dims().y).toBeCloseTo(4, 1);
  });

  it('ignores a degenerate size rather than dividing by zero', () => {
    const layer = makeLayer({ fitToCanvas: true });
    layer.resize?.(200, 50);
    const good = aspect();
    layer.resize?.(0, 0);
    expect(aspect()).toBe(good);
  });
});

describe('setMaskTone', () => {
  const ground = () => viewMat().uniforms.uMaskGround.value as number;
  const ink = () => viewMat().uniforms.uMaskInk.value as number;

  it('defaults to the values the shipped footer logotype was tuned with', () => {
    makeLayer();
    expect(ground()).toBeCloseTo(0.3, 6);
    expect(ink()).toBeCloseTo(0.95, 6);
  });

  it('lets a caller set a ramp legible against its own ground', () => {
    makeLayer().setMaskTone(0.08, 0.42);
    expect(ground()).toBeCloseTo(0.08, 6);
    expect(ink()).toBeCloseTo(0.42, 6);
  });

  it('ignores non-finite values rather than blanking the surface', () => {
    const layer = makeLayer();
    layer.setMaskTone(0.08, 0.42);
    layer.setMaskTone(Number.NaN, 0.5);
    expect(ground()).toBeCloseTo(0.08, 6);
    expect(ink()).toBeCloseTo(0.42, 6);
  });
});

describe('setInvert', () => {
  it('flips the view uniform at runtime so one instance can cross both grounds', () => {
    const layer = makeLayer({ invert: false });
    const read = (): number => viewMat().uniforms.uInvert.value as number;
    expect(read()).toBe(0);
    layer.setInvert(true);
    expect(read()).toBe(1);
    layer.setInvert(false);
    expect(read()).toBe(0);
  });
});
