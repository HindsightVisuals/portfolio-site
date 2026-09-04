# Splitting `about-flow.ts` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/about/about-flow.ts` (1017 lines, fourteen jobs) into five focused modules plus wiring, with zero change to behaviour or to the public `AboutFlow` API.

**Architecture:** `initAboutFlow(deps)` stays a factory returning the same `AboutFlow` object. Its closure state is redistributed into four collaborator factories — `createPresentation`, `createReturnFlight`, `createSession` (which itself owns `createGateControl`) — plus a stateless `about-nav.ts`. The graph is acyclic: the presentation→gate edge is inverted so the session calls `presentation.apply(t)` then `gate.syncAt(t)`, and the return flight takes callbacks (`onDepart`, `onLanded`) rather than a reference back to the session.

**Tech Stack:** TypeScript 6, Three.js, GSAP, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-09-04-about-flow-split-design.md`

## Global Constraints

- **`initAboutFlow(deps: AboutFlowDeps): AboutFlow` must not change** — not its signature, not the `AboutFlow` interface, not `AboutFlowDeps`. `main.ts` and both test files import only through it.
- **`GATE_IDLE_MS` must stay exported from `src/about/about-flow.ts`** — `about-flow.test.ts:6` imports it from there. Move the definition, re-export the name.
- **This is a refactor. No behaviour changes**, including ones that look like obvious improvements. Note them, leave them.
- **Every comment travels with the code it explains.** The comments in this file are the record of roughly a dozen fixed bugs. A comment left behind while its code moves is itself a regression.
- **Preserve DOM write order.** `--gate` / `--gate-show` / `--footer-rise` / `ferroEl.style.opacity` sequencing is load-bearing.
- **No per-frame allocation.** Every scratch object (`pose`, `ferroScratch`, `anchorPos`, `viewportScratch`, `fromPos`, `fromQuat`, `homePos`, `homeQuat`) stays hoisted into its new module's factory closure.
- **Baseline to hold at every commit:** `npx tsc --noEmit` clean; `npm test` → **1528 passed, 4 skipped, 120 files**.
- Branch: `refactor/about-flow-split`, cut from `main` at `3b76c0b`.

---

### Task 1: `about-nav.ts` — pure navigation maths

Smallest unit, no state, and it proves the pattern. `nextBeatId` is the arithmetic currently buried inside `stepBeat`, which cannot be tested today without a mounted corridor.

**Files:**
- Create: `src/about/about-nav.ts`
- Create: `src/about/about-nav.test.ts`
- Modify: `src/about/about-flow.ts` — delete `scrollDocumentTo` (754–772) and `scrollToBeat` (772–788); rewrite `stepBeat` (821–842) to call `nextBeatId`

**Interfaces:**
- Consumes: `AboutPath` from `./about-path`, `ABOUT_MARKERS`/`BeatId` from `./about-markers`, `beatAt` from `./about-scrub`
- Produces: `scrollDocumentTo(target: number): void`, `scrollToBeat(path: AboutPath, id: BeatId): void`, `nextBeatId(path: AboutPath, t: number, dir: 1 | -1): BeatId`

- [ ] **Step 1: Write the failing test**

Create `src/about/about-nav.test.ts`:

```ts
// src/about/about-nav.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { buildAboutPath } from './about-path';
import { ABOUT_MARKERS } from './about-markers';
import { nextBeatId, scrollDocumentTo, scrollToBeat } from './about-nav';

const path = buildAboutPath(new THREE.Vector3(0, 0, -26));
const first = ABOUT_MARKERS[0].id;
const last = ABOUT_MARKERS[ABOUT_MARKERS.length - 1].id;

describe('nextBeatId', () => {
  it('steps forward to the next marker', () => {
    expect(nextBeatId(path, path.tForBeat(first), 1)).toBe(ABOUT_MARKERS[1].id);
  });

  it('clamps forward at the last beat — leaving forward is the gate, not an arrow', () => {
    expect(nextBeatId(path, path.tForBeat(last), 1)).toBe(last);
  });

  it('steps backward from a beat start to the previous beat', () => {
    const second = ABOUT_MARKERS[1].id;
    expect(nextBeatId(path, path.tForBeat(second), -1)).toBe(first);
  });

  it('backward from partway through a beat returns to that beat own start first', () => {
    const second = ABOUT_MARKERS[1].id;
    const third = ABOUT_MARKERS[2].id;
    const partway = (path.tForBeat(second) + path.tForBeat(third)) / 2;
    expect(nextBeatId(path, partway, -1)).toBe(second);
  });

  it('clamps backward at the first beat', () => {
    expect(nextBeatId(path, path.tForBeat(first), -1)).toBe(first);
  });
});

describe('scrollDocumentTo', () => {
  let scrollTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 3000,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps a 0..1 target onto the scrollable range', () => {
    scrollDocumentTo(0.5);
    expect(scrollTo).toHaveBeenCalledWith(0, 1000);
  });

  it('clamps out-of-range targets', () => {
    scrollDocumentTo(2);
    expect(scrollTo).toHaveBeenCalledWith(0, 2000);
    scrollDocumentTo(-1);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('does nothing when there is no scrollable range', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 1000,
      configurable: true,
    });
    scrollDocumentTo(0.5);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('scrollToBeat lands on the beat own t', () => {
    scrollToBeat(path, last);
    expect(scrollTo).toHaveBeenCalledWith(0, 2000 * path.tForBeat(last));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-nav.test.ts`
Expected: FAIL — `Failed to resolve import "./about-nav"`

- [ ] **Step 3: Create `src/about/about-nav.ts`**

Move `scrollDocumentTo` and `scrollToBeat` out of `about-flow.ts` verbatim — **including their full doc comments** — adding `path` as a parameter to `scrollToBeat`, and lift `stepBeat`'s index arithmetic into `nextBeatId`, carrying across the part of `stepBeat`'s doc comment that explains the prev-section convention and the forward clamp.

```ts
// src/about/about-nav.ts
import type { AboutPath } from './about-path';
import { ABOUT_MARKERS, type BeatId } from './about-markers';
import { beatAt } from './about-scrub';

/**
 * Put the real document's scroll position where path parameter `target`
 * sits — the inverse of scrollToT, and the one place that conversion lives.
 *
 * Callers: enter()'s two branches (so the first real scroll event doesn't snap
 * the camera back to the top), scrollToBeat below, and resume().
 */
export function scrollDocumentTo(target: number): void {
  const range = document.documentElement.scrollHeight - window.innerHeight;
  if (range > 0) window.scrollTo(0, range * Math.min(1, Math.max(0, target)));
}

/**
 * Scroll the real document to where a beat's t sits, driving the camera there
 * through the ordinary scroll pipeline (onScroll/apply) — the same mechanism a
 * raw scroll gesture uses. Used by the footer's site nav for 'about' and
 * 'contact', and by the arrow keys: all of them are scroll positions inside
 * THIS document now (D2/the corridor spec), not places to fly to or reopen, so
 * there is nothing to hand off to — just move the scrollbar. Under reduced
 * motion this is also correct and sufficient: the browser's own scroll position
 * is the only "position" that mode has, and mountAboutDocument lays the
 * document out identically regardless of reducedMotion.
 */
export function scrollToBeat(path: AboutPath, id: BeatId): void {
  scrollDocumentTo(path.tForBeat(id));
}

/**
 * Which beat one arrow-key step from `t` lands on.
 *
 * Backward from a beat you are partway through goes to that beat's own start
 * first, then to the previous one — the ordinary prev-section convention.
 * Forward past the last beat clamps: t = 1 IS the last marker, and leaving
 * forward is the footer gate's job, not an arrow's.
 *
 * Leaving the corridor backward from t = 0 is NOT decided here — that is the
 * session's call (it calls exit()), because it is a lifecycle decision rather
 * than navigation maths. This function is only ever asked about steps that
 * stay inside the corridor.
 */
export function nextBeatId(path: AboutPath, t: number, dir: 1 | -1): BeatId {
  const i = ABOUT_MARKERS.findIndex((m) => m.id === beatAt(t, path));
  const here = path.tForBeat(ABOUT_MARKERS[i].id);
  const j = dir > 0 ? i + 1 : t > here + 1e-6 ? i : i - 1;
  return ABOUT_MARKERS[Math.min(ABOUT_MARKERS.length - 1, Math.max(0, j))].id;
}
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `npx vitest run src/about/about-nav.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Rewire `about-flow.ts`**

Add `import { nextBeatId, scrollDocumentTo, scrollToBeat } from './about-nav';`. Delete the local `scrollDocumentTo` and `scrollToBeat` definitions. Replace the four `scrollToBeat(x)` call sites with `scrollToBeat(path, x)`. Rewrite `stepBeat`'s body, keeping its whole doc comment in place:

```ts
  const stepBeat = (dir: 1 | -1): void => {
    if (!open || paused || deps.reducedMotion) return;
    if (dir < 0 && t <= 0) {
      exit();
      return;
    }
    scrollToBeat(path, nextBeatId(path, t, dir));
  };
```

- [ ] **Step 6: Run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; **1528 passed, 4 skipped**. Any failure here is a behaviour change — fix it, do not update the test.

- [ ] **Step 7: Commit**

```bash
git add src/about/about-nav.ts src/about/about-nav.test.ts src/about/about-flow.ts
git commit -m "refactor(about): extract navigation maths into about-nav.ts"
```

---

### Task 2: `about-gate-control.ts` — the footer gate's controller

**Files:**
- Create: `src/about/about-gate-control.ts`
- Create: `src/about/about-gate-control.test.ts`
- Modify: `src/about/about-flow.ts` — remove `GATE_IDLE_MS`'s definition (re-export it), `gate`/`gateFed`/`idleTimer`, `syncGateShow`, `clearIdleTimer`, `scheduleIdleDrain`, `feedGateAt`, and `apply`'s leave-the-end block

**Interfaces:**
- Consumes: `atCorridorEnd`, `createGate`, `feedGate`, `GateState` from `./about-gate`
- Produces: `GATE_IDLE_MS: number`, `GateControl` (methods `feed`, `syncAt`, `reset`, `clearTimer`, `release`), `createGateControl(o: { docRoot(): HTMLElement | null; onArmed(): void }): GateControl`

- [ ] **Step 1: Write the failing test**

Create `src/about/about-gate-control.test.ts`:

```ts
// src/about/about-gate-control.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GATE_THRESHOLD_PX } from './about-gate';
import { createGateControl, GATE_IDLE_MS } from './about-gate-control';

const showValue = (): string =>
  document.documentElement.style.getPropertyValue('--gate-show');

describe('createGateControl', () => {
  let root: HTMLElement;
  let onArmed: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement('div');
    onArmed = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.style.removeProperty('--gate-show');
  });

  const make = () => createGateControl({ docRoot: () => root, onArmed });

  it('ignores feeds away from the corridor end', () => {
    const gate = make();
    gate.feed(500, 0.5);
    expect(root.style.getPropertyValue('--gate')).toBe('');
    expect(showValue()).toBe('');
  });

  it('writes --gate and reveals the panel on the first push at the end', () => {
    const gate = make();
    gate.feed(100, 1);
    expect(Number(root.style.getPropertyValue('--gate'))).toBeGreaterThan(0);
    expect(showValue()).toBe('1');
  });

  it('arms once the threshold is crossed', () => {
    const gate = make();
    gate.feed(GATE_THRESHOLD_PX + 1, 1);
    expect(onArmed).toHaveBeenCalledTimes(1);
  });

  it('drains the fill after the idle timeout but leaves the panel shown', () => {
    const gate = make();
    gate.feed(100, 1);
    vi.advanceTimersByTime(GATE_IDLE_MS + 1);
    expect(root.style.getPropertyValue('--gate')).toBe('');
    expect(showValue()).toBe('1');
  });

  it('rearms the idle clock on every push, so it fires after the LAST one', () => {
    const gate = make();
    gate.feed(100, 1);
    vi.advanceTimersByTime(GATE_IDLE_MS - 100);
    gate.feed(100, 1);
    vi.advanceTimersByTime(GATE_IDLE_MS - 100);
    expect(root.style.getPropertyValue('--gate')).not.toBe('');
    vi.advanceTimersByTime(200);
    expect(root.style.getPropertyValue('--gate')).toBe('');
  });

  it('does not start an idle timer for a push that arms the gate', () => {
    const gate = make();
    gate.feed(GATE_THRESHOLD_PX + 1, 1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('syncAt withdraws the whole offer on leaving the end', () => {
    const gate = make();
    gate.feed(100, 1);
    gate.syncAt(0.5);
    expect(root.style.getPropertyValue('--gate')).toBe('');
    expect(showValue()).toBe('0');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('syncAt at the end leaves a fed gate alone', () => {
    const gate = make();
    gate.feed(100, 1);
    const filled = root.style.getPropertyValue('--gate');
    gate.syncAt(1);
    expect(root.style.getPropertyValue('--gate')).toBe(filled);
    expect(showValue()).toBe('1');
  });

  it('reset clears the accumulator so a later visit needs a fresh full push', () => {
    const gate = make();
    gate.feed(GATE_THRESHOLD_PX - 10, 1);
    gate.reset();
    gate.feed(20, 1);
    expect(onArmed).not.toHaveBeenCalled();
  });

  it('release removes --gate-show', () => {
    const gate = make();
    gate.feed(100, 1);
    gate.release();
    expect(showValue()).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-gate-control.test.ts`
Expected: FAIL — `Failed to resolve import "./about-gate-control"`

- [ ] **Step 3: Create `src/about/about-gate-control.ts`**

Move `GATE_IDLE_MS`, `gate`, `gateFed`, `idleTimer`, `syncGateShow`, `clearIdleTimer`, `scheduleIdleDrain` and `feedGateAt` across **with their full doc comments**, and fold `apply`'s leave-the-end block into `syncAt`.

```ts
// src/about/about-gate-control.ts
import { atCorridorEnd, createGate, feedGate, type GateState } from './about-gate';

/**
 * How long a push at the corridor's end can go quiet before the gate drains
 * back to zero on its own (the idle-retreat, QA change 2).
 *
 * Long enough that a reader who pauses mid-push — to read the label, to
 * breathe — isn't punished for the pause; short enough that the indicator
 * doesn't overstay once they've genuinely stopped. ~1s is the read for "you
 * stopped" without being twitchy; sized a touch under it so the retreat feels
 * prompt rather than sluggish. A tuning value, not derived from anything.
 *
 * Re-exported from about-flow.ts, which is where about-flow.test.ts imports it.
 */
export const GATE_IDLE_MS = 900;

export interface GateControl {
  /** Feed a wheel delta. Only acts at the corridor's end; arms → onArmed(). */
  feed(deltaPx: number, t: number): void;
  /**
   * Reconcile the gate with the current `t`. Called by the session after every
   * presentation.apply(), which is where these two writes used to live.
   */
  syncAt(t: number): void;
  /** enter(): clear the accumulator and the panel for a fresh visit. */
  reset(): void;
  clearTimer(): void;
  /** Teardown: remove --gate-show outright. */
  release(): void;
}

export function createGateControl(o: {
  /**
   * The corridor document's root, read fresh on every call: `doc` is null
   * between visits and is REPLACED on every enter(), so a captured element
   * would go stale after the first exit.
   */
  docRoot(): HTMLElement | null;
  onArmed(): void;
}): GateControl {
  // Reset on every enter() so a PREVIOUS visit's fully-armed gate can't fire on
  // the very first forward wheel tick of a later one.
  const gate: GateState = createGate();

  // Whether the gate has genuinely been fed since arriving at the corridor's
  // end (QA change 1) — the panel's own reveal, distinct from gate.accumulated,
  // which the idle-retreat timer below drains back to zero while this stays
  // true. See syncShow's own doc for why the two must not be the same read.
  let gateFed = false;

  // Rearmed on every push that reaches feed(), so it only ever fires
  // GATE_IDLE_MS after the LAST push, not the first. Held here rather than as a
  // feed()-local so a later push can find and clear the previous one instead of
  // leaving two timers racing to drain the same accumulator.
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Write the gate panel's reveal from whether it has genuinely been fed —
   * gateFed, not a live re-check of gate.accumulated. The two diverge on
   * purpose: the idle-retreat timeout drains accumulated back to zero so the
   * FILL can visibly ease down to nothing, but the panel itself — "keep
   * scrolling to return home" — stays offered for as long as you keep dwelling
   * at the corridor's end, or that easing would happen behind an already
   * vanished panel and be invisible. Only leaving the end (syncAt below) or
   * leaving the corridor (release) clears gateFed.
   *
   * The ONLY writer of --gate-show, full stop.
   */
  const syncShow = (): void => {
    document.documentElement.style.setProperty('--gate-show', gateFed ? '1' : '0');
  };

  /** Stop a pending idle-retreat timer without firing it. Idempotent. */
  const clearTimer = (): void => {
    if (idleTimer === null) return;
    clearTimeout(idleTimer);
    idleTimer = null;
  };

  /**
   * (Re)start the idle-retreat clock: GATE_IDLE_MS after the MOST RECENT push
   * at the corridor's end, drain the accumulator back to zero exactly as
   * leaving the end already does, and let .about-gate-fill's own width
   * transition (about.css) ease the fill down to nothing — no animation loop
   * needed here, only the one write. Does NOT touch gateFed/--gate-show: the
   * panel stays visible so that easing is actually seen, not hidden behind a
   * panel that vanished in the same frame — see syncShow's own doc.
   */
  const scheduleIdleDrain = (): void => {
    clearTimer();
    idleTimer = setTimeout(() => {
      idleTimer = null;
      gate.accumulated = 0;
      o.docRoot()?.style.removeProperty('--gate');
    }, GATE_IDLE_MS);
  };

  return {
    feed(deltaPx: number, t: number): void {
      // atCorridorEnd, not `t >= 1`: t is scrollY/(scrollHeight - innerHeight),
      // and at fractional display scaling (125%/150%, the Windows 11 default)
      // the rounded scrollHeight can put the real maximum scrollY a fraction
      // short — so a fully scrolled document reports t ~ 0.9999 and an exact
      // comparison meant the gate could never arm at all. See GATE_END_EPS.
      if (!atCorridorEnd(t)) return;
      const { armed, amount } = feedGate(gate, deltaPx);
      o.docRoot()?.style.setProperty('--gate', String(amount));
      // The panel's one entrance: the first push that leaves the accumulator
      // above zero. Sticky rather than re-derived from gate.accumulated on
      // every call — see syncShow's own doc for why the idle-retreat timer
      // must not also erase this.
      if (gate.accumulated > 0) gateFed = true;
      // A push can take gateFed from false to true, which is the one moment
      // the panel needs to appear outside syncAt's own per-scroll write.
      syncShow();
      if (armed) {
        // The flight is about to take over; nothing left to drain toward.
        clearTimer();
        o.onArmed();
        return;
      }
      // Rearm the idle clock on every push that doesn't already arm the gate.
      scheduleIdleDrain();
    },

    syncAt(t: number): void {
      // Reset the gate the moment you leave the end.
      //
      // feed() only WRITES --gate while atCorridorEnd(t), so pushing the
      // indicator to 50% and then scrolling back up used to freeze the green
      // fill at 50% for the rest of the corridor — and leave the accumulator
      // half-armed, so a later return to the end needed only half a push. The
      // gate measures intent against the end of the page; leaving the end
      // withdraws it, exactly as feedGate's own backward drain does. Guarded on
      // the accumulator so this is a no-op on all but the one frame that
      // crosses back out, rather than a per-frame style write.
      if (!atCorridorEnd(t) && gate.accumulated !== 0) {
        gate.accumulated = 0;
        o.docRoot()?.style.removeProperty('--gate');
        clearTimer();
        // Leaving the end withdraws the whole offer, not just the fill: the
        // panel is only relevant while you're at the bottom, pushing against
        // it. gateFed's only other reset is reset(), for a later visit.
        gateFed = false;
      }
      // Written every scrub, same as before, so the leave-the-end reset just
      // above is immediately reflected without a second call site.
      syncShow();
    },

    reset(): void {
      gate.accumulated = 0;
      gateFed = false;
    },

    clearTimer,

    release(): void {
      document.documentElement.style.removeProperty('--gate-show');
    },
  };
}
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `npx vitest run src/about/about-gate-control.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Rewire `about-flow.ts`**

- Replace the `GATE_IDLE_MS` definition with a re-export so the existing test import keeps resolving:
  ```ts
  import { createGateControl, GATE_IDLE_MS, type GateControl } from './about-gate-control';
  export { GATE_IDLE_MS };
  ```
- Delete `gate`, `gateFed`, `idleTimer`, `syncGateShow`, `clearIdleTimer`, `scheduleIdleDrain`, `feedGateAt` and the now-unused `atCorridorEnd`/`createGate`/`feedGate` imports.
- Construct it after `doReturnHome` is defined (so `onArmed` can reference it directly):
  ```ts
  const gateCtl: GateControl = createGateControl({
    docRoot: () => doc?.root ?? null,
    onArmed: () => void doReturnHome(),
  });
  ```
  If `doReturnHome` is declared below this point, use `onArmed: () => void doReturnHome()` anyway — it is a `const` arrow captured in a callback that only runs at wheel time, long after initialisation, so hoisting is not a concern. Verify with `npx tsc --noEmit`.
- In `apply()`, delete the leave-the-end block and the trailing `syncGateShow()`; the session calls `gateCtl.syncAt(t)` immediately after `apply(...)`. **For this task only**, the simplest correct move is to keep `apply()` as the single call site and end it with `gateCtl.syncAt(t)` — Task 4 lifts that out when `apply` moves to the presentation module.
- `onWheel` calls `gateCtl.feed(deltaPx, t)`; `feedGateForTest` likewise.
- `enter()` calls `gateCtl.reset()` in place of the two assignments.
- `exit()` and `doReturnHome` call `gateCtl.clearTimer()`.
- `releaseSharedState` calls `gateCtl.release()` in place of its `--gate-show` removal.

- [ ] **Step 6: Run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; **1528 passed, 4 skipped**

- [ ] **Step 7: Commit**

```bash
git add src/about/about-gate-control.ts src/about/about-gate-control.test.ts src/about/about-flow.ts
git commit -m "refactor(about): extract the footer gate controller"
```

---

### Task 3: `about-return.ts` — the flight, owning both ends of the handover

The highest-risk task. `applyReturn`'s `p >= 1` branch is a five-step sequence whose ORDER is the thing that closes the loop.

**Files:**
- Create: `src/about/about-return.ts`
- Create: `src/about/about-return.test.ts`
- Modify: `src/about/about-flow.ts` — remove `RETURN_S`, `RETURN_FADE_P`, the return scratch, `applyReturn`, `doReturnHome`

**Interfaces:**
- Consumes: `HOME_REST_Z` from `../three/world`, `footerRiseAt` from `./about-scrub`, `AboutPath`
- Produces: `ReturnFlight` (methods `start`, `step`, `inFlight`), `createReturnFlight(deps, path): ReturnFlight`

- [ ] **Step 1: Write the failing test**

Create `src/about/about-return.test.ts`. Note the director stub carries **both** methods — that is the point of the module.

```ts
// src/about/about-return.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { HOME_REST_Z } from '../three/world';
import { buildAboutPath } from './about-path';
import { createReturnFlight } from './about-return';

const path = buildAboutPath(new THREE.Vector3(0, 0, -26));

function setup(reducedMotion = false) {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(3, 4, -20);
  camera.quaternion.setFromEuler(new THREE.Euler(0.4, 0, 0));
  const director = { setSuspended: vi.fn(), syncTo: vi.fn() };
  const ferroEl = document.createElement('div');
  const flight = createReturnFlight({ camera, director, ferroEl, reducedMotion }, path);
  return { camera, director, ferroEl, flight };
}

const rise = (): string =>
  document.documentElement.style.getPropertyValue('--footer-rise');

describe('createReturnFlight', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--footer-rise');
    vi.restoreAllMocks();
  });

  it('reports not in flight before it starts', () => {
    expect(setup().flight.inFlight()).toBe(false);
  });

  it('lands the camera at Home', () => {
    const { camera, flight } = setup(true);
    void flight.start({ t: 1, onDepart: () => {}, onLanded: () => {} });
    expect(camera.position.z).toBeCloseTo(HOME_REST_Z, 5);
  });

  it('calls onDepart exactly once, at departure', () => {
    const onDepart = vi.fn();
    const { flight } = setup(true);
    void flight.start({ t: 1, onDepart, onLanded: () => {} });
    expect(onDepart).toHaveBeenCalledTimes(1);
  });

  it('hands the director BOTH ends: syncTo before setSuspended(false)', () => {
    const { director, flight } = setup(true);
    void flight.start({ t: 1, onDepart: () => {}, onLanded: () => {} });
    expect(director.syncTo).toHaveBeenCalledWith(HOME_REST_Z);
    expect(director.setSuspended).toHaveBeenCalledWith(false);
    expect(director.syncTo.mock.invocationCallOrder[0]).toBeLessThan(
      director.setSuspended.mock.invocationCallOrder[0],
    );
  });

  it('tears the session down BEFORE resuming the director', () => {
    const { director, flight } = setup(true);
    const onLanded = vi.fn();
    void flight.start({ t: 1, onDepart: () => {}, onLanded });
    expect(onLanded.mock.invocationCallOrder[0]).toBeLessThan(
      director.syncTo.mock.invocationCallOrder[0],
    );
  });

  it('fades the blob out over the first RETURN_FADE_P of the flight', () => {
    const { ferroEl, flight } = setup();
    void flight.start({ t: 1, onDepart: () => {}, onLanded: () => {} });
    flight.step(0);
    expect(Number(ferroEl.style.opacity)).toBeCloseTo(1, 5);
    flight.step(0.45);
    expect(Number(ferroEl.style.opacity)).toBeCloseTo(0, 5);
    flight.step(0.8);
    expect(Number(ferroEl.style.opacity)).toBeCloseTo(0, 5);
  });

  it('walks the chrome down rather than dropping it', () => {
    const { flight } = setup();
    void flight.start({ t: 1, onDepart: () => {}, onLanded: () => {} });
    flight.step(0);
    const departed = Number(rise());
    expect(departed).toBeGreaterThan(0);
    flight.step(0.5);
    expect(Number(rise())).toBeLessThan(departed);
    expect(Number(rise())).toBeGreaterThan(0);
  });

  it('is in flight until it lands', () => {
    const { flight } = setup();
    void flight.start({ t: 1, onDepart: () => {}, onLanded: () => {} });
    expect(flight.inFlight()).toBe(true);
    flight.step(1);
    expect(flight.inFlight()).toBe(false);
  });

  it('resolves the promise when it lands', async () => {
    const { flight } = setup();
    const done = flight.start({ t: 1, onDepart: () => {}, onLanded: () => {} });
    flight.step(1);
    await expect(done).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-return.test.ts`
Expected: FAIL — `Failed to resolve import "./about-return"`

- [ ] **Step 3: Create `src/about/about-return.ts`**

Move `RETURN_S`, `RETURN_FADE_P`, `fromPos`/`fromQuat`/`homePos`/`homeQuat`/`returnResolve`/`fromRise`, `applyReturn` and `doReturnHome` across **with every doc comment intact** — including the long `--gate-show`-is-deliberately-not-written-here note and the `syncTo`-not-`jumpTo` note, both of which record real bugs.

Structural changes only:
- `doReturnHome`'s listener detaches, its `clearIdleTimer()` and its `doc.root.style.pointerEvents = 'none'` become the caller's `onDepart()`.
- `applyReturn`'s `p >= 1` session teardown (`open`, `paused`, `doc.destroy()`, `lastBeat`, `t`, `releaseSharedState()`) becomes the caller's `onLanded()`, invoked **before** `director.syncTo` — the order is asserted by the test above.
- `doc.root.style.opacity` is written through an `docRoot()` thunk supplied by `start`'s caller... **no**: keep it simple and correct — `start` takes the document root once, at departure, since the document cannot be replaced mid-flight (the listeners are detached and `enter()` cannot run while `open`). Add `docRoot: HTMLElement | null` to `start`'s options.
- Its own guard `if (!open) return Promise.resolve()` moves to the session, which owns `open`.

```ts
export interface ReturnFlight {
  start(o: {
    t: number;
    docRoot: HTMLElement | null;
    onDepart(): void;
    onLanded(): void;
  }): Promise<void>;
  step(p: number): void;
  inFlight(): boolean;
}
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `npx vitest run src/about/about-return.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Rewire `about-flow.ts`**

```ts
const flight = createReturnFlight(
  { camera: deps.camera, director: deps.director, ferroEl: deps.ferroEl, reducedMotion: deps.reducedMotion },
  path,
);

const doReturnHome = (): Promise<void> => {
  if (!open) return Promise.resolve();
  return flight.start({
    t,
    docRoot: doc?.root ?? null,
    onDepart: () => {
      gateCtl.clearTimer();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('wheel', onWheel);
    },
    onLanded: () => {
      open = false;
      paused = false;
      doc?.destroy();
      doc = null;
      lastBeat = null;
      t = 0;
      releaseSharedState();
    },
  });
};
```

`stepReturnForTest` becomes `flight.step(...)` behind its existing `open` guard; `pause()`/`resume()`'s `returnResolve` check becomes `flight.inFlight()`.

Keep `doReturnHome`'s and `onDepart`'s original comments — the belt-and-braces `clearIdleTimer` note and the "also detached here, not just at p>=1" note.

- [ ] **Step 6: Run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; **1528 passed, 4 skipped**. `about-flow-integration.test.ts` is the one that exercises the real director against the real flight — if the handover order regressed, it fails here.

- [ ] **Step 7: Commit**

```bash
git add src/about/about-return.ts src/about/about-return.test.ts src/about/about-flow.ts
git commit -m "refactor(about): extract the return flight, owning both ends of the handover"
```

---

### Task 4: `about-presentation.ts` — given a `t`, write the world

**Files:**
- Create: `src/about/about-presentation.ts`
- Create: `src/about/about-presentation.test.ts`
- Modify: `src/about/about-flow.ts` — remove `IN_FRONT`, the scratch objects, `lastBeat`, `bgCanvas`, `projectionViewport`, `applyBeat`, `apply`, `releaseSharedState`, `ABOUT_OPEN_CLASS`

**Interfaces:**
- Consumes: `paletteAt`/`DAY_INK`, `beatAt`/`footerRiseAt`, `workWallFadeAt`, `projectToRect`, `ferroWorldAt`/`ferroFadeAt`/`FERRO_RADIUS`, `DESTINATIONS`
- Produces: `PresentationDeps`, `Presentation` (methods `apply`, `resetBeat`, `openClass`, `releaseSharedState`), `createPresentation(deps, path): Presentation`

- [ ] **Step 1: Write the failing test**

Create `src/about/about-presentation.test.ts`. Build the deps from the same shape `about-flow.test.ts` already uses for `AboutFlowDeps` so the two agree.

```ts
// src/about/about-presentation.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DESTINATIONS } from '../three/world';
import { DAY_INK } from './about-palette';
import { buildAboutPath } from './about-path';
import { createPresentation, type PresentationDeps } from './about-presentation';

const anchorRest = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ;
const path = buildAboutPath(new THREE.Vector3(0, 0, anchorRest));

function setup(reducedMotion = false) {
  const ferroEl = document.createElement('div');
  const deps: PresentationDeps = {
    camera: new THREE.PerspectiveCamera(),
    world: { setAboutMode: vi.fn(), setAnchoredFade: vi.fn() },
    atmosphere: { setInk: vi.fn() },
    scrollNav: { setMode: vi.fn() },
    ferro: { placeAt: vi.fn().mockResolvedValue(undefined), show: vi.fn(), hide: vi.fn() },
    ferroEl,
    cursor: { setOnDark: vi.fn() },
    background: { setInvertAmount: vi.fn() },
    setGround: vi.fn(),
    setTextInk: vi.fn(),
    reducedMotion,
  };
  return { deps, ferroEl, presentation: createPresentation(deps, path) };
}

afterEach(() => {
  document.documentElement.style.cssText = '';
  document.documentElement.className = '';
});

describe('createPresentation.apply', () => {
  it('writes the camera pose sampled from the path', () => {
    const { deps, presentation } = setup();
    presentation.apply(0.5);
    const expected = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    path.sample(0.5, expected);
    expect(deps.camera.position.distanceTo(expected.position)).toBeCloseTo(0, 6);
    expect(deps.camera.quaternion.angleTo(expected.quaternion)).toBeCloseTo(0, 6);
  });

  it('fans the palette out to ground, ink, atmosphere, cursor and background', () => {
    const { deps, presentation } = setup();
    presentation.apply(0.5);
    expect(deps.setGround).toHaveBeenCalled();
    expect(deps.setTextInk).toHaveBeenCalled();
    expect(deps.atmosphere.setInk).toHaveBeenCalled();
    expect(deps.cursor!.setOnDark).toHaveBeenCalled();
    expect(deps.background!.setInvertAmount).toHaveBeenCalled();
  });

  it('writes --footer-rise every scrub', () => {
    const { presentation } = setup();
    presentation.apply(1);
    expect(
      document.documentElement.style.getPropertyValue('--footer-rise'),
    ).not.toBe('');
  });

  it('does NOT write --gate or --gate-show — that is the gate control now', () => {
    const { presentation } = setup();
    presentation.apply(1);
    expect(document.documentElement.style.getPropertyValue('--gate-show')).toBe('');
  });

  it('toggles the blob behind-class once per beat change, not per frame', () => {
    const { ferroEl, presentation } = setup();
    presentation.apply(0);
    const first = ferroEl.className;
    const spy = vi.spyOn(ferroEl.classList, 'toggle');
    presentation.apply(0.001);
    expect(spy).not.toHaveBeenCalled();
    expect(ferroEl.className).toBe(first);
  });

  it('resetBeat forces the next apply to re-toggle the behind-class', () => {
    const { ferroEl, presentation } = setup();
    presentation.apply(0);
    presentation.resetBeat();
    const spy = vi.spyOn(ferroEl.classList, 'toggle');
    presentation.apply(0);
    expect(spy).toHaveBeenCalled();
  });

  it('allocates nothing per frame — the camera vector identity is stable', () => {
    const { deps, presentation } = setup();
    const before = deps.camera.position;
    presentation.apply(0.2);
    presentation.apply(0.7);
    expect(deps.camera.position).toBe(before);
  });
});

describe('createPresentation.releaseSharedState', () => {
  it('restores background, atmosphere and cursor unconditionally', () => {
    const { deps, presentation } = setup();
    presentation.apply(0.5);
    presentation.releaseSharedState();
    expect(deps.background!.setInvertAmount).toHaveBeenLastCalledWith(0);
    expect(deps.atmosphere.setInk).toHaveBeenLastCalledWith(DAY_INK);
    expect(deps.cursor!.setOnDark).toHaveBeenLastCalledWith(false);
  });

  it('clears the escape-hatch custom properties', () => {
    const { presentation } = setup();
    presentation.apply(0.5);
    presentation.releaseSharedState();
    const s = document.documentElement.style;
    expect(s.getPropertyValue('--ground')).toBe('');
    expect(s.getPropertyValue('--ink')).toBe('');
    expect(s.getPropertyValue('--footer-rise')).toBe('');
  });

  it('leaves ferro, scrollNav and world alone under reduced motion', () => {
    const { deps, presentation } = setup(true);
    presentation.releaseSharedState();
    expect(deps.ferro!.hide).not.toHaveBeenCalled();
    expect(deps.scrollNav!.setMode).not.toHaveBeenCalled();
    expect(deps.world.setAboutMode).not.toHaveBeenCalled();
  });

  it('restores ferro, scrollNav and world when motion is allowed', () => {
    const { deps, presentation } = setup(false);
    presentation.releaseSharedState();
    expect(deps.ferro!.hide).toHaveBeenCalled();
    expect(deps.scrollNav!.setMode).toHaveBeenCalledWith('world');
    expect(deps.world.setAboutMode).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-presentation.test.ts`
Expected: FAIL — `Failed to resolve import "./about-presentation"`

- [ ] **Step 3: Create `src/about/about-presentation.ts`**

Move `IN_FRONT`, `ABOUT_OPEN_CLASS`, `bgCanvas`, `viewportScratch`, `projectionViewport`, `pose`, `ferroScratch`, `anchorPos`, `lastBeat`, `applyBeat`, `apply` and `releaseSharedState` across **with every doc comment**. Three changes only:

1. `apply(next)` becomes `apply(t)` and **drops its `t = next` assignment** — the session owns `t`.
2. `apply` drops the leave-the-end gate block and the trailing `syncGateShow()` (already moved in Task 2); the session now calls `gateCtl.syncAt(t)` right after.
3. `releaseSharedState` drops its `--gate-show` removal (`gateCtl.release()` does it) and reads `deps.reducedMotion` from its own deps.

Expose the open-class helpers the session needs rather than letting it reach for the DOM itself:

```ts
export interface Presentation {
  apply(t: number): void;
  resetBeat(): void;
  /** enter()/exit(): the about-open class and the reduced-motion canvas hide. */
  setOpenClass(on: boolean): void;
  hideCanvas(on: boolean): void;
  releaseSharedState(): void;
}
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `npx vitest run src/about/about-presentation.test.ts`
Expected: PASS, 11 tests

- [ ] **Step 5: Rewire `about-flow.ts`**

Construct `const presentation = createPresentation(deps, path);` and replace every call: `apply(x)` → `presentation.apply(x); gateCtl.syncAt(x);` wrapped in one local `const scrubTo = (next: number): void => { t = next; presentation.apply(t); gateCtl.syncAt(t); };` so the four call sites (`onScroll`, `enter`, `resume`, `setScrollForTest`) stay one-liners and `t` has exactly one writer. `lastBeat = null` → `presentation.resetBeat()`.

- [ ] **Step 6: Run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; **1528 passed, 4 skipped**

- [ ] **Step 7: Commit**

```bash
git add src/about/about-presentation.ts src/about/about-presentation.test.ts src/about/about-flow.ts
git commit -m "refactor(about): extract the per-frame presentation write"
```

---

### Task 5: `about-session.ts` — the state machine and its listeners

What remains of the closure after Tasks 1–4. It moves as a unit.

**Files:**
- Create: `src/about/about-session.ts`
- Create: `src/about/about-session.test.ts`
- Modify: `src/about/about-flow.ts` — reduced to types + wiring

**Interfaces:**
- Consumes: `Presentation`, `ReturnFlight`, `createGateControl`, `about-nav`'s three functions, `scrollToT`, `shouldLeaveCorridor`, `normalizeWheelDelta`, `mountAboutDocument`, `buildFooter`
- Produces: `createSession(o: { deps: AboutFlowDeps; path: AboutPath; presentation: Presentation; flight: ReturnFlight }): AboutFlow`

- [ ] **Step 1: Write the failing test**

Create `src/about/about-session.test.ts` covering the guard table, which is the thing this module newly makes testable in isolation:

```ts
// src/about/about-session.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DESTINATIONS } from '../three/world';
import { buildAboutPath } from './about-path';
import { createSession } from './about-session';
import type { AboutFlowDeps } from './about-flow';

const anchorRest = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ;
const path = buildAboutPath(new THREE.Vector3(0, 0, anchorRest));

function setup(reducedMotion = false) {
  const presentation = {
    apply: vi.fn(),
    resetBeat: vi.fn(),
    setOpenClass: vi.fn(),
    hideCanvas: vi.fn(),
    releaseSharedState: vi.fn(),
  };
  const flight = { start: vi.fn().mockResolvedValue(undefined), step: vi.fn(), inFlight: vi.fn(() => false) };
  const deps = {
    camera: new THREE.PerspectiveCamera(),
    director: { setSuspended: vi.fn(), syncTo: vi.fn() },
    world: { setAboutMode: vi.fn(), setAnchoredFade: vi.fn() },
    atmosphere: { setInk: vi.fn() },
    scrollNav: { setMode: vi.fn() },
    ferro: { placeAt: vi.fn().mockResolvedValue(undefined), show: vi.fn(), hide: vi.fn() },
    ferroEl: document.createElement('div'),
    cursor: { setOnDark: vi.fn() },
    background: { setInvertAmount: vi.fn() },
    setGround: vi.fn(),
    setTextInk: vi.fn(),
    reducedMotion,
  } as unknown as AboutFlowDeps;
  const session = createSession({ deps, path, presentation, flight });
  return { deps, presentation, flight, session };
}

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.className = '';
});

describe('the guard table', () => {
  it('setScrollForTest does nothing while closed', () => {
    const { presentation, session } = setup();
    session.setScrollForTest(0.5);
    expect(presentation.apply).not.toHaveBeenCalled();
  });

  it('setScrollForTest does nothing while paused — pause() detaches the listener, so the seam carries the term', () => {
    const { presentation, session } = setup();
    session.enter(document.body);
    session.pause();
    presentation.apply.mockClear();
    session.setScrollForTest(0.5);
    expect(presentation.apply).not.toHaveBeenCalled();
  });

  it('setScrollForTest does nothing under reduced motion', () => {
    const { presentation, session } = setup(true);
    session.enter(document.body);
    presentation.apply.mockClear();
    session.setScrollForTest(0.5);
    expect(presentation.apply).not.toHaveBeenCalled();
  });

  it('stepReturnForTest guards on open ALONE — legitimate while paused and under reduced motion', () => {
    const { flight, session } = setup(true);
    session.enter(document.body);
    session.pause();
    session.stepReturnForTest(0.5);
    expect(flight.step).toHaveBeenCalledWith(0.5);
  });

  it('pause() refuses while the flight is in the air', () => {
    const { flight, session } = setup();
    session.enter(document.body);
    flight.inFlight.mockReturnValue(true);
    session.pause();
    session.resume();
    expect(session.isOpen()).toBe(true);
  });
});

describe('enter and exit', () => {
  it('enter suspends the director and puts the world in About mode', () => {
    const { deps, session } = setup();
    session.enter(document.body);
    expect(deps.director.setSuspended).toHaveBeenCalledWith(true);
    expect(deps.world.setAboutMode).toHaveBeenCalledWith(true);
    expect(session.isOpen()).toBe(true);
  });

  it('enter is idempotent', () => {
    const { deps, session } = setup();
    session.enter(document.body);
    session.enter(document.body);
    expect(deps.director.setSuspended).toHaveBeenCalledTimes(1);
  });

  it('reduced motion does NOT suspend the director', () => {
    const { deps, session } = setup(true);
    session.enter(document.body);
    expect(deps.director.setSuspended).not.toHaveBeenCalled();
    expect(deps.world.setAboutMode).not.toHaveBeenCalled();
  });

  it('exit cuts the camera to the anchor and releases the director LAST', () => {
    const { deps, session } = setup();
    session.enter(document.body);
    session.exit();
    expect(deps.camera.position.z).toBe(anchorRest);
    expect(deps.director.setSuspended).toHaveBeenLastCalledWith(false);
    expect(session.isOpen()).toBe(false);
  });

  it('exit is a no-op when never opened', () => {
    const { deps, session } = setup();
    session.exit();
    expect(deps.director.setSuspended).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/about/about-session.test.ts`
Expected: FAIL — `Failed to resolve import "./about-session"`

- [ ] **Step 3: Create `src/about/about-session.ts`**

Move the whole remaining closure body across — `open`/`paused`/`t`/`doc`, the `gateCtl` construction, `scrubTo`, `onScroll`, `onResize`, `onWheel`, `exit`, `doReturnHome`, `stepBeat`, `onFooterNav`, and the returned object's `enter`/`pause`/`resume`/seams — **with every doc comment**. It returns the `AboutFlow` object directly.

Add the one new thing the spec calls for, and **only** this: name the shared predicate, keeping each departure's existing comment at its own site.

```ts
/**
 * The scrub guard, shared by onResize, onWheel, stepBeat, feedGateForTest and
 * setScrollForTest. Named rather than hand-copied six times: the six copies
 * were identical in effect and different in wording, so the two that
 * deliberately DEPART from it were indistinguishable from typos.
 *
 * The two departures, both kept and both commented at their own site:
 * onScroll omits `paused` because pause() DETACHES it (the seams that bypass
 * the listener carry the term instead), and stepReturnForTest guards on `open`
 * alone because the return is legitimate under reduced motion and whether or
 * not the corridor is paused.
 */
const canScrub = (): boolean => open && !paused && !deps.reducedMotion;
```

`createSession` signature:

```ts
export function createSession(o: {
  deps: AboutFlowDeps;
  path: AboutPath;
  presentation: Presentation;
  flight: ReturnFlight;
}): AboutFlow;
```

`AboutFlowDeps`, `AboutFlow` and `GATE_IDLE_MS` all stay exported from `about-flow.ts`; import the two types from there. A type-only import back to `about-flow.ts` is not a runtime cycle, but if `tsc` or Vite complains, move both interfaces into `about-session.ts` and re-export them from `about-flow.ts` instead — `export type { AboutFlow, AboutFlowDeps } from './about-session';`.

- [ ] **Step 4: Run the new test to verify it passes**

Run: `npx vitest run src/about/about-session.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Reduce `about-flow.ts` to wiring**

```ts
export function initAboutFlow(deps: AboutFlowDeps): AboutFlow {
  const anchorRest = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ;
  const path: AboutPath = buildAboutPath(new THREE.Vector3(0, 0, anchorRest));
  const presentation = createPresentation(deps, path);
  const flight = createReturnFlight(
    {
      camera: deps.camera,
      director: deps.director,
      ferroEl: deps.ferroEl,
      reducedMotion: deps.reducedMotion,
    },
    path,
  );
  return createSession({ deps, path, presentation, flight });
}
```

Keep the module's top doc comment (the "handover, not replacement" note) and the `AboutFlow`/`AboutFlowDeps` interfaces with all their per-member docs — they are the public contract and belong at the front door.

- [ ] **Step 6: Run the full suite**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; **1528 passed, 4 skipped**

- [ ] **Step 7: Commit**

```bash
git add src/about/about-session.ts src/about/about-session.test.ts src/about/about-flow.ts
git commit -m "refactor(about): extract the session state machine; about-flow is now wiring"
```

---

### Task 6: Verify and record

**Files:**
- Modify: `docs/superpowers/plans/2026-08-24-about-spine-followups.md` — mark section B done
- Verify: every file in `src/about/`

- [ ] **Step 1: Confirm the sizes landed where the spec said**

Run: `wc -l src/about/about-*.ts | sort -n`
Expected: no module over ~350 lines; `about-flow.ts` around 150.

- [ ] **Step 2: Confirm no comment was orphaned**

Run: `git diff main --stat` and then, for each new module, `git log -p -1 --stat`.
Read the diff for `about-flow.ts` specifically: every deleted comment block must appear in exactly one new file. A deleted comment with no counterpart is a lost bug record — restore it.

- [ ] **Step 3: Confirm the dependency graph is acyclic**

Run: `grep -n "^import" src/about/about-{flow,session,presentation,return,nav,gate-control}.ts`
Expected: `about-nav` and `about-gate-control` import no sibling controller; `about-return` imports no sibling controller; `about-session` imports presentation/return/gate-control/nav; `about-flow` imports presentation/return/session. No module imports one that imports it back.

- [ ] **Step 4: Full verification**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: tsc clean; **1528 passed, 4 skipped, 120 files**; build succeeds.

- [ ] **Step 5: Adam drives it in a foreground browser**

Run `npm run dev`, open **`http://127.0.0.1:5173/`** — not `localhost`, which resolves to a stale IPv6-bound dev server. Automation tabs have no rAF, so this check cannot be delegated. Walk:

1. Scrub the full corridor top to bottom — palette, ground, blob path, beat stacking.
2. Push at the very end: the gate panel appears, fills, and the return flight departs and lands at Home with the chrome riding down.
3. Push at the end, then stop: the fill eases to nothing after ~900ms, the panel stays.
4. Push at the end, then scroll back up: the fill and the panel both withdraw.
5. Open the contact modal from a behind-beat (contact, clientWall or capabilities); the blob is visible over it; close it and land back on the same beat.
6. Arrow keys step beats; ArrowUp at the very top leaves the corridor.
7. Backward wheel at the top leaves the corridor.
8. Resize the window mid-corridor; the document re-lays out and the camera holds its beat.
9. `prefers-reduced-motion` on: the document scrolls natively, the canvas is hidden.

- [ ] **Step 6: Mark section B complete**

In `docs/superpowers/plans/2026-08-24-about-spine-followups.md`, add under section B's heading:

```markdown
**DONE (2026-09-04).** Split into about-presentation / about-session / about-return /
about-gate-control / about-nav, leaving about-flow.ts as wiring. See
`docs/superpowers/plans/2026-09-04-about-flow-split.md`. The gate controller and the
pure nav module were not in the original suggestion; pulling them out is what removed
the presentation-to-session coupling rather than merely relocating it.
```

- [ ] **Step 7: Commit and merge**

```bash
git add docs/superpowers
git commit -m "docs(about): record the about-flow split against section B"
git checkout main
git merge --no-ff refactor/about-flow-split
npm test
git push
```

---

## Self-review

**Spec coverage.** Presentation (Task 4), session (Task 5), return (Task 3), gate control (Task 2), nav (Task 1), wiring (Task 5 step 5), the inverted presentation→gate edge (Tasks 2 and 4), the director's full type in the return module (Task 3, asserted by two ordering tests), the named guard predicate (Task 5), comment preservation (Task 6 step 2), the acyclic check (Task 6 step 3), and Adam's foreground pass (Task 6 step 5). The "no per-frame allocation" constraint is asserted in Task 4's test rather than only stated.

**Type consistency.** `Presentation` gained `setOpenClass`/`hideCanvas` in Task 4 and Task 5's test stubs both. `ReturnFlight.start` takes `docRoot` from Task 3 onward and Task 3's rewire passes it. `GateControl.clearTimer` is the name used in Tasks 2, 3 and 5. `nextBeatId` is the name in Task 1 and its only call site.

**Known soft spot.** Task 5 is the largest single move and has the least new test coverage relative to what it carries, because most of its behaviour is already covered by `about-flow.test.ts` through the public API. That is intentional — the characterization suite is the net there, and duplicating it would only pin the implementation. If Task 5's full-suite run fails, bisect by reverting only step 5's wiring and re-running.
