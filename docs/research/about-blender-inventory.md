# commms — About Flow: Blender Object Inventory

**Source:** `Dropbox\PERSONAL BUSINESS\Adam Portfolio\00_Blend\01_Comms\Threejs Flow.blend`
**Read:** 2026-08-21 · 44 objects · 9 markers · frames 1–293 @ 30fps (9.8s) · EEVEE
**Purpose:** a correction pass, not a spec. Tick/fix the two right-hand columns and I re-read the
file and build against it.

---

## How to use this

The right-hand columns are my **guesses**. Correct them, don't rewrite them.

- **Ship?** — does this exist in the web build at all, or is it blocking/reference for me?
- **How** — if it ships, in what form: `geo` (real 3D), `sprite` (textured plane/billboard),
  `dom` (HTML text or UI over the canvas), `anchor` (invisible position only), `light`, `source`
  (an asset I extract but don't place, e.g. a scatter source).

Once the table is right, I can write the answers back into the .blend as custom properties in one
pass, so the file becomes self-describing and neither of us maintains a doc. See
[Making it stick](#making-it-stick).

---

## Beats

| # | Marker | Frame | Camera | Pitch | What's on screen |
|---|---|---|---|---|---|
| 1 | Home Beat | 1 | y −4.9, z 0 | 90° | Work wall far ahead, HUD |
| 2 | Work Page | 64 | y 29.7, z 0 | 90° | Work wall framed |
| 3 | Transition to About Flow | 89 | y 34.7, z 0.3 | 105° | camera starts tilting up |
| 4 | About Page Beat | 105 | y 36.8, z 6.0 | 180° | grass lander, "we are digital nomads" |
| 5 | Team Beat | 121 | y 36.8, z 12.2 | 180° | both portraits |
| 6 | Client Wall Beat | 149 | y 36.8, z 17.3 | 180° | logo ceiling, "clients we've helped…" |
| 7 | Capabilities Beat | 204 | y 39.3, z 18.2 | 90° | levelled off; capability screen |
| 8 | Contact Beat | 231 | y 45.9, z 18.2 | 90° | contact screen + form |
| 9 | AI Transparency Beat | 258 | y 55.5, z 18.2 | 90° | ferrofluid alone — **no copy yet** |

**Shape of the move:** run forward on +Y → pitch up → *climb* +Z through lander / tagline /
portraits / logo ceiling → level off → run forward on +Y again along a mezzanine at z ≈ 18.

> Blender is Z-up, Three.js is Y-up. Blender +Y forward → Three −Z forward; Blender +Z up →
> Three +Y up. The climb stays a climb.

---

## Persistent HUD — on screen at all 9 beats

Camera-parented, so these are screen-space furniture, not world objects.

| Object | Type | NDC | Ship? | How |
|---|---|---|---|---|
| `Logo` | MESH 4v | 0.94, 0.49 | ✅ already exists | `dom` — the site's wordmark |
| `Nav Links` | MESH 4v | 0.94, 0.49 | ✅ already exists | `dom` — `navbar.ts` |
| `Plus Corner` | MESH 4v | 0.02, 0.96 | ✅ already exists | `dom` — reticle brackets |
| `Plus Corner 1` | MESH 4v | 0.97, 0.96 | ✅ | `dom` |
| `Plus Corner 2` | MESH 4v | 0.02, 0.05 | ✅ | `dom` |
| `Plus Corner3` | MESH 4v | 0.97, 0.05 | ✅ | `dom` |

`Logo` and `Nav Links` report identical positions — one is likely sitting on top of the other.
Worth a look.

---

## Reference only — already built, or not About's job

| Object | Type | Seen at | Ship? | Why |
|---|---|---|---|---|
| `Work Page` | MESH 32v, 10.5×3.3 | Home, Work | ❌ ref | The WORK wall exists (`work/tiles.ts`) |
| `Plane` | MESH 4v, ARRAY×2 | Home | ❌ ref | Home blocking; homepage is built |
| `Camera` | CAMERA 50mm | — | ❌ ref | Path source — see note below |

---

## Station 4 — About Page Beat (the lander)

| Object | Type | Detail | Seen at | Ship? | How |
|---|---|---|---|---|---|
| `About Digital Nomad Lander` | MESH | **16,705v**, MULTIRES + **NODES**, mat `Grass and Field` | About | ✅ | `geo` ⚠️ see perf |
| `Grass Clump` | MESH | 490v, mat `Greenery` | Home | ✅ | `source` — scatter instance? |
| `Text` | FONT | "we are digital nomads" | About | ✅ | `dom` |
| `Text.001` | FONT | "exploring digital worlds, building experiences that transcend boundries through three dimensions." | About | ✅ | `dom` |
| `Area` | LIGHT | AREA, energy 33.9, **colour (0.32, 1.0, 0.36)** | About, Team | ✅ | `light` — this green *is* the beat |

⚠️ **The lander is the single biggest perf question in the file.** 16.7k verts is fine; MULTIRES +
geometry nodes is not portable — GN doesn't cross into Three.js. It has to become either baked
geometry, or an instanced grass system written for the web. Needs its own decision.

Typo in `Text.001`: *boundries* → *boundaries*. (You said you're rewriting copy anyway.)

---

## Station 5 — Team Beat

| Object | Type | Detail | Seen at | Ship? | How |
|---|---|---|---|---|---|
| `Adam Full Body Portrait` | MESH 4v | 0.69×1.06, mat `Emission Plane`, **no image bound** | About, Team | ✅ | `sprite` |
| `Maddi Full Body Portrait` | MESH 4v | 0.57×0.87, mat `Emission Plane`, **no image bound** | About, Team | ✅ | `sprite` |
| `Adam Bio/text Placement` | EMPTY | NDC 0.36, 0.59 | About, Team | ✅ | `anchor` |
| `Maddi Bio Text Placement` | EMPTY | NDC 0.64, 0.45 | About, Team | ✅ | `anchor` |

Both portraits are flat emission planes with **no texture assigned** — they render as solid green.
Content blocker: needs cut-out portrait art. Both bio empties are unfilled → **Figma mock needed**
to know what copy sits there and at what size.

---

## Station 6 — Client Wall Beat

| Object | Type | Detail | Ship? | How |
|---|---|---|---|---|
| `Client Text` | FONT | "clients we've helped along the way" | ✅ | `dom` |
| `Logo Placement.01` … `.016` | MESH 4v ×16 | 0.48×0.19 each, `Emission Plane`, **no images** | ✅ | `sprite` ×16 |

**Two rows of 8**, at NDC y ≈ 0.55 and y ≈ 0.44, spanning NDC x −0.18 → 1.18 — so the row runs
*wider than frame* and you pass under it. That's why it reads as a ceiling.

Content blocker: 16 slots, 10 clients named so far. Needs monochrome white SVGs. Recommend one
atlas rather than 16 textures.

---

## Station 7 — Capabilities Beat

| Object | Type | Detail | Seen at | Ship? | How |
|---|---|---|---|---|---|
| `Service/Capability screen` | MESH 8v | 3.53×1.95, `Emission Plane.001` | Capabilities only | ✅ | `sprite`/`dom` |

Renders as a pale full-frame ground with a dark inset panel — **the palette flips light here**,
then back to dark for Contact/AI. Three palette states in the flow, not two. Content is unresolved
→ **Figma mock needed**.

---

## Station 8 — Contact Beat *(the along-the-path contact, NOT the nav modal)*

| Object | Type | Detail | Ship? | How |
|---|---|---|---|---|
| `Contact Screen` | MESH 4v | 4.59×2.62, no material | ✅ | `sprite`/`dom` |
| `Contact Form` | MESH 4v | 1.88×2.47, child of screen | ✅ | `dom` — real inputs |
| `Area.004` | LIGHT | AREA, 4.7, white | ✅ | `light` |

Form fields must be real DOM inputs, never canvas-rendered — accessibility.

---

## Station 9 — AI Transparency Beat

Nothing but the ferrofluid on black. **No copy, no screen, no geometry of its own.**
Most under-built beat in the file → **Figma mock needed**, and it's where your green-RD /
boundary-zone idea lands.

---

## Cross-cutting — the ferrofluid

| Object | Type | Detail | Seen at | Ship? | How |
|---|---|---|---|---|---|
| `Ferro Fluid` | MESH | **6,146v**, DISPLACE, mat `Ferro` | beats 4–9 (**all six**) | ✅ already shipped | `geo` |
| `Ferro Controller` | EMPTY | drives DISPLACE | beats 4–8 | ✅ | `anchor` |
| `Area.002` | LIGHT | AREA 51.2 white, child of Ferro | 4–9 | ✅ | `light` |
| `Area.003` | LIGHT | AREA 21.2 white, child of Ferro | 4–9 | ✅ | `light` |
| `Area.001` | LIGHT | AREA 102.2 white | **never on screen** | ❓ | dead? |

The ferro is **on screen for the entire About flow**, dead-centre at NDC (0.5, 0.5), from the
lander all the way to the AI beat. Either it's a persistent companion that travels with you — a
strong idea — or it's parked and I'm misreading it. Worth confirming; it changes what it means.

Ferro core already shipped (`?lab=ferro`), and the empty-drives-displacement pattern matches the
known gotcha: the empty is a uniform, and normals need rebuilding after displacement.

`Area.001` is never in frame at any beat. Probably dead — confirm before I drop it.

---

## Lighting — the one real architectural decision

This file uses **5 area lights and lit materials**. The site currently ships **zero lights and zero
PBR materials** — every surface is hand-written GLSL (confirmed in the Lusion teardown, and the
reason the site holds framerate).

Three ways forward, in ascending cost:

1. **Bake it.** Lighting goes into a texture channel; the web reads it. Cheapest, matches how the
   site is built, and matches Lusion's channel-packing. Costs art-direction flexibility.
2. **Fake it analytically.** Compute the green key light in the shader. Fits the existing pattern and
   keeps the cursor-as-light idea live, since the cursor becomes just another term.
3. **Introduce real lights.** A genuine departure. Not recommended without a specific reason.

My recommendation is **2 for the lander's green key** (it's one light and it's the whole mood), and
**1 for everything else**.

---

## Content blockers

| Needed | For | Status |
|---|---|---|
| Cut-out portrait art ×2 | Team | ❌ planes have no texture |
| Client logos, mono white | Client Wall | ❌ 16 slots empty, 10 names known |
| AI Transparency copy + layout | AI beat | ❌ nothing built |
| Capabilities screen content | Capabilities | ❌ blank emission plane |
| Bio copy ×2 | Team | ❌ empties only |
| Partners placement | — | ❌ no beat exists |
| "Why Us" | — | ✅ folded into the lander — no beat needed |

---

## Figma mocks worth doing

Only where the beat lands on **typography and layout**, which Blender can't answer:

1. **AI Transparency** — entirely unbuilt
2. **Capabilities screen** — blank plane
3. **Team bio blocks** — two empties, no size or copy

The spatial/material beats — lander, logo ceiling, ferro — are readable from the file as-is and
don't need mocks.

---

## Making it stick

Rather than maintaining this doc, put the answers in the .blend. Once the table is corrected I can
write, per object:

```python
obj["commms_ship"] = True          # or False
obj["commms_how"]  = "geo"         # geo | sprite | dom | anchor | light | source
obj["commms_beat"] = "team"        # which beat owns it
```

Custom properties survive saves, show in the N-panel, and are readable any time — so if you move
something, I re-read the file and I'm current with no round trip through you.

---

## Open questions

1. Is the ferrofluid **meant** to be on screen for the whole flow, or is that unintentional?
2. `Area.001` never appears in frame — dead?
3. `Logo` and `Nav Links` occupy the same position — intentional?
4. The lander's MULTIRES + geometry nodes can't cross to the web. Bake, or rebuild as instanced
   grass?
5. 16 logo slots vs 10 named clients — pad, or trim to 10?

---

## Related

- `docs/research/lusion-about-teardown.md` — technique reference; the baked-camera-spline and
  channel-packing notes both became relevant here
- Brainstorm mockups: `.superpowers/brainstorm/*/content/` (treatment · corridor · stations)
