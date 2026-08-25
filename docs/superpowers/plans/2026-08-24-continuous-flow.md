# commms — Continuous Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the site into one long page — Home, Work wall, About corridor, footer, back to Home — by removing About and Contact as destinations and making everything past the Work wall continuous travel rather than arrival.

**Architecture:** The corridor's camera path is already anchored at the Blender Work Page marker, so its `t = 0` becomes the Work rest and the handover needs no threshold: at the Work rest, forward scroll belongs to the corridor and backward scroll belongs to the director. Every decision — when to hand over, how far the gate has accumulated, how dark the ground should be — is a pure function tested on its own; only the controller touches the DOM or Three.

**Tech Stack:** TypeScript (strict), Three.js, GSAP, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-08-24-continuous-flow-design.md`
**Prior art:** `docs/superpowers/specs/2026-08-21-about-flow-design.md` (beats, markers, palette — still authoritative), `docs/superpowers/plans/2026-08-24-about-spine.md` (what exists), `docs/superpowers/plans/2026-08-24-about-spine-followups.md` (what was deferred and why)

## Global Constraints

- **The suite must stay green: currently 561 passed / 2 skipped across 46 files.** Run `npx vitest run` **from the worktree root** (`C:\Users\Adam\Code\portfolio-site\.claude\worktrees\about-page`), never the repo root — the root glob walks into sibling worktrees and reports ~1269 tests.
- Other commands: `npx tsc --noEmit`, `npm run build`.
- **The Work wall is untouched.** Tiles, hover, focus flights, `/work/[slug]`, case studies all keep working exactly as they ship. If a task finds itself editing tile or focus behaviour, stop and report.
- **Existing constants are authoritative** — import, never re-declare: `SPINE_PERIOD` (`three/loop.ts`), `SPACING` / `CAMERA_OFFSET` / `CAMERA_FOV` / `DESTINATIONS` / `HOME_REST_Z` (`three/world.ts`), `DAMPING_RATE` (`three/camera-director.ts`).
- `verbatimModuleSyntax` (type-only imports must be `import type`), `noUnusedLocals`, `noUnusedParameters`.
- vitest runs the **node** environment; `jsdom` is scoped per-file with `// @vitest-environment jsdom`. **Never create a vitest config.** jsdom here lacks `document.fonts` — stub it in the test file if `initWorld()` is involved, as `world-about-mode.test.ts` does.
- **Feel is verified by Adam in a foreground browser**, not by tests and never by automation (occluded tabs get no rAF).
- Commit after every task with the repo's trailer block.

---

## Decisions taken while planning

**D1 — Removing About and Contact from `DESTINATIONS` deletes their planes for free.** `world.ts:227` builds the screen planes by iterating `DESTINATIONS`. No separate deletion task is needed, and no plane-building code changes.

**D2 — `DestId` and `DEST_ORDER` keep all four members.** They are the *route* vocabulary: `destForPath('/about')` must still resolve, and `pathForDest` must still produce `/contact`. What shrinks is `DESTINATIONS` — the *spine rests*. Anything that today conflates the two (arrow-key cycling) is corrected to iterate the rests.

**D3 — `uInvert` is already a float.** `background.ts:498` initialises `{ value: opts.invert ? 1 : 0 }` and the shader thresholds it at `> 0.5`. Continuous dimming is a one-line shader change plus a setter, not a new uniform. `setInvert(on)` stays for existing callers.

**D4 — The footer is extracted, not copied.** `buildFooter` is a 112-line private function in `case-study.ts`. It moves to its own module so the corridor can mount the same component; the case study must keep rendering identically.

**D5 — The return flight belongs to `about-flow`, not the director.** The director's four travel methods write `position` only. The return interpolates position *and* orientation from an off-spine pitched pose, which only the corridor can do.

---

## File Structure

**New:**

| File | Responsibility |
|---|---|
| `src/about/about-handover.ts` | Pure: when forward scroll should enter the corridor and backward scroll should leave it. |
| `src/about/about-gate.ts` | Pure: the footer gate's accumulator, threshold and indicator amount. |
| `src/page2d/footer.ts` | The site footer, extracted from `case-study.ts` so both pages mount one component. |

**Modified:**

| File | Change |
|---|---|
| `src/three/world.ts` | `DESTINATIONS` drops `about` and `contact`. |
| `src/three/background.ts` | `uInvert` becomes continuous; add `setInvertAmount`. |
| `src/three/camera-director.ts` | Backward travel clamps at Home. |
| `src/about/about-palette.ts` | Expose the continuous `nightAmount`. |
| `src/about/about-flow.ts` | Anchor at the Work rest; pause/resume; the return flight; drive the continuous invert. |
| `src/about/about-document.ts` | Mount the footer in the last beat. |
| `src/page2d/case-study.ts` | Use the extracted footer. |
| `src/main.ts` | Handover wiring; routing; delete the About arrival path. |

---

## Task 1: Shrink the spine to two rests

**Files:**
- Modify: `src/three/world.ts` (the `DESTINATIONS` construction, ~line 113)
- Modify: `src/main.ts` (arrow-key cycling ~line 730, and `aboutRest` ~line 181)
- Modify: `src/about/about-flow.ts` (the `aboutRest` lookup)
- Test: `src/three/world-rests.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `DESTINATIONS` containing exactly `home` and `work`. `HOME_REST_Z` unchanged at `+34`. The Work rest is `DESTINATIONS.find(d => d.id === 'work')!.cameraZ` = **−26**.

**Why this is one task:** three call sites do a non-null `DESTINATIONS.find(...)` for `'about'`. Shrinking the array without fixing them is a runtime crash, so they land together.

- [ ] **Step 1: Write the failing test**

```ts
// src/three/world-rests.test.ts
import { describe, expect, it } from 'vitest';
import { DESTINATIONS, HOME_REST_Z } from './world';
import { DEST_ORDER } from '../routes';

describe('DESTINATIONS', () => {
  it('is the spine rests only — home and work', () => {
    expect(DESTINATIONS.map((d) => d.id)).toEqual(['home', 'work']);
  });

  it('keeps home and work exactly where they were', () => {
    // Nothing about the world's geometry moves; two rests are removed, the
    // remaining two must not shift or the Work wall reframes.
    expect(HOME_REST_Z).toBe(34);
    expect(DESTINATIONS.find((d) => d.id === 'work')!.cameraZ).toBe(-26);
    expect(DESTINATIONS.find((d) => d.id === 'work')!.anchorZ).toBe(-60);
  });

  it('does NOT shrink the route vocabulary — /about and /contact are still routes', () => {
    // DEST_ORDER is what destForPath and pathForDest use. Confusing "a place
    // the camera rests" with "a URL that exists" would break both.
    expect(DEST_ORDER).toEqual(['home', 'work', 'about', 'contact']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/three/world-rests.test.ts`
Expected: FAIL — `DESTINATIONS` still has four entries.

- [ ] **Step 3: Write minimal implementation**

In `world.ts`, replace the `DESTINATIONS` construction. Note the index-based spacing must be preserved, so `work` keeps `anchorZ = -60`:

```ts
/**
 * The spine's RESTS — places the camera stops. Home and Work only.
 *
 * About and Contact used to be rests. They are not any more: everything past
 * the Work wall is continuous travel into the About corridor, which ends at
 * the footer and returns you Home (see
 * docs/superpowers/specs/2026-08-24-continuous-flow-design.md).
 *
 * Removing them here also deletes their screen planes, because the plane
 * builder below iterates this array — they were labels for stops that no
 * longer exist.
 *
 * The spacing is still indexed off the original four-destination layout so
 * Work keeps anchorZ -60 and the wall does not reframe. Do not renumber.
 */
const SPINE_INDEX: Record<'home' | 'work', number> = { home: 0, work: 1 };

export const DESTINATIONS: Destination[] = (['home', 'work'] as DestId[]).map((id) => ({
  id,
  anchorZ: -SPACING * SPINE_INDEX[id as 'home' | 'work'],
  cameraZ: -SPACING * SPINE_INDEX[id as 'home' | 'work'] + CAMERA_OFFSET,
}));
```

In `main.ts`, the About rest lookup becomes the Work rest:

```ts
    const workRest = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ;
```

and every use of the old `aboutRest` identifier is renamed to `workRest`. Arrow-key cycling must iterate the rests, not the routes:

```ts
      // Cycles the spine's RESTS, not DEST_ORDER — /about and /contact are
      // still routes but no longer places the camera stops.
      const ids = DESTINATIONS.map((d) => d.id);
      const idx = ids.indexOf(current.id) + (e.key === 'ArrowDown' ? 1 : -1);
      const next = ids[(idx + ids.length) % ids.length];
```

In `about-flow.ts`, the anchor lookup becomes:

```ts
  const anchorRest = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ;
```

and every later use of `aboutRest` in that file (the `buildAboutPath` call and the `exit()` pose reset) becomes `anchorRest`.

- [ ] **Step 4: Run the suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: the new file passes. **Other tests will fail** — `about-flow.test.ts` and `about-path.test.ts` hardcode `-86` as the anchor. Do not fix them here; Task 2 owns that.

- [ ] **Step 5: Commit**

```bash
git add src/three/world.ts src/three/world-rests.test.ts src/main.ts src/about/about-flow.ts
git commit -m "$(cat <<'EOF'
feat(world): shrink the spine to two rests, deleting the About and Contact planes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 2: Re-anchor the corridor on the Work rest

**Files:**
- Modify: `src/about/about-flow.test.ts` (the hardcoded anchor)
- Modify: `src/about/about-path.test.ts` (the hardcoded anchor)
- Modify: `src/about/about-scrub.test.ts`, `src/about/about-palette.test.ts`, `src/about/about-document.test.ts` (same)

**Interfaces:**
- Consumes: `DESTINATIONS` from Task 1.
- Produces: the corridor's world extent — starts at `(0, 0, -26)`, ends at approximately `(0, +31, -69.7)`.

**Why the geometry moves:** the path was always anchored at the Blender **Work Page marker (frame 64)**, the last marker with a level camera. Under the old model that anchor was transplanted to the About rest (−86). It now sits where it belongs. The path's shape is unchanged: 43.7 world units forward, 31 up.

- [ ] **Step 1: Update the test anchors**

Every About test that constructs a path does so with a literal. Replace the literal with the real rest so the tests track the source of truth:

```ts
import { DESTINATIONS } from '../three/world';

const ANCHOR_Z = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ; // -26
const path = buildAboutPath(new THREE.Vector3(0, 0, ANCHOR_Z));
```

In `about-path.test.ts`, the "stops short of the Contact destination" test is now meaningless — Contact is not a destination. Replace it:

```ts
  it('ends on the mezzanine, forward of and above the Work rest', () => {
    // The corridor now begins AT the Work rest and runs 43.7 units forward
    // (25.72 Blender units x 1.7) while climbing 31 (18.23 x 1.7).
    const end = path.sample(1);
    expect(end.position.z).toBeCloseTo(ANCHOR_Z - 43.72, 1);
    expect(end.position.y).toBeCloseTo(30.99, 1);
  });
```

- [ ] **Step 2: Run to verify the suite is green again**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 562 passed / 2 skipped (561 + Task 1's 3 new, minus the one replaced). If any test still references `-86`, it was missed.

- [ ] **Step 3: Commit**

```bash
git add src/about/*.test.ts
git commit -m "$(cat <<'EOF'
refactor(about): anchor the corridor on the Work rest, where its path always began

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 3: The handover decision

**Files:**
- Create: `src/about/about-handover.ts`
- Test: `src/about/about-handover.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ENTER_EPS: number`, `shouldEnterCorridor(o: { open: boolean; cameraZ: number; restZ: number; deltaPx: number }): boolean`, `shouldLeaveCorridor(o: { open: boolean; t: number; deltaPx: number }): boolean`.

**Sign convention, which the implementer must get right:** a positive wheel `deltaPx` is scrolling *down*, which travels *forward* (deeper, −z). `camera-director.feedScroll` encodes this as `velocity -= pixels * SCROLL_GAIN`.

- [ ] **Step 1: Write the failing test**

```ts
// src/about/about-handover.test.ts
import { describe, expect, it } from 'vitest';
import { ENTER_EPS, shouldEnterCorridor, shouldLeaveCorridor } from './about-handover';

const REST = -26;

describe('shouldEnterCorridor', () => {
  it('enters on a forward scroll at the Work rest', () => {
    expect(shouldEnterCorridor({ open: false, cameraZ: REST, restZ: REST, deltaPx: 120 })).toBe(true);
  });

  it('does not enter on a backward scroll at the rest', () => {
    // Scrolling up at the Work rest belongs to the director — it travels back
    // toward Home. This is the whole point of the handover being directional.
    expect(shouldEnterCorridor({ open: false, cameraZ: REST, restZ: REST, deltaPx: -120 })).toBe(false);
  });

  it('does not enter while still short of the rest', () => {
    // Mid-flight from Home. The director owns the camera until it settles.
    expect(shouldEnterCorridor({ open: false, cameraZ: REST + 20, restZ: REST, deltaPx: 120 })).toBe(false);
  });

  it('enters from within a small epsilon, not only from an exact match', () => {
    // The settle lands "on" the rest to within a fraction of a unit; requiring
    // exact equality would mean the corridor could never be entered.
    expect(shouldEnterCorridor({ open: false, cameraZ: REST + ENTER_EPS / 2, restZ: REST, deltaPx: 120 })).toBe(true);
    expect(ENTER_EPS).toBeGreaterThan(0);
    expect(ENTER_EPS).toBeLessThan(5);
  });

  it('enters when already past the rest — momentum must not skip the corridor', () => {
    // A hard flick can carry the camera beyond the rest before the settle
    // catches it. Without this the wheel would keep feeding the director into
    // empty space where two destinations used to be.
    expect(shouldEnterCorridor({ open: false, cameraZ: REST - 8, restZ: REST, deltaPx: 120 })).toBe(true);
  });

  it('never enters when already open', () => {
    expect(shouldEnterCorridor({ open: true, cameraZ: REST, restZ: REST, deltaPx: 120 })).toBe(false);
  });

  it('ignores a zero or non-finite delta', () => {
    expect(shouldEnterCorridor({ open: false, cameraZ: REST, restZ: REST, deltaPx: 0 })).toBe(false);
    expect(shouldEnterCorridor({ open: false, cameraZ: REST, restZ: REST, deltaPx: NaN })).toBe(false);
  });
});

describe('shouldLeaveCorridor', () => {
  it('leaves on a backward scroll at the very start', () => {
    expect(shouldLeaveCorridor({ open: true, t: 0, deltaPx: -120 })).toBe(true);
  });

  it('does not leave on a backward scroll mid-corridor', () => {
    expect(shouldLeaveCorridor({ open: true, t: 0.4, deltaPx: -120 })).toBe(false);
  });

  it('does not leave on a forward scroll at the start', () => {
    expect(shouldLeaveCorridor({ open: true, t: 0, deltaPx: 120 })).toBe(false);
  });

  it('never leaves when closed', () => {
    expect(shouldLeaveCorridor({ open: false, t: 0, deltaPx: -120 })).toBe(false);
  });

  it('ignores a zero or non-finite delta', () => {
    expect(shouldLeaveCorridor({ open: true, t: 0, deltaPx: 0 })).toBe(false);
    expect(shouldLeaveCorridor({ open: true, t: 0, deltaPx: NaN })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-handover.test.ts`
Expected: FAIL — cannot resolve `./about-handover`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/about/about-handover.ts

/**
 * When the wheel changes owner.
 *
 * The corridor's t = 0 IS the Work rest — the camera path is anchored at the
 * Blender Work Page marker, the last marker with a level camera. So there is
 * no threshold to cross and no gap to interpolate: at the rest, forward scroll
 * belongs to the corridor and backward scroll belongs to the director. The
 * same camera, the same pose, a different owner.
 *
 * Pure and directional. The controller asks; this decides.
 *
 * Sign convention: a positive deltaPx is scrolling DOWN, which travels FORWARD
 * (deeper, -z). camera-director encodes the same rule as
 * `velocity -= pixels * SCROLL_GAIN`.
 */

/**
 * How close to the rest counts as "at" it, in world units.
 *
 * The settle tween lands on the rest to within a fraction of a unit and then
 * stops updating, so requiring exact equality would mean the corridor could
 * never be entered at all. 1.0 is comfortably larger than any residual the
 * settle leaves and far smaller than SPACING, so it cannot be reached from the
 * Home side.
 */
export const ENTER_EPS = 1.0;

const forward = (deltaPx: number): boolean => Number.isFinite(deltaPx) && deltaPx > 0;
const backward = (deltaPx: number): boolean => Number.isFinite(deltaPx) && deltaPx < 0;

export function shouldEnterCorridor(o: {
  open: boolean;
  cameraZ: number;
  restZ: number;
  deltaPx: number;
}): boolean {
  if (o.open || !forward(o.deltaPx)) return false;
  // At the rest OR already past it. "Past" matters: a hard flick can carry the
  // camera beyond the rest before the settle catches it, and beyond the rest
  // there is nothing left on the spine to travel to.
  return o.cameraZ <= o.restZ + ENTER_EPS;
}

export function shouldLeaveCorridor(o: { open: boolean; t: number; deltaPx: number }): boolean {
  return o.open && backward(o.deltaPx) && o.t <= 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/about/about-handover.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/about/about-handover.ts src/about/about-handover.test.ts
git commit -m "$(cat <<'EOF'
feat(about): the handover decision — who owns the wheel at the Work rest

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 4: Make the ground dim continuously

**Files:**
- Modify: `src/three/background.ts` (the `FRAG` invert line ~216, the `BackgroundLayer` interface ~291, the returned object ~709)
- Modify: `src/about/about-palette.ts` (expose the continuous amount)
- Test: `src/three/background.test.ts` (extend), `src/about/about-palette.test.ts` (extend)

**Interfaces:**
- Consumes: nothing.
- Produces: `BackgroundLayer.setInvertAmount(t: number): void` (0 = normal, 1 = fully inverted, clamped); `setInvert(on)` retained and delegating. `AboutPalette` gains `nightAmount: number`.

**Why this is now in scope:** the spine deferred it because the ground snapped inside a transition that was already a cut. Continuous travel puts the flip in the middle of the move.

- [ ] **Step 1: Write the failing tests**

Append to `src/three/background.test.ts`:

```ts
describe('invert amount', () => {
  it('is continuous in the shader, not thresholded', async () => {
    // The old shader read `if (uInvert > 0.5) lum = 1.0 - lum;` — a binary
    // flip. Continuous travel puts the palette crossfade in the middle of the
    // move, where a flip reads as a cut.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('src/three/background.ts', 'utf8'),
    );
    expect(src).toContain('mix(lum, 1.0 - lum');
    expect(src).not.toContain('if (uInvert > 0.5)');
  });
});
```

Append to `src/about/about-palette.test.ts`:

```ts
describe('nightAmount', () => {
  it('is 1 at both ends of the corridor and 0 at capabilities', () => {
    expect(paletteAt(0, path).nightAmount).toBeCloseTo(1, 6);
    expect(paletteAt(1, path).nightAmount).toBeCloseTo(1, 6);
    expect(paletteAt(path.tForBeat('capabilities'), path).nightAmount).toBeCloseTo(0, 6);
  });

  it('agrees with onDark at the midpoint, and is continuous where onDark is not', () => {
    // onDark is a boolean that flips; nightAmount is the ramp behind it. The
    // WebGL ground needs the ramp, the cursor needs the boolean.
    let prev = paletteAt(0, path).nightAmount;
    for (let i = 1; i <= 400; i++) {
      const cur = paletteAt(i / 400, path).nightAmount;
      expect(Math.abs(cur - prev)).toBeLessThan(0.05);
      prev = cur;
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/three/background.test.ts src/about/about-palette.test.ts`
Expected: FAIL — the shader still thresholds; `nightAmount` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `background.ts`'s `FRAG`, replace the threshold:

```glsl
  // Continuous, not a flip. The About corridor crossfades the ground while the
  // camera is travelling, and a threshold here reads as a cut mid-move.
  lum = mix(lum, 1.0 - lum, clamp(uInvert, 0.0, 1.0));
```

Add to the `BackgroundLayer` interface, beside `setInvert`:

```ts
  /** 0 = normal, 1 = fully inverted; clamped. The continuous form of setInvert. */
  setInvertAmount(t: number): void;
```

And to the returned object, beside `setInvert`:

```ts
    setInvertAmount(t: number): void {
      viewMaterial.uniforms.uInvert.value = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
    },
```

`setInvert(on)` stays exactly as it is — it writes 1 or 0, which the new shader handles identically.

In `about-palette.ts`, add `nightAmount` to the interface and return it. `dayAmount` already exists as a private function; `nightAmount` is `1 - d`:

```ts
  /** 0 = full day, 1 = full night. The continuous ramp behind `onDark`, for
   *  driving the WebGL ground (background.setInvertAmount). */
  nightAmount: number;
```

```ts
    nightAmount: 1 - d,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/three/background.ts src/three/background.test.ts src/about/about-palette.ts src/about/about-palette.test.ts
git commit -m "$(cat <<'EOF'
feat(background): dim the ground continuously instead of flipping it

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 5: Drive the continuous invert from the corridor

**Files:**
- Modify: `src/about/about-flow.ts` (the `background` dep type, `apply()`, `exit()`)
- Modify: `src/about/about-flow.test.ts`
- Modify: `src/main.ts` (the dep wiring)

**Interfaces:**
- Consumes: `setInvertAmount` (Task 4), `nightAmount` (Task 4).
- Produces: `AboutFlowDeps.background` becomes `{ setInvertAmount(t: number): void } | null`.

- [ ] **Step 1: Write the failing test**

In `about-flow.test.ts`, change the `background` mock to `{ setInvertAmount: vi.fn() }` and add:

```ts
  it('drives the ground continuously, not as a flip', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    const seen = new Set<number>();
    for (let i = 0; i <= 20; i++) {
      flow.setScrollForTest(i / 20);
      seen.add((deps.background!.setInvertAmount as ReturnType<typeof vi.fn>).mock.lastCall![0]);
    }
    // A binary flip would only ever produce 0 and 1.
    expect(seen.size).toBeGreaterThan(3);
    flow.destroy();
  });

  it('restores the ground on exit', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.3);
    flow.exit();
    expect(deps.background!.setInvertAmount).toHaveBeenLastCalledWith(0);
    flow.destroy();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/about/about-flow.test.ts`
Expected: FAIL — `setInvertAmount` is not a function on the dep.

- [ ] **Step 3: Write minimal implementation**

In `about-flow.ts`, change the dep type and the two call sites:

```ts
  background: { setInvertAmount(t: number): void } | null;
```

In `apply()`, replace the `setInvert(palette.onDark)` call:

```ts
    deps.background?.setInvertAmount(palette.nightAmount);
```

In `exit()`, replace `setInvert(false)`:

```ts
    deps.background?.setInvertAmount(0);
```

In `main.ts`, the wiring already passes `bg`; its type now satisfies the narrower shape without change.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
git add src/about/about-flow.ts src/about/about-flow.test.ts src/main.ts
git commit -m "$(cat <<'EOF'
feat(about): drive the ground's dim continuously from the palette ramp

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 6: Wire the handover

**Files:**
- Modify: `src/main.ts` (the `scrollNav` wiring ~line 172, `activateAbout`, the `director.onArrive` handler, the boot block)
- Modify: `src/about/about-flow.ts` (`enter` accepts a starting `t`)
- Modify: `src/about/about-flow.test.ts`

**Interfaces:**
- Consumes: `shouldEnterCorridor`, `shouldLeaveCorridor` (Task 3).
- Produces: `AboutFlow.enter(parent: HTMLElement, startT?: number): void`.

**What is deleted here:** the About arrival path. `activateAbout`'s fly-then-enter-on-arrive, and the `director.onArrive` branch that entered the corridor. About is no longer somewhere you arrive.

- [ ] **Step 1: Write the failing test**

```ts
  it('can enter at a given t, for deep links into the corridor', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent, 0.5);
    expect(flow.t()).toBeCloseTo(0.5, 6);
    flow.destroy();
  });

  it('defaults to the top when no t is given', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    expect(flow.t()).toBe(0);
    flow.destroy();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/about/about-flow.test.ts`
Expected: FAIL — `enter` takes one argument.

- [ ] **Step 3: Implement `enter(parent, startT)`**

In `about-flow.ts`, widen the signature on both the interface and the implementation, and apply the start value instead of the hardcoded zero:

```ts
  enter(parent: HTMLElement, startT = 0): void {
```

and at the end of the non-reduced-motion path, replace `apply(0)`:

```ts
      apply(Math.min(1, Math.max(0, startT)));
      // Put the document where the camera is, or the first real scroll event
      // would snap the camera back to the top.
      if (doc) {
        const range = document.documentElement.scrollHeight - window.innerHeight;
        if (range > 0) window.scrollTo(0, range * t());
      }
```

- [ ] **Step 4: Wire it in `main.ts`**

Replace the `scrollNav` construction so the wheel is inspected before it reaches the director:

```ts
      scrollNav = initScrollNav((px) => {
        // The handover. At the Work rest, forward scroll belongs to the
        // corridor and backward scroll belongs to the director — the
        // corridor's t = 0 IS that rest, so nothing jumps.
        if (shouldEnterCorridor({
          open: aboutFlow.isOpen(),
          cameraZ: world.camera.position.z,
          restZ: workRest,
          deltaPx: px,
        })) {
          aboutFlow.enter(document.body);
          return;
        }
        director.feedScroll(px);
      });
```

Leaving the corridor needs its own wheel listener, because once the corridor is open `scrollNav` is in `'about'` mode and swallows the wheel:

```ts
    // Backward scroll at the very top of the corridor hands the camera back.
    // Needed as its own listener because scrollNav is in 'about' mode by then
    // and deliberately feeds the director nothing.
    window.addEventListener('wheel', (e) => {
      if (shouldLeaveCorridor({
        open: aboutFlow.isOpen(),
        t: aboutFlow.t(),
        deltaPx: normalizeWheelDelta(e.deltaY, e.deltaMode),
      })) {
        aboutFlow.exit();
      }
    }, { passive: true });
```

Then **delete** the arrival path: `activateAbout`'s `else router.navigate('about')` branch becomes a direct entry, and the `director.onArrive` branch for `'about'` is removed entirely:

```ts
    const activateAbout = (): void => {
      if (takeover.isOpen() || aboutFlow.isOpen()) return;
      // No flight and no arrival — About is not a destination any more. Put the
      // camera on the Work rest and hand straight to the corridor.
      director.jumpTo('work');
      aboutFlow.enter(document.body);
    };
```

- [ ] **Step 5: Verify**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: green. `grep -n "onArrive" src/main.ts` must no longer show an `'about'` branch.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/about/about-flow.ts src/about/about-flow.test.ts
git commit -m "$(cat <<'EOF'
feat(about): hand the wheel over at the Work rest, and retire the About arrival

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 7: Route `/about` and `/contact` into the corridor

**Files:**
- Modify: `src/main.ts` (the boot block, the popstate path)
- Test: `src/about/about-routes.test.ts` (create)

**Interfaces:**
- Consumes: `AboutPath.tForBeat` , `enter(parent, startT)` (Task 6).
- Produces: `corridorTForRoute(path: AboutPath, dest: 'about' | 'contact'): number` in `src/about/about-scrub.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/about/about-routes.test.ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DESTINATIONS } from '../three/world';
import { buildAboutPath } from './about-path';
import { corridorTForRoute } from './about-scrub';

const path = buildAboutPath(
  new THREE.Vector3(0, 0, DESTINATIONS.find((d) => d.id === 'work')!.cameraZ),
);

describe('corridorTForRoute', () => {
  it('puts /about at the top of the corridor', () => {
    expect(corridorTForRoute(path, 'about')).toBe(0);
  });

  it('puts /contact at the start of the contact beat', () => {
    expect(corridorTForRoute(path, 'contact')).toBeCloseTo(path.tForBeat('contact'), 10);
    expect(corridorTForRoute(path, 'contact')).toBeCloseTo(0.8608, 3);
  });

  it('puts contact after about — the two routes are not the same place', () => {
    expect(corridorTForRoute(path, 'contact')).toBeGreaterThan(corridorTForRoute(path, 'about'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/about/about-routes.test.ts`
Expected: FAIL — `corridorTForRoute` is not exported.

- [ ] **Step 3: Implement**

In `about-scrub.ts`:

```ts
/**
 * Where a route lands inside the corridor.
 *
 * About and Contact stopped being destinations the camera flies to; they are
 * scroll positions in one continuous page. Contact is reachable two ways — here
 * as a place in the flow, and as a modal over anything via the nav emblem.
 */
export function corridorTForRoute(path: AboutPath, dest: 'about' | 'contact'): number {
  return dest === 'contact' ? path.tForBeat('contact') : 0;
}
```

- [ ] **Step 4: Wire the boot and popstate paths in `main.ts`**

```ts
    // /about and /contact are corridor positions now, not flights. Jump the
    // camera to the Work rest — the corridor's own t = 0 — and enter at the
    // route's t.
    if ((bootDest === 'about' || bootDest === 'contact') && !takeover.isOpen()) {
      director.jumpTo('work');
      aboutFlow.enter(document.body, corridorTForRoute(aboutFlow.path(), bootDest));
    }
```

This needs the flow to expose its path. Add to `AboutFlow`:

```ts
  /** The corridor's camera path — routing needs it to resolve a beat to a t. */
  path(): AboutPath;
```

```ts
    path: () => path,
```

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
git add src/about/about-scrub.ts src/about/about-routes.test.ts src/about/about-flow.ts src/main.ts
git commit -m "$(cat <<'EOF'
feat(about): /about and /contact become corridor positions, not destinations

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 8: The contact modal pauses the corridor instead of destroying it

**Files:**
- Modify: `src/about/about-flow.ts` (add `pause`/`resume`)
- Modify: `src/about/about-flow.test.ts`
- Modify: `src/main.ts` (`activateContactWipe`, ~line 521)

**Interfaces:**
- Produces: `AboutFlow.pause(): void`, `AboutFlow.resume(): void`.

**Why:** `activateContactWipe` currently calls `aboutFlow.exit()`. That was the correct fix when contact lived elsewhere — without it, the nav emblem stranded the corridor with the director suspended forever. Under this spec contact is a modal over wherever you are, so opening it at beat 4 and closing it must return you to beat 4.

- [ ] **Step 1: Write the failing test**

```ts
  it('pause keeps the corridor open and the camera where it is', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.42);
    const z = deps.camera.position.z;
    flow.pause();
    expect(flow.isOpen()).toBe(true);
    expect(flow.t()).toBeCloseTo(0.42, 6);
    expect(deps.camera.position.z).toBeCloseTo(z, 6);
    flow.destroy();
  });

  it('resume puts the wheel back with the corridor and does not reset t', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.42);
    flow.pause();
    flow.resume();
    expect(flow.t()).toBeCloseTo(0.42, 6);
    expect(deps.scrollNav!.setMode).toHaveBeenLastCalledWith('about');
    flow.destroy();
  });

  it('pause on a closed corridor is a no-op', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    expect(() => { flow.pause(); flow.resume(); }).not.toThrow();
    expect(flow.isOpen()).toBe(false);
    flow.destroy();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/about/about-flow.test.ts`
Expected: FAIL — `pause` is not a function.

- [ ] **Step 3: Implement**

```ts
  /**
   * Hold the corridor while something covers it — the contact modal.
   *
   * NOT exit(): contact is a surface over wherever you are, so closing it must
   * put you back at the beat you opened it from. exit() would reset the camera
   * pose and release the director, and you would find yourself at the Work
   * rest with the corridor unmounted.
   */
  pause(): void;
  /** Give the wheel back to the corridor. Safe to call when never paused. */
  resume(): void;
```

```ts
    pause(): void {
      if (!open || paused) return;
      paused = true;
      window.removeEventListener('scroll', onScroll);
    },

    resume(): void {
      if (!open || !paused) return;
      paused = false;
      window.addEventListener('scroll', onScroll, { passive: true });
      deps.scrollNav?.setMode('about');
    },
```

with `let paused = false;` beside `let open = false;`, reset to `false` in both `enter()` and `exit()`.

- [ ] **Step 4: Wire it in `main.ts`**

In `activateContactWipe`, replace the first line:

```ts
      // Pause, do not exit — contact is a modal over wherever you are, so
      // closing it must return you to the beat you opened it from.
      aboutFlow.pause();
```

and in the takeover's `onModeChange`, where `mode === 'world'`:

```ts
          aboutFlow.resume();
```

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
git add src/about/about-flow.ts src/about/about-flow.test.ts src/main.ts
git commit -m "$(cat <<'EOF'
feat(about): the contact modal pauses the corridor instead of ejecting you

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 9: Extract the footer

**Files:**
- Create: `src/page2d/footer.ts`
- Modify: `src/page2d/case-study.ts` (remove `buildFooter`, import it instead)
- Test: `src/page2d/footer.test.ts` (create)

**Interfaces:**
- Produces: `buildFooter(opts: FooterOpts): HTMLElement`, `interface FooterOpts { onNav(dest: 'work' | 'about' | 'contact'): void }`.

**Constraint:** the case study must render **identically**. This is a move, not a redesign. Read the existing 112-line `buildFooter` and carry it across unchanged apart from its parameters.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildFooter } from './footer';

describe('buildFooter', () => {
  it('builds the site footer', () => {
    const el = buildFooter({ onNav: vi.fn() });
    expect(el.tagName).toBe('FOOTER');
    expect(el.classList.contains('cs-footer')).toBe(true);
  });

  it('wires the site nav links', () => {
    const onNav = vi.fn();
    const el = buildFooter({ onNav });
    const link = el.querySelector<HTMLElement>('a, button');
    expect(link).not.toBeNull();
    link!.click();
    expect(onNav).toHaveBeenCalled();
  });

  it('needs no Project — the corridor has no project to name', () => {
    // The signature is the point of this task: the same component now serves
    // the case study and the end of the About corridor.
    expect(() => buildFooter({ onNav: vi.fn() })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/page2d/footer.test.ts`
Expected: FAIL — cannot resolve `./footer`.

- [ ] **Step 3: Move the function**

Cut `buildFooter` from `case-study.ts` into `src/page2d/footer.ts`, exported, with its doc comment intact and its parameters reduced to `FooterOpts`. If the body genuinely needs anything from `project`, add exactly that field to `FooterOpts` as optional and say so in the report — do not invent a broader interface.

In `case-study.ts`, import it and call it with `{ onNav: opts.onNav }`.

- [ ] **Step 4: Verify the case study is unchanged**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: green, with **no change** to any existing case-study test.

- [ ] **Step 5: Commit**

```bash
git add src/page2d/footer.ts src/page2d/footer.test.ts src/page2d/case-study.ts
git commit -m "$(cat <<'EOF'
refactor(page2d): extract the footer so the corridor can mount the same one

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 10: The gate's accumulator

**Files:**
- Create: `src/about/about-gate.ts`
- Test: `src/about/about-gate.test.ts`

**Interfaces:**
- Produces: `GATE_THRESHOLD_PX: number`, `interface GateState { accumulated: number }`, `createGate(): GateState`, `feedGate(state: GateState, deltaPx: number): { armed: boolean; amount: number }`.

**Placeholder status:** `GATE_THRESHOLD_PX` and the indicator treatment are values the implementer picks, explicitly awaiting Adam's Figma. The *mechanism* is real.

- [ ] **Step 1: Write the failing test**

```ts
// src/about/about-gate.test.ts
import { describe, expect, it } from 'vitest';
import { createGate, feedGate, GATE_THRESHOLD_PX } from './about-gate';

describe('feedGate', () => {
  it('accumulates forward scroll toward the threshold', () => {
    const g = createGate();
    const a = feedGate(g, GATE_THRESHOLD_PX / 4);
    expect(a.amount).toBeCloseTo(0.25, 6);
    expect(a.armed).toBe(false);
    const b = feedGate(g, GATE_THRESHOLD_PX / 4);
    expect(b.amount).toBeCloseTo(0.5, 6);
  });

  it('arms once the threshold is crossed', () => {
    const g = createGate();
    expect(feedGate(g, GATE_THRESHOLD_PX).armed).toBe(true);
    expect(feedGate(g, 0).amount).toBe(1);
  });

  it('drains on backward scroll — the gate is intent, and intent can be withdrawn', () => {
    const g = createGate();
    feedGate(g, GATE_THRESHOLD_PX / 2);
    const back = feedGate(g, -GATE_THRESHOLD_PX / 4);
    expect(back.amount).toBeCloseTo(0.25, 6);
    expect(back.armed).toBe(false);
  });

  it('never drains below zero', () => {
    const g = createGate();
    expect(feedGate(g, -9999).amount).toBe(0);
  });

  it('clamps the reported amount at 1 however far past the threshold you push', () => {
    const g = createGate();
    expect(feedGate(g, GATE_THRESHOLD_PX * 10).amount).toBe(1);
  });

  it('ignores a non-finite delta rather than poisoning the accumulator', () => {
    const g = createGate();
    feedGate(g, GATE_THRESHOLD_PX / 2);
    expect(feedGate(g, NaN).amount).toBeCloseTo(0.5, 6);
  });

  it('has a threshold that takes deliberate effort but is not a workout', () => {
    expect(GATE_THRESHOLD_PX).toBeGreaterThan(300);
    expect(GATE_THRESHOLD_PX).toBeLessThan(2000);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/about/about-gate.test.ts`
Expected: FAIL — cannot resolve `./about-gate`.

- [ ] **Step 3: Implement**

```ts
// src/about/about-gate.ts

/**
 * The footer gate — the page's last beat.
 *
 * At the end of the corridor, further scrolling does nothing at first except
 * accumulate intent against a threshold, with an indicator showing how far you
 * have pushed. Past it, you fly Home and the loop closes.
 *
 * It is a gate rather than a boundary because the corridor's end is also the
 * page's end: without something to push against, the scroll would simply stop
 * dead, and with an ordinary trigger you would fall out of the page by
 * accident.
 *
 * PLACEHOLDER: the threshold value and the indicator's treatment await Adam's
 * Figma. The mechanism here is real; the number is a guess.
 */

/** How much scroll past the footer arms the return. */
export const GATE_THRESHOLD_PX = 800;

export interface GateState {
  accumulated: number;
}

export function createGate(): GateState {
  return { accumulated: 0 };
}

/**
 * Feed the gate a wheel delta. Returns whether it is armed and how full it
 * reads, 0..1, for the indicator.
 *
 * Backward scroll drains it: the gate measures intent, and intent can be
 * withdrawn. Without draining, a stray downward flick would leave the gate
 * permanently half-armed.
 */
export function feedGate(state: GateState, deltaPx: number): { armed: boolean; amount: number } {
  if (Number.isFinite(deltaPx)) {
    state.accumulated = Math.max(0, state.accumulated + deltaPx);
  }
  const amount = Math.min(1, state.accumulated / GATE_THRESHOLD_PX);
  return { armed: state.accumulated >= GATE_THRESHOLD_PX, amount };
}
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/about/about-gate.test.ts`

```bash
git add src/about/about-gate.ts src/about/about-gate.test.ts
git commit -m "$(cat <<'EOF'
feat(about): the footer gate's accumulator

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 11: The return flight

**Files:**
- Modify: `src/about/about-flow.ts`
- Modify: `src/about/about-flow.test.ts`

**Interfaces:**
- Consumes: `HOME_REST_Z` from `three/world.ts` (= 34).
- Produces: `AboutFlow.returnHome(): Promise<void>`.

**Why it cannot reuse `exit()`:** `exit()` cuts the camera to the corridor's anchor before releasing the director — deliberately, because nothing else writes `camera.quaternion`. Reusing it would produce a visible cut *upward* to the Work rest and only then a flight, which is worse than the snap this whole spec removes. The return is one tween from the corridor's actual end pose, interpolating position **and** orientation, handing to the director only once it lands.

- [ ] **Step 1: Write the failing test**

```ts
  it('flies home from the corridor\'s end pose, not from a cut', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(1);
    const startY = deps.camera.position.y;
    expect(startY).toBeGreaterThan(20); // up on the mezzanine

    const done = flow.returnHome();
    // Mid-flight the camera must be BETWEEN the two poses — never teleported
    // to the anchor first.
    flow.stepReturnForTest(0.5);
    expect(deps.camera.position.y).toBeGreaterThan(0);
    expect(deps.camera.position.y).toBeLessThan(startY);

    flow.stepReturnForTest(1);
    return done.then(() => {
      expect(deps.camera.position.y).toBeCloseTo(0, 4);
      expect(deps.camera.position.z).toBeCloseTo(34, 4);
      expect(deps.camera.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 4);
      expect(flow.isOpen()).toBe(false);
      expect(deps.director.setSuspended).toHaveBeenLastCalledWith(false);
      flow.destroy();
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/about/about-flow.test.ts`
Expected: FAIL — `returnHome` is not a function.

- [ ] **Step 3: Implement**

```ts
  /**
   * Fly the camera from wherever the corridor left it back to Home, then hand
   * over. The footer gate's payoff.
   *
   * Its own move rather than exit()+flyTo: exit() CUTS to the anchor before
   * releasing the director, so reusing it would jump the camera up to the Work
   * rest and only then fly — worse than the snap this replaces. And the
   * director's travel methods write position only; the return has to
   * interpolate orientation too, from a pitched off-spine pose.
   */
  returnHome(): Promise<void>;
  /** Test/debug seam: step the return flight to a given 0..1 progress. */
  stepReturnForTest(p: number): void;
```

```ts
  const fromPos = new THREE.Vector3();
  const fromQuat = new THREE.Quaternion();
  const homePos = new THREE.Vector3(0, 0, HOME_REST_Z);
  const homeQuat = new THREE.Quaternion();
  let returnResolve: (() => void) | null = null;

  const applyReturn = (p: number): void => {
    const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2; // easeInOutQuad
    deps.camera.position.lerpVectors(fromPos, homePos, e);
    deps.camera.quaternion.copy(fromQuat).slerp(homeQuat, e);
    if (p >= 1) {
      open = false;
      doc?.destroy();
      doc = null;
      releaseSharedState();      // the same restores exit() performs
      deps.director.setSuspended(false);
      const r = returnResolve;
      returnResolve = null;
      r?.();
    }
  };
```

`releaseSharedState()` is a small private helper extracted from `exit()`'s existing restore block — ground, ink, textInk, cursor, invert, ferro, scrollNav, world mode — so the two paths cannot drift apart. **Extract it; do not duplicate the list.** That drift is exactly how three separate restore leaks reached the branch.

```ts
    returnHome(): Promise<void> {
      if (!open) return Promise.resolve();
      fromPos.copy(deps.camera.position);
      fromQuat.copy(deps.camera.quaternion);
      window.removeEventListener('scroll', onScroll);
      if (deps.reducedMotion) {
        applyReturn(1);
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        returnResolve = resolve;
        const p = { v: 0 };
        gsap.to(p, {
          v: 1,
          duration: RETURN_S,
          ease: 'none',
          onUpdate: () => applyReturn(p.v),
        });
      });
    },
    stepReturnForTest(p: number): void {
      applyReturn(Math.min(1, Math.max(0, p)));
    },
```

with `const RETURN_S = 1.6;` — long enough to read as travel across ~53 world units, short enough not to trap the user. A tuning value.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
git add src/about/about-flow.ts src/about/about-flow.test.ts
git commit -m "$(cat <<'EOF'
feat(about): fly home from the corridor's end pose instead of cutting

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 12: Mount the footer and wire the gate

**Files:**
- Modify: `src/about/about-document.ts` (mount the footer in the last beat)
- Modify: `src/about/about-flow.ts` (feed the gate, call `returnHome`)
- Modify: `src/styles/about.css` (the indicator)
- Modify: `src/about/about-document.test.ts`, `src/about/about-flow.test.ts`

**Interfaces:**
- Consumes: `buildFooter` (Task 9), `createGate`/`feedGate` (Task 10), `returnHome` (Task 11).

- [ ] **Step 1: Write the failing tests**

In `about-document.test.ts`:

```ts
  it('mounts the site footer in the last beat', () => {
    const { doc, parent } = mount();
    expect(doc.sectionFor('ai').querySelector('footer.cs-footer')).not.toBeNull();
    doc.destroy();
    parent.remove();
  });
```

In `about-flow.test.ts`:

```ts
  it('only feeds the gate at the very end of the corridor', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.5);
    flow.feedGateForTest(GATE_THRESHOLD_PX);
    expect(flow.isOpen()).toBe(true); // mid-corridor scroll must not eject you
    flow.destroy();
  });

  it('returns home once the gate arms at the end', async () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(1);
    flow.feedGateForTest(GATE_THRESHOLD_PX);
    flow.stepReturnForTest(1);
    expect(flow.isOpen()).toBe(false);
    flow.destroy();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/about/about-document.test.ts src/about/about-flow.test.ts`
Expected: FAIL — no footer, no `feedGateForTest`.

- [ ] **Step 3: Implement**

In `about-document.ts`, accept a footer factory and append it to the last beat's section:

```ts
export function mountAboutDocument(
  parent: HTMLElement,
  path: AboutPath,
  viewportH: number,
  footer?: () => HTMLElement,
): AboutDocument {
```

```ts
  // The footer lives in the last beat: it IS the end of the page, and the gate
  // is scroll pushed against it.
  if (footer) sections.get(ABOUT_MARKERS[ABOUT_MARKERS.length - 1].id)!.appendChild(footer());
```

In `about-flow.ts`, feed the gate only at the end, and add the indicator:

```ts
  const gate = createGate();

  const onGateWheel = (e: WheelEvent): void => {
    if (!open || t() < 1) return;
    const { armed, amount } = feedGate(gate, normalizeWheelDelta(e.deltaY, e.deltaMode));
    doc?.root.style.setProperty('--gate', String(amount));
    if (armed) void returnHomeInternal();
  };
```

registered on `enter()` and removed on `exit()`/`returnHome()`, plus `feedGateForTest(px)` calling the same body.

In `about.css`:

```css
/* The footer gate's indicator. Placeholder treatment — the mechanism is real,
 * the look awaits Adam's Figma. --gate is 0..1, written per wheel event. */
.about-doc::after {
  content: '';
  position: fixed;
  left: 0;
  bottom: 0;
  height: 2px;
  width: calc(var(--gate, 0) * 100%);
  background: var(--ink);
  opacity: calc(var(--gate, 0) * 0.6);
  pointer-events: none;
}
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run build`

```bash
git add src/about/about-document.ts src/about/about-flow.ts src/styles/about.css src/about/*.test.ts
git commit -m "$(cat <<'EOF'
feat(about): the footer and the scroll gate that closes the loop

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 13: Back-scroll stops at Home

**Files:**
- Modify: `src/three/camera-director.ts` (`update`)
- Modify: `src/three/camera-director.test.ts`

**Interfaces:**
- Consumes: `HOME_REST_Z`.
- Produces: no new API — a clamp inside `update`.

**Why:** Home is the top of the page. The loop now closes through the corridor, so wrapping backwards past Home would travel through the empty space where About and Contact used to stand.

- [ ] **Step 1: Write the failing test**

```ts
describe('backward clamp at Home', () => {
  it('does not travel behind Home', () => {
    const camera = new THREE.PerspectiveCamera();
    const director = initCameraDirector(camera, DESTINATIONS, {});
    director.jumpTo('home');
    for (let i = 0; i < 30; i++) director.feedScroll(-400);
    for (let i = 0; i < 60; i++) director.update(0.016);
    expect(camera.position.z).toBeLessThanOrEqual(HOME_REST_Z + 1e-6);
    director.destroy();
  });

  it('still travels forward freely', () => {
    const camera = new THREE.PerspectiveCamera();
    const director = initCameraDirector(camera, DESTINATIONS, {});
    director.jumpTo('home');
    director.feedScroll(400);
    director.update(0.016);
    expect(camera.position.z).toBeLessThan(HOME_REST_Z);
    director.destroy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/three/camera-director.test.ts`
Expected: FAIL — the camera travels past Home.

- [ ] **Step 3: Implement**

In `update`, immediately after `state.z = state.z + velocity * dt;`:

```ts
        // Home is the top of the page. The loop closes through the About
        // corridor now, so travelling backwards past Home would run through
        // the empty space where About and Contact used to stand.
        if (state.z > HOME_REST_Z) {
          state.z = HOME_REST_Z;
          velocity = 0;
        }
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add src/three/camera-director.ts src/three/camera-director.test.ts
git commit -m "$(cat <<'EOF'
feat(camera-director): stop backward travel at Home — it is the top of the page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012aaRaK2gumn4azVCqA79rw
EOF
)"
```

---

## Task 14: Adam's morning QA

**Files:** none.

Serve with `npm run dev`, foreground window, hard reload.

- [ ] Scroll from Home: reach the Work wall, keep scrolling, and travel into the climb with no visible change of mechanism
- [ ] The About and Contact cards are gone — nothing flashes
- [ ] The ground darkens continuously through the tilt, with no flip
- [ ] Scroll back up: the corridor retraces, hands back at the top, and the director carries you toward Home
- [ ] Scrolling up at Home does nothing — Home is the top
- [ ] The footer is there at the end; pushing against it fills the indicator; past the threshold the camera **flies** home
- [ ] Open contact from inside the corridor, close it, and you are back at the same beat
- [ ] `/about` lands at the top of the corridor; `/contact` lands at the contact beat
- [ ] The Work wall is untouched — tiles, hover, focus, case studies

Record the verdict in `2026-08-24-about-spine-followups.md`.

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Two rests; About/Contact planes deleted | 1 (D1: one change does both) |
| Home/Work keep their anchors | 1 |
| Back-scroll stops at Home | 13 |
| `SPINE_PERIOD` unchanged | 1 (untouched by construction) |
| Corridor `t = 0` is the Work rest | 2 |
| Handover, both directions, reversible | 3, 6 |
| Routing `/about`, `/contact` | 7 |
| Contact modal preserves position | 8 |
| Footer = case-study footer, taller | 9, 12 |
| Gate: accumulator, indicator, threshold | 10, 12 |
| Return Home is a flight from the end pose | 11 |
| Continuous ground dim | 4, 5 |
| Delete the About arrival path | 6 |
| Work wall untouched | Global constraint; no task touches it |
| Single-document target | Recorded in the spec; explicitly not built |

**Placeholder scan:** the only deliberate placeholders are `GATE_THRESHOLD_PX` and the indicator CSS, both labelled in code and in the spec as awaiting Figma. No TBDs.

**Type consistency:** `enter(parent, startT?)` is widened in Task 6 and used in Task 7. `background` narrows to `{ setInvertAmount }` in Task 5 and is produced in Task 4. `path()` is added in Task 7 and consumed there. `returnHome`/`stepReturnForTest` are defined in Task 11 and used in Task 12. `releaseSharedState()` is extracted in Task 11 and shared with `exit()` — **the one place where duplication would be a real defect**, since drifting restore lists produced three separate leaks on the spine branch.

**Ordering constraint:** Task 1 knowingly leaves the suite red (hardcoded `-86` anchors) and Task 2 fixes it. These two must not be reordered or split across a review boundary that requires green.
