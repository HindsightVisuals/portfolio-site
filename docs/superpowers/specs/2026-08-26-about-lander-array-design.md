# About Lander — Communications Array

**Date:** 2026-08-26
**Status:** design approved in conversation; open questions in §9 unresolved
**Beat:** `lander` (`ABOUT_MARKERS`, frame 105) — replaces the grass lander
**Source:** `Dropbox/PERSONAL BUSINESS/Adam Portfolio/00_Blend/01_Comms/AboutLander_Model.blend`

## 1. Summary

The About corridor's `lander` beat becomes a communications array: a segmented
parabolic dish over sculpted terrain, dark, lit almost entirely by its own green
emission. The site's pointer crosses into 3D as a sphere that the array reacts
to — panels open away from it, a glow halo tracks it, a signal beam writhes and
brightens near it, and the dish itself leans toward it.

The whole thing is driven by **one uniform pair** (cursor position and radius in
the disc's local space). No BVH, no CPU geometry rebuild, no per-frame
allocation.

## 2. The Blender rig, decoded

Every number below was read from the file on 2026-08-26 and is the contract the
runtime must reproduce.

### Objects

| Object | Role | Notes |
|---|---|---|
| `Cursor` | driver | UV sphere, local radius **1.0**, world radius **0.2504** |
| `Circle` | dish panels | child of `Cube.001`; **world scale 0.732**; local radius ≈ **1.611**; 9,840 tris |
| `Circle.012` | **constant emitter** — the glowing core | child of `Circle`; 3,072 tris; see below |
| `Cylinder` | signal beam | child of `Circle`; 1,404 tris after Decimate |
| `Cube.001` + 19 others | frame, struts, dish fittings | share `Array Material` (grey metal) |
| `Landscape` | terrain | 32,768 base polys × Multires L2 = **524,288** |
| `Point` | key light | child of `Circle`, `CHILD_OF`→`Cursor` at **0.142** |

`Circle` carries `TRACK_TO`→`Cursor` at influence **0.159**.

**`Circle.012` shares `Array Material_CursorEmission` with the panels but has no
GN modifier**, so its `dist` attribute resolves to 0 and the Map Range pins
emission at its maximum, 4.6, everywhere. It is a *constant* full-strength
emitter mottled by the noise mask — the bright green core visible in the
reference frame, not a cursor-driven surface. It needs a simplified variant of
the panel material: the emission path without the explode or the `vDist` varying.

### Hierarchy (drives the export grouping)

```
Cube.001 ........................ static base
├── Circle ...................... the 224-panel dish  [shader-driven]
│   ├── Circle.001 – .011, Cube .. dish fittings, ride with the dish
│   ├── Circle.012 .............. constant emitter core
│   ├── Cylinder ................ signal beam
│   └── Point ................... key light
├── Circle.013, .014, Cube.002 .. static
└── (unparented) Circle.015, .016, Cube.003, Cube.004 — mast and base
```

**Cursor radius expressed in `Circle`'s local space: 0.3421.** All thresholds
below are in that same local space.

### Panel explode — GN group `Geometry Nodes.002`

Five nodes:

1. `Split Edges` (all) — 224 faces become 224 disconnected islands
2. `Object Info`(`Cursor`, **transform space RELATIVE**) → `Geometry Proximity`
   (**target element FACES**) → distance
3. `Map Range` **0.2 → 0.41** remapped to **0.57 → 1.0**, LINEAR, clamped
4. `Scale Elements` (domain FACE, mode Uniform), **Center = proximity position × 1.5**
5. `Store Named Attribute "dist"` (POINT/FLOAT) — the bridge to the shader

Near the cursor panels *shrink*, opening gaps. The ×1.5 on the centre is what
makes the shrink read as displacement rather than a uniform pucker.

### Panel emission — `Array Material_CursorEmission`

- Base colour `0.133` grey, **Metallic 1**
- Emission colour linear `(0.164, 1.0, 0.248)` ≈ **`#71FF88`** (a near-sibling of
  the F15 cursor's `#61E891`)
- `Attribute("dist")` → `Map Range` **0 → 0.11** remapped to **4.6 → 0**
- Multiplied down by a 3D noise mask (scale 3.8, ramp 0.169→0.634) so it mottles
- Roughness from `Scratches.jpeg` on Generated coords

**The glow shell (0–0.11) is far tighter than the explode band (0.2–0.41).**
That separation is load-bearing — it is why the effect reads as a focused beam
of attention rather than a soft blob. Preserve the ratio when tuning.

### Signal beam — `Cylinder` + `Signal` material

- `Displace` modifier: Blender `CLOUDS` texture (noise_scale 1.31, depth 2),
  **texture coords = OBJECT → `Cursor`**, strength **2.04**, mid 0.5, NORMAL.
  The noise field is sampled in the *cursor's* space, so moving the cursor
  slides the field through the cylinder and the beam writhes.
- Shader drivers:
  - noise `W = frame / 200` (slow evolution)
  - both `Wave Texture` phase offsets `= frame / 5` (fast scroll)
  - **emission strength `= 10 / (d⁴ + 1)`**, `d` = `LOC_DIFF` between `Cursor`
    and `Cylinder` in world space — quartic falloff
- Alpha is a hard threshold (`ColorRamp` 0.677→1.0) over two wave textures
  screened together minus a stretched 4D noise
- Colour ramps green `#55FF7A` → pale `#D4FFA5`

### Lighting

**`World` background strength is `0`.** The HDRI in the file contributes
nothing; the scene is lit by the Point/Area lights plus emission. No environment
map is needed in the web build.

`Rough Meta.001` on the Landscape is **fully procedural** — noise, ramps, bump,
zero image textures. The 4K sand maps in the file belong to unused materials.

## 3. The core finding

**Geometry Proximity against a sphere is closed-form.** For a 512-face UV sphere
the faceting error is well under 1% of radius, so:

```
distance to surface  =  length(p - c) - r
nearest point        =  c + normalize(p - c) * r
```

Which collapses the entire GN group into a vertex shader:

```glsl
// aIslandCentre : rest centroid of this vertex's panel island (derived at load)
// uCursorLocal  : cursor centre, in the disc's local space
// uCursorRadius : 0.3421

vec3  toC     = aIslandCentre - uCursorLocal;
float len     = length(toC);
float d       = len - uCursorRadius;

float s       = mix(0.57, 1.0, clamp((d - 0.2) / (0.41 - 0.2), 0.0, 1.0));

vec3  nearest = uCursorLocal + (toC / max(len, 1e-6)) * uCursorRadius;
vec3  centre  = nearest * 1.5;

vec3  p       = centre + (position - centre) * s;
vDist         = d;
```

Fragment stage:

```glsl
float base = clamp((vDist - 0.0) / (0.11 - 0.0), 0.0, 1.0);
float e    = mix(4.6, 0.0, base) * (1.0 - noiseMask);
```

The `CLOUDS` displacement on the beam is likewise just 3D noise in a vertex
shader — no texture asset required.

## 4. Systems

**S1 — Pointer → 3D cursor.** The pointer raycasts to a world position and
becomes the driving sphere. Raycast target is an **invisible static proxy in the
disc's local space**, not the disc itself: the disc's orientation is driven by
the cursor (`TRACK_TO` 0.159), so raycasting the live disc is a feedback loop.
The proxy lags one frame, which at 0.159 influence is imperceptible and
unconditionally stable.

**S2 — Panel explode.** §3, vertex shader.

**S3 — Panel emission halo.** §3, fragment stage, fed by the `vDist` varying.

**S4 — Signal beam.** Cursor-space 3D noise displacement in the vertex shader;
animated alpha mask from two wave functions and a 4D noise, all procedural;
emission strength `10/(d⁴+1)` from a CPU-computed distance uniform.

**S5 — Soft tracking.** The disc lerps toward facing the cursor at 0.159; the key
light partially follows at 0.142. Both are one-line exponential follows, not
constraints.

**S6 — Blob-tracking network.** *(new — not in the Blender file)*

Nodes are the panel centroids, so they inherit every displacement the panels get.
Edges use a **fixed candidate list with live visibility**:

- At load, compute each node's *k* nearest neighbours at rest (k ≈ 6, ~1,300
  candidate edges) and build a static index buffer.
- Each frame the vertex shader measures the edge's **current** length, after
  displacement, and fades it against a threshold.
- An edge that stretches past the threshold dies; one that compresses under it
  lights up.

The network genuinely re-wires itself as nodes drift — including while the
cursor is still, because ambient displacement keeps the nodes moving. One draw
call, static buffers, no CPU work per frame.

*Known limit:* candidates are fixed at rest, so a node that drifts far enough
that its true nearest neighbour was never a candidate cannot form that edge.
This is a reason to keep ambient amplitude genuinely subtle — which is the
intent anyway.

**S7 — Ambient / idle state machine.** *(new)*

A low-amplitude 3D noise displacement running **alongside** the cursor-driven
one, gated by an engagement signal:

| State | Ambient | Cursor-driven |
|---|---|---|
| Engaged (pointer near the disc **and** moving) | on | on |
| Disengaged — first 2s | **off** | off |
| Disengaged — after 2s | on (keep-alive) | off |

The array goes still for a beat when you leave, then starts breathing on its
own. **The pause is the point** — it is what makes it read as alive rather than
as a loop.

`disengaged = pointerFar || pointerMotionless`. Both triggers feed one timer, so
a pointer parked on the dish and a pointer that has left get the same
silence-then-breathe treatment. Ambient eases in over ~800ms rather than
snapping; any pointer movement kills it immediately.

## 5. Module structure

### Prerequisite: split `about-flow.ts` first

It is **1017 lines** — up from the 575 that §B of
`plans/2026-08-24-about-spine-followups.md` already called a structural problem.
The array is the largest beat by some margin and must not mount into it as-is.
Take the split that doc prescribes, unchanged:

- `about-presentation.ts` — apply / palette / beat
- `about-session.ts` — the open/paused/`t` state machine and its listeners
- `about-return.ts` — the return flight, owning both ends of the handover
- `about-flow.ts` — wiring only

### New modules, `src/about/array/`

| Module | Responsibility | Depends on THREE? |
|---|---|---|
| `array-math.ts` | `panelScale`, `scaleCentre`, `emissionStrength`, `edgeAlpha`, `signalFalloff` | no |
| `array-idle.ts` | the S7 engagement state machine | no |
| `array-geometry.ts` | island extraction (connected components), centroids, edge-candidate build | geometry only |
| `array-material.ts` | panel `ShaderMaterial` (S2 + S3) | yes |
| `array-network.ts` | node + edge layer (S6) | yes |
| `array-signal.ts` | the beam (S4) | yes |
| `array-pointer.ts` | proxy raycast → cursor local position (S1) | yes |
| `array.ts` | assembly, `update(dt)`, mount/unmount | yes |

The first two are pure and carry the behaviour worth testing. Follow
`tile-material.ts`'s `ShaderMaterial` precedent rather than `onBeforeCompile` —
that file's header explains why for this codebase.

## 6. Asset handoff contract

What the runtime needs exported. **Nothing here needs a custom Blender
attribute** — island centroids are derived at load from connected components,
which is robust and keeps the export simple.

### One file, not five

**Export the whole array as a single `array.glb` with its hierarchy intact**, and
the runtime splits it by node name.

Splitting per-group into separate `.glb` files — an earlier draft of this spec —
is wrong: `Circle`'s transform is expressed relative to `Cube.001`, so exporting
them to different files drops the parent chain and the dish lands in the wrong
place. Per-mesh handling (don't-merge, decimate, UV-preserve) is a property of
each mesh, not of the file it ships in. And there is no lazy-loading benefit,
because the whole beat loads together.

| Node | Handling |
|---|---|
| `Circle` | **Do not merge vertices.** Island separation is load-bearing — a merge-by-distance pass destroys the effect. 9,840 tris, ship as-is. |
| `Circle.012` | Constant emitter, own material variant. Decimate freely — 3,072 tris is generous for a glowing cone. |
| `Circle.001`–`.011`, `Cube` | Dish fittings, ride with the disc. **Both decimation targets: `Circle.010` at 7,484 and `Cube` at 7,136 — together 42% of the array, both pure dressing.** |
| `Cube.001`, `Circle.013`/`.014`, `Cube.002`, `Circle.015`/`.016`, `Cube.003`/`.004` | Static base and mast. 3,658 tris total — leave alone. |
| `Cylinder` | Signal beam. Decimated, **UVs intact** — the alpha mask is UV-driven. |
| `Cursor` | Include, hidden. Gives the runtime its measured radius and a placement reference rather than a hardcoded 0.2504. |
| `Point` | Include. Exports via `KHR_lights_punctual`; saves guessing intensity and colour. |

Ground ships separately as `array-ground.glb` — low-poly plane plus baked normal
map. Multires L2 at 524k polys cannot ship.

### Export settings

- **"Apply Modifiers" ON.** Not optional: the GN group on `Circle` is what
  creates the islands, and the `Array` GN on `Circle.016`/`Cube.004` is real
  geometry. Solidify, Bevel, Mirror and Decimate all need to bake too.
- **Do NOT apply scale or rotation.** Every threshold in §2 and §3 is expressed in
  `Circle`'s local space *as it currently stands* (local scale 2, world scale
  0.732, local radius ≈ 1.611). Applying scale doubles that local radius and
  breaks 0.2 / 0.41 / 0.3421 all at once. glTF carries the node TRS faithfully,
  so there is nothing to gain.
- **Mute `Circle`'s `TRACK_TO` and `Point`'s `CHILD_OF` before exporting.**
  Measured 2026-08-26: the constraints swing the dish **5.91°** off its authored
  rotation as the file sits, and **11.36°** once the cursor is parked far away for
  the GN bake. The exporter reads the evaluated depsgraph, so that swing gets
  baked into the node transform. The runtime reproduces both follows itself and
  needs the authored rest pose.
- Park `Cursor` far away (e.g. x = 100) so the GN evaluates every panel at scale
  1.0 — the closed state. Restore it afterwards.

Placement: an array-root transform relative to the `lander` marker, dialled in
once — see §9.1.

Pipeline, following Igloo: **Draco** for geometry, **KTX2/Basis** for any
texture. Neither loader is in the bundle today; both go in the lazy About chunk,
not the boot path.

## 7. Performance budget

Igloo's site is the reference for how this should be delivered, not for what it
should look like. The transferable choices:

- **Everything compressed** — Draco geometry, KTX2 textures, no raw PNG
- **Bake lighting into colour maps** rather than lighting at runtime — the
  world strength of 0 means this scene is already most of the way there
- **Load on approach, not at boot** — the About chunk is already lazy
- `prefers-reduced-motion` honoured: ambient off, explode static, no beam animation

**Measured, as authored: the array is 34,734 tris** — before the ground plane.
That is the real starting point, and it is heavier than it looks because two
dressing objects dominate:

| Group | Tris | Action |
|---|---|---|
| `Circle` (dish panels) | 9,840 | **Untouchable** — island separation is the effect |
| `Circle.010` | 7,484 | Decimate hard — dressing |
| `Cube` | 7,136 | Decimate hard — dressing |
| `Circle.012` (core) | 3,072 | Decimate freely |
| `Circle.016` | 1,872 | Decimate |
| `Cylinder` (signal) | 1,404 | Keep — UVs load-bearing |
| everything else | 3,926 | Leave alone |

Halving the two big dressing objects and the core lands the array near **21k**,
leaving room for the ground bake under a **35k beat total**. Two shader
materials (panels, core) plus the signal and the network — four draw calls for
the dynamic parts.

Per `portfolio_perf_constraints`: gate the update loop on visibility and pause it
under takeovers.

## 8. Testing

Automation tabs on this machine run occluded — `rAF` is flat zero, CSS
transitions freeze at their start value. Plan around it:

- **Unit tests** (vitest) for `array-math.ts` and `array-idle.ts` — the state
  machine's silence-then-breathe cycle is exactly the kind of thing that ships
  broken and is trivially testable.
- **Island extraction** tested against a synthetic two-island mesh, asserting
  centroids and that no island bleeds into another.
- **Edge candidates** tested for symmetry and k-count.
- **Shader compile** proven with the `readPixels` route: expose the renderer from
  a lab, force one `render()`, read `renderer.info.programs[].diagnostics.error`.
  Without this a broken shader is silent in a hidden tab.
- **Motion feel, timing, the 2s pause** — Adam, foreground browser. Report as
  unverified until then; do not imply otherwise.

## 9. Open questions

**9.1 — Where does the array sit relative to the camera?** The `lander` marker
has **pitch 179.9°**, i.e. the camera looking straight up; the Blender comms
scene is framed level (camera at y −4.558, pitch 90°). Looking up at a dish that
looms overhead would work, but the array's placement transform depends on the
answer and it is not derivable from either file.

**9.2 — Touch devices.** There is no pointer. Options: ambient-only, an
autonomous sweep that drives the cursor, or drive it from scroll position. F19
(mobile) has been open since Phase 2 exit.

**9.3 — Does the array stay live while the camera scrubs past**, or only inside a
`t` window around the beat? Affects whether the update loop is always-on.

**9.4 — Does the 2D cursor hide during the beat?** The pointer becomes a physical
object here; keeping the F15 square drawn on top may double the read.

## 10. Non-goals

- No change to the corridor's scroll mechanism or the two-mechanism handover
- No MSDF/in-WebGL text — the corridor's copy stays DOM, per the shipped
  takeover architecture. Igloo's all-WebGL UI is noted as a divergence, not a target.
- The other unbuilt beats (portraits, client wall, capabilities, AI copy) are out
  of scope
