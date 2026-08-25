# commms — About QA Pass — Design Spec

**Date:** 2026-08-25
**Branch:** `worktree-about-page`
**Follows:** `2026-08-24-continuous-flow-design.md`. That spec's model — one long page, the corridor,
the gate — stands. This is the third pass over it, driven by Adam's first browser QA.

---

## What this covers

Adam's QA raised five items. **Two are already fixed** (`2494e94`): the white-to-black snap on
entering the corridor, and the ferro disappearing behind a contact modal opened from a "behind"
beat. This spec covers the remaining three, all of which are design work against references Adam
supplied.

| # | Item | Reference |
|---|---|---|
| 1 | The ferro arrives and travels a world path, instead of sitting centre-frame | `Threejs Flow1.blend` |
| 2 | The footer beat: the footer rises and pushes the chrome up; the nav moves to the top | Figma `110:2` |
| 3 | The scroll gate's indicator | Figma `110:473` |

---

## 1 · The ferro arrives, then travels with you

**Today** the blob sits dead centre at a fixed fraction of the viewport for the entire corridor.
Adam: *"Currently it's center frame the whole time… I'd like the ferro to first appear in the scroll
transition from frame 160 and beyond. It should be 'faded' … until this point and begin to come into
frame and follow the movement path that it has animated."*

### It stays a shader; only the rect changes

Adam's own note — *"not sure how this works since I think it's not actually a 3D object, but a
shader with interactivity"* — is right, and it does not block this.

The blob renders on its own canvas with its own fixed camera (`FERRO_CAMERA = { distance: 4.2,
fovYDeg: 35 }`), and `placeAt(rect)` positions it by **CSS rect**; `ferro-placement.ts` turns that
rect into an object transform. A screen rect is just a projection. So: project the world-space path
through the *corridor's* camera each frame and hand the result to `placeAt`. Apparent size falls out
of camera distance for free, so it grows as it approaches. The WebGL drawing buffer never resizes,
which is the property the ferro stage was built around.

**No new renderer, no move into the world scene.** The alternative — making it a real object in the
world — would cost it its dedicated float environment and its own render pass, for no visible gain.

### The measured path

From `Threejs Flow1.blend`, object `Ferro Fluid`, in Blender coordinates. Frames convert with
`t = (frame - 64) / 194`, the same mapping the camera path uses.

| Frame | `t` | x | y | z |
|---|---|---|---|---|
| 157 | 0.479 | −0.014 | 36.840 | 27.332 |
| 165 | 0.521 | −0.014 | 37.176 | 20.043 |
| 172 | 0.557 | −0.676 | 41.457 | 21.785 |
| 177 | 0.582 | −1.075 | 43.792 | 18.186 |
| 209 | 0.747 | −1.075 | 43.792 | 18.186 |
| 228 | 0.845 | −0.635 | 50.484 | 18.186 |
| 236 | 0.887 | −0.635 | 50.484 | 18.186 |
| 257 | 0.995 | 0.002 | 58.131 | 18.245 |

Read plainly: it drops in from above (z 27.3 → 20 across f157–165), settles to mezzanine height by
f177, then travels forward with the camera, holding roughly **3–4.5 units ahead of it** in y for the
rest of the corridor. Two flat holds — f177–209 and f228–236 — are the capabilities and contact
beats, where it waits for you.

The same Blender→world conversion the camera path uses applies (`about-coords.ts`): offsets from the
anchor marker, scaled by `BLENDER_TO_WORLD`, with Blender +Y → Three −Z and +Z → +Y.

### Arrival

**It fades up as it descends** — Adam's call, chosen over a blur, a combined blur-and-fade, or a
pure scale-from-distance. Opacity 0 → 1 across f157–165 (`t` 0.479 → 0.521), the same span as the
descent, so the fade and the drop are one move. Before f157 it is not drawn at all.

Blur was rejected as reading like a lens effect rather than distance, and for costing a
full-viewport filter on every frame it is active. Pure scale was rejected because nothing then hides
the blob before it arrives.

### Not in scope

The `Ferro Controller` empty does one full rotation between f154 and f203, driving the displacement
churn. Matching that speed-up is a separate question — the existing drift is untouched here.

---

## 2 · The footer beat

Adam: *"the footer should scroll up 100vw and push the bottom plus hud icons and 'comms is a
interactive…' up and the navigation bar should also move up to the top of the page similar to it's
vertical position in the contact modal/page."*

### What the mockup actually specifies

Figma `110:2`, on a 1920×1080 frame:

- `Hero — Synth Nav` — the world band — **276px (25.6%)**
- the footer — **804px (74.4%)**

So it is **not** a 100vh takeover. The footer rises to about three quarters and the world stays
visible as a band above it. Nothing has to *compress*: the footer already covers the canvas, and the
canvas keeps rendering full-frame behind it. What moves is the chrome.

### What moves

`.chrome` is `position: fixed; inset: 0; z-index: 10` and never fades — it is above the corridor's
document. Within it:

| Element | At rest | At the footer beat |
|---|---|---|
| `.wordmark` | `top: 50%`, centred | top of the viewport |
| `.site-nav` | `top: 50%`, centred | top of the viewport |
| `.margin-note--bl` / `--br` | `bottom: 50px` | pushed up to sit just above the footer's top edge |
| `.margin-note--tl`, corner marks | unchanged | unchanged |

The nav's destination is the vertical position it already holds on the 2D pages, where `.nav2d` is
`position: sticky; top: 0` — so this is the nav returning to a place it already goes, not a new one.

### How it is driven

A **`--footer-rise`** custom property, 0 → 1, written by the corridor from scroll position across
the last beat — the same mechanism `--ground`, `--ink` and `--gate` already use. The chrome's CSS
interpolates against it. One number, one writer, and it is zero when the corridor is closed, so no
other page is affected.

**It must be cleared on exit**, alongside the other custom properties in `releaseSharedState()` —
that list exists because three separate restores leaked on this branch, one at a time.

---

## 3 · The scroll gate's indicator

Replaces the placeholder hairline with the component in Figma `110:473`. Adam's mock, verbatim:

- **Panel** — background `#121212`, 1px border `#6b6b6b`, radius 4px, padding 24px horizontal /
  8px vertical, contents centred in a column with 5px gap
- **Label** — "keep scrolling to return home", 12px, `#bdbdbd`, centred, full width
- **Track** — 1px border `#6f6f6f`, radius 4px, 4px inner padding, full width, filled with a 45°
  diagonal hatch
- **Fill** — `#61e891`, 20px tall, radius 2px, growing from the left

It is wired to the `--gate` value the gate already writes; only the presentation changes.

**Two deliberate deviations, both flagged to Adam:**

- **The hatch is a CSS repeating gradient, not the exported PNG.** It is a specifiable 45° stripe,
  not an icon — a gradient stays crisp at any width, has no tiling seam, and can take the palette's
  ink rather than being baked to one colour.
- **The font is the site's `--font-mono` (Space Mono), not the mock's Galix Mono**, which the site
  does not ship. If Galix is licensed and wanted, that is a separate change across all the chrome,
  not something to smuggle in here.

The indicator is **placeholder-free from here** — this is the real design, so the "awaiting Figma"
note attached to `GATE_THRESHOLD_PX` now covers only the threshold *value*, not the treatment.

---

## Out of scope

- **The grass.** `Threejs Flow1.blend` now has the lander geometry applied — `About Digital Nomad
  Lander`, **661,795 verts / 432,874 polys**, three materials. That is roughly five times the
  contact ferro and far too heavy to ship as-is; it needs decimation or a bake before it can land.
  The lander beat remains a later plan.
- The `Ferro Controller`'s rotation speed-up.
- Everything in `2026-08-24-about-spine-followups.md`, including the `about-flow.ts` split.

---

## Verification

- The suite must stay green — currently **663 passed / 2 skipped** across 53 files, run from the
  worktree root, never the repo root.
- Pure logic gets unit tests: the world→rect projection, the ferro keyframe sampling and its fade
  ramp, the footer-rise amount, and the gate fill's mapping to `--gate`.
- Feel is verified by Adam in a foreground browser. Automation tabs are occluded — no rAF, CSS
  transitions frozen — so screenshots prove nothing here.

### What Adam should be able to see when it works

- The blob is absent for the first half of the corridor, then fades up as it drops in after the
  client wall, and travels ahead of him to the end
- Reaching the footer, the nav rises to the top and the HUD line lifts with the footer rather than
  being covered by it
- Pushing past the footer fills a real indicator that says what pushing will do
