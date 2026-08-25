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
