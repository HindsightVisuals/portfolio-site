# commms — About QA Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the three design items from Adam's first browser QA — the ferro arriving on a world-space path, the footer beat pushing the chrome up, and the real scroll-gate indicator.

**Architecture:** Every new piece is a pure function that `about-flow.ts`'s `apply(t)` calls. The ferro keeps its own canvas and its own camera; it travels because the CSS rect it is placed into is a projection of a world point through the corridor camera. The footer beat and the gate indicator are both driven by a custom property the corridor writes, exactly as `--ground`, `--ink` and `--gate` already are.

**Tech Stack:** TypeScript (strict), Three.js, GSAP, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-08-25-about-qa-pass-design.md`
**Context:** `2026-08-24-continuous-flow-design.md` (the model), `2026-08-24-about-spine-followups.md` (what is deferred and why)

## Global Constraints

- **The suite must stay green: currently 663 passed / 2 skipped across 53 files.** Run `npx vitest run` **from the worktree root** (`C:\Users\Adam\Code\portfolio-site\.claude\worktrees\about-page`), never the repo root — the root glob walks into sibling worktrees and reports ~1269 tests.
- Other commands: `npx tsc --noEmit`, `npm run build`.
- **`verbatimModuleSyntax`** (type-only imports must be `import type`), `noUnusedLocals`, `noUnusedParameters`.
- **Existing constants are authoritative — import, never re-declare.** Four test files on this branch have already been pulled up for hardcoding values. `CAMERA_FOV`, `DESTINATIONS`, `HOME_REST_Z` live in `three/world.ts`; `BLENDER_TO_WORLD` in `about/about-coords.ts`; `worldPerPx` in `three/framing.ts`.
- vitest runs the **node** environment; `jsdom` is scoped per-file with `// @vitest-environment jsdom`. **Never create a vitest config.**
- **The font is `var(--font-mono)` (Space Mono), not the mock's Galix Mono.** The site does not ship Galix.
- **Feel is verified by Adam in a foreground browser**, never by automation (occluded tabs get no rAF).
- Commit after every task with the repo's trailer block.

---

## Decisions taken while planning

**D1 — the ferro's opacity rides `ferroEl.style.opacity`.** `FerroController` has no opacity method, and adding one would mean reaching into the stage's material. The return flight already fades the blob through that inline property and `releaseSharedState()` already clears it, so the arrival fade uses the same channel and inherits the same teardown. Ownership is unambiguous because they never run together: `apply()` owns it while scrolling, `applyReturn` owns it during the flight (when the scroll listeners are detached).

**D2 — the blob's world radius is 0.49.** `Ferro Fluid`'s Blender dimensions are 0.58 × 0.63 × 0.62, so its radius is ≈0.29 Blender units; ×`BLENDER_TO_WORLD` = 0.49 world units. Named as a constant, not inlined.

**D3 — nothing compresses for the footer beat.** The mockup's 276px world band is simply what remains uncovered when the footer occupies 804px. The canvas keeps rendering full-frame behind it. Only `.chrome` moves.

---

## File Structure

**New:**

| File | Responsibility |
|---|---|
| `src/about/about-project.ts` | Pure: a world point + radius → the CSS rect it projects to, through a given camera. |
| `src/about/about-ferro-path.ts` | Pure: the measured ferro keyframes, sampled by `t`, plus its arrival fade. |

**Modified:**

| File | Change |
|---|---|
| `src/about/about-scrub.ts` | `footerRiseAt(t, path)` — the 0→1 rise amount. |
| `src/about/about-flow.ts` | Drive the ferro from the path; write `--footer-rise`; clear it on release. |
| `src/styles/base.css` | `.chrome` interpolates against `--footer-rise`. |
| `src/styles/about.css` | The gate indicator, replacing the placeholder rule. |
| `src/about/about-document.ts` | Mount the indicator's markup. |

---

## Task 1: World point → screen rect

**Files:**
- Create: `src/about/about-project.ts`
- Test: `src/about/about-project.test.ts`

**Interfaces:**
- Consumes: `worldPerPx` from `../three/framing`.
- Produces: `projectToRect(world: THREE.Vector3, radius: number, camera: THREE.PerspectiveCamera, viewport: { w: number; h: number }): { x: number; y: number; w: number; h: number } | null`.

Returns `null` when the point is behind the camera — the caller then draws nothing rather than a mirrored ghost.

- [ ] **Step 1: Write the failing test**

```ts
// src/about/about-project.test.ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAMERA_FOV } from '../three/world';
import { projectToRect } from './about-project';

const VP = { w: 1000, h: 800 };

const cam = (): THREE.PerspectiveCamera => {
  const c = new THREE.PerspectiveCamera(CAMERA_FOV, VP.w / VP.h, 0.1, 500);
  c.position.set(0, 0, 0);
  c.updateMatrixWorld(true);
  return c;
};

describe('projectToRect', () => {
  it('puts a point straight ahead at the centre of the viewport', () => {
    const r = projectToRect(new THREE.Vector3(0, 0, -10), 0.49, cam(), VP)!;
    expect(r.x + r.w / 2).toBeCloseTo(VP.w / 2, 4);
    expect(r.y + r.h / 2).toBeCloseTo(VP.h / 2, 4);
  });

  it('grows as the point approaches', () => {
    const far = projectToRect(new THREE.Vector3(0, 0, -20), 0.49, cam(), VP)!;
    const near = projectToRect(new THREE.Vector3(0, 0, -5), 0.49, cam(), VP)!;
    expect(near.w).toBeGreaterThan(far.w);
    // Apparent size is inverse in distance: 4x closer is 4x bigger.
    expect(near.w / far.w).toBeCloseTo(4, 1);
  });

  it('is square — the blob is round, so one dimension governs', () => {
    const r = projectToRect(new THREE.Vector3(0, 0, -10), 0.49, cam(), VP)!;
    expect(r.w).toBeCloseTo(r.h, 10);
  });

  it('moves right when the point moves right, and DOWN when the point moves up', () => {
    // Screen y grows downward; world y grows up. Getting this backwards is the
    // classic projection bug and it looks plausible until you scroll.
    const c = cam();
    const base = projectToRect(new THREE.Vector3(0, 0, -10), 0.49, c, VP)!;
    const right = projectToRect(new THREE.Vector3(2, 0, -10), 0.49, c, VP)!;
    const up = projectToRect(new THREE.Vector3(0, 2, -10), 0.49, c, VP)!;
    expect(right.x).toBeGreaterThan(base.x);
    expect(up.y).toBeLessThan(base.y);
  });

  it('returns null for a point behind the camera', () => {
    expect(projectToRect(new THREE.Vector3(0, 0, 10), 0.49, cam(), VP)).toBeNull();
  });

  it('returns null for a degenerate viewport rather than Infinity', () => {
    expect(projectToRect(new THREE.Vector3(0, 0, -10), 0.49, cam(), { w: 0, h: 0 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-project.test.ts`
Expected: FAIL — cannot resolve `./about-project`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/about/about-project.ts
import * as THREE from 'three';
import { worldPerPx } from '../three/framing';

/**
 * Where a world-space sphere lands on screen, as a CSS rect.
 *
 * This is what lets the ferro travel through the world without being in it.
 * The blob renders on its own canvas with its own fixed camera, and `placeAt`
 * positions it by CSS rect — so a rect is all the corridor has to produce. Feed
 * it the projection of a world point and the blob appears to occupy that point:
 * it moves as the camera moves, and it grows as the camera closes, because the
 * projection does both.
 *
 * Returns null rather than a rect when there is nothing sensible to draw — the
 * point is behind the camera, or the viewport has no size yet. A mirrored ghost
 * behind the viewer is the failure mode this exists to prevent.
 */
export function projectToRect(
  world: THREE.Vector3,
  radius: number,
  camera: THREE.PerspectiveCamera,
  viewport: { w: number; h: number },
): { x: number; y: number; w: number; h: number } | null {
  if (!(viewport.w > 0) || !(viewport.h > 0)) return null;

  // Distance along the camera's own forward axis, not straight-line distance:
  // apparent size depends on depth in view space, and a point far off to the
  // side is further away without being any deeper.
  const toPoint = world.clone().sub(camera.position);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const depth = toPoint.dot(forward);
  if (depth <= 0) return null; // behind the camera

  const ndc = world.clone().project(camera);
  const cx = (ndc.x * 0.5 + 0.5) * viewport.w;
  // Screen y grows downward, NDC y grows up.
  const cy = (-ndc.y * 0.5 + 0.5) * viewport.h;

  const wpp = worldPerPx(depth, camera.fov, viewport.h);
  if (!(wpp > 0)) return null;
  const side = (2 * radius) / wpp;

  return { x: cx - side / 2, y: cy - side / 2, w: side, h: side };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/about/about-project.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/about/about-project.ts src/about/about-project.test.ts
git commit -m "$(cat <<'EOF'
feat(about): project a world point to the CSS rect the ferro is placed into

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 2: The ferro's measured path and its arrival

**Files:**
- Create: `src/about/about-ferro-path.ts`
- Test: `src/about/about-ferro-path.test.ts`

**Interfaces:**
- Consumes: `blenderToWorld`, `BLENDER_TO_WORLD` from `./about-coords`; `ABOUT_MARKERS` from `./about-markers`.
- Produces: `FERRO_RADIUS: number`, `FERRO_ARRIVE_T: number`, `ferroWorldAt(t: number, anchor: THREE.Vector3, into?: THREE.Vector3): THREE.Vector3`, `ferroFadeAt(t: number): number`.

**The frame→t mapping is the same one the camera path uses**: `t = (frame - 64) / 194`. Do not re-derive it from a different pair of markers.

- [ ] **Step 1: Write the failing test**

```ts
// src/about/about-ferro-path.test.ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DESTINATIONS } from '../three/world';
import { FERRO_ARRIVE_T, FERRO_RADIUS, ferroFadeAt, ferroWorldAt } from './about-ferro-path';

const ANCHOR = new THREE.Vector3(0, 0, DESTINATIONS.find((d) => d.id === 'work')!.cameraZ);

describe('ferroFadeAt', () => {
  it('is invisible before it arrives', () => {
    expect(ferroFadeAt(0)).toBe(0);
    expect(ferroFadeAt(0.4)).toBe(0);
    expect(ferroFadeAt(FERRO_ARRIVE_T - 0.001)).toBeCloseTo(0, 3);
  });

  it('fades up across the descent, not instantly', () => {
    // f157 -> f165 is t 0.479 -> 0.521. The fade shares that span with the
    // drop, so arriving and appearing are one move.
    const mid = ferroFadeAt((0.479 + 0.521) / 2);
    expect(mid).toBeGreaterThan(0.1);
    expect(mid).toBeLessThan(0.9);
  });

  it('is fully visible once it has settled, and stays so', () => {
    expect(ferroFadeAt(0.55)).toBeCloseTo(1, 6);
    expect(ferroFadeAt(1)).toBeCloseTo(1, 6);
  });

  it('never leaves 0..1', () => {
    for (let i = -5; i <= 105; i++) {
      const f = ferroFadeAt(i / 100);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});

describe('ferroWorldAt', () => {
  it('drops from above onto the mezzanine', () => {
    // Blender z 27.3 -> 18.2 becomes Three y, so it descends.
    const early = ferroWorldAt(0.479, ANCHOR);
    const settled = ferroWorldAt(0.582, ANCHOR);
    expect(early.y).toBeGreaterThan(settled.y);
  });

  it('holds still through the capabilities beat', () => {
    // f177 and f209 are the same measured point — the blob waits for you there.
    const a = ferroWorldAt(0.582, ANCHOR, new THREE.Vector3());
    const b = ferroWorldAt(0.747, ANCHOR, new THREE.Vector3());
    expect(a.distanceTo(b)).toBeCloseTo(0, 3);
  });

  it('travels forward on -Z across the mezzanine run', () => {
    const a = ferroWorldAt(0.75, ANCHOR, new THREE.Vector3());
    const b = ferroWorldAt(1, ANCHOR, new THREE.Vector3());
    expect(b.z).toBeLessThan(a.z);
  });

  it('is anchored like the camera path — relative to the Work rest, not absolute Blender', () => {
    // The first keyframe is Blender y 36.840 against the anchor marker's 29.74,
    // so it sits 7.1 Blender units forward of the rest: 7.1 * 1.7 = 12.07.
    const p = ferroWorldAt(0.479, ANCHOR, new THREE.Vector3());
    expect(p.z).toBeCloseTo(ANCHOR.z - 12.07, 1);
  });

  it('writes through `into` instead of allocating', () => {
    const into = new THREE.Vector3();
    expect(ferroWorldAt(0.6, ANCHOR, into)).toBe(into);
  });

  it('has a radius consistent with the measured blob', () => {
    // Blender dims 0.58 across, so radius 0.29, scaled by BLENDER_TO_WORLD.
    expect(FERRO_RADIUS).toBeCloseTo(0.29 * 1.7, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-ferro-path.test.ts`
Expected: FAIL — cannot resolve `./about-ferro-path`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/about/about-ferro-path.ts
import * as THREE from 'three';
import { blenderToWorld, BLENDER_TO_WORLD } from './about-coords';
import { ABOUT_MARKERS } from './about-markers';

/**
 * The ferro blob's own path through the corridor.
 *
 * Measured 2026-08-25 from `00_Blend\01_Comms\Threejs Flow1.blend`, object
 * `Ferro Fluid`. Adam: "I'd like the ferro to first appear in the scroll
 * transition from frame 160 and beyond… and begin to come into frame and follow
 * the movement path that it has animated."
 *
 * It drops in from above, settles to mezzanine height, then travels forward
 * with the camera holding roughly 3-4.5 units ahead of it. Two flat holds — the
 * capabilities and contact beats — are where it waits for you.
 *
 * The blob is not a world object: it renders on its own canvas and is placed by
 * CSS rect. These points are projected through the corridor camera to produce
 * that rect (see about-project.ts), which is what makes a flat shader appear to
 * occupy a place in the world.
 */

const FIRST = ABOUT_MARKERS[0];
const LAST = ABOUT_MARKERS[ABOUT_MARKERS.length - 1];
/** Frames to `t`, the same mapping the camera path uses. */
const frameToT = (f: number): number => (f - FIRST.frame) / (LAST.frame - FIRST.frame);

interface Key { t: number; x: number; y: number; z: number }

/** Blender-space keys, verbatim. x/y/z are Blender axes; the conversion is below. */
const KEYS: readonly Key[] = Object.freeze([
  { t: frameToT(157), x: -0.014, y: 36.840, z: 27.332 },
  { t: frameToT(165), x: -0.014, y: 37.176, z: 20.043 },
  { t: frameToT(172), x: -0.676, y: 41.457, z: 21.785 },
  { t: frameToT(177), x: -1.075, y: 43.792, z: 18.186 },
  { t: frameToT(209), x: -1.075, y: 43.792, z: 18.186 },
  { t: frameToT(228), x: -0.635, y: 50.484, z: 18.186 },
  { t: frameToT(236), x: -0.635, y: 50.484, z: 18.186 },
  { t: frameToT(257), x:  0.002, y: 58.131, z: 18.245 },
]);

/** Where it first exists, and where the fade begins. */
export const FERRO_ARRIVE_T = KEYS[0].t;
/** Where the fade completes — the same key the descent lands on. */
const FERRO_VISIBLE_T = KEYS[1].t;

/**
 * Object-space radius in world units. Blender dimensions are 0.58 across, so
 * 0.29 in radius, at the same scale everything else converts by.
 */
export const FERRO_RADIUS = 0.29 * BLENDER_TO_WORLD;

const scratch = new THREE.Vector3();

/**
 * Its world position at `t`, anchored the way the camera path is: offsets from
 * the anchor marker, so Blender's absolute placement is discarded.
 */
export function ferroWorldAt(t: number, anchor: THREE.Vector3, into?: THREE.Vector3): THREE.Vector3 {
  const out = into ?? scratch;
  const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;

  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  let local = 1;
  if (clamped <= KEYS[0].t) {
    a = b = KEYS[0];
    local = 0;
  } else {
    for (let i = 1; i < KEYS.length; i++) {
      if (clamped <= KEYS[i].t) {
        a = KEYS[i - 1];
        b = KEYS[i];
        const span = b.t - a.t;
        local = span > 0 ? (clamped - a.t) / span : 0;
        break;
      }
    }
  }

  const bx = a.x + (b.x - a.x) * local;
  const by = a.y + (b.y - a.y) * local;
  const bz = a.z + (b.z - a.z) * local;

  const world = blenderToWorld({
    x: bx - FIRST.blender.x,
    y: by - FIRST.blender.y,
    z: bz - FIRST.blender.z,
  });
  return out.copy(world).add(anchor);
}

const smoothstep = (v: number): number => {
  const c = Math.min(1, Math.max(0, v));
  return c * c * (3 - 2 * c);
};

/**
 * Opacity at `t`. Zero until it arrives, then up across the descent so the
 * fade and the drop are one move — Adam's call over a blur, which reads as a
 * lens effect rather than distance and costs a full-viewport filter per frame.
 */
export function ferroFadeAt(t: number): number {
  if (!Number.isFinite(t) || t < FERRO_ARRIVE_T) return 0;
  return smoothstep((t - FERRO_ARRIVE_T) / (FERRO_VISIBLE_T - FERRO_ARRIVE_T));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/about/about-ferro-path.test.ts && npx vitest run && npx tsc --noEmit`
Expected: 11 new tests pass; suite green.

- [ ] **Step 5: Commit**

```bash
git add src/about/about-ferro-path.ts src/about/about-ferro-path.test.ts
git commit -m "$(cat <<'EOF'
feat(about): the ferro's measured path and its arrival fade

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 3: Fly the ferro along it

**Files:**
- Modify: `src/about/about-flow.ts` (`apply`, and `FERRO_FRACTION`'s centred rect)
- Modify: `src/about/about-flow.test.ts`

**Interfaces:**
- Consumes: `projectToRect` (Task 1); `ferroWorldAt`, `ferroFadeAt`, `FERRO_RADIUS`, `FERRO_ARRIVE_T` (Task 2).

**What this replaces:** the centred rect at a fixed `FERRO_FRACTION` of the viewport, placed once per beat. The blob now moves every frame, so the once-per-beat gate goes with it — but keep the tween off: pass `{ instant: true }`, because a per-frame `placeAt` that tweens would restart its own tween every frame and never arrive.

- [ ] **Step 1: Write the failing test**

```ts
  it('keeps the blob out of the corridor until it arrives', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.3); // before FERRO_ARRIVE_T
    expect(deps.ferroEl!.style.opacity).toBe('0');
    flow.destroy();
  });

  it('fades it up and places it once it arrives', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    (deps.ferro!.placeAt as ReturnType<typeof vi.fn>).mockClear();
    flow.setScrollForTest(0.6);
    expect(Number(deps.ferroEl!.style.opacity)).toBeCloseTo(1, 3);
    expect(deps.ferro!.placeAt).toHaveBeenCalled();
    flow.destroy();
  });

  it('moves it every frame now, not once per beat', () => {
    // The blob travels a path; gating on beat changes would freeze it between
    // markers. The tween is off instead (instant), or each frame would restart
    // a tween that never lands.
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    (deps.ferro!.placeAt as ReturnType<typeof vi.fn>).mockClear();
    flow.setScrollForTest(0.60);
    flow.setScrollForTest(0.61);
    flow.setScrollForTest(0.62);
    const calls = (deps.ferro!.placeAt as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls[calls.length - 1][1]).toEqual({ instant: true });
    flow.destroy();
  });

  it('gives a different rect at different points on the path', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.60);
    const a = (deps.ferro!.placeAt as ReturnType<typeof vi.fn>).mock.lastCall![0];
    flow.setScrollForTest(0.95);
    const b = (deps.ferro!.placeAt as ReturnType<typeof vi.fn>).mock.lastCall![0];
    expect(a).not.toEqual(b);
    flow.destroy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-flow.test.ts`
Expected: FAIL — the blob is still centred and placed once per beat.

- [ ] **Step 3: Write minimal implementation**

In `apply()`, replace the beat-gated centred placement with a per-frame projection. Delete `FERRO_FRACTION` and `centredRect()` — they have no other caller.

```ts
    // The blob travels its own measured path now, projected through the
    // corridor camera into the rect placeAt wants. Every frame, not once per
    // beat: it is moving continuously, and `instant` because a tween re-issued
    // each frame would restart and never land.
    const fade = ferroFadeAt(t);
    if (deps.ferroEl) deps.ferroEl.style.opacity = String(fade);
    if (fade > 0) {
      const rect = projectToRect(
        ferroWorldAt(t, anchorPos, ferroScratch),
        FERRO_RADIUS,
        deps.camera,
        { w: window.innerWidth, h: window.innerHeight },
      );
      if (rect) void deps.ferro?.placeAt(rect, { instant: true });
    }
```

with `const ferroScratch = new THREE.Vector3();` and `const anchorPos = new THREE.Vector3(0, 0, anchorRest);` beside the other module state.

`applyBeat` keeps the z-flip toggle — that is still per-beat and still correct — but loses its `placeAt` call.

- [ ] **Step 4: Verify**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/about/about-flow.ts src/about/about-flow.test.ts
git commit -m "$(cat <<'EOF'
feat(about): fly the ferro along its measured path instead of pinning it centre

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 4: The footer rise amount

**Files:**
- Modify: `src/about/about-scrub.ts`
- Modify: `src/about/about-scrub.test.ts`

**Interfaces:**
- Produces: `footerRiseAt(t: number, path: AboutPath): number` — 0 before the last beat, ramping to 1 at the corridor's end.

- [ ] **Step 1: Write the failing test**

```ts
describe('footerRiseAt', () => {
  it('is zero for the whole corridor until the last beat', () => {
    expect(footerRiseAt(0, path)).toBe(0);
    expect(footerRiseAt(path.tForBeat('contact'), path)).toBe(0);
  });

  it('reaches 1 at the very end', () => {
    expect(footerRiseAt(1, path)).toBeCloseTo(1, 6);
  });

  it('ramps across the last beat rather than switching', () => {
    const ai = path.tForBeat('ai');
    const mid = footerRiseAt((path.tForBeat('contact') + ai) / 2 + (1 - ai) / 2, path);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('is monotonic and stays in 0..1', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 200; i++) {
      const v = footerRiseAt(i / 200, path);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-scrub.test.ts`
Expected: FAIL — `footerRiseAt` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * How far the footer has risen, 0..1, across the corridor's last beat.
 *
 * Adam's mockup (Figma 110:2) puts the footer at 804 of 1080px with the world
 * still visible as a 276px band above it — so this is not a takeover, and
 * nothing needs to compress. The footer simply covers the canvas as it rises;
 * what this number drives is the CHROME, which lifts out of its way: the nav
 * travels to the top of the viewport (where it already sits on the 2D pages)
 * and the bottom margin notes rise with the footer's edge.
 */
export function footerRiseAt(t: number, path: AboutPath): number {
  const start = path.tForBeat('ai');
  if (!Number.isFinite(t) || t <= start) return 0;
  if (start >= 1) return 1;
  return Math.min(1, (t - start) / (1 - start));
}
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/about/about-scrub.test.ts`

```bash
git add src/about/about-scrub.ts src/about/about-scrub.test.ts
git commit -m "$(cat <<'EOF'
feat(about): the footer's rise amount across the last beat

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 5: The chrome lifts out of the footer's way

**Files:**
- Modify: `src/about/about-flow.ts` (`apply`, `releaseSharedState`)
- Modify: `src/styles/base.css` (`.wordmark`, `.site-nav`, `.margin-note--bl`, `.margin-note--br`)
- Modify: `src/about/about-flow.test.ts`

**Interfaces:**
- Consumes: `footerRiseAt` (Task 4).

**The custom property must be cleared in `releaseSharedState()`.** That list exists because three separate restores leaked on this branch, one round at a time.

- [ ] **Step 1: Write the failing test**

```ts
  it('writes the footer rise as the corridor reaches its end', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.5);
    expect(document.documentElement.style.getPropertyValue('--footer-rise')).toBe('0');
    flow.setScrollForTest(1);
    expect(Number(document.documentElement.style.getPropertyValue('--footer-rise'))).toBeCloseTo(1, 3);
    flow.destroy();
  });

  it('clears the footer rise on exit, like every other shared property', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(1);
    flow.exit();
    expect(document.documentElement.style.getPropertyValue('--footer-rise')).toBe('');
    flow.destroy();
  });
```

Add `--footer-rise` to the file's `afterEach` cleanup, beside `--ground` and `--ink`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-flow.test.ts`
Expected: FAIL — the property is never written.

- [ ] **Step 3: Write minimal implementation**

In `apply()`, beside the other property writes:

```ts
    document.documentElement.style.setProperty('--footer-rise', String(footerRiseAt(t, path)));
```

In `releaseSharedState()`, beside the other two:

```ts
    document.documentElement.style.removeProperty('--footer-rise');
```

In `base.css`, have the chrome interpolate against it. `--footer-rise` is undefined outside the corridor, so every rule needs the `, 0` fallback or it will affect other pages:

```css
/* The About footer beat lifts the chrome out of the rising footer's way
 * (about-flow.ts writes --footer-rise, 0..1). The nav travels to the top of the
 * viewport — the position it already holds on the 2D pages, where .nav2d is
 * sticky at top: 0 — and the bottom margin notes rise with the footer's edge.
 * The fallback matters: --footer-rise is undefined everywhere else. */
.wordmark,
.site-nav {
  top: calc(50% - (50% - 50px) * var(--footer-rise, 0));
}

.margin-note--bl,
.margin-note--br {
  bottom: calc(50px + (100vh - 276px - 100px) * var(--footer-rise, 0));
}
```

The `276px` is the world band the mockup leaves above the footer; `100px` keeps the notes clear of its edge by the same 50px inset they use at rest.

- [ ] **Step 4: Verify**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/about/about-flow.ts src/about/about-flow.test.ts src/styles/base.css
git commit -m "$(cat <<'EOF'
feat(about): lift the chrome out of the rising footer's way

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 6: The real scroll-gate indicator

**Files:**
- Modify: `src/about/about-document.ts` (mount the markup)
- Modify: `src/styles/about.css` (replace the placeholder rule)
- Modify: `src/about/about-document.test.ts`

**Interfaces:**
- Consumes: the `--gate` property the gate already writes.

**Exact values from Figma `110:473`.** Panel `#121212`, border `#6b6b6b`, radius 4px, padding 24px/8px, column, gap 5px, centred. Label 12px `#bdbdbd` centred. Track border `#6f6f6f`, radius 4px, padding 4px. Fill `#61e891`, 20px tall, radius 2px.

- [ ] **Step 1: Write the failing test**

```ts
  it('mounts the gate indicator in the last beat, with its label', () => {
    const { doc, parent } = mount();
    const last = doc.sectionFor('ai');
    const gate = last.querySelector('.about-gate');
    expect(gate).not.toBeNull();
    expect(gate!.textContent).toContain('keep scrolling to return home');
    expect(gate!.querySelector('.about-gate-fill')).not.toBeNull();
    doc.destroy();
    parent.remove();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-document.test.ts`
Expected: FAIL — no `.about-gate`.

- [ ] **Step 3: Write minimal implementation**

In `about-document.ts`, append to the last beat's section beside the footer:

```ts
  const gate = document.createElement('div');
  gate.className = 'about-gate';
  const gateLabel = document.createElement('p');
  gateLabel.className = 'about-gate-label';
  gateLabel.textContent = 'keep scrolling to return home';
  const gateTrack = document.createElement('div');
  gateTrack.className = 'about-gate-track';
  const gateFill = document.createElement('div');
  gateFill.className = 'about-gate-fill';
  gateTrack.appendChild(gateFill);
  gate.append(gateLabel, gateTrack);
  sections.get(ABOUT_MARKERS[ABOUT_MARKERS.length - 1].id)!.appendChild(gate);
```

In `about.css`, replace the placeholder `.about-doc::after` rule entirely:

```css
/* The footer gate's indicator, per Figma 110:473. It is fixed to the viewport
 * rather than flowing with the footer, so it stays reachable while you push
 * against the end. --gate is 0..1, written per wheel event by about-flow.ts.
 *
 * The hatch is a CSS gradient rather than the mock's exported PNG: it is a
 * specifiable 45-degree stripe, not an icon, and a gradient stays crisp at any
 * width with no tiling seam. Space Mono stands in for the mock's Galix Mono,
 * which the site does not ship. */
.about-gate {
  position: fixed;
  left: 50%;
  bottom: 64px;
  transform: translateX(-50%);
  width: min(1272px, calc(100vw - 160px));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px 24px;
  background: #121212;
  border: 1px solid #6b6b6b;
  border-radius: 4px;
  pointer-events: none;
  z-index: 2;
}

.about-gate-label {
  margin: 0;
  width: 100%;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: normal;
  color: #bdbdbd;
}

.about-gate-track {
  width: 100%;
  box-sizing: border-box;
  padding: 4px;
  border: 1px solid #6f6f6f;
  border-radius: 4px;
  background: repeating-linear-gradient(
    45deg,
    #1c1c1c 0 6px,
    #121212 6px 12px
  );
}

.about-gate-fill {
  height: 20px;
  border-radius: 2px;
  background: #61e891;
  width: calc(var(--gate, 0) * 100%);
}

@media (prefers-reduced-motion: reduce) {
  .about-gate { display: none; }
}
```

The reduced-motion hide is deliberate: the gate is never fed in that mode (`onWheel` returns early), so an indicator that can never fill would be a lie.

- [ ] **Step 4: Verify**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/about/about-document.ts src/about/about-document.test.ts src/styles/about.css
git commit -m "$(cat <<'EOF'
feat(about): the real scroll-gate indicator, per Figma 110:473

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 7: Adam's QA

**Files:** none.

`npm run dev`, foreground window, hard reload.

- [ ] The blob is absent for the first half of the corridor, then **fades up as it drops in** after the client wall
- [ ] It then travels **ahead of you**, growing as you close on it, and holds at the capabilities and contact beats
- [ ] It does not jitter — it is placed every frame with the tween off, so any stutter is a real problem
- [ ] Reaching the footer, the **nav rises to the top** and the **HUD line lifts** rather than being covered
- [ ] The world stays visible as a band above the footer
- [ ] Pushing past the footer fills the **hatched indicator**, and its label tells you what pushing does
- [ ] Leaving the corridor puts the chrome back where it was

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Ferro stays a shader; only the rect changes | 1, 3 |
| The measured path | 2 |
| Arrival: fades up across the descent | 2, 3 |
| Footer beat: what moves | 4, 5 |
| Footer beat: driven by a custom property, cleared on release | 5 |
| Gate indicator, exact values | 6 |
| Hatch as CSS, Space Mono not Galix | 6 (both in the file's comment) |
| Grass, Controller rotation, followups | Out of scope, unchanged |

**Placeholder scan:** none. `GATE_THRESHOLD_PX` keeps its "awaiting Figma" note, but that now covers only the threshold *value* — the treatment is specified.

**Type consistency:** `projectToRect` (Task 1) returns the same `{x,y,w,h}` shape `placeAt` takes, consumed in Task 3. `ferroWorldAt`/`ferroFadeAt`/`FERRO_RADIUS` (Task 2) are consumed in Task 3. `footerRiseAt` (Task 4) is consumed in Task 5. `--gate` (existing) is consumed in Task 6; `--footer-rise` is produced in Task 5 and consumed in Task 5's CSS.

**The invariant no parameter carries** — the lesson from the last plan's two Criticals. Three here:
- Task 3 removes the once-per-beat `placeAt` gate. `applyBeat` must keep its **z-flip** toggle; only the placement moves out.
- Task 5's CSS must use `var(--footer-rise, 0)` everywhere. The property is undefined on every other page, and a missing fallback would move the chrome site-wide.
- Task 6 replaces `.about-doc::after`. Confirm nothing else references that selector before deleting it.
