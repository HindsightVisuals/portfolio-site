# About Lander — Communications Array Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the communications array — a cursor-reactive segmented dish — as a self-contained subsystem, verified in a lab route, ready to mount into the About corridor's `lander` beat.

**Architecture:** The array's whole behaviour collapses into a vertex shader because Blender's `Geometry Proximity` target is a sphere, making it closed-form. Panel islands come from a baked `_ISLAND_C` attribute; the pointer raycasts a static proxy to produce a cursor position in the disc's local space; two uniforms drive everything.

**Tech Stack:** TypeScript, Three.js r184, GSAP, Vite 8, Vitest 4. `GLTFLoader` + `DRACOLoader`.

**Spec:** `docs/superpowers/specs/2026-08-26-about-lander-array-design.md`

## Global Constraints

- **All thresholds are in the disc's LOCAL space.** Cursor radius there is `0.3421`; disc local radius ≈ `1.611`. Never convert to world space.
- Explode band: `0.2 → 0.41` mapped to scale `0.57 → 1.0`, clamped, linear.
- Glow shell: `0 → 0.11` mapped to emission `4.6 → 0`, clamped.
- Scale centre: nearest point on the cursor sphere, **× 1.5**.
- Emission colour, linear: `(0.164, 1.0, 0.248)`.
- Follow influences: disc `TRACK_TO` **0.159**, key light `CHILD_OF` **0.142**.
- Idle: silence **2000 ms** after disengage, then keep-alive. Ambient eases over **800 ms**.
- `_ISLAND_C` is Draco-quantised (~0.0005 local units) — **cluster it at load** or panels deform instead of scaling rigidly.
- Use `ShaderMaterial`, not `onBeforeCompile` — see the header comment in `src/three/tile-material.ts` for why in this codebase.
- Never run `taskkill /F /IM node.exe` or any process-wide kill.

**Phase 1 (this plan)** builds the subsystem standalone behind `?lab=array`. It touches **no** existing About code, so it does not wait on the `about-flow.ts` split. Phase 2 (network + signal beam) and Phase 3 (the split, then mounting into the beat) are separate plans.

## File Structure

| File | Responsibility |
|---|---|
| `src/about/array/array-math.ts` | Pure: scale, emission, falloff curves. No THREE. |
| `src/about/array/array-idle.ts` | Pure: engagement/silence/breathe state machine. No THREE. |
| `src/about/array/array-geometry.ts` | Cluster `_ISLAND_C` back to exact per-island values. |
| `src/about/array/array-load.ts` | Draco-enabled GLTF load; split the scene by node name. |
| `src/about/array/array-material.ts` | Panel `ShaderMaterial` — explode + emission halo. |
| `src/about/array/array-pointer.ts` | Pointer → proxy raycast → cursor position in disc-local space. |
| `src/about/array/array.ts` | Assembly, `update(dt)`, `StageLayer` conformance. |
| `src/lab/array.ts` | Lab harness behind `?lab=array`. |
| `public/lander/*.glb` | The exported assets. |
| `public/draco/*` | Draco decoder, copied from `three`. |

---

### Task 1: Pure math

**Files:**
- Create: `src/about/array/array-math.ts`
- Test: `src/about/array/array-math.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `clamp01(v: number): number`, `surfaceDistance(centreDist: number, radius?: number): number`, `panelScale(d: number): number`, `emissionStrength(d: number): number`, `signalFalloff(d: number): number`, and the constants `EXPLODE_NEAR`, `EXPLODE_FAR`, `SCALE_MIN`, `SCALE_MAX`, `GLOW_RADIUS`, `EMISSION_MAX`, `CENTRE_SCALE`, `CURSOR_RADIUS`.

- [ ] **Step 1: Write the failing test**

```ts
// src/about/array/array-math.test.ts
import { describe, it, expect } from 'vitest';
import {
  EXPLODE_NEAR, EXPLODE_FAR, SCALE_MIN, SCALE_MAX,
  GLOW_RADIUS, EMISSION_MAX, CURSOR_RADIUS,
  clamp01, surfaceDistance, panelScale, emissionStrength, signalFalloff,
} from './array-math';

describe('constants match the Blender rig', () => {
  it('carries the measured thresholds verbatim', () => {
    expect(EXPLODE_NEAR).toBe(0.2);
    expect(EXPLODE_FAR).toBe(0.41);
    expect(SCALE_MIN).toBe(0.57);
    expect(SCALE_MAX).toBe(1);
    expect(GLOW_RADIUS).toBe(0.11);
    expect(EMISSION_MAX).toBe(4.6);
    expect(CURSOR_RADIUS).toBeCloseTo(0.3421, 4);
  });
});

describe('surfaceDistance', () => {
  it('subtracts the sphere radius from the centre distance', () => {
    expect(surfaceDistance(1, 0.25)).toBeCloseTo(0.75, 6);
  });

  it('goes negative inside the sphere', () => {
    expect(surfaceDistance(0.1, 0.25)).toBeCloseTo(-0.15, 6);
  });
});

describe('panelScale', () => {
  it('is fully shrunk at and inside the near threshold', () => {
    expect(panelScale(EXPLODE_NEAR)).toBeCloseTo(SCALE_MIN, 6);
    expect(panelScale(0)).toBeCloseTo(SCALE_MIN, 6);
    expect(panelScale(-5)).toBeCloseTo(SCALE_MIN, 6);
  });

  it('is closed at and beyond the far threshold', () => {
    expect(panelScale(EXPLODE_FAR)).toBeCloseTo(SCALE_MAX, 6);
    expect(panelScale(10)).toBeCloseTo(SCALE_MAX, 6);
  });

  it('is linear across the band', () => {
    const mid = (EXPLODE_NEAR + EXPLODE_FAR) / 2;
    expect(panelScale(mid)).toBeCloseTo((SCALE_MIN + SCALE_MAX) / 2, 6);
  });
});

describe('emissionStrength', () => {
  it('peaks against the cursor surface', () => {
    expect(emissionStrength(0)).toBeCloseTo(EMISSION_MAX, 6);
  });

  it('reaches zero at the glow shell edge and stays there', () => {
    expect(emissionStrength(GLOW_RADIUS)).toBeCloseTo(0, 6);
    expect(emissionStrength(1)).toBeCloseTo(0, 6);
  });

  it('is tighter than the explode band — the ratio that makes it read', () => {
    expect(emissionStrength(EXPLODE_NEAR)).toBe(0);
  });
});

describe('signalFalloff', () => {
  it('is 10 at zero distance', () => {
    expect(signalFalloff(0)).toBeCloseTo(10, 6);
  });

  it('is quartic — half strength at unit distance', () => {
    expect(signalFalloff(1)).toBeCloseTo(5, 6);
    expect(signalFalloff(2)).toBeCloseTo(10 / 17, 6);
  });
});

describe('clamp01', () => {
  it('clamps both ends and passes the middle', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/array/array-math.test.ts`
Expected: FAIL — `Failed to resolve import "./array-math"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/about/array/array-math.ts
/**
 * Curves for the communications array, lifted verbatim from the Blender rig.
 *
 * Every distance here is in the DISC'S LOCAL SPACE — the GN group's
 * `Object Info` used transform space RELATIVE, so proximity was measured after
 * the cursor was brought into `Circle`'s space. The disc's world scale is
 * 0.732 and its local radius is about 1.611; converting any of these to world
 * units breaks all of them at once.
 */

/** Map Range "From Min" on the explode band. */
export const EXPLODE_NEAR = 0.2;
/** Map Range "From Max" on the explode band. */
export const EXPLODE_FAR = 0.41;
/** Scale Elements output at the near threshold — panels shrink toward the cursor. */
export const SCALE_MIN = 0.57;
/** Scale Elements output past the far threshold — the closed, rest state. */
export const SCALE_MAX = 1;

/**
 * The emission Map Range's "From Max".
 *
 * Deliberately far tighter than the explode band: the glow is a thin shell
 * against the cursor while the geometry opens over a much wider radius. That
 * separation is what makes the effect read as focused attention rather than a
 * soft blob — preserve the ratio when tuning.
 */
export const GLOW_RADIUS = 0.11;
/** Emission strength at zero surface distance. */
export const EMISSION_MAX = 4.6;

/** The Vector Math MULTIPLY feeding Scale Elements' Center input. */
export const CENTRE_SCALE = 1.5;

/**
 * The cursor sphere's radius expressed in the disc's local space.
 *
 * Measured: world radius 0.2504 against the disc's world scale of 0.732.
 */
export const CURSOR_RADIUS = 0.3421;

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Distance from a point to the cursor sphere's SURFACE, not its centre.
 *
 * Blender's Geometry Proximity measured against the sphere's mesh; against a
 * 512-face UV sphere the faceting error is well under 1% of radius, so the
 * closed form stands in exactly.
 */
export function surfaceDistance(centreDist: number, radius: number = CURSOR_RADIUS): number {
  return centreDist - radius;
}

/** Panel scale from surface distance. Near the cursor panels SHRINK, opening gaps. */
export function panelScale(d: number): number {
  const t = clamp01((d - EXPLODE_NEAR) / (EXPLODE_FAR - EXPLODE_NEAR));
  return SCALE_MIN + (SCALE_MAX - SCALE_MIN) * t;
}

/** Emission strength from surface distance — 4.6 at the surface, 0 past the shell. */
export function emissionStrength(d: number): number {
  return EMISSION_MAX * (1 - clamp01(d / GLOW_RADIUS));
}

/**
 * Signal beam emission, `10 / (d⁴ + 1)`.
 *
 * A scripted driver in the Blender file, with `d` a LOC_DIFF between Cursor and
 * Cylinder in WORLD space — the one distance here that is not disc-local.
 */
export function signalFalloff(d: number): number {
  return 10 / (d ** 4 + 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/about/array/array-math.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/about/array/array-math.ts src/about/array/array-math.test.ts
git commit -m "feat(array): curves for the comms array, lifted from the Blender rig"
```

---

### Task 2: Idle / engagement state machine

**Files:**
- Create: `src/about/array/array-idle.ts`
- Test: `src/about/array/array-idle.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `IDLE_SILENCE_MS`, `AMBIENT_EASE_MS`, `MOTIONLESS_MS`, type `IdleState = 'engaged' | 'silent' | 'breathing'`, interface `IdleModel { state: IdleState; ambient: number; cursor: number; sinceDisengage: number }`, `createIdleModel(): IdleModel`, `updateIdle(m: IdleModel, dtMs: number, disengaged: boolean): void`.

`updateIdle` mutates in place and returns void — it runs every frame and must not allocate.

- [ ] **Step 1: Write the failing test**

```ts
// src/about/array/array-idle.test.ts
import { describe, it, expect } from 'vitest';
import {
  IDLE_SILENCE_MS, AMBIENT_EASE_MS,
  createIdleModel, updateIdle,
} from './array-idle';

/** Drive the model in small steps, the way a frame loop would. */
function run(m: ReturnType<typeof createIdleModel>, ms: number, disengaged: boolean): void {
  const step = 16;
  for (let t = 0; t < ms; t += step) updateIdle(m, step, disengaged);
}

describe('engaged', () => {
  it('brings both ambient and cursor up', () => {
    const m = createIdleModel();
    run(m, AMBIENT_EASE_MS * 1.5, false);
    expect(m.state).toBe('engaged');
    expect(m.ambient).toBeCloseTo(1, 2);
    expect(m.cursor).toBeCloseTo(1, 2);
  });
});

describe('the silence after disengaging', () => {
  it('drops BOTH to zero — the array goes still', () => {
    const m = createIdleModel();
    run(m, AMBIENT_EASE_MS * 1.5, false);
    run(m, AMBIENT_EASE_MS * 1.5, true);
    expect(m.state).toBe('silent');
    expect(m.ambient).toBeCloseTo(0, 2);
    expect(m.cursor).toBeCloseTo(0, 2);
  });

  it('is still silent just before the threshold', () => {
    const m = createIdleModel();
    run(m, AMBIENT_EASE_MS * 1.5, false);
    run(m, IDLE_SILENCE_MS - 100, true);
    expect(m.state).toBe('silent');
  });
});

describe('the keep-alive breath', () => {
  it('flips to breathing once the silence elapses', () => {
    const m = createIdleModel();
    run(m, AMBIENT_EASE_MS * 1.5, false);
    run(m, IDLE_SILENCE_MS + 100, true);
    expect(m.state).toBe('breathing');
  });

  it('brings ambient back WITHOUT bringing the cursor back', () => {
    const m = createIdleModel();
    run(m, AMBIENT_EASE_MS * 1.5, false);
    run(m, IDLE_SILENCE_MS + AMBIENT_EASE_MS * 1.5, true);
    expect(m.ambient).toBeCloseTo(1, 2);
    expect(m.cursor).toBeCloseTo(0, 2);
  });
});

describe('re-engaging', () => {
  it('resets the timer so the next departure gets a full silence', () => {
    const m = createIdleModel();
    run(m, IDLE_SILENCE_MS + 100, true);
    expect(m.state).toBe('breathing');
    updateIdle(m, 16, false);
    expect(m.state).toBe('engaged');
    expect(m.sinceDisengage).toBe(0);
  });

  it('brings the cursor back up', () => {
    const m = createIdleModel();
    run(m, IDLE_SILENCE_MS + 500, true);
    run(m, AMBIENT_EASE_MS * 1.5, false);
    expect(m.cursor).toBeCloseTo(1, 2);
  });
});

describe('allocation discipline', () => {
  it('mutates in place and returns nothing', () => {
    const m = createIdleModel();
    expect(updateIdle(m, 16, false)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/array/array-idle.test.ts`
Expected: FAIL — `Failed to resolve import "./array-idle"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/about/array/array-idle.ts
/**
 * The array's engagement state machine.
 *
 * Ambient displacement runs ALONGSIDE the cursor-driven one while you are
 * engaged. When you leave, both stop — and the array holds still for a beat
 * before it starts breathing on its own again.
 *
 * That pause is the point. Without it the idle motion reads as a loop that was
 * always running; with it, the array reads as something that noticed you left.
 */

/** How long the array holds still after you disengage, before the keep-alive. */
export const IDLE_SILENCE_MS = 2000;
/** Ease time for both amplitudes, in either direction. */
export const AMBIENT_EASE_MS = 800;
/**
 * How long a motionless pointer counts as engaged before it is treated as gone.
 *
 * "Disengaged" is far OR motionless: a pointer parked on the dish and a pointer
 * that has left the page get the same silence-then-breathe treatment. The caller
 * decides which of the two it is; this constant is exported so it decides
 * consistently.
 */
export const MOTIONLESS_MS = 2000;

export type IdleState = 'engaged' | 'silent' | 'breathing';

export interface IdleModel {
  state: IdleState;
  /** 0..1 amplitude of the always-on-when-alive noise displacement. */
  ambient: number;
  /** 0..1 amplitude of the cursor-driven explode. */
  cursor: number;
  /** ms since the pointer disengaged; 0 whenever engaged. */
  sinceDisengage: number;
}

export function createIdleModel(): IdleModel {
  return { state: 'engaged', ambient: 0, cursor: 0, sinceDisengage: 0 };
}

/** Move `v` toward `target` at a rate that spans 0..1 in AMBIENT_EASE_MS. */
function ease(v: number, target: number, dtMs: number): number {
  const step = dtMs / AMBIENT_EASE_MS;
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}

export function updateIdle(m: IdleModel, dtMs: number, disengaged: boolean): void {
  if (disengaged) {
    m.sinceDisengage += dtMs;
    m.state = m.sinceDisengage >= IDLE_SILENCE_MS ? 'breathing' : 'silent';
  } else {
    m.sinceDisengage = 0;
    m.state = 'engaged';
  }

  // Ambient is alive when engaged OR breathing — it is dark only during the
  // silence. The cursor term is alive only when actually engaged.
  const ambientTarget = m.state === 'silent' ? 0 : 1;
  const cursorTarget = m.state === 'engaged' ? 1 : 0;

  m.ambient = ease(m.ambient, ambientTarget, dtMs);
  m.cursor = ease(m.cursor, cursorTarget, dtMs);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/about/array/array-idle.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/about/array/array-idle.ts src/about/array/array-idle.test.ts
git commit -m "feat(array): engagement state machine with the silence before the breath"
```

---

### Task 3: Island centroid clustering

**Files:**
- Create: `src/about/array/array-geometry.ts`
- Test: `src/about/array/array-geometry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ISLAND_EPSILON`, interface `IslandData { centres: Float32Array; count: number }`, `clusterIslandCentres(raw: Float32Array, epsilon?: number): IslandData`.

- [ ] **Step 1: Write the failing test**

```ts
// src/about/array/array-geometry.test.ts
import { describe, it, expect } from 'vitest';
import { clusterIslandCentres } from './array-geometry';

describe('clusterIslandCentres', () => {
  it('collapses Draco jitter so one island has ONE exact centre', () => {
    // Two islands, three verts each, each vert jittered a little.
    const raw = new Float32Array([
      1.0000, 2.0000, 3.0000,
      1.0002, 1.9998, 3.0001,
      0.9999, 2.0001, 2.9998,
      -4.0000, 0.5000, 0.0000,
      -3.9998, 0.5002, 0.0001,
      -4.0001, 0.4999, -0.0002,
    ]);
    const { centres, count } = clusterIslandCentres(raw);

    expect(count).toBe(2);
    for (let i = 0; i < 3; i++) {
      expect(centres[i * 3 + 0]).toBe(centres[0]);
      expect(centres[i * 3 + 1]).toBe(centres[1]);
      expect(centres[i * 3 + 2]).toBe(centres[2]);
    }
    for (let i = 3; i < 6; i++) {
      expect(centres[i * 3 + 0]).toBe(centres[9]);
      expect(centres[i * 3 + 1]).toBe(centres[10]);
      expect(centres[i * 3 + 2]).toBe(centres[11]);
    }
  });

  it('puts each cluster at the mean of its members', () => {
    const raw = new Float32Array([
      0, 0, 0,
      0.002, 0, 0,
    ]);
    const { centres, count } = clusterIslandCentres(raw, 0.01);
    expect(count).toBe(1);
    expect(centres[0]).toBeCloseTo(0.001, 5);
  });

  it('keeps genuinely distinct islands apart', () => {
    const raw = new Float32Array([
      0, 0, 0,
      0.5, 0, 0,
      1.0, 0, 0,
    ]);
    expect(clusterIslandCentres(raw).count).toBe(3);
  });

  it('returns a new array and does not touch the input', () => {
    const raw = new Float32Array([1, 1, 1, 1.0001, 1, 1]);
    const copy = Float32Array.from(raw);
    const { centres } = clusterIslandCentres(raw);
    expect(raw).toEqual(copy);
    expect(centres).not.toBe(raw);
  });

  it('handles an empty input', () => {
    const { centres, count } = clusterIslandCentres(new Float32Array(0));
    expect(count).toBe(0);
    expect(centres.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/array/array-geometry.test.ts`
Expected: FAIL — `Failed to resolve import "./array-geometry"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/about/array/array-geometry.ts
/**
 * Recover exact per-island centroids from the baked `_ISLAND_C` attribute.
 *
 * WHY THIS EXISTS: `_ISLAND_C` rides inside Draco, which quantises generic
 * attributes to roughly 0.0005 local units. Two vertices of the SAME panel can
 * therefore arrive with slightly different centroids — and since each vertex
 * computes its own scale from its own centroid, the panel would deform slightly
 * instead of scaling rigidly. Snapping every vertex back to its cluster's mean
 * removes that entirely.
 *
 * The attribute is baked in Blender rather than derived here because neither
 * route to deriving it survives contact with the export (measured 2026-08-26):
 * index connectivity fragments once `Smooth by Angle` splits vertices at sharp
 * edges, and position welding merges neighbouring panels because adjacent
 * islands genuinely touch — 505 shared positions on the scaffold disc at an
 * epsilon of 1e-6.
 */

/**
 * Cluster radius. Comfortably above Draco's ~0.0005 quantisation step and far
 * below the gap between neighbouring panel centroids.
 */
export const ISLAND_EPSILON = 1e-3;

export interface IslandData {
  /** Per-vertex island centroid, xyz interleaved — same length as the input. */
  centres: Float32Array;
  /** How many distinct islands were found. Sanity-check against 224 / 256. */
  count: number;
}

export function clusterIslandCentres(
  raw: Float32Array,
  epsilon: number = ISLAND_EPSILON,
): IslandData {
  const n = raw.length / 3;
  const centres = new Float32Array(raw.length);
  if (n === 0) return { centres, count: 0 };

  const inv = 1 / epsilon;
  const bucketOf = new Map<string, number>();
  const owner = new Int32Array(n);
  const sums: number[] = [];
  const counts: number[] = [];

  for (let i = 0; i < n; i++) {
    const x = raw[i * 3], y = raw[i * 3 + 1], z = raw[i * 3 + 2];
    const key = `${Math.round(x * inv)},${Math.round(y * inv)},${Math.round(z * inv)}`;
    let b = bucketOf.get(key);
    if (b === undefined) {
      b = counts.length;
      bucketOf.set(key, b);
      sums.push(0, 0, 0);
      counts.push(0);
    }
    owner[i] = b;
    sums[b * 3] += x;
    sums[b * 3 + 1] += y;
    sums[b * 3 + 2] += z;
    counts[b] += 1;
  }

  for (let i = 0; i < n; i++) {
    const b = owner[i];
    const c = counts[b];
    centres[i * 3] = sums[b * 3] / c;
    centres[i * 3 + 1] = sums[b * 3 + 1] / c;
    centres[i * 3 + 2] = sums[b * 3 + 2] / c;
  }

  return { centres, count: counts.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/about/array/array-geometry.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/about/array/array-geometry.ts src/about/array/array-geometry.test.ts
git commit -m "feat(array): cluster _ISLAND_C to undo Draco quantisation jitter"
```

---

### Task 4: Assets and the Draco-enabled loader

**Files:**
- Create: `public/lander/` (copied GLBs), `public/draco/` (copied decoder)
- Create: `src/about/array/array-load.ts`
- Test: `src/about/array/array-load.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ARRAY_ASSETS` (readonly string[]), `DISC_NODES` (readonly string[]), `splitByName(root: THREE.Object3D): Map<string, THREE.Mesh>`, `loadArray(baseUrl?: string): Promise<Map<string, THREE.Mesh>>`.

`splitByName` is the testable half — it walks a loaded scene and returns every `Mesh` keyed by node name, so later tasks can pull `Circle` and `Circle.012` out by name rather than by file.

- [ ] **Step 1: Copy the assets in**

```bash
mkdir -p public/lander public/draco
cp "/c/Users/Adam/Dropbox/PERSONAL BUSINESS/Adam Portfolio/02_Assets/00_3DModels_ForSite/array-disc.glb" public/lander/
cp "/c/Users/Adam/Dropbox/PERSONAL BUSINESS/Adam Portfolio/02_Assets/00_3DModels_ForSite/array-disc_supporting_wireframe.glb" public/lander/
cp "/c/Users/Adam/Dropbox/PERSONAL BUSINESS/Adam Portfolio/02_Assets/00_3DModels_ForSite/array-core.glb" public/lander/
cp "/c/Users/Adam/Dropbox/PERSONAL BUSINESS/Adam Portfolio/02_Assets/00_3DModels_ForSite/array-frame.glb" public/lander/
cp "/c/Users/Adam/Dropbox/PERSONAL BUSINESS/Adam Portfolio/02_Assets/00_3DModels_ForSite/array-signal.glb" public/lander/
cp "/c/Users/Adam/Dropbox/PERSONAL BUSINESS/Adam Portfolio/02_Assets/00_3DModels_ForSite/array-ground.glb" public/lander/
cp node_modules/three/examples/jsm/libs/draco/draco_decoder.js public/draco/
cp node_modules/three/examples/jsm/libs/draco/draco_decoder.wasm public/draco/
cp node_modules/three/examples/jsm/libs/draco/draco_wasm_wrapper.js public/draco/
ls -la public/lander public/draco
```

Expected: six GLBs (~4.2 MB total, `array-ground.glb` the bulk) and three decoder files.

- [ ] **Step 2: Write the failing test**

```ts
// src/about/array/array-load.test.ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ARRAY_ASSETS, DISC_NODES, getIslandAttribute, splitByName } from './array-load';

function meshNamed(name: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  m.name = name;
  return m;
}

describe('ARRAY_ASSETS', () => {
  it('lists every exported file exactly once', () => {
    expect(ARRAY_ASSETS).toHaveLength(6);
    expect(new Set(ARRAY_ASSETS).size).toBe(6);
    expect(ARRAY_ASSETS).toContain('array-disc.glb');
    expect(ARRAY_ASSETS).toContain('array-disc_supporting_wireframe.glb');
  });
});

describe('DISC_NODES', () => {
  it('names the two meshes that carry _ISLAND_C', () => {
    expect(DISC_NODES).toEqual(['Circle', 'Circle.012']);
  });
});

describe('getIslandAttribute', () => {
  it('finds the attribute under the name GLTFLoader actually gives it', () => {
    // GLTFLoader renames unknown attributes with `name.toLowerCase()`, so the
    // `_ISLAND_C` written in Blender arrives as `_island_c`. Looking for the
    // original spelling finds nothing at all.
    const g = new THREE.BufferGeometry();
    g.setAttribute('_island_c', new THREE.BufferAttribute(new Float32Array([1, 2, 3]), 3));
    expect(getIslandAttribute(g, 'Circle').count).toBe(1);
  });

  it('still accepts the original spelling', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('_ISLAND_C', new THREE.BufferAttribute(new Float32Array([1, 2, 3]), 3));
    expect(getIslandAttribute(g, 'Circle').count).toBe(1);
  });

  it('names the attributes it DID find, so the failure is diagnosable', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    expect(() => getIslandAttribute(g, 'Circle')).toThrow(/Present: position/);
  });
});

describe('splitByName', () => {
  it('keys every mesh in the tree by its node name', () => {
    const root = new THREE.Group();
    const a = meshNamed('Circle');
    const b = meshNamed('Cylinder');
    a.add(b); // nested, not a sibling
    root.add(a);

    const found = splitByName(root);
    expect(found.get('Circle')).toBe(a);
    expect(found.get('Cylinder')).toBe(b);
    expect(found.size).toBe(2);
  });

  it('ignores non-mesh nodes', () => {
    const root = new THREE.Group();
    const empty = new THREE.Object3D();
    empty.name = 'Empty.001';
    root.add(empty, meshNamed('Circle'));

    const found = splitByName(root);
    expect(found.has('Empty.001')).toBe(false);
    expect(found.size).toBe(1);
  });

  it('keeps the first mesh when names collide, rather than silently overwriting', () => {
    const root = new THREE.Group();
    const first = meshNamed('Circle');
    const second = meshNamed('Circle');
    root.add(first, second);
    expect(splitByName(root).get('Circle')).toBe(first);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/about/array/array-load.test.ts`
Expected: FAIL — `Failed to resolve import "./array-load"`.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/about/array/array-load.ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * The array ships as several GLBs purely because that is how they were
 * exported; the runtime does not care which file a node came from and pulls
 * everything out by node name. Nothing here carries materials — every array
 * surface is authored in GLSL, which is what keeps these files at 283 KB for
 * 34,734 triangles.
 */
export const ARRAY_ASSETS: readonly string[] = [
  'array-disc.glb',
  'array-disc_supporting_wireframe.glb',
  'array-core.glb',
  'array-frame.glb',
  'array-signal.glb',
  'array-ground.glb',
];

/**
 * The two meshes that carry the baked `_ISLAND_C` attribute and take the panel
 * material. `Circle` is the dish (224 islands); `Circle.012` is the wireframe
 * scaffold beneath it (256 islands) and gets the SAME treatment — same
 * material, same explode, same emission.
 */
export const DISC_NODES: readonly string[] = ['Circle', 'Circle.012'];

/**
 * Every `Mesh` in the tree, keyed by node name.
 *
 * First-wins on a name collision. Silently overwriting would make a duplicated
 * node look like a missing one at the point of use, which is a much worse place
 * to discover it.
 */
export function splitByName(root: THREE.Object3D): Map<string, THREE.Mesh> {
  const out = new Map<string, THREE.Mesh>();
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !out.has(o.name)) out.set(o.name, o as THREE.Mesh);
  });
  return out;
}

/**
 * Candidate spellings of the baked island attribute, in likelihood order.
 *
 * GLTFLoader renames anything it does not recognise:
 *   `ATTRIBUTES[name] || name.toLowerCase()`
 * so the `_ISLAND_C` written in Blender arrives as `_island_c`. Looking for the
 * original spelling finds nothing — and because the attribute is only read at
 * load, that surfaces as an undefined-attribute crash rather than as anything
 * pointing at the exporter.
 */
const ISLAND_ATTR_NAMES = ['_island_c', '_ISLAND_C', 'island_c', 'ISLAND_C'] as const;

/**
 * The island-centroid attribute, whatever the loader decided to call it.
 * Throws with the geometry's actual attribute list, which is the one thing that
 * makes a missing-attribute failure diagnosable.
 */
export function getIslandAttribute(
  geometry: THREE.BufferGeometry,
  label: string,
): THREE.BufferAttribute {
  for (const n of ISLAND_ATTR_NAMES) {
    const a = geometry.getAttribute(n);
    if (a) return a as THREE.BufferAttribute;
  }
  const present = Object.keys(geometry.attributes).join(', ') || '(none)';
  throw new Error(
    `${label}: no island attribute found (looked for ${ISLAND_ATTR_NAMES.join(', ')}). ` +
    `Present: ${present}. Re-export from Blender with Data > Mesh > Attributes enabled.`,
  );
}

export async function loadArray(baseUrl: string = import.meta.env.BASE_URL): Promise<Map<string, THREE.Mesh>> {
  const draco = new DRACOLoader();
  draco.setDecoderPath(`${baseUrl}draco/`);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  const scenes = await Promise.all(
    ARRAY_ASSETS.map((f) => loader.loadAsync(`${baseUrl}lander/${f}`)),
  );

  const all = new Map<string, THREE.Mesh>();
  for (const gltf of scenes) {
    for (const [name, mesh] of splitByName(gltf.scene)) {
      if (!all.has(name)) all.set(name, mesh);
    }
  }
  draco.dispose();
  return all;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/about/array/array-load.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add public/lander public/draco src/about/array/array-load.ts src/about/array/array-load.test.ts
git commit -m "feat(array): assets and the Draco-enabled loader"
```

---

### Task 5: The panel material

**Files:**
- Create: `src/about/array/array-material.ts`
- Test: `src/about/array/array-material.test.ts`

**Interfaces:**
- Consumes: `array-math.ts` constants.
- Produces: interface `PanelMaterialHandle { material: THREE.ShaderMaterial; setCursor(localX: number, localY: number, localZ: number): void; setCursorRadius(r: number): void; setAmbient(v: number): void; setCursorAmount(v: number): void; setTime(t: number): void; dispose(): void }`, `makePanelMaterial(): PanelMaterialHandle`, `EMISSION_COLOR: THREE.Color`.

The shader reads the `_ISLAND_C` attribute as `aIslandC`.

- [ ] **Step 1: Write the failing test**

```ts
// src/about/array/array-material.test.ts
import { describe, it, expect } from 'vitest';
import { makePanelMaterial, EMISSION_COLOR } from './array-material';
import { CURSOR_RADIUS, EXPLODE_NEAR, EXPLODE_FAR, SCALE_MIN, GLOW_RADIUS, EMISSION_MAX, CENTRE_SCALE } from './array-math';

describe('makePanelMaterial', () => {
  it('exposes the uniforms the frame loop writes', () => {
    const h = makePanelMaterial();
    const u = h.material.uniforms;
    expect(u.uCursor).toBeDefined();
    expect(u.uCursorRadius.value).toBeCloseTo(CURSOR_RADIUS, 4);
    expect(u.uAmbient.value).toBe(0);
    expect(u.uCursorAmount.value).toBe(0);
    expect(u.uTime.value).toBe(0);
    h.dispose();
  });

  it('bakes the measured thresholds into the shader source, not magic numbers', () => {
    const h = makePanelMaterial();
    const src = h.material.vertexShader + h.material.fragmentShader;
    for (const v of [EXPLODE_NEAR, EXPLODE_FAR, SCALE_MIN, GLOW_RADIUS, EMISSION_MAX, CENTRE_SCALE]) {
      expect(src).toContain(String(v));
    }
    h.dispose();
  });

  it('declares the baked island attribute', () => {
    const h = makePanelMaterial();
    expect(h.material.vertexShader).toContain('attribute vec3 aIslandC;');
    h.dispose();
  });

  it('writes the cursor uniform through setCursor', () => {
    const h = makePanelMaterial();
    h.setCursor(1, 2, 3);
    expect(h.material.uniforms.uCursor.value.toArray()).toEqual([1, 2, 3]);
    h.dispose();
  });

  it('clamps the two amplitudes to 0..1', () => {
    const h = makePanelMaterial();
    h.setAmbient(5); h.setCursorAmount(-2);
    expect(h.material.uniforms.uAmbient.value).toBe(1);
    expect(h.material.uniforms.uCursorAmount.value).toBe(0);
    h.dispose();
  });

  it('uses the rig emission colour', () => {
    expect(EMISSION_COLOR.r).toBeCloseTo(0.164, 3);
    expect(EMISSION_COLOR.g).toBeCloseTo(1, 3);
    expect(EMISSION_COLOR.b).toBeCloseTo(0.248, 3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/array/array-material.test.ts`
Expected: FAIL — `Failed to resolve import "./array-material"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/about/array/array-material.ts
import * as THREE from 'three';
import {
  CENTRE_SCALE, CURSOR_RADIUS, EMISSION_MAX, EXPLODE_FAR, EXPLODE_NEAR,
  GLOW_RADIUS, SCALE_MAX, SCALE_MIN, clamp01,
} from './array-math';

/**
 * The rig's emission colour, LINEAR — a near-sibling of the F15 cursor green.
 * Written straight into a Color without conversion because the shader outputs
 * linear and the renderer handles the transfer.
 */
export const EMISSION_COLOR = new THREE.Color(0.164, 1.0, 0.248);

/**
 * Format a number as a GLSL float literal.
 *
 * Necessary, not decorative: `SCALE_MAX` is exactly 1, and interpolating it
 * raw emits `mix(0.57, 1, t)` — an int literal, which is a compile error in
 * GLSL ES. A hidden one, too: without rAF a shader never compiles in an
 * occluded tab, so it would look fine right up until it was looked at.
 */
const f = (n: number): string => n.toFixed(2);

const VERT = /* glsl */ `
attribute vec3 aIslandC;

uniform vec3  uCursor;
uniform float uCursorRadius;
uniform float uCursorAmount;
uniform float uAmbient;
uniform float uTime;

varying float vDist;
varying vec3  vNormalW;

// Cheap value noise — the ambient keep-alive only needs low-frequency drift.
float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

void main() {
  vec3 toC = aIslandC - uCursor;
  float len = length(toC);
  float d = len - uCursorRadius;
  vDist = d;

  // Scale Elements, FACE domain, Uniform: near the cursor panels SHRINK.
  float t = clamp((d - ${f(EXPLODE_NEAR)}) / (${f(EXPLODE_FAR)} - ${f(EXPLODE_NEAR)}), 0.0, 1.0);
  float s = mix(${f(SCALE_MIN)}, ${f(SCALE_MAX)}, t);
  s = mix(1.0, s, uCursorAmount);

  // The scale centre is the nearest point on the cursor sphere, pushed out by
  // 1.5. That offset is what makes the shrink read as displacement rather than
  // a uniform pucker.
  vec3 nearest = uCursor + (toC / max(len, 1e-6)) * uCursorRadius;
  vec3 centre = nearest * ${f(CENTRE_SCALE)};

  vec3 p = centre + (position - centre) * s;

  // Ambient drift, per island so panels move as units.
  vec3 drift = vec3(
    noise3(aIslandC * 3.1 + vec3(uTime * 0.13, 0.0, 0.0)),
    noise3(aIslandC * 3.1 + vec3(0.0, uTime * 0.11, 0.0)),
    noise3(aIslandC * 3.1 + vec3(0.0, 0.0, uTime * 0.17))
  ) - 0.5;
  p += drift * 0.012 * uAmbient;

  vNormalW = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3  uEmission;
uniform float uCursorAmount;

varying float vDist;
varying vec3  vNormalW;

void main() {
  // Emission Map Range: 4.6 at the cursor surface, 0 past the glow shell. Much
  // tighter than the explode band, deliberately.
  float g = 1.0 - clamp(vDist / ${f(GLOW_RADIUS)}, 0.0, 1.0);
  float e = ${f(EMISSION_MAX)} * g * uCursorAmount;

  // Metallic 1, base 0.133 grey, and no environment light in this scene — so
  // the panels are near-black except where the emission catches them.
  float facing = clamp(dot(normalize(vNormalW), vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
  vec3 base = vec3(0.133) * (0.25 + 0.75 * facing);

  gl_FragColor = vec4(base + uEmission * e, 1.0);
}
`;

export interface PanelMaterialHandle {
  material: THREE.ShaderMaterial;
  /** Cursor centre, in the DISC'S LOCAL SPACE. */
  setCursor(localX: number, localY: number, localZ: number): void;
  setCursorRadius(r: number): void;
  setAmbient(v: number): void;
  setCursorAmount(v: number): void;
  setTime(t: number): void;
  dispose(): void;
}

export function makePanelMaterial(): PanelMaterialHandle {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uCursor: { value: new THREE.Vector3(0, 0, 0) },
      uCursorRadius: { value: CURSOR_RADIUS },
      uCursorAmount: { value: 0 },
      uAmbient: { value: 0 },
      uTime: { value: 0 },
      uEmission: { value: EMISSION_COLOR },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });

  return {
    material,
    setCursor(x, y, z) { (material.uniforms.uCursor.value as THREE.Vector3).set(x, y, z); },
    setCursorRadius(r) { material.uniforms.uCursorRadius.value = r; },
    setAmbient(v) { material.uniforms.uAmbient.value = clamp01(v); },
    setCursorAmount(v) { material.uniforms.uCursorAmount.value = clamp01(v); },
    setTime(t) { material.uniforms.uTime.value = t; },
    dispose() { material.dispose(); },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/about/array/array-material.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/about/array/array-material.ts src/about/array/array-material.test.ts
git commit -m "feat(array): panel material — closed-form explode and emission halo"
```

---

### Task 6: Pointer to disc-local cursor

**Files:**
- Create: `src/about/array/array-pointer.ts`
- Test: `src/about/array/array-pointer.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: interface `PointerSample { x: number; y: number; movedAt: number }`, `isDisengaged(sample: PointerSample | null, now: number, motionlessMs?: number): boolean`, `makeProxy(radius: number): THREE.Mesh`, interface `ArrayPointer { update(camera: THREE.Camera, disc: THREE.Object3D, out: THREE.Vector3): boolean; onPointerMove(e: PointerEvent): void; lastMovedAt(): number; destroy(): void }`, `initArrayPointer(el: HTMLElement, proxy: THREE.Mesh): ArrayPointer`.

- [ ] **Step 1: Write the failing test**

```ts
// src/about/array/array-pointer.test.ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { isDisengaged, makeProxy } from './array-pointer';

describe('isDisengaged', () => {
  it('is true when there has never been a pointer', () => {
    expect(isDisengaged(null, 1000)).toBe(true);
  });

  it('is false right after a move', () => {
    expect(isDisengaged({ x: 0, y: 0, movedAt: 900 }, 1000, 2000)).toBe(false);
  });

  it('is true once the pointer has been motionless past the threshold', () => {
    expect(isDisengaged({ x: 0, y: 0, movedAt: 0 }, 2500, 2000)).toBe(true);
  });

  it('treats exactly-at-threshold as disengaged', () => {
    expect(isDisengaged({ x: 0, y: 0, movedAt: 0 }, 2000, 2000)).toBe(true);
  });
});

describe('makeProxy', () => {
  it('is invisible and not raycast-blocking for anything else', () => {
    const p = makeProxy(1.6);
    expect(p.visible).toBe(false);
    expect(p.geometry).toBeInstanceOf(THREE.SphereGeometry);
  });

  it('stays raycastable despite being invisible', () => {
    // Three skips invisible objects in Raycaster.intersectObjects, so the proxy
    // must be raycast directly rather than relied on via scene traversal.
    const p = makeProxy(1.6);
    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
    const hits: THREE.Intersection[] = [];
    p.raycast(ray, hits);
    expect(hits.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/array/array-pointer.test.ts`
Expected: FAIL — `Failed to resolve import "./array-pointer"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/about/array/array-pointer.ts
import * as THREE from 'three';
import { MOTIONLESS_MS } from './array-idle';

export interface PointerSample {
  /** Normalised device coords, -1..1. */
  x: number;
  y: number;
  movedAt: number;
}

/**
 * Disengaged is far OR motionless — a pointer parked on the dish and one that
 * has left get the same silence-then-breathe treatment.
 */
export function isDisengaged(
  sample: PointerSample | null,
  now: number,
  motionlessMs: number = MOTIONLESS_MS,
): boolean {
  if (!sample) return true;
  return now - sample.movedAt >= motionlessMs;
}

/**
 * The raycast target.
 *
 * NOT the disc itself: the disc's orientation is driven by the cursor
 * (TRACK_TO at influence 0.159), so raycasting it would close a feedback loop.
 * A static proxy in the disc's local space lags by one frame, which at that
 * influence is imperceptible and unconditionally stable.
 */
export function makeProxy(radius: number): THREE.Mesh {
  const proxy = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 16),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  proxy.visible = false;
  return proxy;
}

export interface ArrayPointer {
  /**
   * Write the cursor position, in the disc's local space, into `out`.
   * Returns false when the pointer misses the proxy entirely.
   */
  update(camera: THREE.Camera, disc: THREE.Object3D, out: THREE.Vector3): boolean;
  onPointerMove(e: PointerEvent): void;
  lastMovedAt(): number;
  destroy(): void;
}

export function initArrayPointer(el: HTMLElement, proxy: THREE.Mesh): ArrayPointer {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let sample: PointerSample | null = null;
  const hits: THREE.Intersection[] = [];

  const onMove = (e: PointerEvent): void => {
    const r = el.getBoundingClientRect();
    sample = {
      x: ((e.clientX - r.left) / r.width) * 2 - 1,
      y: -(((e.clientY - r.top) / r.height) * 2 - 1),
      movedAt: performance.now(),
    };
  };
  el.addEventListener('pointermove', onMove, { passive: true });

  return {
    update(camera, disc, out) {
      if (!sample) return false;
      ndc.set(sample.x, sample.y);
      ray.setFromCamera(ndc, camera);
      hits.length = 0;
      // Raycast the proxy DIRECTLY — Three skips invisible objects during
      // scene traversal, so intersectObjects would never see it.
      proxy.raycast(ray, hits);
      if (hits.length === 0) return false;
      out.copy(hits[0].point);
      disc.worldToLocal(out);
      return true;
    },
    onPointerMove: onMove,
    lastMovedAt: () => sample?.movedAt ?? -Infinity,
    destroy() { el.removeEventListener('pointermove', onMove); },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/about/array/array-pointer.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/about/array/array-pointer.ts src/about/array/array-pointer.test.ts
git commit -m "feat(array): pointer to disc-local cursor via a static proxy"
```

---

### Task 7: Assembly and the lab route

**Files:**
- Create: `src/about/array/array.ts`
- Create: `src/lab/array.ts`
- Modify: `src/main.ts:99-103`

**Interfaces:**
- Consumes: everything above.
- Produces: interface `ArrayHandle extends StageLayer { group: THREE.Group; update(dt: number): void; dispose(): void }`, `initArray(opts: { el: HTMLElement; camera: THREE.PerspectiveCamera; reducedMotion: boolean }): Promise<ArrayHandle>`.

- [ ] **Step 1: Write the assembly**

```ts
// src/about/array/array.ts
import * as THREE from 'three';
import { clusterIslandCentres } from './array-geometry';
import { DISC_NODES, getIslandAttribute, loadArray } from './array-load';
import { createIdleModel, updateIdle } from './array-idle';
import { makePanelMaterial } from './array-material';
import { initArrayPointer, isDisengaged, makeProxy } from './array-pointer';
import { CURSOR_RADIUS } from './array-math';

/** Disc local radius, measured in Blender. Sizes the raycast proxy. */
const DISC_LOCAL_RADIUS = 1.611;

/** TRACK_TO influence on the dish, from the rig. */
const TRACK_INFLUENCE = 0.159;

export interface ArrayHandle {
  group: THREE.Group;
  update(dt: number): void;
  render?(renderer: THREE.WebGLRenderer): void;
  dispose(): void;
}

export async function initArray(opts: {
  el: HTMLElement;
  camera: THREE.PerspectiveCamera;
  reducedMotion: boolean;
}): Promise<ArrayHandle> {
  const meshes = await loadArray();
  const group = new THREE.Group();

  const panel = makePanelMaterial();

  for (const [name, mesh] of meshes) {
    if (DISC_NODES.includes(name)) {
      const attr = getIslandAttribute(mesh.geometry, name);
      const { centres, count } = clusterIslandCentres(attr.array as Float32Array);
      mesh.geometry.setAttribute('aIslandC', new THREE.BufferAttribute(centres, 3));
      // 224 for the dish, 256 for the scaffold. A wrong count here means the
      // clustering epsilon is off, and every panel downstream is wrong.
      console.info(`[array] ${name}: ${count} islands`);
      mesh.material = panel.material;
    } else {
      mesh.material = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 1, roughness: 0.5 });
    }
    group.add(mesh);
  }

  const disc = meshes.get('Circle');
  if (!disc) throw new Error('array: Circle node not found');

  const proxy = makeProxy(DISC_LOCAL_RADIUS);
  disc.add(proxy);

  const pointer = initArrayPointer(opts.el, proxy);
  const idle = createIdleModel();
  const cursorLocal = new THREE.Vector3();
  const cursorWorld = new THREE.Vector3();
  const lookTarget = new THREE.Quaternion();
  const restQuat = disc.quaternion.clone();
  let time = 0;

  return {
    group,
    update(dt: number): void {
      time += dt;
      const now = performance.now();

      const hit = pointer.update(opts.camera, disc, cursorLocal);
      const disengaged = opts.reducedMotion || !hit ||
        isDisengaged({ x: 0, y: 0, movedAt: pointer.lastMovedAt() }, now);

      updateIdle(idle, dt * 1000, disengaged);

      panel.setCursor(cursorLocal.x, cursorLocal.y, cursorLocal.z);
      panel.setCursorAmount(idle.cursor);
      panel.setAmbient(opts.reducedMotion ? 0 : idle.ambient);
      panel.setTime(time);

      // Soft TRACK_TO: the dish leans toward the cursor at 0.159, never fully.
      if (hit && !opts.reducedMotion) {
        cursorWorld.copy(cursorLocal);
        disc.localToWorld(cursorWorld);
        const parent = disc.parent ?? disc;
        const m = new THREE.Matrix4().lookAt(disc.getWorldPosition(new THREE.Vector3()), cursorWorld, parent.up);
        lookTarget.setFromRotationMatrix(m);
        disc.quaternion.copy(restQuat).slerp(lookTarget, TRACK_INFLUENCE);
      }
    },
    dispose(): void {
      pointer.destroy();
      panel.dispose();
      group.clear();
    },
  };
}
```

- [ ] **Step 2: Write the lab harness**

```ts
// src/lab/array.ts
import * as THREE from 'three';
import { initStage } from '../three/stage';
import { initArray } from '../about/array/array';

/**
 * `?lab=array` — the comms array on its own, with orbit-free fixed framing.
 *
 * Deliberately does NOT mount the corridor: the array is being built as a
 * standalone subsystem so it does not wait on the about-flow.ts split.
 */
export async function initArrayLab(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#bg-canvas');
  if (!canvas) throw new Error('#bg-canvas not found');

  document.querySelector<HTMLElement>('.tagline')?.style.setProperty('display', 'none');
  document.querySelector<HTMLElement>('.chrome')?.style.setProperty('opacity', '0');
  document.querySelector<HTMLElement>('.reticle-field')?.style.setProperty('display', 'none');

  const stage = initStage(canvas, { reducedMotion: false });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  // 50mm on a 36mm sensor at 16:9 -> about 22.9 degrees vertical.
  const camera = new THREE.PerspectiveCamera(22.9, window.innerWidth / window.innerHeight, 0.01, 100);
  camera.position.set(0, 0.6, -4.5);
  camera.lookAt(0, 0.6, 0);

  // The rig's three lights, at their measured powers. World strength is 0 in
  // Blender, so there is deliberately no ambient or environment term.
  const area = new THREE.DirectionalLight(0xffffff, 1.6);
  area.position.set(0.086, 2.52, 0.287);
  const fill = new THREE.PointLight(0xffffff, 2.5, 0, 2);
  fill.position.set(0.079, 0.668, 0.857);
  const key = new THREE.PointLight(new THREE.Color(0.288, 1, 0.361), 0.4, 0, 2);
  key.position.set(0.47, 0.865, -0.264);
  scene.add(area, fill, key);

  const array = await initArray({ el: canvas, camera, reducedMotion: false });
  scene.add(array.group);

  stage.addLayer({
    update: (dt) => array.update(dt),
    render: (renderer) => renderer.render(scene, camera),
    resize: (w, h) => { camera.aspect = w / h; camera.updateProjectionMatrix(); },
  });
  stage.start();

  console.info('[array lab] ready');
}
```

- [ ] **Step 3: Wire the lab route**

In `src/main.ts`, extend the existing lab block (currently lines 99–103):

```ts
const lab = new URLSearchParams(location.search).get('lab');
if (lab === 'ferro') {
  void import('./lab/ferro').then((m) => m.initFerroLab());
} else if (lab === 'fly') {
  void import('./lab/fly').then((m) => m.initFlyLab());
} else if (lab === 'array') {
  void import('./lab/array').then((m) => m.initArrayLab());
}
```

- [ ] **Step 4: Verify the suite and the types**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 5: Verify in a real browser**

Run: `npm run dev -- --host`, open `http://localhost:5173/?lab=array` **in a foreground window**.

Expected in the console: `[array] Circle: 224 islands` and `[array] Circle.012: 256 islands`. Those two numbers are the load-bearing check — a wrong count means the clustering epsilon is off.

Expected on screen: the dish, dark, with panels opening and a green halo tracking the pointer; the dish leaning slightly toward it; motion settling after two seconds of stillness and then resuming a slow drift.

**Automation cannot verify any of this** — tabs here run occluded, `rAF` is flat zero. Structure and uniform values are checkable programmatically; motion feel is Adam's, in a foreground browser.

- [ ] **Step 6: Commit**

```bash
git add src/about/array/array.ts src/lab/array.ts src/main.ts
git commit -m "feat(array): assemble the comms array behind ?lab=array"
```

---

## Deferred to later plans

**Phase 2:** the blob-tracking network (`array-network.ts`) and the signal beam (`array-signal.ts`). Both are specced in §4 (S4, S6) and neither blocks the others.

**Phase 3:** split `about-flow.ts` — 1017 lines, per §B of `plans/2026-08-24-about-spine-followups.md` — then mount the array into the `lander` beat.

**Open, from §9 of the spec:** touch fallback (9.2), whether the beat stays live during scrub (9.3), whether the F15 2D cursor hides (9.4). Also unresolved: KTX2 encoding is not working on this machine, so ground textures ship as embedded JPEG at ~3.7 MB.

**Look matching:** the scene renders under Filmic / Medium High Contrast in Blender. Three.js has no direct equivalent; expect a tuning pass by eye against a reference frame.
