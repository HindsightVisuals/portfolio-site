/**
 * ⚗️ Ferrofluid lab — `?lab=ferro`
 *
 * THROWAWAY. This exists to answer one question before any spec: does Adam's
 * Blender ferrofluid translate to Three.js, and does it still read as
 * ferrofluid when it does? Nothing here is production code.
 *
 * Ported from `00_Blend/01_Comms/Contact Object Ferro.blend`, whose actual
 * setup is:
 *   · spherified subdivided cube, 6144 quads (radius ≈ 0.85)
 *   · Displace modifier, strength 1, mid-level 0.5, direction NORMAL
 *   · texture coords OBJECT → "Empty"
 *   · texture = MAGIC, depth 1, turbulence 4.1
 *   · Empty animated on LOCATION Z, +10 → −10 over 200 frames @ 30fps
 *     (= 3 units/sec — the field slides past the sphere, it does not rotate)
 *
 * Two translation notes that matter:
 *
 * 1. The Empty is not an object here, it is an offset. `texture_coords =
 *    OBJECT` means the sample point is the vertex position in the Empty's
 *    space; with an unrotated, unscaled Empty that is just `position - empty`.
 *    Moving the Empty slides the whole noise volume across the surface. Scroll
 *    drives that offset directly.
 *
 * 2. The geometry is an icosphere, not a spherified cube. Same silhouette,
 *    near-uniform triangles, and no cube-face seams where the displacement
 *    density changes. Press G to compare against a spherified cube built the
 *    way the blend file does it.
 */

import * as THREE from 'three';
import { MAGIC_GLSL } from './magic-texture';
import { approachExp } from '../three/magnet';

/**
 * Where Adam landed, 2026-08-21. The lab boots here; B goes to blend parity.
 *
 * Two of these are deliberate departures from Blender parity, not oversights:
 *
 * `recalcNormals: 0` — normals are left ORIGINAL on purpose. Rebuilding them
 * from the field gradient is "correct" and gives the hard black-chrome look of
 * the Blender reference (shading SD 17.0 vs 2.7); leaving them alone lights the
 * blob as a smooth sphere regardless of its silhouette, which is what produces
 * the soft gradient falloff Adam chose. Trade-off to keep in mind: the shading
 * stays keyed to the undisplaced sphere, so in motion the silhouette morphs
 * while the highlights largely do not.
 *
 * `darkEnv: false` — the white-void environment, matching the site's ground
 * rather than the blend file's studio HDRI.
 */
const DEFAULTS = {
  mode: 1, // simplex
  strength: 1.05,
  midLevel: 0.5,
  turbulence: 7, // inert in simplex; kept so B/R round-trip cleanly
  texScale: 0.5,
  radius: 0.85,
  detail: 64,
  driftSeconds: 12,
  recalcNormals: 0,
  darkEnv: false,
  exposure: 0.5,
};

/** Straight off the blend file, for A/B against the Blender original. */
const BLENDER = { mode: 0, strength: 1, turbulence: 4.1, texScale: 1, driftSeconds: 0.51 };

/**
 * Drift is expressed as SECONDS PER TURNOVER, not units per second.
 *
 * "Turnover" = the empty travelling one full noise period, which is the point
 * at which the pattern across the blob has completely changed. That distance is
 * `1 / texScale` units, so quoting a speed in units/sec means the perceived
 * churn silently changes every time the scale is touched. Holding the TIME
 * constant is what actually matches the eye.
 *
 * For reference, the blend file's own rate — 3 units/sec at scale 1 — works out
 * to roughly one turnover every 0.5s, which is why it read as frantic.
 */
const driftUnitsPerSec = (texScale: number, seconds: number): number =>
  seconds <= 0 ? 0 : 1 / texScale / seconds;

/** Scroll → units of texture-space travel. */
const SCROLL_UNITS_PER_PX = 0.0025;
/** Momentum mode: impulse per pixel. Tuned so total coast ≈ the raw distance
 *  (travel = impulse / damping), with the site's own damping rate. */
const SCROLL_VEL_PER_PX = SCROLL_UNITS_PER_PX * 2.2;
/** Matches camera-director's DAMPING_RATE, so the blob shares the site's inertia. */
const SCROLL_DAMPING = 2.2;
/** Eased mode: catch-up rate, per second. */
const SCROLL_EASE_RATE = 4;

const SIMPLEX_GLSL = /* glsl */ `
vec3 fMod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 fMod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 fPermute(vec4 x){ return fMod289(((x*34.0)+1.0)*x); }
vec4 fTaylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float fSnoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = fMod289(i);
  vec4 p = fPermute(fPermute(fPermute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = fTaylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

/** Spherified subdivided cube — the blend file's own construction, for comparison. */
function spherifiedCube(radius: number, segments: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(2, 2, 2, segments, segments, segments);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize().multiplyScalar(radius);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  // BoxGeometry duplicates verts along face borders; merging is what removes
  // the visible seam, but the point of this option is to SHOW that seam.
  return geo;
}

export function initFerroLab(): void {
  for (const sel of ['.tagline', '.reticle-field', '.chrome', '.screen-proxies', '.contact-mark']) {
    document.querySelector<HTMLElement>(sel)?.style.setProperty('display', 'none');
  }

  const canvas = document.querySelector<HTMLCanvasElement>('#bg-canvas');
  if (!canvas) throw new Error('#bg-canvas not found');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0xfdfdfd, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 4.2);

  /**
   * The environment IS the look.
   *
   * The blend file's Ferro material is metallic 1 / roughness 0 — a perfect
   * mirror — lit only by `studio_small_09_4k.exr` (no lights in the scene at
   * all). So every highlight in Adam's reference is a bright softbox in a
   * mostly-black studio, and a white-void environment cannot produce that look
   * no matter how the material is tuned.
   *
   * Built as a FLOAT DataTexture, not a canvas: an LDR canvas clamps at 1.0,
   * and a mirror reflecting a clamped white gives flat grey highlights instead
   * of the hard specular hits a real HDRI's >1 values produce.
   */
  const buildEnv = (dark: boolean): THREE.DataTexture => {
    const W = 256;
    const H = 128;
    const data = new Float32Array(W * H * 4);
    const ambient = dark ? 0.015 : 0.85;
    // [x0, y0, x1, y1, intensity] in equirect space; y 0 = up.
    const boxes: Array<[number, number, number, number, number]> = dark
      ? [
          [0.05, 0.06, 0.3, 0.34, 18],
          [0.55, 0.1, 0.74, 0.3, 12],
          [0.34, 0.02, 0.46, 0.16, 22],
        ]
      : [
          [0.05, 0.05, 0.35, 0.35, 6],
          [0.6, 0.08, 0.8, 0.3, 4],
        ];
    const soft = (v: number, e: number): number => Math.min(1, Math.max(0, v / e));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const v = y / H;
        // Floor bounce — studio HDRIs are brighter below the horizon.
        let lum = ambient + (v > 0.5 ? (dark ? 0.06 : 0.25) * (v - 0.5) * 2 : 0);
        for (const [x0, y0, x1, y1, i] of boxes) {
          if (u > x0 && u < x1 && v > y0 && v < y1) {
            const fx = Math.min(soft(u - x0, 0.04), soft(x1 - u, 0.04));
            const fy = Math.min(soft(v - y0, 0.04), soft(y1 - v, 0.04));
            lum += i * fx * fy;
          }
        }
        const o = (y * W + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = lum;
        data[o + 3] = 1;
      }
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.needsUpdate = true;
    return tex;
  };

  const pmrem = new THREE.PMREMGenerator(renderer);
  let darkEnv = DEFAULTS.darkEnv;
  const applyEnv = (): void => {
    const src = buildEnv(darkEnv);
    scene.environment = pmrem.fromEquirectangular(src).texture;
    src.dispose();
  };
  applyEnv();

  // Blender is on Filmic / medium-high contrast. ACES is the closest thing
  // three ships; without any tone mapping the >1 softbox hits just clip white.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = DEFAULTS.exposure;

  const uniforms = {
    uEmpty: { value: new THREE.Vector3(0, 0, 10) }, // the Blender Empty
    uStrength: { value: DEFAULTS.strength },
    uMidLevel: { value: DEFAULTS.midLevel },
    uTurbulence: { value: DEFAULTS.turbulence },
    uTexScale: { value: DEFAULTS.texScale },
    uMode: { value: DEFAULTS.mode }, // 0 = Blender Magic, 1 = simplex
    uRecalcNormals: { value: DEFAULTS.recalcNormals },
  };

  /**
   * The blend file's "Ferro" Principled BSDF, read off the live file:
   * Base Color linear 0.0371 (= sRGB #363636), Metallic 1, Roughness 0,
   * Coat Weight 0. Black chrome — a mirror, not glossy plastic.
   *
   * three's colour management takes the hex as sRGB and converts, which lands
   * back on 0.0369 linear. Do not "correct" this to a darker hex.
   */
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x363636,
    metalness: 1,
    roughness: 0,
    clearcoat: 0,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform vec3 uEmpty;
        uniform float uStrength;
        uniform float uMidLevel;
        uniform float uTurbulence;
        uniform float uTexScale;
        uniform float uMode;
        uniform float uRecalcNormals;
        ${MAGIC_GLSL}
        ${SIMPLEX_GLSL}

        // Blender: texture_coords = OBJECT, so the sample point is the vertex
        // in the Empty's space. Unrotated + unscaled Empty ⇒ a plain offset.
        float ferroField(vec3 p) {
          vec3 tp = (p - uEmpty) * uTexScale;
          if (uMode < 0.5) return magicIntensity(tp, uTurbulence);
          return fSnoise(tp) * 0.5 + 0.5;   // remap to Magic's 0..1 range
        }

        // Displace modifier: (intensity - mid_level) * strength, along NORMAL.
        float ferroDisp(vec3 p) {
          return (ferroField(p) - uMidLevel) * uStrength;
        }

        // Moving vertices does not move normals. Ferrofluid is almost entirely
        // specular, so without this the blob lights like a matte lump — press N
        // to see it. Rebuild from the field gradient projected off the normal.
        vec3 ferroNormal(vec3 p, vec3 n) {
          if (uRecalcNormals < 0.5) return n;
          float e = 0.002;
          float d = ferroDisp(p);
          vec3 g = vec3(
            ferroDisp(p + vec3(e, 0.0, 0.0)) - d,
            ferroDisp(p + vec3(0.0, e, 0.0)) - d,
            ferroDisp(p + vec3(0.0, 0.0, e)) - d
          ) / e;
          return normalize(n - (g - dot(g, n) * n));
        }
        `,
      )
      .replace(
        '#include <beginnormal_vertex>',
        'vec3 objectNormal = ferroNormal( position, normal );',
      )
      .replace(
        '#include <begin_vertex>',
        'vec3 transformed = position + normal * ferroDisp( position );',
      );
  };

  let detail = DEFAULTS.detail;
  let useCube = false;
  let mesh: THREE.Mesh | null = null;

  const buildMesh = (): void => {
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
    const geo = useCube
      ? spherifiedCube(DEFAULTS.radius, 32)
      : new THREE.IcosahedronGeometry(DEFAULTS.radius, detail);
    mesh = new THREE.Mesh(geo, material);
    scene.add(mesh);
  };
  buildMesh();

  // --- HUD -----------------------------------------------------------------
  const hud = document.createElement('pre');
  hud.style.cssText =
    'position:fixed;left:24px;top:24px;z-index:50;margin:0;font:12px/1.5 ui-monospace,monospace;' +
    'color:#141414;white-space:pre;pointer-events:none;';
  document.body.append(hud);

  let drift = true;
  let driftSeconds = DEFAULTS.driftSeconds;

  /**
   * The empty's Z is composed, not accumulated: `driftZ + scrollZ`.
   *
   * Writing both into one value made them fight — in eased mode the drift moved
   * the value while the ease pulled it back toward a target the drift never
   * updated, so slow drift and scrolling cancelled each other out.
   */
  let driftZ = 10; // blend file's starting empty.z
  let scrollZ = 0;
  let scrollTarget = 0;
  let scrollVel = 0;

  /** 0 = raw (steps per notch), 1 = eased (catch-up), 2 = momentum (coasts). */
  let scrollMode = 2;
  const SCROLL_MODES = ['raw — steps per notch', 'eased — catches up', 'momentum — coasts'];

  const tris = (): number =>
    useCube ? 6 * 32 * 32 * 2 : 20 * (detail + 1) * (detail + 1);

  const paintHud = (): void => {
    hud.textContent = [
      `⚗️  FERRO LAB                     scroll = drive the Empty`,
      ``,
      `mode        ${uniforms.uMode.value < 0.5 ? 'MAGIC (Blender parity)' : 'SIMPLEX'}   [M]`,
      `empty.z     ${uniforms.uEmpty.value.z.toFixed(2)}   (blend: +10 → −10)`,
      `drift       ${drift ? `on — ${driftSeconds.toFixed(1)}s / turnover` : 'off'}   [SPACE]  ; / '`,
      `            ${drift ? `= ${driftUnitsPerSec(uniforms.uTexScale.value, driftSeconds).toFixed(3)} units/s` : ''}`,
      `scroll      ${SCROLL_MODES[scrollMode]}   [S]`,
      `strength    ${uniforms.uStrength.value.toFixed(2)}   [ / ]`,
      `tex scale   ${uniforms.uTexScale.value.toFixed(2)}   - / =`,
      `turbulence  ${uniforms.uTurbulence.value.toFixed(2)}   , / .${uniforms.uMode.value < 0.5 ? '' : '   ← MAGIC ONLY, inert here'}`,
      `geometry    ${useCube ? 'spherified cube 32³' : `icosphere detail ${detail}`}   [G]`,
      `triangles   ${tris().toLocaleString()}   [1..4 detail]`,
      `normals     ${uniforms.uRecalcNormals.value ? 'recalculated' : 'ORIGINAL (see the flat lighting)'}   [N]`,
      `material    metal 1 · rough 0 · #363636   (blend "Ferro")`,
      `environment ${darkEnv ? 'dark studio (≈ studio_small_09)' : 'white void (site ground)'}   [E]`,
      `exposure    ${renderer.toneMappingExposure.toFixed(2)}   [K]   ACES ≈ Blender Filmic`,
      ``,
      `R = reset to these defaults    B = Blender parity`,
    ].join('\n');
  };

  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'm': case 'M': uniforms.uMode.value = uniforms.uMode.value < 0.5 ? 1 : 0; break;
      case 'n': case 'N': uniforms.uRecalcNormals.value = uniforms.uRecalcNormals.value ? 0 : 1; break;
      case ' ': drift = !drift; e.preventDefault(); break;
      case '[': uniforms.uStrength.value = Math.max(0, uniforms.uStrength.value - 0.05); break;
      case ']': uniforms.uStrength.value += 0.05; break;
      case '-': uniforms.uTexScale.value = Math.max(0.05, uniforms.uTexScale.value - 0.05); break;
      case '=': uniforms.uTexScale.value += 0.05; break;
      case ',': uniforms.uTurbulence.value = Math.max(0, uniforms.uTurbulence.value - 0.1); break;
      case '.': uniforms.uTurbulence.value += 0.1; break;
      case 's': case 'S': scrollMode = (scrollMode + 1) % 3; scrollVel = 0; scrollTarget = scrollZ; break;
      case 'e': case 'E': darkEnv = !darkEnv; applyEnv(); break;
      case 'k': case 'K':
        renderer.toneMappingExposure = renderer.toneMappingExposure >= 2 ? 0.5
          : +(renderer.toneMappingExposure + 0.25).toFixed(2);
        break;
      case ';': driftSeconds = Math.min(60, driftSeconds + 1); break;
      case "'": driftSeconds = Math.max(0.25, driftSeconds - 1); break;
      case 'g': case 'G': useCube = !useCube; buildMesh(); break;
      case '1': detail = 16; useCube = false; buildMesh(); break;
      case '2': detail = 32; useCube = false; buildMesh(); break;
      case '3': detail = 64; useCube = false; buildMesh(); break;
      case '4': detail = 128; useCube = false; buildMesh(); break;
      case 'r': case 'R':
        uniforms.uStrength.value = DEFAULTS.strength;
        uniforms.uTexScale.value = DEFAULTS.texScale;
        uniforms.uTurbulence.value = DEFAULTS.turbulence;
        uniforms.uMode.value = DEFAULTS.mode;
        uniforms.uRecalcNormals.value = DEFAULTS.recalcNormals;
        driftSeconds = DEFAULTS.driftSeconds;
        driftZ = 10; scrollZ = 0; scrollTarget = 0; scrollVel = 0;
        renderer.toneMappingExposure = DEFAULTS.exposure;
        if (darkEnv !== DEFAULTS.darkEnv) { darkEnv = DEFAULTS.darkEnv; applyEnv(); }
        break;
      case 'b': case 'B':
        uniforms.uStrength.value = BLENDER.strength;
        uniforms.uTexScale.value = BLENDER.texScale;
        uniforms.uTurbulence.value = BLENDER.turbulence;
        uniforms.uMode.value = BLENDER.mode;
        uniforms.uRecalcNormals.value = 1;
        driftSeconds = BLENDER.driftSeconds;
        driftZ = 10; scrollZ = 0; scrollTarget = 0; scrollVel = 0;
        break;
    }
    paintHud();
  });

  window.addEventListener(
    'wheel',
    (e) => {
      if (scrollMode === 0) scrollZ -= e.deltaY * SCROLL_UNITS_PER_PX;
      else if (scrollMode === 1) scrollTarget -= e.deltaY * SCROLL_UNITS_PER_PX;
      else scrollVel -= e.deltaY * SCROLL_VEL_PER_PX;
      paintHud();
    },
    { passive: true },
  );

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Debug handle. This is a lab, so poking uniforms from the devtools console
  // is the point — and it lets a shader compile be forced without waiting on
  // rAF, which matters because an occluded tab never ticks and would hide a
  // GLSL error entirely. `__ferro.renderer.compile(__ferro.scene, __ferro.camera)`.
  (window as unknown as Record<string, unknown>).__ferro = {
    renderer,
    scene,
    camera,
    material,
    uniforms,
  };

  const clock = new THREE.Clock();
  let hudTick = 0;
  const frame = (): void => {
    const dt = Math.min(clock.getDelta(), 0.05);

    if (drift) driftZ -= driftUnitsPerSec(uniforms.uTexScale.value, driftSeconds) * dt;
    if (scrollMode === 1) scrollZ = approachExp(scrollZ, scrollTarget, dt, SCROLL_EASE_RATE);
    else if (scrollMode === 2) {
      scrollZ += scrollVel * dt;
      scrollVel *= Math.exp(-SCROLL_DAMPING * dt);
    }
    uniforms.uEmpty.value.z = driftZ + scrollZ;

    renderer.render(scene, camera);
    if ((hudTick = (hudTick + 1) % 12) === 0) paintHud();
    requestAnimationFrame(frame);
  };
  paintHud();
  requestAnimationFrame(frame);
}
