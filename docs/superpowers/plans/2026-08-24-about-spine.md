# commms — About Spine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the About flow's spine — the camera path, the scroll scrub that drives it, the palette that rides it, and the handover from the site's existing zoom grammar — so the whole About corridor can be scrolled end to end, correctly lit and paced, with no content in it yet.

**Architecture:** A pure `t → { position, quaternion }` camera path derived from nine measured Blender markers, sampled by a scroll-driven `t` and written onto the existing `world.camera`. Entering About suspends `camera-director` rather than replacing it, so the site's zoom grammar is untouched and returns intact on exit. Every derivation — axis conversion, path sampling, scroll mapping, beat lookup, palette interpolation — is a pure function in its own module with unit tests; only the controller touches the DOM or Three.

**Tech Stack:** TypeScript (strict), Three.js, GSAP, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-08-21-about-flow-design.md`
**Measurements:** `docs/research/about-blender-inventory.md`

---

## Global Constraints

- **This plan is the SPINE ONLY.** Beats 2–8 (lander, team, client wall, capabilities, contact, AI, footer gate) are out of scope and get their own plans. Nothing here renders beat content.
- **No new assets and no Figma dependency.** If a task needs a portrait, a logo, a grass mesh or a mock, it belongs in a later plan.
- **The existing suite must stay green: 470 passed / 2 skipped.** Run `npx vitest run` from the worktree, never from the repo root — the root glob walks into `.claude/worktrees/` and over-counts (96 files / 1269 tests).
- **Verification commands** (all run from `C:\Users\Adam\Code\portfolio-site\.claude\worktrees\about-page`):
  - `npx vitest run` — full suite
  - `npx vitest run src/about/<file>.test.ts` — one file
  - `npx tsc --noEmit` — typecheck
  - `npm run build` — production build
- **Feel is verified in a foreground browser by Adam, not by tests, and not by browser automation.** Automation tabs run occluded: no rAF, CSS transitions stuck at their start value. A screenshot from automation proves nothing about this flow.
- **Existing constants are authoritative** — import them, never re-declare: `SPINE_PERIOD = 240` (`three/loop.ts`), `SPACING = 60` and `CAMERA_OFFSET = 34` and `CAMERA_FOV = 45` (`three/world.ts`), `DAMPING_RATE = 2.2` (`three/camera-director.ts`).
- **Commit after every task**, with the trailer block used by this repo.

---

## Decisions taken while planning

These resolve gaps or errors in the spec. Each is implemented as a named, documented constant or module so it can be retuned without archaeology.

**D1 — Blender coordinates give the path's SHAPE, not the site's coordinates.**
The site spaces destinations 60 units apart on a 240-unit loop. Blender placed About ~7 units past Work. A linear fit through the Home and Work markers gives scale `60 / 34.61 = 1.734`; an independent check — Blender camera-to-Work-wall ≈ 20.3 units against the site's `CAMERA_OFFSET = 34` — gives `1.678`. The unit size agrees to ~3%; the *placement* does not. So: convert Blender offsets to world units at a single named scale, and **anchor the path at the site's own About rest**, discarding Blender's absolute positions.

**D2 — The path anchors at the Work Page marker (frame 64), not at the transition marker (frame 89).**
Frame 64 is the last marker where Blender's camera is horizontal (pitch 90°), which is the orientation the site's camera already has when it arrives at About. Anchoring at frame 89 (pitch 105.3°) would jump the view 15° at the instant of handover. Anchoring at 64 costs nothing and buys a run-up: the first ~8.6 world units of scrub are level travel before the tilt starts.

**D3 — Field of view stays at the world's `CAMERA_FOV = 45`.**
The Blender camera is 50mm — about 27° vertical. Matching it would mean animating `camera.fov` mid-flow, which invalidates `framing.ts`'s `distanceForFraming`/`worldPerPx` (both take `fovYDeg` and are used by the WORK wall and the ferro) and changes the atmosphere's distance-based point sizing. The About beats are almost entirely DOM, so the framing cost is small. **Flag for Adam:** if the lander's grass framing reads wrong in Plan 2, this is the first thing to revisit.

**D4 — Spec "Ask #2 of the contact branch" is void; no ferro path work is needed.**
`ferro-stage.ts` owns a fixed camera (`FERRO_CAMERA = { distance: 4.2, fovYDeg: 35 }`) and never moves the blob in world space — `placeAt(rect)` positions it by CSS rect and the object transform does the travelling. The spec puts the ferro dead-centre at NDC (0.5, 0.5) at every About beat, so a centred rect whose size interpolates per beat is the entire requirement. Task 9 does exactly that.

**D5 — Two rAF loops stay.**
The spec says "one rAF drives both, sharing one camera." `ferro-stage.ts` already runs its own visibility-gated loop and its own camera, and merging them would mean reworking a module that just shipped. It is an optimization, not a requirement. Not in this plan.

**D6 — Spec open question #5 is answered.** `/contact` survived the contact merge as a real routed page (`routes.ts`, `PATHS.contact = '/contact'`). About's contact beat reuses the panel; the destination is not About's to change.

**D7 — The world must hide its spine dressing during About.**
`world.ts` re-anchors every screen with `nearestWrapped(anchorZ, camera.position.z)` and fades it by `Math.abs(camera.position.z - s.root.position.z)` — both assume the camera is on the spine. The About path climbs ~31 world units in +Y, so the Work and Contact screens would materialize in mid-air alongside the corridor. Task 7 adds an About mode to the world that freezes re-anchoring and hides the anchored roots.

---

## File Structure

**New — `src/about/`, one responsibility each, all pure except the controller:**

| File | Responsibility |
|---|---|
| `about-coords.ts` | Blender→world axis conversion, the unit scale, pitch→quaternion. Nothing else knows Blender exists. |
| `about-markers.ts` | The nine measured markers as data, verbatim from the inventory. Pure table, no logic. |
| `about-path.ts` | `AboutPath` — `sample(t) → { position, quaternion }`. Catmull-Rom on position, slerp on orientation. |
| `about-scrub.ts` | Scroll geometry: `scrollToT`, `beatAt`, `beatProgress`. |
| `about-palette.ts` | Three-state palette keyed to `t`; returns ground, ink, and on-dark. |
| `about-document.ts` | The scrolling `<main>` shell and its beat-height spacers. DOM only, no maths. |
| `about-flow.ts` | The controller. Owns enter/exit, binds scroll, drives the camera, applies palette. The only stateful module. |

**Modified:**

| File | Change |
|---|---|
| `src/three/camera-director.ts` | Add `setSuspended(v)` so `update()` stops writing the camera. |
| `src/three/world.ts` | Add `setAboutMode(v)`; freeze re-anchoring and hide anchored roots when on. |
| `src/three/atmosphere.ts` | Hoist the hard-coded `INK = 0.07` out of the shader string into a `uInk` uniform with `setInk()`. |
| `src/home/scroll-nav.ts` | Add `'about'` to `ScrollMode`. |
| `src/styles/about.css` | New — the scrolling document's layout. |
| `src/main.ts` | Wire the controller; route `/about` into it. |

**Retired:** `src/page2d/about.ts` and its takeover wiring — replaced by the scrolling document. Removed in Task 12, not before, so the site keeps a working `/about` throughout.

---

## Task 1: Blender→world coordinate conversion

**Files:**
- Create: `src/about/about-coords.ts`
- Test: `src/about/about-coords.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BLENDER_TO_WORLD: number`, `blenderToWorld(b: BlenderVec): THREE.Vector3`, `pitchToQuaternion(pitchDeg: number): THREE.Quaternion`, `interface BlenderVec { x: number; y: number; z: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/about/about-coords.test.ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BLENDER_TO_WORLD, blenderToWorld, pitchToQuaternion } from './about-coords';

describe('blenderToWorld', () => {
  it('maps Blender +Y (forward) onto Three -Z', () => {
    const v = blenderToWorld({ x: 0, y: 1, z: 0 });
    expect(v.x).toBeCloseTo(0, 10);
    expect(v.y).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(-BLENDER_TO_WORLD, 10);
  });

  it('maps Blender +Z (up) onto Three +Y', () => {
    const v = blenderToWorld({ x: 0, y: 0, z: 1 });
    expect(v.y).toBeCloseTo(BLENDER_TO_WORLD, 10);
    expect(v.z).toBeCloseTo(0, 10);
  });

  it('maps Blender +X onto Three +X', () => {
    expect(blenderToWorld({ x: 1, y: 0, z: 0 }).x).toBeCloseTo(BLENDER_TO_WORLD, 10);
  });

  it('scales at the rate the two independent derivations agree on', () => {
    // Home->Work marker span 34.61 Blender units against the site's 60-unit
    // SPACING gives 1.734; camera-to-wall 20.3 against CAMERA_OFFSET 34 gives
    // 1.678. See D1 in the plan. The constant sits between them.
    expect(BLENDER_TO_WORLD).toBeGreaterThan(1.67);
    expect(BLENDER_TO_WORLD).toBeLessThan(1.74);
  });
});

describe('pitchToQuaternion', () => {
  it('is identity at 90 degrees — Blender level is Three level', () => {
    // Blender's camera at pitch 90 looks along +Y; Three's default camera looks
    // along -Z. The axis map sends one to the other, so level is no rotation.
    const q = pitchToQuaternion(90);
    expect(q.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 10);
  });

  it('points the camera straight up at 180 degrees', () => {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(pitchToQuaternion(180));
    expect(dir.x).toBeCloseTo(0, 6);
    expect(dir.y).toBeCloseTo(1, 6);
    expect(dir.z).toBeCloseTo(0, 6);
  });

  it('is a pure X rotation — the flow has no yaw and no roll', () => {
    const e = new THREE.Euler().setFromQuaternion(pitchToQuaternion(105.3), 'XYZ');
    expect(e.y).toBeCloseTo(0, 10);
    expect(e.z).toBeCloseTo(0, 10);
    expect(THREE.MathUtils.radToDeg(e.x)).toBeCloseTo(15.3, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-coords.test.ts`
Expected: FAIL — `Failed to resolve import "./about-coords"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/about/about-coords.ts
import * as THREE from 'three';

/**
 * Blender units → world units.
 *
 * Two independent derivations, documented because they disagree by ~3% and the
 * value is therefore a judgement, not a measurement:
 *
 *   - The Home and Work markers span 34.61 Blender units. The site spaces those
 *     same two destinations SPACING = 60 apart. 60 / 34.61 = 1.734.
 *   - The Work camera sits ~20.3 Blender units from the Work wall. The site's
 *     camera sits CAMERA_OFFSET = 34 from its screens. 34 / 20.3 = 1.678.
 *
 * 1.70 splits them. Retune here — nothing else in the codebase knows the rate.
 *
 * Note what this constant does NOT do: it does not place the About beats in the
 * world. Blender's absolute positions are discarded (see D1); only offsets from
 * the anchor marker survive the conversion.
 */
export const BLENDER_TO_WORLD = 1.7;

export interface BlenderVec { x: number; y: number; z: number }

/**
 * Blender is Z-up and films along +Y; Three is Y-up and films along -Z.
 * So: Blender +Y → Three -Z, Blender +Z → Three +Y, Blender +X → Three +X.
 */
export function blenderToWorld(b: BlenderVec): THREE.Vector3 {
  return new THREE.Vector3(
    b.x * BLENDER_TO_WORLD,
    b.z * BLENDER_TO_WORLD,
    -b.y * BLENDER_TO_WORLD,
  );
}

/**
 * The flow's camera has pitch and nothing else — the inventory records no yaw
 * and no roll at any of the nine markers, and every marker sits at x = 0. So a
 * single rotation about X carries the whole orientation.
 *
 * Blender pitch 90 is level. Under the axis map above, level in Blender is
 * already level in Three, so 90 must produce the identity — hence the -90.
 */
export function pitchToQuaternion(pitchDeg: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(THREE.MathUtils.degToRad(pitchDeg - 90), 0, 0, 'XYZ'),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/about/about-coords.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/about/about-coords.ts src/about/about-coords.test.ts
git commit -m "$(cat <<'EOF'
feat(about): Blender-to-world coordinate conversion for the camera path

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 2: The marker table

**Files:**
- Create: `src/about/about-markers.ts`
- Test: `src/about/about-markers.test.ts`

**Interfaces:**
- Consumes: nothing (pure data).
- Produces: `type BeatId`, `interface AboutMarker { id: BeatId; frame: number; blender: BlenderVec; pitchDeg: number }`, `ABOUT_MARKERS: readonly AboutMarker[]`, `ANCHOR_FRAME: number`.

- [ ] **Step 1: Write the failing test**

```ts
// src/about/about-markers.test.ts
import { describe, expect, it } from 'vitest';
import { ABOUT_MARKERS, ANCHOR_FRAME } from './about-markers';

describe('ABOUT_MARKERS', () => {
  it('carries the six markers the About flow scrubs through', () => {
    // The nine Blender markers include Home and Work, which the site owns and
    // the scrub never visits. The path starts at the anchor (Work Page) and
    // runs to AI Transparency.
    expect(ABOUT_MARKERS.map((m) => m.id)).toEqual([
      'anchor', 'transition', 'lander', 'team', 'clientWall', 'capabilities', 'contact', 'ai',
    ]);
  });

  it('starts at the anchor frame', () => {
    expect(ABOUT_MARKERS[0].frame).toBe(ANCHOR_FRAME);
    expect(ANCHOR_FRAME).toBe(64);
  });

  it('has strictly increasing frames — the path never doubles back in time', () => {
    for (let i = 1; i < ABOUT_MARKERS.length; i++) {
      expect(ABOUT_MARKERS[i].frame).toBeGreaterThan(ABOUT_MARKERS[i - 1].frame);
    }
  });

  it('never leaves the x = 0 plane', () => {
    for (const m of ABOUT_MARKERS) expect(m.blender.x).toBe(0);
  });

  it('matches the measured inventory at the two poses that define the move', () => {
    const lander = ABOUT_MARKERS.find((m) => m.id === 'lander')!;
    expect(lander.frame).toBe(105);
    expect(lander.blender.y).toBeCloseTo(36.83, 2);
    expect(lander.blender.z).toBeCloseTo(6.02, 2);
    expect(lander.pitchDeg).toBeCloseTo(179.9, 1);

    const ai = ABOUT_MARKERS.find((m) => m.id === 'ai')!;
    expect(ai.frame).toBe(258);
    expect(ai.blender.y).toBeCloseTo(55.46, 2);
    expect(ai.blender.z).toBeCloseTo(18.23, 2);
    expect(ai.pitchDeg).toBeCloseTo(89.9, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-markers.test.ts`
Expected: FAIL — cannot resolve `./about-markers`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/about/about-markers.ts
import type { BlenderVec } from './about-coords';

/**
 * The beats the scrub travels through. 'anchor' is not a beat anyone sees — it
 * is the Work Page marker, where the path attaches to the site (see D2).
 */
export type BeatId =
  | 'anchor' | 'transition' | 'lander' | 'team'
  | 'clientWall' | 'capabilities' | 'contact' | 'ai';

export interface AboutMarker {
  id: BeatId;
  /** Blender frame, 30fps. Used only as the path's parameter axis. */
  frame: number;
  /** Camera position in Blender's own space, verbatim from the inventory. */
  blender: BlenderVec;
  /** Blender camera pitch in degrees. 90 is level; 180 looks straight up. */
  pitchDeg: number;
}

/**
 * Where the path attaches to the site's world (D2). Frame 64 is the last marker
 * with a level camera, so handover costs no orientation jump — the site's
 * camera is already level when it arrives at About.
 */
export const ANCHOR_FRAME = 64;

/**
 * Measured 2026-08-21 from `00_Blend\01_Comms\Threejs Flow.blend`; the full
 * 44-object survey is in docs/research/about-blender-inventory.md.
 *
 * Every marker sits at x = 0 and carries pitch only — no yaw, no roll. That is
 * why about-coords exposes pitchToQuaternion rather than a full euler.
 */
export const ABOUT_MARKERS: readonly AboutMarker[] = Object.freeze([
  { id: 'anchor',       frame: 64,  blender: { x: 0, y: 29.74, z: 0     }, pitchDeg: 90.0  },
  { id: 'transition',   frame: 89,  blender: { x: 0, y: 34.73, z: 0.31  }, pitchDeg: 105.3 },
  { id: 'lander',       frame: 105, blender: { x: 0, y: 36.83, z: 6.02  }, pitchDeg: 179.9 },
  { id: 'team',         frame: 121, blender: { x: 0, y: 36.84, z: 12.15 }, pitchDeg: 179.9 },
  { id: 'clientWall',   frame: 149, blender: { x: 0, y: 36.84, z: 17.27 }, pitchDeg: 179.9 },
  { id: 'capabilities', frame: 204, blender: { x: 0, y: 39.26, z: 18.23 }, pitchDeg: 89.9  },
  { id: 'contact',      frame: 231, blender: { x: 0, y: 45.93, z: 18.23 }, pitchDeg: 89.9  },
  { id: 'ai',           frame: 258, blender: { x: 0, y: 55.46, z: 18.23 }, pitchDeg: 89.9  },
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/about/about-markers.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/about/about-markers.ts src/about/about-markers.test.ts
git commit -m "$(cat <<'EOF'
feat(about): the measured Blender marker table

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 3: The camera path

**Files:**
- Create: `src/about/about-path.ts`
- Test: `src/about/about-path.test.ts`

**Interfaces:**
- Consumes: `ABOUT_MARKERS`, `ANCHOR_FRAME`, `BeatId` (Task 2); `blenderToWorld`, `pitchToQuaternion` (Task 1).
- Produces: `interface CameraPose { position: THREE.Vector3; quaternion: THREE.Quaternion }`, `interface AboutPath { sample(t: number, into?: CameraPose): CameraPose; tForBeat(id: BeatId): number; length(): number }`, `buildAboutPath(anchor: THREE.Vector3): AboutPath`.

**Design note for the implementer:** `sample` takes an optional `into` to write through, because the controller calls it every frame and must not allocate a `Vector3` and a `Quaternion` per frame. `t` is normalized frame position across the marker span, NOT arc length — the Blender timing is the authored pacing and re-parameterizing by distance would discard it.

- [ ] **Step 1: Write the failing test**

```ts
// src/about/about-path.test.ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ABOUT_MARKERS } from './about-markers';
import { BLENDER_TO_WORLD, pitchToQuaternion } from './about-coords';
import { buildAboutPath } from './about-path';

const ANCHOR = new THREE.Vector3(0, 0, -86); // the site's About rest

describe('buildAboutPath', () => {
  const path = buildAboutPath(ANCHOR);

  it('starts exactly on the anchor with a level camera', () => {
    const pose = path.sample(0);
    expect(pose.position.distanceTo(ANCHOR)).toBeCloseTo(0, 6);
    expect(pose.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 6);
  });

  it('passes through every measured marker at that marker\'s own t', () => {
    for (const m of ABOUT_MARKERS) {
      const pose = path.sample(path.tForBeat(m.id));
      const expected = new THREE.Vector3(
        0,
        (m.blender.z - ABOUT_MARKERS[0].blender.z) * BLENDER_TO_WORLD + ANCHOR.y,
        -(m.blender.y - ABOUT_MARKERS[0].blender.y) * BLENDER_TO_WORLD + ANCHOR.z,
      );
      expect(pose.position.distanceTo(expected)).toBeCloseTo(0, 4);
      expect(pose.quaternion.angleTo(pitchToQuaternion(m.pitchDeg))).toBeCloseTo(0, 4);
    }
  });

  it('travels forward on -Z without a visible backward wiggle', () => {
    // NOT an exact-monotonic assertion, on purpose. The climb run (lander,
    // team, clientWall) sits at Blender y 7.09 / 7.10 / 7.10 — three knots
    // essentially on top of each other in the forward axis — and the next knot
    // jumps to 9.52. A Catmull-Rom through that will bulge slightly backward
    // between them. Centripetal parameterization is chosen precisely to keep
    // that bulge small; WIGGLE is what "small" means, in world units, and it is
    // well under one frame of scroll travel.
    const WIGGLE = 0.05;
    let prevZ = Infinity;
    for (let i = 0; i <= 200; i++) {
      const z = path.sample(i / 200).position.z;
      expect(z).toBeLessThanOrEqual(prevZ + WIGGLE);
      prevZ = z;
    }
    // And the run as a whole is unambiguously forward. 43.7 world units of it:
    // the markers span 25.72 Blender units on the forward axis. That is well
    // short of the ~70-unit total path length, because the climb contributes
    // 31 units in +Y — do not conflate the two.
    expect(path.sample(1).position.z).toBeLessThan(path.sample(0).position.z - 40);
  });

  it('climbs monotonically in +Y through the lander-to-client-wall run', () => {
    const a = path.tForBeat('transition');
    const b = path.tForBeat('clientWall');
    let prevY = -Infinity;
    for (let i = 0; i <= 50; i++) {
      const y = path.sample(a + ((b - a) * i) / 50).position.y;
      expect(y).toBeGreaterThanOrEqual(prevY - 1e-6);
      prevY = y;
    }
  });

  it('clamps out-of-range t rather than extrapolating off the end of the world', () => {
    // Each sample gets its OWN `into`. Without one, sample() writes into a
    // shared scratch pose and returns it, so comparing two bare sample() calls
    // in one expression compares the object with itself and passes whatever
    // the implementation does.
    const pose = () => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() });
    const [under, start, over, end] = [pose(), pose(), pose(), pose()];
    path.sample(-1, under);
    path.sample(0, start);
    path.sample(2, over);
    path.sample(1, end);
    expect(under.position.distanceTo(start.position)).toBeCloseTo(0, 6);
    expect(over.position.distanceTo(end.position)).toBeCloseTo(0, 6);
  });

  it('writes through the `into` pose instead of allocating', () => {
    const into = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    const out = path.sample(0.5, into);
    expect(out).toBe(into);
    expect(out.position).toBe(into.position);
  });

  it('stops short of the Contact destination — the corridor is a mezzanine, not a collision', () => {
    // Contact's camera rest is z = -146. If the path overran it the scrub would
    // fly through the Contact screen, which the world still has anchored there.
    expect(path.sample(1).position.z).toBeGreaterThan(-146);
  });

  it('reports its own world length so the scroll document can be sized from it', () => {
    expect(path.length()).toBeGreaterThan(60);
    expect(path.length()).toBeLessThan(120);
  });

  it('gives beats t values in marker order, 0 and 1 at the ends', () => {
    expect(path.tForBeat('anchor')).toBe(0);
    expect(path.tForBeat('ai')).toBe(1);
    const ts = ABOUT_MARKERS.map((m) => path.tForBeat(m.id));
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-path.test.ts`
Expected: FAIL — cannot resolve `./about-path`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/about/about-path.ts
import * as THREE from 'three';
import { blenderToWorld, pitchToQuaternion } from './about-coords';
import { ABOUT_MARKERS, type BeatId } from './about-markers';

export interface CameraPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export interface AboutPath {
  /** Pose at `t` in 0..1, clamped. Writes into `into` when given. */
  sample(t: number, into?: CameraPose): CameraPose;
  /** Where a beat sits on the 0..1 axis. */
  tForBeat(id: BeatId): number;
  /** Total path length in world units — what the scroll document is sized from. */
  length(): number;
}

const FIRST = ABOUT_MARKERS[0];
const LAST = ABOUT_MARKERS[ABOUT_MARKERS.length - 1];
const FRAME_SPAN = LAST.frame - FIRST.frame;

/**
 * A camera path through the measured markers, anchored into the site's world.
 *
 * `t` is normalized FRAME position, not arc length. The Blender timing is the
 * authored pacing — the climb is deliberately slower than the level run — and
 * re-parameterizing by distance would flatten exactly that. Free scrub means
 * the user sets the speed anyway; what this preserves is the relative dwell.
 *
 * Position interpolates on a centripetal Catmull-Rom through the marker points,
 * which keeps the pitch-up-then-climb corner smooth without the overshoot a
 * uniform spline puts on unevenly spaced knots. Orientation slerps between
 * adjacent markers rather than riding the curve, because a camera that rolls
 * toward its path tangent is not what the Blender move does — it pitches and
 * holds.
 */
export function buildAboutPath(anchor: THREE.Vector3): AboutPath {
  // Offsets from the anchor marker, converted once. Blender's absolute
  // positions are discarded here — see D1.
  const points = ABOUT_MARKERS.map((m) =>
    blenderToWorld({
      x: m.blender.x - FIRST.blender.x,
      y: m.blender.y - FIRST.blender.y,
      z: m.blender.z - FIRST.blender.z,
    }).add(anchor),
  );
  const quats = ABOUT_MARKERS.map((m) => pitchToQuaternion(m.pitchDeg));
  const ts = ABOUT_MARKERS.map((m) => (m.frame - FIRST.frame) / FRAME_SPAN);

  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');

  let total = 0;
  for (let i = 1; i < points.length; i++) total += points[i].distanceTo(points[i - 1]);

  const scratch = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

  /** Index of the marker segment containing t, plus the local 0..1 within it. */
  const locate = (t: number): { i: number; local: number } => {
    for (let i = 1; i < ts.length; i++) {
      if (t <= ts[i]) {
        const span = ts[i] - ts[i - 1];
        return { i: i - 1, local: span > 0 ? (t - ts[i - 1]) / span : 0 };
      }
    }
    return { i: ts.length - 2, local: 1 };
  };

  return {
    sample(t: number, into?: CameraPose): CameraPose {
      const out = into ?? scratch;
      const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
      curve.getPoint(clamped, out.position);
      const { i, local } = locate(clamped);
      out.quaternion.copy(quats[i]).slerp(quats[i + 1], local);
      return out;
    },
    tForBeat(id: BeatId): number {
      const i = ABOUT_MARKERS.findIndex((m) => m.id === id);
      return i < 0 ? 0 : ts[i];
    },
    length(): number {
      return total;
    },
  };
}
```

**Implementer's note on the first assertion:** `CatmullRomCurve3.getPoint(0)` returns the first control point exactly, and `getPoint(1)` the last, so the endpoint tests hold. If the marker-pass test fails at interior markers by a small amount, that is the spline not passing exactly through its knots — it does pass through them; check that `ts` is being used to locate the segment rather than feeding `t` straight to `getPoint` for the quaternion.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/about/about-path.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 479 passed / 2 skipped; tsc silent.

- [ ] **Step 6: Commit**

```bash
git add src/about/about-path.ts src/about/about-path.test.ts
git commit -m "$(cat <<'EOF'
feat(about): the scrubable camera path through the measured markers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 4: Scroll geometry — scroll offset to `t`, and beat lookup

**Files:**
- Create: `src/about/about-scrub.ts`
- Test: `src/about/about-scrub.test.ts`

**Interfaces:**
- Consumes: `BeatId`, `ABOUT_MARKERS` (Task 2); `AboutPath` (Task 3).
- Produces: `scrollToT(scrollTop: number, scrollHeight: number, viewportH: number): number`, `documentHeightFor(path: AboutPath, viewportH: number): number`, `beatAt(t: number, path: AboutPath): BeatId`, `beatProgress(t: number, path: AboutPath): number`, `WORLD_UNITS_PER_VIEWPORT: number`.

- [ ] **Step 1: Write the failing test**

```ts
// src/about/about-scrub.test.ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildAboutPath } from './about-path';
import {
  beatAt, beatProgress, documentHeightFor, scrollToT, WORLD_UNITS_PER_VIEWPORT,
} from './about-scrub';

const path = buildAboutPath(new THREE.Vector3(0, 0, -86));

describe('scrollToT', () => {
  it('is 0 at the top and 1 at the bottom', () => {
    expect(scrollToT(0, 5000, 1000)).toBe(0);
    expect(scrollToT(4000, 5000, 1000)).toBe(1);
  });

  it('is linear in between — free scrub, 1:1, no easing', () => {
    expect(scrollToT(2000, 5000, 1000)).toBeCloseTo(0.5, 10);
    expect(scrollToT(1000, 5000, 1000)).toBeCloseTo(0.25, 10);
  });

  it('clamps rather than overshooting on rubber-band scroll', () => {
    expect(scrollToT(-300, 5000, 1000)).toBe(0);
    expect(scrollToT(9999, 5000, 1000)).toBe(1);
  });

  it('returns 0 for a document no taller than the viewport', () => {
    // Nothing to scrub. Dividing by the zero-length scroll range would give
    // Infinity and put the camera at the end of the flow on a short viewport.
    expect(scrollToT(0, 800, 800)).toBe(0);
    expect(scrollToT(50, 600, 800)).toBe(0);
  });
});

describe('documentHeightFor', () => {
  it('gives every world unit of path a consistent number of scrolled pixels', () => {
    const h = documentHeightFor(path, 1000);
    expect(h).toBeCloseTo(1000 + (path.length() / WORLD_UNITS_PER_VIEWPORT) * 1000, 6);
  });

  it('is always at least one viewport, so the page is never shorter than the screen', () => {
    expect(documentHeightFor(path, 1000)).toBeGreaterThanOrEqual(1000);
  });

  it('scales with the viewport — the same flow takes the same number of screens', () => {
    const short = documentHeightFor(path, 800);
    const tall = documentHeightFor(path, 1600);
    expect((short - 800) * 2).toBeCloseTo(tall - 1600, 6);
  });
});

describe('beatAt', () => {
  it('reports the beat whose marker the scrub has most recently reached', () => {
    expect(beatAt(0, path)).toBe('anchor');
    expect(beatAt(1, path)).toBe('ai');
    expect(beatAt(path.tForBeat('team'), path)).toBe('team');
  });

  it('holds the previous beat until the next marker is actually reached', () => {
    const t = (path.tForBeat('team') + path.tForBeat('clientWall')) / 2;
    expect(beatAt(t, path)).toBe('team');
  });
});

describe('beatProgress', () => {
  it('is 0 on a marker and approaches 1 at the next one', () => {
    expect(beatProgress(path.tForBeat('lander'), path)).toBeCloseTo(0, 6);
    const mid = (path.tForBeat('lander') + path.tForBeat('team')) / 2;
    expect(beatProgress(mid, path)).toBeCloseTo(0.5, 6);
  });

  it('is 1 at the very end rather than restarting', () => {
    expect(beatProgress(1, path)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-scrub.test.ts`
Expected: FAIL — cannot resolve `./about-scrub`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/about/about-scrub.ts
import { ABOUT_MARKERS, type BeatId } from './about-markers';
import type { AboutPath } from './about-path';

/**
 * How much of the path one viewport of scrolling covers.
 *
 * This is the flow's pacing dial and the only place it lives. Lower means a
 * longer document and a slower corridor; higher means fewer screens of scroll.
 * 12 puts the ~76-unit path at a little over six screens, which is in the range
 * a long-form page occupies — the flow should not feel like an endurance test.
 *
 * Free scrub means the user sets the speed; this only sets how much travel a
 * gesture buys. Verify by feel in a foreground window, not by test.
 */
export const WORLD_UNITS_PER_VIEWPORT = 12;

/**
 * Scroll offset → path parameter. Linear and clamped: the spec calls for free
 * scrub at 1:1 with no snapping, so there is deliberately no easing here.
 */
export function scrollToT(scrollTop: number, scrollHeight: number, viewportH: number): number {
  const range = scrollHeight - viewportH;
  if (!(range > 0) || !Number.isFinite(scrollTop)) return 0;
  return Math.min(1, Math.max(0, scrollTop / range));
}

/** The document height that gives the path its pacing at this viewport. */
export function documentHeightFor(path: AboutPath, viewportH: number): number {
  const screens = path.length() / WORLD_UNITS_PER_VIEWPORT;
  return viewportH + screens * viewportH;
}

/**
 * The beat the scrub is currently in — the last marker reached, held until the
 * next one. Beats are ranges, not points: everything keyed off this (the ferro
 * z-flip, the palette, later the content reveals) needs a stable answer while
 * the camera is between two markers.
 */
export function beatAt(t: number, path: AboutPath): BeatId {
  let current: BeatId = ABOUT_MARKERS[0].id;
  for (const m of ABOUT_MARKERS) {
    if (t + 1e-9 >= path.tForBeat(m.id)) current = m.id;
    else break;
  }
  return current;
}

/** 0..1 through the current beat's range. 1 at the very end of the flow. */
export function beatProgress(t: number, path: AboutPath): number {
  const id = beatAt(t, path);
  const i = ABOUT_MARKERS.findIndex((m) => m.id === id);
  if (i >= ABOUT_MARKERS.length - 1) return 1;
  const a = path.tForBeat(ABOUT_MARKERS[i].id);
  const b = path.tForBeat(ABOUT_MARKERS[i + 1].id);
  return b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/about/about-scrub.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/about/about-scrub.ts src/about/about-scrub.test.ts
git commit -m "$(cat <<'EOF'
feat(about): scroll-to-t mapping, document sizing and beat lookup

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 5: The three-state palette

**Files:**
- Create: `src/about/about-palette.ts`
- Test: `src/about/about-palette.test.ts`

**Interfaces:**
- Consumes: `AboutPath` (Task 3).
- Produces: `interface AboutPalette { ground: string; ink: number; onDark: boolean }`, `paletteAt(t: number, path: AboutPath): AboutPalette`, `NIGHT_GROUND: string`, `DAY_GROUND: string`, `NIGHT_INK: number`, `DAY_INK: number`.

**Design note:** the spec says the world "dims continuously on approach rather than snapping — the palette is a property of where the camera is, not an event anyone triggers." So this is interpolation over `t`, with the crossfades placed inside the beat ranges either side of the flip, never at a marker.

- [ ] **Step 1: Write the failing test**

```ts
// src/about/about-palette.test.ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildAboutPath } from './about-path';
import { DAY_GROUND, DAY_INK, NIGHT_GROUND, NIGHT_INK, paletteAt } from './about-palette';

const path = buildAboutPath(new THREE.Vector3(0, 0, -86));

describe('paletteAt', () => {
  it('is night at the start of the corridor', () => {
    expect(paletteAt(0, path).ground).toBe(NIGHT_GROUND);
    expect(paletteAt(0, path).onDark).toBe(true);
  });

  it('is day at the capabilities beat', () => {
    const p = paletteAt(path.tForBeat('capabilities'), path);
    expect(p.ground).toBe(DAY_GROUND);
    expect(p.onDark).toBe(false);
  });

  it('is night again at AI — three states across the flow, not two', () => {
    const p = paletteAt(path.tForBeat('ai'), path);
    expect(p.ground).toBe(NIGHT_GROUND);
    expect(p.onDark).toBe(true);
  });

  it('crosses continuously — no jump between adjacent samples anywhere', () => {
    const lum = (hex: string): number => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l;
    let prev = lum(paletteAt(0, path).ground);
    for (let i = 1; i <= 400; i++) {
      const cur = lum(paletteAt(i / 400, path).ground);
      expect(Math.abs(cur - prev)).toBeLessThan(0.05);
      prev = cur;
    }
  });

  it('moves ink with the ground so atmosphere stays legible on both', () => {
    expect(paletteAt(0, path).ink).toBeCloseTo(NIGHT_INK, 6);
    expect(paletteAt(path.tForBeat('capabilities'), path).ink).toBeCloseTo(DAY_INK, 6);
  });

  it('never reports onDark true on a pale ground', () => {
    for (let i = 0; i <= 200; i++) {
      const p = paletteAt(i / 200, path);
      const l = new THREE.Color(p.ground).getHSL({ h: 0, s: 0, l: 0 }).l;
      if (l > 0.5) expect(p.onDark).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-palette.test.ts`
Expected: FAIL — cannot resolve `./about-palette`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/about/about-palette.ts
import * as THREE from 'three';
import type { AboutPath } from './about-path';

/** Near-black. The corridor's default; matches the case study pages' dark ground. */
export const NIGHT_GROUND = '#0b0b0b';
/** Pale. The capabilities beat flips light — spec §Beats 5. */
export const DAY_GROUND = '#fdfdfd';

/**
 * Atmosphere particle ink, per ground. The value shipped hard-coded in
 * atmosphere.ts as 0.07, which is correct on the pale ground it was authored
 * against; on near-black it disappears entirely, so night raises it.
 */
export const DAY_INK = 0.07;
export const NIGHT_INK = 0.82;

export interface AboutPalette {
  /** CSS colour for the page ground. */
  ground: string;
  /** Atmosphere ink, 0..1, fed to the uInk uniform. */
  ink: number;
  /** Whether the cursor should switch to its on-dark treatment. */
  onDark: boolean;
}

/**
 * How much of the beat either side of a flip the crossfade occupies. Kept well
 * inside the beat so the change never coincides with a marker: landing a
 * palette flip exactly on the pose the camera settles at reads as a cut, which
 * is the one thing the spec rules out.
 */
const FADE = 0.6;

const smoothstep = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

const nightC = new THREE.Color(NIGHT_GROUND);
const dayC = new THREE.Color(DAY_GROUND);
const mixed = new THREE.Color();

/**
 * Ground brightness at `t`: 0 = night, 1 = day.
 *
 * Night from the start, up through the client wall; day across capabilities;
 * night again from contact onward. Both transitions are ramps placed in the
 * approach, so the world dims and brightens as a property of position rather
 * than as an event.
 */
function dayAmount(t: number, path: AboutPath): number {
  const wall = path.tForBeat('clientWall');
  const caps = path.tForBeat('capabilities');
  const contact = path.tForBeat('contact');

  const upStart = wall + (caps - wall) * (1 - FADE);
  const downEnd = contact + (path.tForBeat('ai') - contact) * FADE;

  if (t <= upStart) return 0;
  if (t < caps) return smoothstep((t - upStart) / (caps - upStart));
  if (t <= contact) return 1;
  if (t < downEnd) return 1 - smoothstep((t - contact) / (downEnd - contact));
  return 0;
}

export function paletteAt(t: number, path: AboutPath): AboutPalette {
  const d = dayAmount(t, path);
  mixed.copy(nightC).lerp(dayC, d);
  return {
    ground: `#${mixed.getHexString()}`,
    ink: NIGHT_INK + (DAY_INK - NIGHT_INK) * d,
    // Flip the cursor at the midpoint of the crossfade, which is also where the
    // ground crosses mid-grey.
    onDark: d < 0.5,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/about/about-palette.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/about/about-palette.ts src/about/about-palette.test.ts
git commit -m "$(cat <<'EOF'
feat(about): three-state palette interpolated along the path

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 6: Atmosphere ink becomes a uniform

**Files:**
- Modify: `src/three/atmosphere.ts` (the `INK` const at line 13, its use in `FRAG`, the `uniforms` block, and the returned interface)
- Test: `src/three/atmosphere.test.ts` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Atmosphere.setInk(v: number): void`, and `initAtmosphere` keeps its existing signature.

**Why:** the spec calls this out directly — `atmosphere.ts:13` hard-codes `INK = 0.07` into the shader string, so the particles cannot follow the palette onto a dark ground. The default must not change: every existing page renders against the pale ground this value was tuned for.

- [ ] **Step 1: Write the failing test**

```ts
// src/three/atmosphere.test.ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { initAtmosphere } from './atmosphere';

const inkUniform = (a: { object: THREE.Points }): { value: number } =>
  (a.object.material as THREE.ShaderMaterial).uniforms.uInk as { value: number };

describe('initAtmosphere', () => {
  it('defaults to the 0.07 ink every existing page was tuned against', () => {
    const a = initAtmosphere();
    expect(inkUniform(a).value).toBeCloseTo(0.07, 6);
    a.destroy();
  });

  it('exposes ink as a uniform so the palette can drive it', () => {
    const a = initAtmosphere();
    a.setInk(0.82);
    expect(inkUniform(a).value).toBeCloseTo(0.82, 6);
    a.destroy();
  });

  it('clamps out-of-range ink instead of writing an invalid colour', () => {
    const a = initAtmosphere();
    a.setInk(4);
    expect(inkUniform(a).value).toBe(1);
    a.setInk(-1);
    expect(inkUniform(a).value).toBe(0);
    a.destroy();
  });

  it('no longer bakes the ink into the fragment source', () => {
    const a = initAtmosphere();
    const frag = (a.object.material as THREE.ShaderMaterial).fragmentShader;
    expect(frag).toContain('uInk');
    expect(frag).not.toContain('vec3(0.07)');
    a.destroy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/three/atmosphere.test.ts`
Expected: FAIL — `uniforms.uInk` is undefined; `setInk` is not a function.

- [ ] **Step 3: Write minimal implementation**

Four edits to `src/three/atmosphere.ts`:

3a. Replace the constant (line 13) with a documented default:

```ts
/**
 * Particle ink. Tuned against the site's pale ground; the About flow's night
 * palette drives it up through setInk() (about-palette.ts), which is why this
 * is a uniform rather than baked into the shader string as it once was.
 */
const INK_DEFAULT = 0.07;
```

3b. In `FRAG`, declare the uniform and read it:

```glsl
precision highp float;
uniform float uInk;
varying float vDepthFade;
```

and the last line of `main`:

```glsl
  gl_FragColor = vec4(vec3(uInk), alpha);
```

3c. Add it to the `uniforms` block:

```ts
      uCameraZ: { value: 0 },
      uInk: { value: INK_DEFAULT },
```

3d. Add `setInk` to the interface and the returned object:

```ts
export interface Atmosphere {
  object: THREE.Points;
  update(dt: number, velocity: number, cameraZ: number): void;
  /** 0..1 particle ink; clamped. Driven by the About palette. */
  setInk(v: number): void;
  destroy(): void;
}
```

```ts
    setInk(v: number): void {
      material.uniforms.uInk.value = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : INK_DEFAULT;
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/three/atmosphere.test.ts && npx vitest run && npx tsc --noEmit`
Expected: 4 new tests pass; full suite 500 passed / 2 skipped; tsc silent.

- [ ] **Step 5: Commit**

```bash
git add src/three/atmosphere.ts src/three/atmosphere.test.ts
git commit -m "$(cat <<'EOF'
refactor(atmosphere): hoist the baked INK constant into a uInk uniform

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 7: Suspend the director, and give the world an About mode

**Files:**
- Modify: `src/three/camera-director.ts` (the `CameraDirector` interface, and `update`)
- Modify: `src/three/world.ts` (the `WorldLayer` interface, and the anchoring/materialize pass in `update`)
- Test: `src/three/camera-director.test.ts` (extend), `src/three/world-about-mode.test.ts` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `CameraDirector.setSuspended(v: boolean): void`, `WorldLayer.setAboutMode(v: boolean): void`.

**Why two changes in one task:** they are the same deliverable — "the world stops behaving like a spine" — and neither is independently reviewable. Suspending the director without hiding the screens leaves them materializing beside the corridor; hiding them without suspending the director leaves two writers fighting over `camera.position`.

- [ ] **Step 1: Write the failing tests**

Append to `src/three/camera-director.test.ts`:

```ts
describe('setSuspended', () => {
  it('stops writing the camera so another controller can own it', () => {
    const camera = new THREE.PerspectiveCamera();
    const director = initCameraDirector(camera, DESTINATIONS, {});
    director.update(0.016);
    director.setSuspended(true);
    camera.position.set(1, 2, 3);
    director.feedScroll(500);
    director.update(0.016);
    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    director.destroy();
  });

  it('resumes from wherever it left off, without a jump', () => {
    const camera = new THREE.PerspectiveCamera();
    const director = initCameraDirector(camera, DESTINATIONS, {});
    director.jumpTo('about');
    const z = camera.position.z;
    director.setSuspended(true);
    director.update(0.016);
    director.setSuspended(false);
    director.update(0.016);
    expect(camera.position.z).toBeCloseTo(z, 6);
    director.destroy();
  });

  it('swallows scroll while suspended rather than banking momentum', () => {
    // Without this, every wheel event during the About scrub accumulates
    // velocity that fires the instant the corridor is exited.
    const camera = new THREE.PerspectiveCamera();
    const director = initCameraDirector(camera, DESTINATIONS, {});
    director.jumpTo('about');
    const z = camera.position.z;
    director.setSuspended(true);
    for (let i = 0; i < 40; i++) director.feedScroll(400);
    director.setSuspended(false);
    director.update(0.016);
    expect(camera.position.z).toBeCloseTo(z, 3);
    director.destroy();
  });
});
```

Create `src/three/world-about-mode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { initWorld } from './world';

describe('world about mode', () => {
  it('hides the spine dressing so screens do not float beside the corridor', () => {
    const world = initWorld({ reducedMotion: true });
    world.setAboutMode(true);
    world.camera.position.set(0, 31, -120); // up on the mezzanine, off the spine
    world.update?.(0.016);
    expect(world.anchoredVisibleCount()).toBe(0);
    world.destroy();
  });

  it('restores them on exit', () => {
    const world = initWorld({ reducedMotion: true });
    world.setAboutMode(true);
    world.update?.(0.016);
    world.setAboutMode(false);
    world.camera.position.set(0, 0, -86);
    world.update?.(0.016);
    expect(world.anchoredVisibleCount()).toBeGreaterThan(0);
    world.destroy();
  });

  it('freezes re-anchoring while on, so nothing snaps when the camera climbs', () => {
    const world = initWorld({ reducedMotion: true });
    world.camera.position.set(0, 0, -86);
    world.update?.(0.016);
    const before = world.anchoredPositionsZ();
    world.setAboutMode(true);
    world.camera.position.set(0, 31, -130);
    world.update?.(0.016);
    expect(world.anchoredPositionsZ()).toEqual(before);
    world.destroy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/three/camera-director.test.ts src/three/world-about-mode.test.ts`
Expected: FAIL — `setSuspended`, `setAboutMode`, `anchoredVisibleCount` and `anchoredPositionsZ` are not functions.

- [ ] **Step 3: Write minimal implementation**

3a. `camera-director.ts` — add to the interface:

```ts
  /**
   * Hand the camera to another controller (the About scrub). While suspended,
   * update() writes nothing and scroll is swallowed — banking momentum through
   * a scrub of several thousand pixels would fire the whole lot on exit.
   */
  setSuspended(v: boolean): void;
```

Add the state, near `let mode: Mode = 'free';`:

```ts
  let suspended = false;
```

Guard `feedScroll` — first line of the method:

```ts
      if (suspended) return;
```

Guard `update` — first line of the method:

```ts
      if (suspended) return;
```

Implement it in the returned object:

```ts
    setSuspended(v: boolean): void {
      if (v === suspended) return;
      suspended = v;
      if (v) {
        // Park cleanly rather than leaving a tween writing the camera behind
        // the scrub's back.
        killSettle();
        lateralTween?.kill();
        lateralTween = null;
        velocity = 0;
        mode = 'free';
      }
    },
```

3b. `world.ts` — add to `WorldLayer`:

```ts
  /** Freeze spine re-anchoring and hide the anchored screens (About corridor). */
  setAboutMode(v: boolean): void;
  /** Test seam: how many anchored roots are currently visible. */
  anchoredVisibleCount(): number;
  /** Test seam: the anchored roots' current z positions, in declaration order. */
  anchoredPositionsZ(): number[];
```

Add the state next to `let velocitySource`:

```ts
  let aboutMode = false;
```

In `update`, wrap the two passes. The re-anchor loop and the materialize loop both become no-ops while on:

```ts
      if (!aboutMode) {
        for (const s of anchored) {
          if (s.root === homeMock && s.root.visible) continue;
          s.root.position.z = nearestWrapped(s.anchorZ, camera.position.z);
        }
        for (const s of anchored) {
          if (s.root === homeMock) continue;
          const dist = Math.abs(camera.position.z - s.root.position.z);
          const a = materializeAmount(dist);
          s.root.visible = a > 0.01;
          const sc = 1 - MATERIALIZE_SCALE * (1 - a);
          s.root.scale.setScalar(sc);
          s.setFade(a);
        }
      }
      atmosphere.update(dt, velocitySource(), camera.position.z);
```

And in the returned object:

```ts
    setAboutMode(v: boolean): void {
      if (v === aboutMode) return;
      aboutMode = v;
      if (v) {
        // Hidden outright, not faded. The corridor climbs 31 units off the
        // spine, where materializeAmount's z-only distance is meaningless — a
        // screen 4 units away in z but 31 away in y would fade in at full
        // strength beside you.
        for (const s of anchored) {
          s.root.visible = false;
          s.setFade(0);
        }
      }
      // Exiting needs no restore pass: the next update() re-anchors and
      // re-fades every root from the camera's actual position.
    },
    anchoredVisibleCount(): number {
      return anchored.filter((s) => s.root.visible).length;
    },
    anchoredPositionsZ(): number[] {
      return anchored.map((s) => s.root.position.z);
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/three/camera-director.test.ts src/three/world-about-mode.test.ts && npx vitest run && npx tsc --noEmit`
Expected: 6 new tests pass; full suite green; tsc silent.

- [ ] **Step 5: Commit**

```bash
git add src/three/camera-director.ts src/three/camera-director.test.ts src/three/world.ts src/three/world-about-mode.test.ts
git commit -m "$(cat <<'EOF'
feat(world): suspendable director and an About mode that stops spine dressing

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 8: The third scroll mode

**Files:**
- Modify: `src/home/scroll-nav.ts`
- Test: `src/home/scroll-nav.test.ts` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ScrollMode` gains `'about'`.

**Why a mode rather than reusing `'takeover'`:** `'takeover'` means "the world is covered, ignore the wheel entirely." About means "the wheel belongs to the document, and the document drives the camera." `main.ts` reads the same value to gate the arrow keys, so collapsing them would make arrow-key navigation fly the camera off the corridor mid-scrub.

- [ ] **Step 1: Write the failing test**

```ts
// src/home/scroll-nav.test.ts
import { describe, expect, it, vi } from 'vitest';
import { initScrollNav } from './scroll-nav';

const wheel = (deltaY: number): void => {
  window.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaMode: 0 }));
};

describe('initScrollNav', () => {
  it('feeds the director in world mode', () => {
    const onDelta = vi.fn();
    const nav = initScrollNav(onDelta);
    wheel(120);
    expect(onDelta).toHaveBeenCalledWith(120);
    nav.destroy();
  });

  it('swallows the wheel in takeover mode', () => {
    const onDelta = vi.fn();
    const nav = initScrollNav(onDelta);
    nav.setMode('takeover');
    wheel(120);
    expect(onDelta).not.toHaveBeenCalled();
    nav.destroy();
  });

  it('swallows the wheel in about mode — the document owns it there', () => {
    const onDelta = vi.fn();
    const nav = initScrollNav(onDelta);
    nav.setMode('about');
    wheel(120);
    expect(onDelta).not.toHaveBeenCalled();
    nav.destroy();
  });

  it('resumes feeding when the mode returns to world', () => {
    const onDelta = vi.fn();
    const nav = initScrollNav(onDelta);
    nav.setMode('about');
    wheel(120);
    nav.setMode('world');
    wheel(120);
    expect(onDelta).toHaveBeenCalledTimes(1);
    nav.destroy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/home/scroll-nav.test.ts`
Expected: FAIL — `Argument of type '"about"' is not assignable to parameter of type 'ScrollMode'`.

- [ ] **Step 3: Write minimal implementation**

One edit in `src/home/scroll-nav.ts`:

```ts
/**
 * 'world'    — the wheel drives the camera director along the spine.
 * 'takeover' — a 2D page covers the world; the wheel belongs to that page.
 * 'about'    — the About corridor; the scrolling document owns the wheel and
 *              drives the camera itself through about-flow.ts. Distinct from
 *              'takeover' because main.ts reads this same value to gate arrow
 *              -key navigation, which must not fly the camera off the corridor
 *              mid-scrub.
 */
export type ScrollMode = 'world' | 'takeover' | 'about';
```

The existing `if (mode !== 'world') return;` already does the right thing for the new value.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/home/scroll-nav.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/home/scroll-nav.ts src/home/scroll-nav.test.ts
git commit -m "$(cat <<'EOF'
feat(scroll-nav): add the 'about' mode where the document owns the wheel

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 9: The scrolling document shell

**Files:**
- Create: `src/about/about-document.ts`
- Create: `src/styles/about.css`
- Test: `src/about/about-document.test.ts`

**Interfaces:**
- Consumes: `AboutPath` (Task 3); `documentHeightFor` (Task 4); `BeatId`, `ABOUT_MARKERS` (Task 2).
- Produces: `interface AboutDocument { root: HTMLElement; sectionFor(id: BeatId): HTMLElement; resize(viewportH: number): void; destroy(): void }`, `mountAboutDocument(parent: HTMLElement, path: AboutPath, viewportH: number): AboutDocument`.

**What this is and is not:** it is the scrollbar. Real DOM sections, one per beat, sized so the whole document is `documentHeightFor(path, viewportH)` tall, each carrying a landmark and a heading so the page reads in order with the canvas gone. It is **not** beat content — sections are empty containers that later plans fill.

- [ ] **Step 1: Write the failing test**

```ts
// src/about/about-document.test.ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildAboutPath } from './about-path';
import { documentHeightFor } from './about-scrub';
import { ABOUT_MARKERS } from './about-markers';
import { mountAboutDocument } from './about-document';

const path = buildAboutPath(new THREE.Vector3(0, 0, -86));

const mount = (h = 1000) => {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return { parent, doc: mountAboutDocument(parent, path, h) };
};

describe('mountAboutDocument', () => {
  it('mounts one section per beat, in path order', () => {
    const { doc, parent } = mount();
    const ids = [...doc.root.querySelectorAll('[data-beat]')].map((s) => s.getAttribute('data-beat'));
    expect(ids).toEqual(ABOUT_MARKERS.map((m) => m.id));
    doc.destroy();
    parent.remove();
  });

  it('is exactly as tall as the path pacing asks for', () => {
    const { doc, parent } = mount(1000);
    const total = ABOUT_MARKERS.reduce(
      (sum, m) => sum + parseFloat(doc.sectionFor(m.id).style.height),
      0,
    );
    expect(total).toBeCloseTo(documentHeightFor(path, 1000), 0);
    doc.destroy();
    parent.remove();
  });

  it('gives each beat a share of the height proportional to its span on the path', () => {
    const { doc, parent } = mount(1000);
    const h = (i: number): number => parseFloat(doc.sectionFor(ABOUT_MARKERS[i].id).style.height);
    const span = (i: number): number =>
      path.tForBeat(ABOUT_MARKERS[i + 1].id) - path.tForBeat(ABOUT_MARKERS[i].id);
    // capabilities->contact is a longer stretch of path than lander->team, so
    // it must be a taller section, or the scrub would race through it.
    expect(span(5) > span(2)).toBe(true);
    expect(h(5)).toBeGreaterThan(h(2));
    doc.destroy();
    parent.remove();
  });

  it('re-sizes every section when the viewport changes', () => {
    const { doc, parent } = mount(1000);
    const before = parseFloat(doc.sectionFor('lander').style.height);
    doc.resize(2000);
    expect(parseFloat(doc.sectionFor('lander').style.height)).toBeCloseTo(before * 2, 0);
    doc.destroy();
    parent.remove();
  });

  it('reads as a document with the canvas gone — landmark plus a heading per beat', () => {
    const { doc, parent } = mount();
    expect(doc.root.tagName).toBe('MAIN');
    for (const m of ABOUT_MARKERS) {
      expect(doc.sectionFor(m.id).querySelector('h2')).not.toBeNull();
    }
    doc.destroy();
    parent.remove();
  });

  it('removes itself cleanly', () => {
    const { doc, parent } = mount();
    doc.destroy();
    expect(parent.querySelector('main')).toBeNull();
    parent.remove();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-document.test.ts`
Expected: FAIL — cannot resolve `./about-document`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/about/about-document.ts
import '../styles/about.css';
import { ABOUT_MARKERS, type BeatId } from './about-markers';
import type { AboutPath } from './about-path';
import { documentHeightFor } from './about-scrub';

/**
 * The About corridor's scrollbar.
 *
 * The camera is driven by scroll offset, so something has to be scrollable. It
 * is a real document rather than a synthetic scroll accumulator for two
 * reasons the spec is explicit about: the copy has to be selectable and read in
 * order with the canvas gone, and reduced motion is then almost free — it is
 * simply what remains when the canvas is removed.
 *
 * Sections are EMPTY. This module owns the scroll geometry and nothing else;
 * beat content arrives in later plans and mounts into sectionFor(id).
 */

/** Heading per beat. Placeholder copy — Adam is rewriting all of it. */
const HEADINGS: Record<BeatId, string> = {
  anchor: 'About',
  transition: 'About',
  lander: 'We are digital nomads',
  team: 'The team',
  clientWall: 'Selected clients',
  capabilities: 'What we do',
  contact: 'Start a project',
  ai: 'On AI',
};

export interface AboutDocument {
  root: HTMLElement;
  sectionFor(id: BeatId): HTMLElement;
  resize(viewportH: number): void;
  destroy(): void;
}

export function mountAboutDocument(
  parent: HTMLElement,
  path: AboutPath,
  viewportH: number,
): AboutDocument {
  const root = document.createElement('main');
  root.className = 'about-doc';

  const sections = new Map<BeatId, HTMLElement>();
  for (const m of ABOUT_MARKERS) {
    const section = document.createElement('section');
    section.className = 'about-beat';
    section.dataset.beat = m.id;
    const h = document.createElement('h2');
    h.className = 'about-beat-heading';
    h.textContent = HEADINGS[m.id];
    section.appendChild(h);
    sections.set(m.id, section);
    root.appendChild(section);
  }

  /**
   * Height per beat, proportional to that beat's span of the path.
   *
   * This is what keeps scroll and camera in step: a beat covering a long
   * stretch of path needs a correspondingly tall section, or the camera races
   * through it while the reader is still on the first paragraph. The last beat
   * has no successor, so it gets one viewport — enough to come to rest on.
   */
  const layout = (h: number): void => {
    const total = documentHeightFor(path, h);
    const scrubbable = total - h;
    for (let i = 0; i < ABOUT_MARKERS.length; i++) {
      const id = ABOUT_MARKERS[i].id;
      const last = i === ABOUT_MARKERS.length - 1;
      const span = last ? 0 : path.tForBeat(ABOUT_MARKERS[i + 1].id) - path.tForBeat(id);
      const px = last ? h : span * scrubbable;
      sections.get(id)!.style.height = `${px}px`;
    }
  };

  layout(viewportH);
  parent.appendChild(root);

  return {
    root,
    sectionFor(id: BeatId): HTMLElement {
      return sections.get(id)!;
    },
    resize(h: number): void {
      layout(h);
    },
    destroy(): void {
      root.remove();
      sections.clear();
    },
  };
}
```

```css
/* src/styles/about.css
 * The About corridor's scrolling document.
 *
 * The canvas is fixed behind this and the camera is driven by how far this has
 * scrolled, so the layout rule that matters most is the boring one: sections
 * are sized in px from about-document.ts, never by their content. Content that
 * grew a section taller than its path span would desynchronise scroll from
 * camera, which reads as the corridor lurching.
 */

.about-doc {
  position: relative;
  z-index: 1;               /* above #world (0), below .ferro-stage (25) */
  margin: 0;
  padding: 0;
}

.about-beat {
  position: relative;
  /* height is written per-beat in px by about-document.ts — do not set it here */
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
}

.about-beat-heading {
  margin: 0;
  font: inherit;
  /* Placeholder until each beat's own plan dresses it. Visible on purpose:
   * the spine's whole deliverable is being able to see where you are in the
   * corridor while scrolling it. */
  opacity: 0.5;
}

/* Reduced motion: no canvas, so the document is all there is. Sections stop
 * being scroll geometry and collapse to their content. */
@media (prefers-reduced-motion: reduce) {
  .about-beat {
    height: auto !important;
    min-height: 0;
    padding: 4rem 0;
    display: block;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/about/about-document.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/about/about-document.ts src/about/about-document.test.ts src/styles/about.css
git commit -m "$(cat <<'EOF'
feat(about): the scrolling document that gives the corridor its scrollbar

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 10: The controller

**Files:**
- Create: `src/about/about-flow.ts`
- Test: `src/about/about-flow.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:

```ts
export interface AboutFlowDeps {
  camera: THREE.PerspectiveCamera;
  director: { setSuspended(v: boolean): void };
  world: { setAboutMode(v: boolean): void };
  atmosphere: { setInk(v: number): void };
  scrollNav: { setMode(m: 'world' | 'takeover' | 'about'): void } | null;
  ferro: { placeAt(rect: { x: number; y: number; w: number; h: number }, opts?: { instant?: boolean }): Promise<void>; show(): void; hide(): void } | null;
  ferroEl: HTMLElement | null;
  cursor: { setOnDark(v: boolean): void } | null;
  setGround(css: string): void;
  reducedMotion: boolean;
}
export interface AboutFlow {
  enter(parent: HTMLElement): void;
  exit(): void;
  isOpen(): boolean;
  /** Test/debug seam: the current path parameter. */
  t(): number;
  destroy(): void;
}
export function initAboutFlow(deps: AboutFlowDeps): AboutFlow;
```

**The ferro rect (D4):** centred, square, side = `min(vw, vh) * FERRO_FRACTION`, interpolated per beat. `placeAt` is called only when the beat changes, not per frame — the blob's own drift carries the motion between beats, and calling `placeAt` every frame would fight it.

**The z-flip (spec layer stack):** `.ferro-stage` toggles `.ferro-stage--behind` (z-index 0, below the document's z-index 1) on beats where the blob must not cross the type. Beats where it crosses: `lander`, `team`, `ai`. Beats where it sits behind: `clientWall`, `capabilities`, `contact`.

- [ ] **Step 1: Write the failing test**

```ts
// src/about/about-flow.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { initAboutFlow, type AboutFlowDeps } from './about-flow';

const makeDeps = (over: Partial<AboutFlowDeps> = {}): AboutFlowDeps => ({
  camera: new THREE.PerspectiveCamera(),
  director: { setSuspended: vi.fn() },
  world: { setAboutMode: vi.fn() },
  atmosphere: { setInk: vi.fn() },
  scrollNav: { setMode: vi.fn() },
  ferro: { placeAt: vi.fn().mockResolvedValue(undefined), show: vi.fn(), hide: vi.fn() },
  ferroEl: document.createElement('div'),
  cursor: { setOnDark: vi.fn() },
  setGround: vi.fn(),
  reducedMotion: false,
  ...over,
});

let parent: HTMLElement;
beforeEach(() => {
  parent = document.createElement('div');
  document.body.appendChild(parent);
});

describe('initAboutFlow', () => {
  it('takes the camera off the director and stops the spine dressing on enter', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    expect(deps.director.setSuspended).toHaveBeenCalledWith(true);
    expect(deps.world.setAboutMode).toHaveBeenCalledWith(true);
    expect(deps.scrollNav!.setMode).toHaveBeenCalledWith('about');
    flow.destroy();
  });

  it('gives all three back on exit', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.exit();
    expect(deps.director.setSuspended).toHaveBeenLastCalledWith(false);
    expect(deps.world.setAboutMode).toHaveBeenLastCalledWith(false);
    expect(deps.scrollNav!.setMode).toHaveBeenLastCalledWith('world');
    expect(flow.isOpen()).toBe(false);
    flow.destroy();
  });

  it('lands the camera on the start of the path, level, before the first paint', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    expect(flow.t()).toBe(0);
    expect(deps.camera.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 6);
    flow.destroy();
  });

  it('drives the camera from the document scroll offset', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    const zStart = deps.camera.position.z;
    // jsdom reports zero-size elements; drive the seam directly.
    flow.setScrollForTest(0.5);
    expect(flow.t()).toBeCloseTo(0.5, 6);
    expect(deps.camera.position.z).toBeLessThan(zStart);
    expect(deps.camera.position.y).toBeGreaterThan(0);
    flow.destroy();
  });

  it('applies the palette as it goes — ground, ink and cursor together', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    (deps.setGround as ReturnType<typeof vi.fn>).mockClear();
    flow.setScrollForTest(1);
    expect(deps.setGround).toHaveBeenCalled();
    expect(deps.atmosphere.setInk).toHaveBeenCalled();
    expect(deps.cursor!.setOnDark).toHaveBeenCalledWith(true);
    flow.destroy();
  });

  it('places the ferro once per beat, not once per frame', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    const calls = () => (deps.ferro!.placeAt as ReturnType<typeof vi.fn>).mock.calls.length;
    const afterEnter = calls();
    flow.setScrollForTest(0.201);
    flow.setScrollForTest(0.202);
    flow.setScrollForTest(0.203);
    expect(calls()).toBeLessThanOrEqual(afterEnter + 1);
    flow.destroy();
  });

  it('flips the ferro behind the document on beats where it must not cross the type', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0); // anchor/lander region — in front
    expect(deps.ferroEl!.classList.contains('ferro-stage--behind')).toBe(false);
    flow.setScrollForTest(0.78); // capabilities region — behind
    expect(deps.ferroEl!.classList.contains('ferro-stage--behind')).toBe(true);
    flow.destroy();
  });

  it('under reduced motion mounts the document and touches neither camera nor ferro', () => {
    const deps = makeDeps({ reducedMotion: true });
    const flow = initAboutFlow(deps);
    const before = deps.camera.position.clone();
    flow.enter(parent);
    expect(parent.querySelector('main.about-doc')).not.toBeNull();
    expect(deps.camera.position.equals(before)).toBe(true);
    expect(deps.ferro!.show).not.toHaveBeenCalled();
    flow.destroy();
  });

  it('survives null ferro, null cursor and null scrollNav', () => {
    const deps = makeDeps({ ferro: null, ferroEl: null, cursor: null, scrollNav: null });
    const flow = initAboutFlow(deps);
    expect(() => {
      flow.enter(parent);
      flow.setScrollForTest(0.5);
      flow.exit();
    }).not.toThrow();
    flow.destroy();
  });

  it('is idempotent — entering twice does not mount two documents', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.enter(parent);
    expect(parent.querySelectorAll('main.about-doc')).toHaveLength(1);
    flow.destroy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-flow.test.ts`
Expected: FAIL — cannot resolve `./about-flow`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/about/about-flow.ts
import * as THREE from 'three';
import { DESTINATIONS } from '../three/world';
import { mountAboutDocument, type AboutDocument } from './about-document';
import { buildAboutPath, type AboutPath, type CameraPose } from './about-path';
import { paletteAt } from './about-palette';
import { beatAt, scrollToT } from './about-scrub';
import type { BeatId } from './about-markers';

/**
 * The About corridor's controller — the only stateful module in src/about/.
 *
 * It owns three things and delegates everything else: the scroll binding, the
 * per-frame write onto the world camera, and the enter/exit handover. All the
 * maths lives in the pure modules beside it.
 *
 * Handover, not replacement. camera-director keeps its state and is merely
 * suspended, so leaving the corridor returns the site's zoom grammar exactly as
 * it was rather than rebuilding it.
 */

/** Beats where the blob passes IN FRONT of the copy. Everything else is behind. */
const IN_FRONT: ReadonlySet<BeatId> = new Set<BeatId>(['anchor', 'transition', 'lander', 'team', 'ai']);

/** Blob size as a fraction of the viewport's smaller dimension. */
const FERRO_FRACTION = 0.42;

export interface AboutFlowDeps {
  camera: THREE.PerspectiveCamera;
  director: { setSuspended(v: boolean): void };
  world: { setAboutMode(v: boolean): void };
  atmosphere: { setInk(v: number): void };
  scrollNav: { setMode(m: 'world' | 'takeover' | 'about'): void } | null;
  ferro: {
    placeAt(rect: { x: number; y: number; w: number; h: number }, opts?: { instant?: boolean }): Promise<void>;
    show(): void;
    hide(): void;
  } | null;
  ferroEl: HTMLElement | null;
  cursor: { setOnDark(v: boolean): void } | null;
  setGround(css: string): void;
  reducedMotion: boolean;
}

export interface AboutFlow {
  enter(parent: HTMLElement): void;
  exit(): void;
  isOpen(): boolean;
  t(): number;
  /**
   * Drive the scrub directly, bypassing the DOM.
   *
   * jsdom gives every element a zero-height box, so a scroll-driven controller
   * cannot be tested through real scroll events. This is also what `?debug-about`
   * uses to step the corridor in an occluded automation tab, where no rAF ticks
   * — the same reason the ferro exposes step(dt).
   */
  setScrollForTest(t: number): void;
  destroy(): void;
}

export function initAboutFlow(deps: AboutFlowDeps): AboutFlow {
  const aboutRest = DESTINATIONS.find((d) => d.id === 'about')!.cameraZ;
  const path: AboutPath = buildAboutPath(new THREE.Vector3(0, 0, aboutRest));
  const pose: CameraPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

  let doc: AboutDocument | null = null;
  let open = false;
  let t = 0;
  let lastBeat: BeatId | null = null;

  const centredRect = (): { x: number; y: number; w: number; h: number } => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const side = Math.min(vw, vh) * FERRO_FRACTION;
    return { x: (vw - side) / 2, y: (vh - side) / 2, w: side, h: side };
  };

  const applyBeat = (beat: BeatId): void => {
    if (beat === lastBeat) return;
    lastBeat = beat;
    // Once per beat, never per frame: placeAt tweens, and re-issuing it every
    // frame restarts that tween and fights the blob's own drift.
    void deps.ferro?.placeAt(centredRect());
    deps.ferroEl?.classList.toggle('ferro-stage--behind', !IN_FRONT.has(beat));
  };

  const apply = (next: number): void => {
    t = next;
    path.sample(t, pose);
    deps.camera.position.copy(pose.position);
    deps.camera.quaternion.copy(pose.quaternion);

    const palette = paletteAt(t, path);
    deps.setGround(palette.ground);
    deps.atmosphere.setInk(palette.ink);
    deps.cursor?.setOnDark(palette.onDark);

    applyBeat(beatAt(t, path));
  };

  const onScroll = (): void => {
    if (!open || deps.reducedMotion) return;
    apply(
      scrollToT(
        window.scrollY,
        document.documentElement.scrollHeight,
        window.innerHeight,
      ),
    );
  };

  const onResize = (): void => {
    if (!open) return;
    doc?.resize(window.innerHeight);
    if (!deps.reducedMotion) {
      onScroll();
      if (lastBeat) void deps.ferro?.placeAt(centredRect(), { instant: true });
    }
  };

  return {
    enter(parent: HTMLElement): void {
      if (open) return;
      open = true;
      doc = mountAboutDocument(parent, path, window.innerHeight);
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize);

      if (deps.reducedMotion) {
        // No camera, no WebGL beats — the document is the whole experience.
        // Deliberately does NOT suspend the director or hide the world: under
        // reduced motion the canvas is not animating anyway, and leaving the
        // world alone keeps exit trivially correct.
        return;
      }

      deps.director.setSuspended(true);
      deps.world.setAboutMode(true);
      deps.scrollNav?.setMode('about');
      deps.ferro?.show();
      lastBeat = null;
      // Position before the first paint: the camera must already be on the
      // corridor when the next frame renders, not one frame behind it.
      apply(0);
    },

    exit(): void {
      if (!open) return;
      open = false;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      doc?.destroy();
      doc = null;
      lastBeat = null;
      t = 0;
      if (deps.reducedMotion) return;
      deps.ferro?.hide();
      deps.ferroEl?.classList.remove('ferro-stage--behind');
      deps.scrollNav?.setMode('world');
      deps.world.setAboutMode(false);
      // Released LAST: the director resumes writing the camera from here, and
      // it must not do so while the world is still in About mode.
      deps.director.setSuspended(false);
    },

    isOpen: () => open,
    t: () => t,
    setScrollForTest(next: number): void {
      if (!open || deps.reducedMotion) return;
      apply(Math.min(1, Math.max(0, next)));
    },
    destroy(): void {
      if (open) this.exit();
    },
  };
}
```

Add the z-flip class to `src/styles/ferro.css`:

```css
/* About corridor: the blob drops behind the scrolling document on beats where
 * it must not cross the type (about-flow.ts, IN_FRONT). Beats are discrete
 * scroll ranges and the blob is far from the copy at every boundary, so this
 * swaps invisibly — no crossfade needed. */
.ferro-stage--behind {
  z-index: 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/about/about-flow.test.ts && npx vitest run && npx tsc --noEmit`
Expected: 10 new tests pass; full suite green; tsc silent.

- [ ] **Step 5: Commit**

```bash
git add src/about/about-flow.ts src/about/about-flow.test.ts src/styles/ferro.css
git commit -m "$(cat <<'EOF'
feat(about): the corridor controller — scroll binding, camera drive, handover

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 11: Wire it into the app

**Files:**
- Modify: `src/main.ts`
- Modify: `src/three/world.ts` (expose the atmosphere handle)
- Test: manual, in a foreground browser — plus the full suite staying green

**Interfaces:**
- Consumes: `initAboutFlow` (Task 10).
- Produces: `WorldLayer.atmosphere: { setInk(v: number): void }`.

**Integration points, in `main.ts`:**

| Where | What |
|---|---|
| `activateAbout()` (~line 574) | Replace the `openAbout()` / `router.navigate('about')` branch with: fly to About rest, then `aboutFlow.enter(document.body)`. |
| `director.onArrive` handler (~line 747) | On arriving at `'about'`, enter the flow. This is what makes an `/about` deep link and a nav click take the same route. |
| The boot block (~line 795) | If `bootDest === 'about'`, `director.jumpTo('about')` then `aboutFlow.enter(...)` — no fly-in on a deep link. |
| Every other `activate*` | Call `aboutFlow.exit()` first. Leaving the corridor by any route must restore the director. |
| `stage.onFrame` | Nothing. The corridor is scroll-driven, not time-driven; the camera is written on scroll, and `stage`'s own loop renders it. |

- [ ] **Step 1: Expose the atmosphere handle from the world**

In `world.ts`, add to `WorldLayer`:

```ts
  /** The atmosphere layer, for palette-driven ink (about-palette.ts). */
  atmosphere: { setInk(v: number): void };
```

and to the returned object, beside `camera`:

```ts
    atmosphere,
```

- [ ] **Step 2: Build the flow in `main.ts`**

After `ferro = initFerro({ reducedMotion });` (~line 790), and after `cursor`, `world`, `director` and `scrollNav` all exist:

```ts
    const aboutFlow = initAboutFlow({
      camera: world.camera,
      director,
      world,
      atmosphere: world.atmosphere,
      scrollNav,
      ferro,
      ferroEl: ferroStageEl,
      cursor,
      setGround: (css) => {
        document.documentElement.style.setProperty('--ground', css);
      },
      reducedMotion,
    });
```

- [ ] **Step 3: Route into it**

Replace `activateAbout`:

```ts
    const activateAbout = (): void => {
      if (takeover.isOpen() || aboutFlow.isOpen()) return;
      if (Math.abs(wrapDelta(aboutRest, world.camera.position.z)) < ABOUT_REST_EPS) {
        aboutFlow.enter(document.body);
      } else {
        // The flow is entered by the onArrive handler once the camera lands —
        // entering here would start the scrub while the flight is still writing
        // the camera, and the two would fight for a full two seconds.
        router.navigate('about');
      }
    };
```

In the `director.onArrive((id) => { ... })` handler:

```ts
      if (id === 'about' && !takeover.isOpen()) aboutFlow.enter(document.body);
```

And leave the corridor from anywhere else — add as the first line of `activateWork`, `activateContact`, `activateHome` and the case-study opener:

```ts
    aboutFlow.exit();
```

- [ ] **Step 4: Add the ground variable**

In `src/styles/base.css`, beside the existing root custom properties:

```css
  /* Page ground. The About corridor drives this per-beat from about-palette.ts;
   * everything else leaves it at the site default. */
  --ground: #fdfdfd;
```

and make the body use it:

```css
body {
  background: var(--ground);
}
```

- [ ] **Step 5: Verify**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: full suite green (~510 passed / 2 skipped), tsc silent, build clean.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/three/world.ts src/styles/base.css
git commit -m "$(cat <<'EOF'
feat(about): route /about into the corridor and hand the camera over

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 12: Retire the placeholder About takeover

**Files:**
- Delete: `src/page2d/about.ts`
- Modify: `src/main.ts` (`openAbout` and its lazy import)
- Modify: `src/styles/page2d.css` (drop `.about-*` rules)

**Do this last, not first.** Until Task 11 lands, `page2d/about.ts` is the only working `/about`; deleting it earlier leaves the site with a dead route through several commits.

- [ ] **Step 1: Find every reference**

Run: `grep -rn "page2d/about\|openAbout\|about-stack\|about-services\|about-service\b" src/`
Expected: hits in `main.ts` (the lazy import and `openAbout`), `page2d/about.ts` itself, and `.about-*` blocks in `page2d.css`.

- [ ] **Step 2: Remove them**

Delete `src/page2d/about.ts`. Delete `openAbout` and its dynamic import from `main.ts`. Delete the `.about-stack`, `.about-services`, `.about-service` and sibling rules from `page2d.css` — leave everything else in that file alone, it dresses the case study and contact pages.

- [ ] **Step 3: Verify nothing else referenced it**

Run: `grep -rn "page2d/about\|openAbout" src/`
Expected: no output.

- [ ] **Step 4: Verify the suite and the build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: green, silent, clean.

- [ ] **Step 5: Commit**

```bash
git add -A src/page2d src/main.ts src/styles/page2d.css
git commit -m "$(cat <<'EOF'
refactor(about): retire the placeholder takeover, superseded by the corridor

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 13: Adam's in-browser check

**Files:** none — this is the gate the tests cannot be.

Automation cannot verify this flow: occluded tabs get no rAF and CSS transitions stick at their start value. The `setScrollForTest` seam steps the corridor without a frame loop, which proves the maths, not the feel.

- [ ] **Step 1: Serve it**

Run: `npm run dev`

- [ ] **Step 2: Adam checks, in a FOREGROUND window, hard-reloaded**

- [ ] `/about` deep link lands at the top of the corridor, camera level, no flight
- [ ] Clicking About from the world flies in, then the scrub takes over with no jolt at the handover
- [ ] Scrolling runs the whole corridor: forward, pitch up, climb, level off, forward again
- [ ] Scrolling back up retraces it exactly — free scrub is reversible
- [ ] No Work or Contact screen ever appears beside the corridor
- [ ] The ground dims and brightens continuously; the flip at capabilities never reads as a cut
- [ ] Atmosphere particles stay visible on both the pale and the near-black ground
- [ ] The blob sits centred and crosses in front of the copy only where it should
- [ ] Leaving About (back button, nav, logo) restores normal scroll-to-fly immediately
- [ ] No banked momentum fires on exit after a long scrub

- [ ] **Step 3: Record the verdict**

Update the memory note `commms_contact_ferro.md`'s sibling — or write a new `commms_about_flow.md` — with what Adam confirmed and what he wants retuned. `WORLD_UNITS_PER_VIEWPORT` (pacing) and `FERRO_FRACTION` (blob size) are the two dials most likely to move.

---

## Self-review

**Spec coverage — the spine's share of the spec:**

| Spec section | Task |
|---|---|
| Architecture — world not reloaded | 7 (About mode), 11 (wiring) |
| Architecture — layer stack, ferro z-flip per beat | 10 |
| Scroll model — free scrub, 1:1, no snapping | 4, 10 |
| Camera — `t → {position, quaternion}` interface | 3 |
| Camera — measured marker table, Blender→Three axes | 1, 2 |
| Beat 1 — transition, pitch to vertical, `/about` deep link | 3, 11 |
| Palette — three states, continuous dim | 5, 10 |
| Palette — `atmosphere.ts:13` INK must become a uniform | 6 |
| Palette — `Cursor.setOnDark()` hook | 5, 10 |
| Reduced motion — same document, no camera, no WebGL | 9 (CSS), 10 |
| Accessibility — live DOM, reads in order | 9 |
| Reuse — retire `src/page2d/about.ts` | 12 |
| Verification — suite stays green, feel checked by Adam | Global constraints, 13 |
| Ask #1 — RD colour uniform | **Deferred to the AI-beat plan.** It exists to unblock beat 7, which is out of scope, and the merge-conflict reason for doing it early is gone (D6 context). |
| Ask #2 — ferro camera path | **Void** — D4. |
| Beats 2–8 content | Out of scope by the agreed split. |
| Touch quality tiers | Out of scope — they belong with the grass and the RD, which are the things that cost. |

**Placeholder scan:** no TBDs. Every code step carries real code. The one deliberate placeholder is `HEADINGS` in Task 9, flagged inline as awaiting Adam's rewrite — that is content, not a plan gap.

**Type consistency checked:** `BlenderVec` (Task 1) is what `AboutMarker.blender` holds (Task 2). `BeatId` is used identically in Tasks 2, 4, 9, 10. `AboutPath` (Task 3) is consumed by Tasks 4, 5, 9, 10 with `sample`/`tForBeat`/`length` spelled the same everywhere. `CameraPose` is allocated once in Task 10 and written through by Task 3's `into`. `setInk` (Task 6) matches `AboutFlowDeps.atmosphere` (Task 10) and the `WorldLayer.atmosphere` shape (Task 11). `ScrollMode`'s three values (Task 8) match `AboutFlowDeps.scrollNav.setMode` (Task 10).

**Known follow-ups, deliberately not in this plan:**
- `WORLD_UNITS_PER_VIEWPORT` and `FERRO_FRACTION` are first guesses; Task 13 is where they get their real values.
- D3's FOV question reopens if the lander's grass framing reads wrong in Plan 2.
- The ferro WebGL context is still allocated at boot for every visitor, About or not — a pre-existing cost, noted in the contact memory as parked.
