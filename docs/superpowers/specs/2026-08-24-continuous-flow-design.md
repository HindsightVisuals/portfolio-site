# commms — Continuous Flow — Design Spec

**Date:** 2026-08-24
**Supersedes:** the entry/exit half of `2026-08-21-about-flow-design.md`. That spec's beats,
camera markers and palette all stand; what changes is how you get into and out of them.
**Branch:** `worktree-about-page` (the About spine, 21 commits, unmerged)

---

## The reframe

Adam, on being shown the corridor's hard entry and exit:

> We're essentially turning the whole experience into a long homepage, where you see a landing
> screen (/home with the reticles), then you scroll to see a wall of work (like a work grid on a
> normal site), then you start learning about me and commms (about flow), then you land at a
> footer. It's essentially a site with 1 page, 1 work/case study template, and one contact modal.

That is a different thing from what was built. The About corridor was designed as a *destination*
— you fly to the About screen, arrive, and a flow takes over. Adam's Blender file never described
it that way: the camera runs forward past the Work wall at frame 64 and simply starts tilting up
at frame 89. There is no arrival and no About screen in that file at all.

So the three hard edges reported in the first browser pass — the About card flashing, the snap to
black, the snap back to white on exit — are not three bugs. They are one mismatch: **the site
arrives somewhere the flow only travels through.**

## What this changes

**One page: Home → Work → About → footer → Home.** Everything after the Work wall is travel, not
arrival.

**Target state, stated explicitly:** one scroll position drives the whole site, the document is
the source of truth, and the 3D reads from it. **This pass does not build that.** It builds a
handover between two input models, deliberately designed to be removed. Recording the target
matters because it decides how the seam is written: as a known staging post, not as architecture
to harden around. Converting for real means re-opening how the Work wall is reached — tile focus,
the case-study flights and the takeover's scroll handling all hang off the director's wheel model
— and that is far safer once the corridor exists and is tuned.

---

## The spine becomes two rests

`DESTINATIONS` keeps `home` and `work`. Both keep their anchors, their snap-and-settle, and every
behaviour the Work wall has today: tile hover, focus flights, `/work/[slug]`, case studies.

`about` and `contact` leave `DESTINATIONS`, and **their screen planes are deleted from the
world.** They were labels for stops that no longer exist; with the corridor climbing past where
they stood, keeping them would mean fixing the materialize fade to measure real 3D distance for
the sake of two planes nobody arrives at.

Current geometry, for reference — `SPACING = 60`, `CAMERA_OFFSET = 34`, `SPINE_PERIOD = 240`:

| Destination | anchorZ | cameraZ | After |
|---|---|---|---|
| home | 0 | +34 | stays |
| work | −60 | −26 | stays |
| about | −120 | −86 | **removed** |
| contact | −180 | −146 | **removed** |

**Scrolling backwards from Home stops at Home.** Home is the top of the page. The endless loop in
that direction goes away, and that is the honest consequence of the loop now closing through the
corridor rather than by wrapping.

`SPINE_PERIOD` stays 240 — the atmosphere and any remaining anchored geometry still use
`nearestWrapped`, and changing the period is a separate concern with no benefit here.

---

## The handover

**The corridor's `t = 0` is the Work rest.** This falls out of a decision already made: the camera
path is anchored at the **Work Page marker (frame 64)**, chosen because it is the last marker
where Blender's camera is level, so handover costs no orientation jump. Under the old model that
anchor was transplanted to the About rest. Under this one it is simply where it belongs.

The consequence is that **there is no threshold to tune and no gap to cross.** At the Work rest:

- **forward scroll belongs to the corridor** — the director is suspended, the corridor takes the
  camera from `t = 0`
- **backward scroll belongs to the director** — the corridor releases, camera back on the spine,
  the director travels back toward Home

The corridor's own first stretch is level forward travel — frames 64 to 89, about 8.5 world units
before the tilt begins — which is exactly what the director would have done. Nothing jumps
because nothing moves discontinuously: the same camera, the same pose, a different owner.

**Reversibility is the requirement.** Scrolling up at `t = 0` must hand back cleanly, and
scrolling down again must re-enter at `t = 0`, any number of times, with no drift.

**Known tuning knob, not built this pass:** a hard flick from Home currently settles at the Work
rest before the corridor can take over, so a single continuous gesture hitches there. Carrying the
director's momentum across the handover would smooth it. Deferred — judge whether the hitch is
perceptible first.

---

## Routing

| Route | Behaviour |
|---|---|
| `/` | Home, unchanged |
| `/work` | the Work wall, unchanged |
| `/work/[slug]` | case study, unchanged |
| `/about` | enters the corridor at `t = 0` |
| `/contact` | enters the corridor at the **start of the contact beat** (beat 6) |
| nav emblem | opens the contact takeover from anywhere, including inside the corridor |

Contact becomes **one thing reached two ways**: a place inside the flow, and a modal over
whatever you are looking at.

**Opening the contact modal from inside the corridor must preserve corridor position.** Today
`activateContactWipe` calls `aboutFlow.exit()` — added to fix a real bug where the emblem left the
corridor stranded with the director suspended forever. That fix was correct for a model where
contact was somewhere else. Under this one, opening the modal at beat 4 and closing it must put
you back at beat 4. The corridor pauses rather than exits.

---

## The far end

Reaching the end of the corridor lands you on the footer. Continuing to scroll past it accumulates
intent against a threshold, with an indicator; past the threshold, you return Home.

**The footer is the case study pages' footer, scaled taller** — Adam's call, and what the About
spec already assumed. It reuses a component that exists and is designed, so closing the loop needs
no new design. Marked in the follow-ups as awaiting his own treatment.

**The return Home is a flight, not a cut** — Adam's call. The camera travels back through the
world to the landing screen, so the loop closes as travel like everything else in this pass. It is
the slower option and it is the one that keeps the page feeling like one continuous space rather
than a document that jumped to the top.

> [!important] The return flight cannot reuse the existing exit path
> `exit()` **cuts** the camera to the corridor's anchor before releasing the director — deliberately,
> because nothing else in the codebase writes `camera.quaternion` and leaving it un-reset left the
> whole site rotated after one visit. Reusing it for the gate would produce a visible cut *upward*
> to the Work rest and only then a flight Home, which is worse than the snap this whole spec exists
> to remove.
>
> So the return is **its own move**: a single tween from the corridor's actual end pose — roughly
> 43.7 world units forward of the Work rest and 31 units up, pitched level — interpolating both
> position and orientation to Home's pose, and handing to the director only once it lands, with the
> camera already on the spine and level. The director's four travel methods all write `position`
> only and cannot do this; the corridor already owns pose interpolation, so the move belongs to it.

**Roughed in without a Figma mock, at Adam's direction.** The threshold value and the indicator's
treatment are placeholders chosen by the implementer and explicitly expected to be redirected.
What must be real is the mechanism — the accumulator, the threshold, the flight — so the loop
closes and the page has an end.

---

## Promoted into scope: the ground must dim continuously

`background.ts`'s `setInvert` is binary. The About spine deferred that: the ground snapped, but it
snapped inside a transition that was already a cut, so it hid.

Continuous travel puts that flip in the middle of the move, which is the worst place for it. The
palette already computes a continuous day/night amount and drives the CSS ground continuously; the
WebGL field needs the same. **This requires a new uniform in `background.ts`** — the view shader
currently reads a boolean `uInvert`.

---

## What gets deleted

- The About and Contact screen planes and their pickable entries in `world.ts`
- `about` and `contact` from `DEST_ORDER` / `DESTINATIONS`
- The About arrival path in `main.ts` — `activateAbout`'s fly-to-then-enter-on-arrive, and the
  `director.onArrive('about')` handler
- `setAboutMode`'s hide-everything loop simplifies: with two planes gone and the Work wall behind
  you, there is far less to hide

---

## Out of scope

- **The Work wall's treatment.** Adam described it as "a wall of work (like a work grid on a
  normal site)"; asked directly, he confirmed that is an analogy for where it sits in the scroll,
  **not** a request to flatten the 3D wall into a grid. It keeps its tiles, hover, focus flights
  and case-study entry exactly as they ship. Nothing in this pass touches it.
- **Beat content.** Grass lander, portraits, client wall, capabilities panel, AI copy. Later
  plans, three of them blocked on Figma.
- **The true single-document conversion.** Stated as the target; its own plan.
- **Momentum across the handover.** Noted above.
- **The follow-ups from the spine build** — the text-contrast curve through the crossfade, the
  frozen `getVelocity()`, the client-wall pin. See `2026-08-24-about-spine-followups.md`. The
  frozen velocity becomes more visible under continuous travel and may want promoting; judge by
  eye.

---

## Verification

- The existing suite must stay green — currently **561 passed / 2 skipped**, run from the worktree
  root, never the repo root.
- Pure logic gets unit tests: the handover's enter/exit conditions at the Work rest, the route →
  scroll-position mapping for `/about` and `/contact`, the gate's accumulator and threshold, and
  the continuous invert amount.
- **Reversibility is the test that matters most**: hand over and back repeatedly and assert the
  camera returns to the same pose every time, with no accumulated drift.
- Feel is verified by Adam in a foreground browser. Automation tabs are occluded — no rAF, CSS
  transitions frozen at their start value — so screenshots prove nothing about this flow.

### What Adam should be able to feel when it works

- Scrolling down from Home reaches the Work wall, and continuing carries you into the climb
  without a visible change of mechanism
- The ground darkens as you tilt up, continuously, with no flip
- Scrolling back up retraces the whole thing and puts you back on the spine
- The end of the corridor is a footer you can keep pushing against until it returns you Home
- Opening contact from anywhere, and closing it, leaves you where you were

---

## Related

- `2026-08-21-about-flow-design.md` — the beats, markers and palette this keeps
- `2026-08-24-about-spine.md` — the spine plan, and the 24 rulings behind what exists
- `2026-08-24-about-spine-followups.md` — everything deferred, with why
- `docs/research/about-blender-inventory.md` — the measured source
