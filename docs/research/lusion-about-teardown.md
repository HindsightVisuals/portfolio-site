# commms — Lusion /about Teardown — Technique Reference

**Date:** 2026-08-19
**Type:** Research / technique reference (not a spec — nothing here is committed work)
**Source:** `https://lusion.co/about`, three.js r158, bundle `_astro/hoisted.CUO_IjfL.js`
**Repo:** `C:\Users\Adam\Code\portfolio-site`

---

## Why this doc exists

Adam asked how Lusion builds the 3D on their About page. The findings below are read
directly from their shipped bundle and asset files, not inferred from looking at the
page. Each section ends with **→ commms** — what, if anything, we should do about it.

Nothing here is a decision. It's a menu to pull from when the relevant work comes up.

---

## The headline finding: no materials, no lights

Their instantiation counts across the whole bundle:

```
new MeshStandardMaterial   0
new MeshPhysicalMaterial   0
new MeshBasicMaterial      2
new ShaderMaterial        37
new RawShaderMaterial      1
new DirectionalLight       0
new PointLight             0
new AmbientLight           0
```

Zero lights. Zero PBR materials. Every surface on that page is hand-written GLSL, with
lighting either baked into a texture channel or computed analytically in the shader.

**→ commms:** We're already on this road — `tile-material.ts` documents exactly this
choice ("why a hand-written shader rather than onBeforeCompile"), and `background.ts`,
`atmosphere.ts`, `rd-surface.ts` are all raw GLSL. No change needed; this is
confirmation that the approach scales to a page far heavier than ours.

---

## Asset pipeline

They don't ship glTF. Custom `.buf` format — a length-prefixed JSON header followed by
tightly packed binary:

```json
{ "vertexCount": 8192, "indexCount": 0, "meshType": "Points",
  "attributes": [
    { "id": "position", "storageType": "Uint16Array", "componentSize": 3,
      "packedComponents": [{ "from": -0.999, "delta": 1.9985 }, ...] },
    { "id": "nShade", "storageType": "Uint8Array", "componentSize": 4 }
  ] }
```

Positions quantised to Uint16 with a per-axis from/delta range, normals to Uint8. ~27
files, most under 100kb. Total texture budget for the entire page is **four WebP files**:

- `terrain_shadow_light_height.webp` — shadow, light, and height in separate channels
- `person.webp`, `person_light.webp`, `ground_person_shadow.webp`

Plus a blue-noise tile and the two SMAA lookups. No albedo, roughness, or normal maps
anywhere.

**→ commms: skip the format, steal the packing idea.** Our Spy Hop GLB is 116 KiB and
tile art is 273 KiB total — we do not have an asset-size problem, and a bespoke binary
format is a maintenance tax with no payoff at our scale. What *is* worth copying is
**channel-packing**: if we ever bake lighting or masks for a 3D element, put shadow /
light / height in R/G/B of one WebP rather than shipping three textures.

---

## Baked animation, replayed on the GPU

- `camera_spline.buf` — 200 points, each position + quaternion. The entire camera move is
  authored in a DCC app and baked; scroll just scrubs `t` along it.
- `rock_animation_0.buf` — 1920 position+quaternion pairs. The rock meshes carry a
  `piece:Uint8` per vertex; the vertex shader reads `piece`, looks up that piece's baked
  rigid transform, and applies it. A shattering rigid-body sim replayed entirely on the GPU
  with no runtime physics.
- `person_idle.buf` — same trick for the walk cycle, 2-bone skinning only.
- `letter_placements.buf` — 196 points with `position`, `density`, and a per-letter `dof`
  value. Even the depth-of-field weighting is art-directed and baked.

**→ commms: relevant, but not now.** Our camera is procedural (`camera-director.ts`,
`snap.ts`, `magnet.ts`) and it needs to be — the whole WORK wall interaction is
"camera responds to where you point", which a baked spline can't do. Where this *would*
apply is a future scripted moment (an intro flight, a case-study transition) where the
path is fixed and art direction matters more than responsiveness. The `piece`-attribute
pattern is the one to remember: **one Uint8 per vertex + a lookup table beats any runtime
sim** when the motion is authored rather than reactive.

---

## The team portraits — instanced quads, not a textured plane

Worth recording because the obvious guess (a plane with a scrolling alpha texture) is
wrong on both counts.

Each person is **8192 instanced quads** — a `PlaneGeometry(1,1)` promoted to an
`InstancedBufferGeometry`, one instance per particle. The point cloud is uploaded once
into a 128×64 data texture (128 × 64 = 8192 exactly) and each instance samples it:

```glsl
vec3 basePos  = texture2D(u_positionTexture, a_simUv).xyz;
vec4 norShade = texture2D(u_norShadeTexture, a_simUv);
vec3 nor = norShade.xyz * 2. - 1.;   // packed normal
float light = norShade.w * 1.25;     // baked shade term
```

The data textures are written once at load and never updated — despite the FBO helper,
there is **no ping-pong sim for the faces**. All motion is computed in the vertex shader
from `u_time` and per-instance randoms. Two meshes exist (`MAX_FACE_NUM = 2`) so the
current and next portrait can cross-fade.

The fragment shader samples no texture at all:

```glsl
float d = length(v_toCenter);
float range = v_blurriness * 5.;
float brightness = linearStep(1., 1. - range - fwidth(d), d);
gl_FragColor = vec4(shade) * v_showRatio * v_showRatio;
```

Each quad is a procedural soft dot, additively blended (`OneFactor`/`OneFactor`,
`depthTest: false`, `depthWrite: false`).

The "matrix" read comes from four things stacked in the vertex shader, none of them
textures:

1. **The cursor is the light.** Mouse unprojected to world space, used as a point light
   with `1/sqrt(dist)` falloff.
2. **A travelling scanline** — `smoothstep(0.04, 0., abs(fract(u_time * -0.3 - basePos.y * .5 + .5)))`,
   plus a rim term that brightens particles whose normal is perpendicular to view, so
   silhouette edges glow.
3. **Glitch bands** — a hash per horizontal strip shoves whole rows sideways and tints
   them `vec3(1.0, 0.5, 2.0)` during transitions.
4. **Depth of field in the point size** — out-of-focus particles get bigger *and* dimmer,
   and the fragment's edge softens via `range = v_blurriness * 5.`. Bokeh with no
   post-process pass.

**→ commms:** No portrait feature planned, so this is reference rather than a to-do. The
transferable pieces are (a) **mouse-as-light-source** — cheap, reads as expensive, and
fits our existing cursor language; and (b) **DOF via point size + edge softness** instead
of a post pass, which matters because we've already ruled out extra full-screen passes on
perf grounds.

---

## The two techniques actually worth adopting

### 1. Sub-pixel energy conservation — we have this bug today

When a quad would render smaller than a pixel, Lusion clamps its size and dims it by
exactly the ratio it was scaled up:

```glsl
float pointSize = max(basePointSize, 12. / u_resolution.y);
float subpixelMultiplier = pow(basePointSize / pointSize, 1.5);
// ... later
v_shade = min(1.0, light * (...)) * subpixelMultiplier * showRatio;
```

This is what keeps 8192 dots from shimmering and crawling as they move. Without it, a
sub-pixel point flickers as it drifts across the sample grid — it's either hit or missed,
with no in-between.

**→ commms: `src/three/atmosphere.ts` has exactly this problem.** Current code:

```glsl
gl_PointSize = aSize * uPixelRatio * (140.0 / max(dist, 1.0)) * (1.0 + stretch);
```

`SIZE_MIN` is 2 and `RANGE_Z` is 300, so distant motes fall well under a pixel with no
floor and no compensating dim. The fix is the two lines above: clamp `gl_PointSize` to a
1px floor and multiply `vDepthFade` by `pow(desired / clamped, 1.5)`. Should be a visible
improvement on the far field, and it costs nothing.

Not doing it as part of this commit — it's a visual change and belongs in its own pass
where Adam can see the before/after.

### 2. `fwidth()` for edge width instead of a fixed smoothstep

Lusion's dot edge is `1. - range - fwidth(d)` — the antialiasing band is exactly one
pixel wide whatever the point's screen size, so a dot stays crisp when small and soft
when large, automatically.

**→ commms: `atmosphere.ts` frag uses a fixed band** — `smoothstep(0.35, 0.9, d)`. That's
tuned for one apparent size and gets mushy on near motes, aliased on far ones. Same pass
as the fix above. (`OES_standard_derivatives` is core in WebGL2, so no extension flag
needed; Lusion only sets `material.extensions.derivatives` because they support WebGL1.)

---

## Smaller notes worth keeping

- **Blue-noise dither everywhere.** 52 references to `blueNoise` and 50 to `dither` in
  their bundle, fed by the standard `LDR_RGB1_0.png` tile. The terrain shader does
  `gl_FragColor.g -= blueNoise.z * 0.004` purely to kill gradient banding. **→ commms:**
  relevant to the RD background's large flat ramps if banding ever shows on a wide gamut
  display. Cheap insurance, one texture.
- **Mini G-buffer via channel packing.** Their terrain writes `.r` = shadow, `.b` = fog
  depth, `.a` = spec × shadow, so the post stack reads masks it would otherwise need
  extra passes to compute. **→ commms:** only relevant if we ever add a post chain; we
  currently don't have one and shouldn't add one lightly (see perf constraints).
- **Live accumulation buffer for contact shadow.** The ground ping-pongs a 768×768 render
  target to accumulate the walking figure's footprint trail, blurred over time. **→
  commms:** structurally identical to what `background.ts` already does for the RD sim.
  No new technique for us, but confirms the pattern is idiomatic.
- **Geometry pre-sorted at export.** `edan.buf` is strictly sorted by z — 8192 vertices,
  zero ordering violations. Sorting done once at bake time so nothing sorts at runtime.
  **→ commms:** general principle — if an ordering is fixed, bake it into the asset.
- **DPR is not capped.** They render at full `devicePixelRatio` (measured 1.5 → 3843×1960
  backing store). Given our 4K frame-rate history, we should *not* copy this.

---

## Explicitly not adopting

- **A custom binary asset format.** No size problem to solve; pure maintenance cost.
- **A baked camera spline for the main navigation.** Kills the responsiveness the WORK
  wall is built around.
- **Full-DPR rendering.** Directly contradicts our known 4K perf ceiling.
- **A post-process chain** to get DOF or scatter. If we want those, do them in the
  material like Lusion does — see the point-size DOF above.

---

## Related

- `docs/` — this is the first research note; specs and plans live in the Obsidian vault
  under `07 Projects/Portfolio/Specs & Plans/`
- Standing perf rules that constrain anything adopted from here: rAF visibility gating,
  `stage.setPaused(true)` under takeovers, lazy-chunk routing, and "question every new RD
  instance"
