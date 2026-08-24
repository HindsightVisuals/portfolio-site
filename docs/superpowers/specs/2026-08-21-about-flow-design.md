# commms — About Flow — Design Spec

**Date:** 2026-08-21
**Feature:** F16 (About page) · Roadmap Phase 6
**Status:** Design agreed. **Code blocked** on `worktree-feat+contact` landing on `main`.
**Branch:** `worktree-about-page`

---

## Context

About was the last page in the site with no experiential direction. The roadmap called it out
explicitly — *"F16 is vision-thin — options to Adam first"* — and the narrative gave a content
structure with no spatial treatment at all.

Three treatments were put to Adam: a crafted 2D takeover matching the case studies, a hybrid with a
3D landing, and a fully spatial version with no takeover. He chose fully spatial, for a specific
reason worth recording: **the site is itself meant to be a portfolio piece.** About is where a
studio selling 3D and interactive web either demonstrates it or doesn't.

Adam then built the flow in Blender (`00_Blend\01_Comms\Threejs Flow.blend`) as a spatial mockup —
nine markers, 293 frames, a camera that climbs. That file supersedes the earlier brainstorm on
layout and order, and this spec is written against it. Object-level measurements are in
`docs/research/about-blender-inventory.md`.

---

## What this is

A **scroll-scrubbed hybrid document**. One continuous scroll drives one timeline; the camera moves
along an authored path through the world you already have; content is real DOM in a scrolling
document, with three things — and only three — rendered in WebGL.

It is **not** a takeover, and it is **not** the site's existing scroll-zoom grammar. Entering About
changes what scroll means. That is a deliberate, accepted cost.

---

## Architecture

### The world is not reloaded

The About beats sit at y ≈ 37–55 in the same Blender space as the Work wall at y ≈ 50. About is a
**region of the existing world**, not a new scene. Nothing loads on entry; the input layer switches
from "zoom between destinations" to "scrub the About timeline." The `Transition to About Flow`
marker (f89) is that handover.

### Layer stack

| z | Layer | Contents |
|---|---|---|
| 0 | `canvas#world` — fixed | Grass field · green RD at the AI beat |
| 1 | `main` — scrolling document | All text · 16 logo SVGs · capabilities panel · contact form · AI copy · footer |
| 2 | `canvas#ferro` — fixed, transparent | The ferro alone |
| 100 | `.cursor-layer` | Exists already (`base.css:334`) |

Two WebGL contexts is the price of "the ferro sometimes passes in front of the copy." One rAF
drives both, sharing one camera. The ferro canvas **flips z-index per beat** — above the document
where it should cross the type, below where it shouldn't. Beats are discrete scroll ranges, so this
is a class toggle, and at boundaries the ferro is far enough from type that the swap is invisible.

### Scroll model

**Free scrub, 1:1, no snapping.** Scroll offset maps directly to camera `t`. Magnetism is a later
addition if it needs one — `camera-director.ts` already has snap and magnet, so retrofitting is
small.

Consequence to design against: **every in-between state is a state someone can park on.** Half-composed
frames must look intentional, not just the composed ones.

The **client wall is the single exception** — a pinned section where scroll stops driving the camera.
It is the one place the page holds you, and therefore the most likely thing to feel wrong on first
build.

### Camera

Defined as one interface: `t → { position, quaternion }`.

Backed initially by procedural keyframes derived from the Blender marker measurements (below). If
Adam later refines the Blender move and wants it exactly, a baked position+quaternion spline swaps
in behind the same interface and nothing else changes. This keeps "cheap now" and "authored later"
from being a choice.

Measured marker positions (Blender coords, Z-up):

| Beat | Frame | Camera (x, y, z) | Pitch |
|---|---|---|---|
| Home | 1 | 0, −4.87, 0 | 90° |
| Work Page | 64 | 0, 29.74, 0 | 90° |
| Transition to About | 89 | 0, 34.73, 0.31 | 105.3° |
| About Page (lander) | 105 | 0, 36.83, 6.02 | 179.9° |
| Team | 121 | 0, 36.84, 12.15 | 179.9° |
| Client Wall | 149 | 0, 36.84, 17.27 | 179.9° |
| Capabilities | 204 | 0, 39.26, 18.23 | 89.9° |
| Contact | 231 | 0, 45.93, 18.23 | 89.9° |
| AI Transparency | 258 | 0, 55.46, 18.23 | 89.9° |

Shape: forward on +Y → pitch up → **climb +Z** through lander/team/client wall → level off → forward
on +Y along a mezzanine at z ≈ 18. Lens 50mm.

> Blender is Z-up, Three.js is Y-up. Blender +Y → Three −Z; Blender +Z → Three +Y.

---

## Beats

### 1 · Transition (f89)

Camera pitches from horizontal to looking straight up. Entry from Work. Deep-linking `/about` lands
at the top of the flow, skipping the approach.

### 2 · Lander — "we are digital nomads" (f105)

**The only real geometry in the build.** A grass field lit green against a black world.

- Headline and sub-copy are **live DOM**, not 3D text.
- The green key light (Blender `Area`, energy 33.9, colour 0.32/1.0/0.36) **follows the pointer** —
  computed analytically in the shader, not a real light. Moving the mouse rakes light across the field.
- On touch: the light drifts on a slow automatic path.

The Blender lander is 16,705 verts with MULTIRES + geometry nodes. **Geometry nodes do not cross into
Three.js.** Adam supplies final geometry; the build uses a placeholder instanced-grass system until
then, and the swap is expected.

### 3 · Team (f121)

- Transparent PNG cut-outs of Adam and Maddi as sprites.
- Bio copy is **live DOM**, positioned at the two anchor empties (`Adam Bio/text Placement`,
  `Maddi Bio Text Placement`, NDC 0.36/0.59 and 0.64/0.45).
- Outfit-switching interaction: **explicitly deferred.** Not in this build.

Adam Tarr is named here. This is the one place an individual surfaces in a page written as "we",
and it is what keeps a recruiter's name search working.

### 4 · Client Wall — pinned (f149)

Camera parks under the ceiling. Scroll drives 16 logo SVGs **horizontally**, fully reversible. When
the row is exhausted, scroll resumes driving the camera.

Reuse `strip.ts` / `strip-scroll.ts`, which already implement pinned horizontal scrolling on the
case study page.

Blender has two rows of 8 spanning NDC x −0.18 → 1.18 — wider than frame, which is why it reads as
a ceiling you pass under. 16 slots, 10 clients named so far.

### 5 · Capabilities (f204)

A flat page in 3D space with the **live GLSL ferro embedded in it** and animated pieces that play as
you scroll.

**The palette flips light here**, then back to dark for Contact and AI. Three palette states across
the flow, not two.

⚠️ Content undefined — the Blender object is a blank emission plane. **Figma mock required.**

### 6 · Contact — along-the-path (f231)

Distinct from the nav CTA modal, which is a separate feature owned by `worktree-feat+contact`. This
is a contact moment placed after capabilities, for people converting off what they just read.

Reuses that branch's contact panel. Form fields must be **real DOM inputs**, never canvas-rendered.

### 7 · AI Transparency (f258)

Green reaction-diffusion. The policy copy sits in a zone the reaction **refuses to spread into** —
the boundary is absorbing, inside the feedback loop. Not a shape composited over the top.

`worktree-feat+contact` has already built this mechanism (`setMask`, `setMaskMix`, `setMaskTone`,
mask applied in the sim step, boundary documented as absorbing). What is still missing is **colour**
— the view shader outputs greyscale `vec3(lum)`.

⚠️ Layout undefined. **Figma mock required.**

### 8 · Footer + the gate

The footer scrolls up to fill the viewport — the same footer as the case study page, but taller.

Then a **scroll gate**: further scrolling does nothing at first except surface a "keep scrolling"
prompt with an indicator showing accumulated intent. Past a threshold, the footer exits upward and
the user lands on **Home**.

This closes a loop, consistent with the world's existing looping navigation (`SPINE_PERIOD = 240`).

⚠️ Threshold value and indicator design undefined. **Figma mock required.**

---

## The ferrofluid

**One object, morphing through the entire flow.** It travels with the camera and is on screen at
every About beat, dead-centre at NDC (0.5, 0.5), from lander to AI.

Its role changes per beat — idle companion on the climb, embedded in the capabilities panel, the
contact blob, then seeding the green RD at AI — but it is never re-instantiated. This continuity is
the flow's spine and its character.

Built on `worktree-feat+contact` as six tested modules (`src/ferro/`). No extraction needed; import
once landed.

---

## Palette

| State | Where | Ground |
|---|---|---|
| Night | Transition → Client Wall | near-black |
| Day | Capabilities | pale |
| Night | Contact → AI → Footer | near-black |

The world **dims continuously on approach** rather than snapping — the palette is a property of
where the camera is, not an event anyone triggers.

Existing hooks: `Cursor.setOnDark()` and `--cursor-ink` already handle the cursor on dark grounds
(`base.css:345`), built for the case study pages. `uInvert` already flips the RD for a dark ground
(`background.ts:179`).

`atmosphere.ts:13` hard-codes `INK = 0.07` into the shader string — this must become a uniform.

---

## Reduced motion, touch, accessibility

**Reduced motion:** the same document, no camera, no WebGL beats. Because the content is a real
scrolling document, this is close to free — it is what remains when the canvas is removed.

**Touch: full experience.** Adam's call. Note the consequence: About becomes the site's first
mobile-complete page, and **F19 is effectively decided here** for the whole site.

Two WebGL contexts, a grass field, a displaced ferro and a Gray-Scott sim will not hold 60fps on a
mid-range phone without explicit quality tiers — fewer grass instances, coarser RD grid, lower-poly
ferro. Tiers are specced up front, not discovered in QA.

**Accessibility:** all copy is live DOM and selectable. Form inputs are real. The document reads in
order without the canvas.

---

## Reuse

| Need | Already exists |
|---|---|
| Pinned horizontal scroll | `page2d/strip.ts`, `strip-scroll.ts` |
| Cursor on dark grounds | `Cursor.setOnDark()`, `base.css:345` |
| RD sim + absorbing mask | `three/background.ts` + contact branch's mask API |
| Ferro | `src/ferro/` ×6 modules (contact branch) |
| Contact panel + form model | `src/contact/`, `page2d/contact.ts` (contact branch) |
| Footer | case study footer (`c62d38b`) |
| Camera snap/magnet, if needed later | `three/camera-director.ts`, `snap.ts`, `magnet.ts` |
| Scroll-driven reveal | `page2d/reveal.ts` |

`src/page2d/about.ts` — the placeholder takeover — is **retired** by this work.

---

## Asks of `worktree-feat+contact`

Small, and cheap while that branch still owns those files:

1. **Add a colour/tint uniform to the RD view shader.** Output is hard-coded greyscale; the AI beat
   needs green. Three lines there; a GLSL merge conflict here otherwise.
2. **Be aware the ferro will need to travel a camera path**, not only sit in a fixed screen rect.
   `ferro-placement.ts` expresses placement as a screen rect today.

---

## Blocked on / needed from Adam

**Assets:** portrait cut-outs ×2 (transparent PNG) · 16 client logos (mono white SVG, one weight —
recommend an atlas) · final grass geometry.

**Figma mocks:** Capabilities page · AI Transparency layout · Team bio blocks · footer gate indicator.

**Copy:** Adam is rewriting all of it. The drafts in the brainstorm mockups serve as pacing and
length guides only.

---

## Out of scope

- Outfit-switching on the Team beat
- The nav CTA contact modal (`worktree-feat+contact`)
- The resume download
- Partners — no beat exists in the flow; placement unresolved
- "Why Us" as a separate beat — folded into the lander, correctly

---

## Open questions

1. `Area.001` never appears in frame at any beat — dead?
2. `Logo` and `Nav Links` report identical positions — one on top of the other?
3. 16 logo slots vs 10 named clients — pad, or trim?
4. Where does Partners go?
5. Does `/contact` survive as a destination, or does the nav modal replace it? (Not About's call —
   but someone must decide.)

---

## Verification

- `npm test` — the existing 329 tests must stay green throughout.
- Pure logic gets unit tests: scroll→`t` mapping, the pin's enter/exit thresholds, the footer gate's
  accumulator, palette interpolation across beats. These are the parts that break silently.
- Camera path: assert measured positions at each beat frame match the Blender table above.
- Feel is verified in-browser by Adam, not by tests. Frozen-tab caveat applies: browser automation
  runs occluded, so no rAF and CSS transitions stick at their start value — screenshots of this flow
  from automation prove nothing.
- Perf: 60fps desktop at the lander and AI beats (the two heaviest), plus a mid-range phone pass
  before the touch tiers are considered done.

---

## Related

- `docs/research/about-blender-inventory.md` — all 44 objects, per-beat, measured
- `docs/research/lusion-about-teardown.md` — the baked-spline and channel-packing notes both became
  relevant here
- `.superpowers/brainstorm/*/content/` — treatment · corridor · stations mockups
- Obsidian: `Master Brain\07 Projects\Portfolio\Specs & Plans\`
