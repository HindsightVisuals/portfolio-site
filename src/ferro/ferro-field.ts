/**
 * Ferro field — the displacement math and its GLSL, as a pure module.
 *
 * Ported from the verified `?lab=ferro` build. The lab kept both Blender's
 * Magic texture and simplex behind a mode switch; production is simplex only,
 * so the Magic branch (and `uTurbulence`, which is inert in simplex) is gone.
 *
 * Pure math is tested; the GL shell that consumes this is not. See the header
 * of `src/home/cursor-math.ts` for the convention.
 */

/** Adam's tuned look, 2026-08-21. Art direction — not Blender parity. */
export const FERRO_DEFAULTS = Object.freeze({
  strength: 1.05,
  midLevel: 0.5,
  texScale: 0.5,
  radius: 0.85,
  detail: 64,
  driftSeconds: 12,
  /**
   * Leaving normals original lights the blob as a smooth sphere regardless of
   * silhouette — a soft gradient falloff rather than the reference's hard black
   * chrome. Adam chose it; do not "fix" it.
   */
  recalcNormals: false,
  exposure: 0.5,
});

/**
 * Drift as SECONDS PER TURNOVER, not units/sec. A turnover is the field
 * travelling one noise period (1/texScale units) — the point the pattern across
 * the blob has fully changed. Quoting a speed instead silently changes the
 * perceived churn every time the scale moves.
 */
export function driftUnitsPerSec(texScale: number, seconds: number): number {
  if (!Number.isFinite(texScale) || !Number.isFinite(seconds)) return 0;
  if (seconds <= 0 || texScale <= 0) return 0;
  return 1 / texScale / seconds;
}

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

/**
 * The uniform block and the three field functions, injected after
 * `#include <common>` in the vertex shader. `ferroDisp` and `ferroNormal` are
 * the entry points the material patch replaces `begin_vertex` and
 * `beginnormal_vertex` with — see `ferro-object.ts`.
 */
export const FERRO_GLSL = /* glsl */ `
uniform vec3 uEmpty;
uniform float uStrength;
uniform float uMidLevel;
uniform float uTexScale;
uniform float uRecalcNormals;

${SIMPLEX_GLSL}

// Blender: texture_coords = OBJECT, so the sample point is the vertex in the
// Empty's space. An unrotated, unscaled Empty is therefore a plain offset —
// and the Empty translates on Z, it does not rotate.
float ferroField(vec3 p) {
  vec3 tp = (p - uEmpty) * uTexScale;
  return fSnoise(tp) * 0.5 + 0.5;   // remap to the Displace modifier's 0..1
}

// Displace modifier: (intensity - mid_level) * strength, along NORMAL.
float ferroDisp(vec3 p) {
  return (ferroField(p) - uMidLevel) * uStrength;
}

// Moving vertices does not move normals. Rebuilding them from the field
// gradient is available but OFF by default — see FERRO_DEFAULTS.recalcNormals.
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
`;
