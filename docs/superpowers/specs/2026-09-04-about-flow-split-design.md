# commms — Splitting `about-flow.ts` — Design

**Date:** 2026-09-04
**Status:** agreed, ready to plan
**Implements:** section B of `docs/superpowers/plans/2026-08-24-about-spine-followups.md`

## The problem

`src/about/about-flow.ts` is **1017 lines** (575 when first flagged) doing fourteen
jobs across eleven dependencies: the camera path, the per-frame camera write, the
palette fan-out, beat detection, DOM lifecycle, the scroll lock, three listeners,
enter/exit, pause/resume, the footer gate, a GSAP tween, footer nav, the shared-state
release, and five test seams.

The final reviewer of the spine plan put it exactly right: it has been **documented
into coherence rather than structured into it**, which is why it still reads fine and
why nobody noticed the mass.

The evidence it has outgrown itself is the return-flight bug. `returnHome` is a
camera-and-director handover living in a module whose `director` dependency was typed
`{ setSuspended }` — it could not express what the move required, so it shipped doing
half of it.

Five content plans (portraits, client wall, capabilities, AI copy, and mounting the
comms array into the `lander` beat) mount into this file. The array was deliberately
built standalone behind `?lab=array` to avoid waiting on this split, so it is owed.

## The constraint that makes this safe

`initAboutFlow(deps: AboutFlowDeps): AboutFlow` **does not change** — not its
signature, not the `AboutFlow` interface, not `AboutFlowDeps`, not the exported
`GATE_IDLE_MS`.

Both test files import through that public surface and nothing else:

- `about-flow.test.ts` (1446 lines) — `initAboutFlow`, `AboutFlowDeps`, `GATE_IDLE_MS`
- `about-flow-integration.test.ts` (251 lines) — `initAboutFlow`, `AboutFlow`, `AboutFlowDeps`

So the existing 1697 lines of test are a **characterization net**: they cannot tell
the difference between before and after except by catching a behaviour change. That is
the whole verification story. `main.ts` likewise touches only the public methods.

## Decomposition

Four new modules plus wiring. The dependency graph is **acyclic** — this was the part
worth designing rather than assuming, because the obvious reading of section B is not.

```
about-flow.ts .................. types + wiring (~150)
  |
  +-- about-presentation.ts .... given a t, write the world           (~250)
  +-- about-return.ts .......... the flight + both ends of the handover (~180)
  +-- about-nav.ts ............. pure navigation maths                (~120)
  +-- about-session.ts ......... open/paused/t/doc + listeners        (~330)
        +-- about-gate-control.ts .. gate/gateFed/idleTimer           (~120)
```

Nothing over ~330 lines. No module imports a sibling that imports it back.

### `about-presentation.ts` — given a `t`, write the world

Owns `pose`, `ferroScratch`, `anchorPos`, `viewportScratch`, `lastBeat`.

```ts
export interface PresentationDeps { /* the subset of AboutFlowDeps apply() reads */ }
export interface Presentation {
  apply(t: number): void;            // camera + palette + ferro + --footer-rise
  resetBeat(): void;                 // lastBeat = null
  releaseSharedState(): void;
}
export function createPresentation(deps: PresentationDeps, path: AboutPath): Presentation;
```

**It does not own `t`.** Today `apply()` opens with `t = next`, which is why the
per-frame write and the state machine look inseparable. They are not: the caller owns
`t` and passes it. This is the single change that makes the split possible.

### The edge that gets inverted

Today `apply()` reaches into gate state directly:

```js
if (!atCorridorEnd(t) && gate.accumulated !== 0) { /* reset, gateFed = false */ }
syncGateShow();
```

That is the presentation module poking session state, and it is the reason a naive
extraction leaves the two welded together. But both are pure functions of `t` plus
gate state, and both are DOM writes — they do not need to be inside `apply()` at all.
They need to happen whenever `t` changes.

So the session's own apply becomes two calls, in this order:

```ts
presentation.apply(t);
gate.syncAt(t);        // the leave-the-end reset, then --gate-show
```

and the presentation → gate edge disappears entirely. Ordering is preserved: the gate
writes ran last inside `apply()` and they still run last.

### `about-gate-control.ts` — the footer gate's controller

Owns `gate` (`GateState`), `gateFed`, `idleTimer`. Constructed and owned by the
session, which is its only caller, so there is no cycle.

```ts
export const GATE_IDLE_MS = 900;   // re-exported from about-flow.ts for the test
export interface GateControl {
  feed(deltaPx: number, t: number): void;  // arms → onArmed()
  syncAt(t: number): void;                 // leave-the-end reset, then --gate-show
  reset(): void;                           // enter(): accumulated = 0, gateFed = false
  clearTimer(): void;
  release(): void;                         // remove --gate-show
}
export function createGateControl(o: {
  docRoot(): HTMLElement | null;
  onArmed(): void;
}): GateControl;
```

`docRoot()` is a thunk, not an element: `doc` is null between visits and is replaced
on every `enter()`, so a captured reference would go stale. `onArmed` is the session's
`beginReturn`.

The two-value distinction survives intact and must: `gate.accumulated` is drained by
the idle-retreat timer so the fill can visibly ease down, while `gateFed` stays true
so the panel is still there to see it happen.

### `about-return.ts` — the flight, owning both ends of the handover

Owns `fromPos`, `fromQuat`, `homePos`, `homeQuat`, `fromRise`, `returnResolve`.

```ts
export interface ReturnFlight {
  start(o: { t: number; onDepart(): void; onLanded(): void }): Promise<void>;
  step(p: number): void;      // the stepReturnForTest seam
  inFlight(): boolean;        // returnResolve !== null — pause()/resume() read this
}
export function createReturnFlight(
  deps: {
    camera: THREE.PerspectiveCamera;
    director: { setSuspended(v: boolean): void; syncTo(z: number): void };
    ferroEl: HTMLElement | null;
    reducedMotion: boolean;
  },
  path: AboutPath,
): ReturnFlight;
```

**This module takes the director's full type, both methods, deliberately.** The bug
that motivates this whole split existed because the type was narrowed to
`{ setSuspended }` in the module that owned the flight, which made the missing
`syncTo` unrepresentable. Section B's phrase is "owning both ends of the handover" and
that is load-bearing: `syncTo(homePos.z)` and `setSuspended(false)` stay **inside**
this module, at `p >= 1`, in that order, after `onLanded()`.

The split at `p >= 1` is therefore:

| step | who |
|---|---|
| 1. close the session — `open=false`, `paused=false`, `doc.destroy()`, `t=0` | `onLanded()` (session) |
| 2. `presentation.resetBeat()` + `releaseSharedState()` | `onLanded()` (session) |
| 3. `director.syncTo(homePos.z)` | **return** |
| 4. `director.setSuspended(false)` | **return** |
| 5. resolve the promise | **return** |

The order is not incidental. Steps 3–4 must follow 1–2 because the director resumes
writing the camera from there and must not do so while the world is still in About
mode. Preserving this exact sequence is the single highest-risk line in the refactor.

`onDepart()` is the session's: detach the three listeners, clear the idle timer, set
`doc.root.style.pointerEvents = 'none'`.

Return imports `footerRiseAt` directly rather than asking presentation for it, so it
carries no sibling dependency at all.

### `about-nav.ts` — pure navigation maths, no state

```ts
export function scrollDocumentTo(target: number): void;
export function scrollToBeat(path: AboutPath, id: BeatId): void;
export function nextBeatId(path: AboutPath, t: number, dir: 1 | -1): BeatId;
```

`nextBeatId` is `stepBeat`'s index arithmetic — including the ruling that backward
from partway through a beat goes to that beat's own start first, and that forward past
the last beat clamps. Stateless and directly unit-testable, which it is not today.

The guards and the `exit()` calls stay in the session: `stepBeat`'s
`open/paused/reducedMotion` check and its leave-at-the-top `exit()`, and
`onFooterNav`'s `'work'` branch. Those are session decisions, not navigation maths.

### `about-session.ts` — the state machine and its listeners

Owns `open`, `paused`, `t`, `doc`; constructs the gate control; holds `onScroll`,
`onResize`, `onWheel`, `enter`, `exit`, `pause`, `resume`, `stepBeat`, `onFooterNav`,
`beginReturn` and the test seams.

The guard table becomes explicit. Six hand-copied conditionals across `onScroll`,
`onResize`, `onWheel`, `stepBeat`, `feedGateForTest` and `setScrollForTest` currently
differ from one another in ways that are correct but only discoverable by reading six
comments. They collapse to one predicate with named terms:

```ts
const canScrub = (): boolean => open && !paused && !deps.reducedMotion;
```

with the two documented departures kept and commented where they are:
`stepReturnForTest` guards on `open` alone (the return is legitimate under reduced
motion and whether or not paused), and `onScroll` omits `paused` because `pause()`
detaches it — the seams that bypass the listener carry the term instead.

## What must not change

- Every DOM property write, its value, and **the order writes happen in**. The
  `--gate-show`/`--gate`/`--footer-rise` sequencing is load-bearing and several of the
  comments record bugs caused by getting it wrong.
- The reduced-motion branch structure everywhere it appears. It is not a single flag
  check: `releaseSharedState` restores background/atmosphere/cursor unconditionally
  but ferro/scrollNav/world only when not reduced, and that asymmetry is deliberate.
- The zero-allocation-per-frame property. Every scratch object stays module-scoped
  within its new home; `apply()` and `applyReturn` still allocate nothing.
- `pause()`/`resume()`'s in-flight guard, now reading `returnFlight.inFlight()`.
- Every existing comment travels with the code it explains. These comments are the
  record of about a dozen fixed bugs; a comment left behind in `about-flow.ts` while
  its code moves is a regression in its own right.

## Verification

1. `npx tsc --noEmit` clean.
2. `npm test` — 1528 passing, 4 skipped, 120 files. Baseline captured 2026-09-02.
3. Each new module gets its own focused unit test — the payoff of the split, and the
   thing the 1017-line file made impossible.
4. Adam drives the corridor in a **foreground** browser: scrub the full corridor, the
   footer gate and its return flight, the contact modal's pause/resume from a
   behind-beat, arrow-key stepping, backward-at-the-top exit, and a resize
   mid-corridor. Automation tabs have no rAF, so motion feel cannot be checked there.

## Explicitly out of scope

- Mounting the comms array into the `lander` beat. Next, not now.
- The stated-but-unbuilt target of one scroll position driving everything with the
  document as source of truth. That re-opens how the Work wall is reached, which is
  shipped and works.
- Any behaviour change, however obviously an improvement. If something looks wrong
  during the split, note it and leave it.
