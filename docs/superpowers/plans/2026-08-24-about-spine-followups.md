# About Spine — Follow-ups and Known Gaps

Companion to `2026-08-24-about-spine.md`. Everything here was found during execution, judged
real, and **deliberately not fixed** — either out of the spine's scope, or residual after the
final review's single fix wave. Nothing here blocks the branch; all of it is someone's call.

Ordered by what I'd look at first.

---

## 1. Adam's in-browser gate (Task 13) — not yet run

This cannot be automated. Browser automation runs occluded: no rAF, and CSS transitions stick at
their start value, so a screenshot from automation proves nothing about this flow.

Serve with `npm run dev`, then in a **foreground** window, hard-reloaded:

- [ ] `/about` deep link lands at the top of the corridor, camera level, no fly-in
- [ ] Clicking About from the world flies in, then the scrub takes over with no jolt at handover
- [ ] Scrolling runs the whole corridor: forward, pitch up, climb, level off, forward again
- [ ] Scrolling back up retraces it exactly — free scrub is reversible
- [ ] No Work or Contact screen ever appears beside the corridor
- [ ] Leaving About (back button, nav, logo, contact emblem) restores normal scroll-to-fly at once
- [ ] No banked momentum fires on exit after a long scrub

Added by the reviews, and worth specific attention:

- [ ] **Text legibility through the palette crossfade** — see §2, this is the one I'd expect to fail
- [ ] **Cursor colour after a *keyboard* exit** (ArrowUp/ArrowDown) — the mouse-move path self-heals, the keyboard one does not
- [ ] **Chrome legibility on the night beats** — corner marks, margin notes, wordmark, nav links
- [ ] **World-vs-blob horizontal alignment** once the scrollbar appears — see §4
- [ ] **Does the corridor feel like travel?** — see §3; the atmosphere and background stretch are inert inside it
- [ ] Clicking nav "About" while already in the corridor is a no-op (fixed, but confirm)

Two dials most likely to move after this: `WORLD_UNITS_PER_VIEWPORT` (`about-scrub.ts`, pacing)
and `FERRO_FRACTION` (`about-flow.ts`, blob size).

---

## 2. The `--ink` crossfade passes through near-zero contrast — **Important, visual**

Introduced by the fix for invisible text on the night ground. Ground and text lerp between the
*same* endpoint pair in opposite directions, so they converge at the midpoint:

| `d` | ground | text | contrast |
|---|---|---|---|
| 0.00 | `#0b0b0b` | `#fdfdfd` | 19.35 |
| 0.35 | `#9f9f9f` | `#d1d1d1` | 1.73 |
| **0.50** | `#bababa` | `#bbbbbb` | **1.01** |
| 0.65 | `#d1d1d1` | `#9f9f9f` | 1.73 |
| 1.00 | `#fdfdfd` | `#141414` | 18.11 |

Text is invisible at the midpoint and below 3:1 across roughly the middle third of each ramp.

**Why it was left:** it is still a large net improvement — before the fix, `#141414` on `#0b0b0b`
was ~1.1 contrast for the *entire* night stretch, not a brief dip. And the right curve is an
aesthetic call.

**Fix when you want it:** drive `textInk` off a steeper curve than the ground (a biased or squared
smoothstep), so the text crosses mid-grey faster than the ground does. `about-palette.ts`.

---

## 3. `getVelocity()` is frozen for the whole corridor — the travel dressing is dead

`camera-director.update()` early-returns while suspended, so `measuredVelocity` is never
recomputed — but two site-wide consumers poll it every frame regardless:

- `world.ts:406` → `atmosphere.update(dt, velocitySource(), …)`
- `main.ts:156` → `bg.setVelocityProvider(…)`, driving `travelStretch`

So while the camera scrubs ~43.7 world units, both believe it is stationary. The atmosphere
streaks and the background stretch that give the rest of the site its sense of motion do nothing
inside the corridor.

**Why it was left:** it is motion *dressing*, outside the spine's stated scope, and a proper fix
needs a velocity-provider seam that belongs with the lander beat where that dressing matters.

**Fix when you want it:** have `about-flow`'s `apply()` feed a derived velocity, or make
`getVelocity()` overridable while suspended.

---

## 4. `ferro.css`'s new comment has `vh` and `%` inverted — one line

Shipped inside the fix for two *other* wrong comments. `.ferro-stage` is `height: 100%`;
`#bg-canvas` is `height: 100vh`. The comment says the reverse.

---

## 5. The invariant test isn't invariant — **and its comment claims it is**

`about-flow.test.ts`'s consolidated restore test was meant to fail whenever `apply()` gains a
writer that `exit()` does not restore. It does not: the final reviewer inserted a fifth writer
(`deps.ferro?.show()`) into `apply()` and the test still passed. It is a fourth hardcoded list of
five literal assertions.

This matters because three separate leaks of exactly this shape (`setInvert`, `setInk`,
`setOnDark`) were each found in a different round, one at a time. The test does still pin those
five, so it has real value — but **its docstring asserts a property it does not have**, which is
worse than the gap, because the next person will trust it.

**Fix:** either rewrite the comment to say what it actually covers, or make it real — enumerate
the mocks off the deps object (or record calls through a Proxy) and assert every dep method
`apply()` touched was touched again after `exit()` with its declared default.

---

## 6. The `html.about-open .chrome { color: var(--ink) }` rule is inert

Every `.chrome` consumer already declares the property itself (`.margin-note`, `.wordmark`,
`.site-nav a`, `.reticle`), and two of them use it for `background` and `outline`, which a
`color` rule never reaches. The palette writes `--ink` as an inline style on `<html>`, so no
class-scoped selector can gate it — the scoping buys nothing.

**Recommendation:** delete the declaration, keep a comment noting `.chrome`'s legibility rides on
base.css's `var(--ink)` consumers. If it stays, its rationale comment must be rewritten — it is
currently false in the same way the two comments §4 came from were false.

---

## 7. The client-wall pin has no implementation and had no disposition

The spec names one exception to free scrub: *"The client wall is the single exception — a pinned
section where scroll stops driving the camera. It is the one place the page holds you, and
therefore the most likely thing to feel wrong on first build."*

The spine plan's coverage table mapped the scroll model to the scrub and controller tasks and
never mentioned the pin — neither built nor declared out of scope. That was an omission in the
plan, not in the build.

Deferring is right (it is unbuildable against empty sections), but it is scroll **geometry**, not
beat content, so it belongs explicitly in the client-wall beat's plan. `strip.ts` /
`strip-scroll.ts` already implement pinned horizontal scrolling for the case study page.

---

## 8. Smaller things, recorded so they aren't rediscovered

- **`setInvert` is binary**, so the WebGL ground snaps at the crossfade midpoint rather than
  dimming continuously as the spec asks. Continuous dimming needs a new uniform in
  `background.ts`. The CSS ground path *is* continuous.
- **Entering the corridor by scroll-settling** onto the About rest — no click required — is
  spec-mandated and matches how contact already behaves, but contact opens an opaque takeover
  while About hijacks the world camera. A UX call, easily reversed with one guard.
- **`suspend` zeroes `peek` but not `lateral`/`magnet`.** Unreachable today; the invariant now
  reads as half-enforced.
- **`enter()` calls `apply(0)` rather than `onScroll()`** — if the browser ever restores a
  non-zero `scrollY` (bfcache, `history.scrollRestoration`), camera and document start desynced.
  Unreachable today because the page is `overflow: hidden` at boot.
- **`ferro.setGlow()` is never set on About entry**, so the blob inherits whatever the last
  takeover left. Deterministic; set it explicitly.
- **`AboutFlow.destroy()`** is untested and never called.
- **`beatProgress`** is exported and tested with no production caller — intended for later beats.
- **`paletteAt` allocates** a fresh object and hex string per call, where every other pure module
  on the branch uses the write-into-`out` shape.
- **Test seams on the production interface:** `WorldLayer` carries `anchoredVisibleCount` and
  `anchoredPositionsZ` for tests only.
- **`about.css`'s "above #world (0)"** names a selector that does not exist; it is `#bg-canvas`.
  The spec's layer table has the same wrong name.
- **`about-markers.test.ts`** has a test titled "six markers" that asserts all eight.
- **`initAboutFlow` is a static import**, so the About modules left the lazy chunk. A few kB
  against a 721 kB three.js-dominated bundle, but it cuts against the recorded perf constraint
  that route modules go in the lazy chunk.

---

## Two things to confirm before merge

1. **`jsdom` was added as a devDependency** (`^30.0.1`, +530 lockfile lines, dev-only, ships
   nothing). It was needed because vitest runs the node environment here and the corridor's
   document and lifecycle are irreducibly DOM. Scoped with per-file `@vitest-environment`
   docblocks so no existing test's environment moved; removable in one commit. **This was a
   judgement call made mid-execution — veto it if you'd rather the DOM-touching logic were
   restructured into pure reducers instead.**
2. **`.gitignore` gained `.superpowers/`** — that line came from an earlier brainstorming session
   in this worktree, not from this feature. It is repo-wide in effect. Confirm you want it.

---

## Adam's first browser pass (2026-08-24)

The corridor scrolls and the camera move reads correctly. Two things came out of it.

### FIXED — the RD field smeared once the camera went vertical

`background.ts`'s `PARALLAX_UV_PER_UNIT` (0.01 UV per world unit) was tuned against the pointer
magnet, which deflects the camera by a fraction of a unit, and `BASE_OVERSCAN`'s 3% was sized to
cover exactly that — its comment says it "must leave more margin than the max parallax offset."
The corridor climbs `cam.y` to +31 units, asking for a 31% shift against a ~1.5% margin, so the
field ran off its own clamped edge for the whole climb.

Fixed in `8cf9f0e` by clamping the offset to the margin the zoom actually leaves
(`parallaxMargin`/`clampParallax`, pure and tested). Near the spine nothing changes; it saturates
only where it would otherwise tear. Hardens the field against any future off-spine camera.

### OPEN — there is no entry or exit transition, and it shows

Adam: *"when you hit the about page in the main flow, it just shows the about page card
placeholder, then snaps to black (inverted) then the travel begins, its not smooth, and when you
want to go back... it just snaps back to white then your back on the main flow again."*

**This is a scoping gap in the spine plan, not a bug.** The spec's beat 1 is "camera pitches from
horizontal to looking straight up," which was built as the *path's shape* and never as a *visual
treatment*. Three separate hard edges compose the effect:

1. **The About screen card flashes, then vanishes.** `setAboutMode(true)` hides the world's
   anchored roots outright (`world.ts`) — no fade. It was written that way because the
   materialize pass fades on z-distance alone, which is meaningless once the camera is 31 units
   off-axis in y.
2. **The snap to black.** `setInvert` is binary — see §8. The ground flips rather than dims.
3. **The snap back to white on exit.** Deliberate (Ruling F4): `exit()` cuts the camera to the
   About rest and resets the quaternion, because nothing else in the codebase writes
   `camera.quaternion` and leaving it un-reset left the entire site rotated after one visit. A cut
   was chosen over a rotated world; a *transition* was never designed.

Needs art direction before code — it is the first thing anyone sees of the corridor. Brainstorm
it, then plan it.

### Deferred by Adam, this pass

- **Text contrast through the crossfade** (§2) — "this is fine for now."
- **Pacing** (`WORLD_UNITS_PER_VIEWPORT`) — "easier to judge once we nail that down a bit more in
  the next few passes."
- **Sense of travel** — reads as travel from the dots alone. The frozen-velocity item (§3) was not
  independently noticeable yet, likely because the beats are empty.
- **Depth cues** — "the only things giving the illusion of 3d space at the moment are the floating
  dots." Expected: the beats are empty and the lander's grass is a later plan.

---

# Continuous Flow — follow-ups (2026-08-25)

The second plan turned the site into one long page. Same rules as above: everything here was found,
judged real, and deliberately not fixed.

## A. Your QA checklist for this pass

Foreground window, hard reload. Ordered by what I most expect to be wrong.

- [ ] **Scroll from the Work wall into the corridor and watch the tiles.** They should *fade* over
      the first stretch of the climb. A one-frame disappearance means the new fade isn't working.
      Then scroll back up and watch them return.
- [ ] **Push through the footer gate and keep watching for two seconds after.** You should see the
      document fade, the camera fly, and then stay at Home. If you end up at the Work wall, the
      director handover regressed.
- [ ] **Check the gate arms at all, at your actual display scaling.** Scroll to the very bottom and
      keep pushing. Windows at 125/150% was making `t` max out at ~0.9999 so the gate could never
      fire; that's fixed with an epsilon, but it's worth confirming on your machine specifically.
- [ ] **Open contact mid-corridor, scroll hard inside the modal, close it.** You should come back to
      the same beat. Then scroll one notch — if the camera jumps elsewhere, the scroll resync failed.
- [ ] **Arrow keys inside the corridor.** They now step through beats; a backward step at the top
      exits. ArrowUp at Home should do nothing.
- [ ] **Click the footer's three nav buttons.** All three still cut — judge how bad `work` is, since
      it jumps from 31 units up and pitched.
- [ ] **Short viewport (~700px) and a wide one.** The footer is ~1802px inside a one-viewport
      section, so it overflows. Watch whether the beat headings arrive *ahead* of the camera.
- [ ] **Watch the address bar for a whole loop.** Scrolling into the corridor leaves it at `/work`.
- [ ] **Reduced motion:** `/contact` should land you at the contact beat; the canvas should be
      hidden; backward scroll must not unmount the document.
- [ ] **A case study page.** It's the least-protected surface in the whole branch — 147 lines moved
      out of it and 165 lines of CSS relocated, with zero tests covering it. Check the footer and the
      big COMMMS mark above it.

## B. The one structural thing I'd do before beat content

**`about-flow.ts` is 575 lines doing fourteen jobs** — path, camera writes, palette fan-out, beat
detection, DOM lifecycle, scroll lock, three listeners, enter/exit, pause/resume, the gate, a GSAP
tween, footer nav, the shared-state release, and three test seams. `AboutFlowDeps` has eleven
members. The final reviewer put it well: it has been *documented* into coherence rather than
*structured* into it, which is why it still reads fine and why nobody noticed the mass.

The evidence it has outgrown itself is the return-flight bug. `returnHome` is a camera-and-director
handover living in a module whose director dependency was typed `{ setSuspended }` — it could not
express what the move required, so it shipped doing half of it.

Suggested split, before the five content plans mount into it: `about-presentation.ts` (apply/palette
/beat), `about-session.ts` (the open/paused/t state machine and its listeners — which turns the
guard table into one switch instead of six hand-copied conditionals), `about-return.ts` (the flight,
owning both ends of the handover), leaving `about-flow.ts` as wiring.

**DONE (2026-09-04).** Split into about-presentation / about-session / about-return /
about-gate-control / about-nav, leaving about-flow.ts as wiring. See
`docs/superpowers/plans/2026-09-04-about-flow-split.md`. The gate controller and the
pure nav module were not in the original suggestion; pulling them out is what removed
the presentation-to-session coupling rather than merely relocating it.

## C. Deferred, with why

- **The footer nav's three buttons all cut.** `work` calls `exit()`, which cuts from the pitched end
  pose — the exact move the spec forbids for the gate. Consistent with the pre-existing
  backward-scroll exit convention, so it's a convention problem, not a new regression.
- **`onFooterNav('work')` leaves the URL at `/about`.** Same pre-existing convention.
- **Entering the corridor by scrolling doesn't set the URL** — it stays `/work`. Arguably right: the
  corridor's `t = 0` *is* the Work rest, and pushing `/about` on a scroll gesture would spam history.
- **The last section has no overflow containment** while its height is forced to one viewport. A
  700px viewport reproduced a 41px overflow. Will get worse once beat content lands.
- **`exit()` doesn't zero the director's `lateral`.** `syncTo` does, on the `returnHome` path only.
  If the corridor is ever entered from a focused tile, that offset surfaces on the first tick out.
  Not observed today.
- **Keyboard can't arm the footer gate.** Arrows give a way out of the corridor but not a way to
  close the loop forward.
- **The two-rest invariant is unasserted.** T13's backward clamp is only correct because Home is the
  numeric maximum of a two-entry `DESTINATIONS`. Add a rest above 34 and the wrap hole reopens
  silently.
- **`loop.test.ts` and `snap.test.ts`** still carry `RESTS = [34, -26, -86, -146]` commented
  `// home, work, about, contact` — legitimately synthetic fixtures, but the comments now describe a
  spine that doesn't exist.
- **Dead code confirmed unreachable:** `world.ts`'s label-plane branch and `makeLabelTexture`
  (deleting them also retires the `document.fonts` jsdom workaround); `main.ts`'s
  `hit.dest === 'about'` pick branch; `main.ts`'s `onArrive('contact')` handler.
- **`RETURN_FADE_P = 0.45` and `GATE_END_EPS = 1e-3`** are reasoned but unverified by eye.

## D. A note on how the two Criticals got through

Both were found only by the whole-plan review, and both are the same shape: the pre-flight scan pairs
tasks by **named symbol** handoff (`workRest`, `setInvertAmount`, `buildFooter`). Neither Critical
had a symbol — one was the director's *private* `state.z`, the other was the world's visibility flag
versus the corridor's new anchor. Both rows were marked "clean" in the scan and both are where the
bugs lived.

The lesson for the next plan: alongside "what does task B consume from task A", ask **"what invariant
does this task rely on that no parameter carries?"**

## E. Two things parked at the very end

Found by the re-review of the final fix wave, after the no-second-fix-wave line. Both recorded
rather than fixed.

- **The reduced-motion return path leaks an inline `opacity: 0` onto the ferro element.**
  `applyReturn` writes it unconditionally; `releaseSharedState()` early-returns under reduced motion
  *before* clearing it. Inline beats `.ferro-stage--hidden`, so a later `ferro.show()` would leave
  the blob invisible on every 2D page for the rest of the session. **Unreachable today** — the gate
  runs through `onWheel`, which is gated on `!reducedMotion`, and `returnHome()` has no other
  production caller. One line: move the `removeProperty('opacity')` above that early return.

- **Clicking a nav link during the 1.6 s return flight lands you at Home, whatever you clicked.**
  Nothing kills the tween and `.chrome` stays clickable above the fading document, so `onDepart`
  fires `exit()`, then the still-running tween finishes and runs teardown a second time — including
  `syncTo(HOME_REST_Z)`, which kills the new navigation's settle. The race predates this wave;
  `syncTo` only changed where you come to rest. Narrow window, deliberate gesture.

Also worth an eye during QA: the corridor's document is still natively scrollable during the return
flight (the listeners are detached but `html.about-open` remains), so a wheel during those 1.6 s
scrolls the fading document under the flight. Cosmetic.

---

# QA Pass — follow-ups (2026-08-25)

The third plan, from Adam's first browser QA. Two of his five items were fixed immediately
(`2494e94`); the other three became this pass.

## The one thing waiting on Adam

**The ferro's arrival flies off screen, twice.** From the client wall it fades up as a small dot,
leaves frame off the **top**, returns, sweeps down and leaves off the **bottom** at full opacity for
~350px of scroll, then re-enters and settles. From the capabilities beat onward it is correct and
holds at both beats exactly as the Blender keys intend.

**The keyframes are not the problem.** They were sampled at frames 157-177, which sit inside the
camera's 55-frame pitch-down — and the corridor's path **linearly slerps** that pitch from 179.9 to
89.9 degrees where the Blender file **eases** it. So during exactly the window the blob arrives, the
camera it is projected through is not the camera those frames were measured against.

The fix is camera markers between f149 and f204 matching the file's easing, which would make the
whole climb more faithful, not just the blob. Adam chose to see it in the browser before deciding.

## Parked after the final fix wave

- **The HUD notes clear the footer by 100px, not the intended 50px.** Arithmetic slip: the leading
  `50px` in the calc already supplies the inset. The exact term is `(100vh - 276px)`. Left
  deliberately, because **the 276px it is measured against is itself wrong** — it is the world band
  from a 1920x1080 Figma frame, but the real footer is content-sized (~1802px) and covers the
  viewport at every height. Decide both numbers together, by eye, once the footer has its own design.
- **The gate panel stays in the accessibility tree while invisible.** Not a regression — it was
  equally reachable before, when it was also visible — but now sighted users do not see it and screen
  readers still announce "keep scrolling to return home" for the whole corridor. Minimal fix: a
  keyword-valued `--gate-vis` driving `visibility`, which removes the subtree from the a11y tree and
  preserves the opacity fade. Cheaper than plumbing `aria-hidden`.
- **The canvas-box measurement is correct but inert, and two comments are false because of it.**
  `stage.ts` calls `renderer.setSize(innerWidth, innerHeight)` with `updateStyle` defaulting true,
  writing an **inline** `style.width` on `#bg-canvas` that beats `base.css`'s `width: 100%`. So the
  world canvas lays out at `innerWidth` while `.ferro-stage` is the narrower `100%` — **the ~15px
  world-vs-blob mismatch is still live.** `projectionViewport()`'s comment and `base.css`'s
  `#bg-canvas` comment both currently assert otherwise. (`ferro-stage.ts` already passes
  `setSize(..., false)`, which is why its own `width: 100%` governs.)
  **If anyone fixes `stage.ts`, `world.resize()`'s `camera.aspect` must move in the same commit** —
  today window, canvas box and renderer size all agree; change one and projection and aspect diverge.
- **The green fill cuts rather than fades** when you scroll back up from the end — no `transition`,
  so a half-full bar empties in one frame while the panel is still near-opaque.
- The gate panel's `width: min(1272px, calc(100vw - 160px))` is invented, not from Figma `110:473`.

## Two brief errors worth carrying forward

Four separate errors in the plan's own briefs were caught this pass. Two generalise:

- **A shared module-level scratch vector** meant two calls without an `into` argument returned the
  same aliased object. This is the *same* bug caught in the spine plan's tests and then reintroduced
  here. If a function returns a scratch by default, its tests must pass distinct `into`s.
- **A test harness that put the camera in a state production never has.** `about-project.test.ts`
  called `updateMatrixWorld(true)`, so it passed against a fresh matrix while production projected
  through a stale one — size and position a frame apart, every frame. The per-task reviews could not
  see it: one owned the pure function, the other owned the call site, and the bug lived in the seam.

---

## Reference — igloo.inc

Adam, 2026-08-25: *"this site is doing a lot of what I want through the about flow."*

<https://www.igloo.inc/?ref=threejsresources>

Parked deliberately — flagged "for later", not as a task. Worth a proper look before the lander
beat, since that is the next piece of About being built and the reference is about the *flow*
rather than any single beat. When picking it up, be specific about which qualities are wanted
(pacing, the way content enters, the camera's relationship to the copy, material treatment) rather
than treating it as a whole-cloth target — the corridor's own grammar is already established and
the useful question is which of its choices to revisit against this.
