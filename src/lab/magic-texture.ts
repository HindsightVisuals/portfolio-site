/**
 * A faithful port of Blender's Magic procedural texture.
 *
 * Adam's ferrofluid blend (`00_Blend/01_Comms/Contact Object Ferro.blend`)
 * drives a Displace modifier from a Magic texture, not from Clouds — so any
 * translation of that look has to reproduce Magic specifically. Simplex noise
 * is a different animal: Magic is nested sine/cosine interference, which gives
 * the regular, banded, liquid-looking swirls that file has.
 *
 * Ported from Blender's `magic()` in `texture.cc`. Verified against
 * `Texture.evaluate()` sampled from the live file — see magic-texture.test.ts.
 * The GLSL below is the same function; keep the two in step.
 */

export interface MagicResult {
  r: number;
  g: number;
  b: number;
  /** Blender's `tin` — the intensity the Displace modifier actually reads. */
  intensity: number;
}

/**
 * @param depth      Blender's "Depth" (noise_depth), 0..10.
 * @param turbulence Blender's "Turbulence" (turbul). Divided by 5 internally,
 *                   exactly as Blender does.
 */
export function magic(
  x0: number,
  y0: number,
  z0: number,
  depth: number,
  turbulence: number,
): MagicResult {
  const turb0 = turbulence / 5;
  let turb = turb0;

  let x = Math.sin((x0 + y0 + z0) * 5);
  let y = Math.cos((-x0 + y0 - z0) * 5);
  let z = -Math.cos((-x0 - y0 + z0) * 5);

  if (depth > 0) {
    x *= turb;
    y *= turb;
    z *= turb;
    y = -Math.cos(x - y + z);
    y *= turb;
    if (depth > 1) {
      x = Math.cos(x - y - z);
      x *= turb;
      if (depth > 2) {
        z = Math.sin(-x - y - z);
        z *= turb;
        if (depth > 3) {
          x = -Math.cos(-x + y - z);
          x *= turb;
          if (depth > 4) {
            y = -Math.sin(-x + y + z);
            y *= turb;
            if (depth > 5) {
              y = -Math.cos(-x + y + z);
              y *= turb;
              if (depth > 6) {
                x = Math.cos(x + y + z);
                x *= turb;
                if (depth > 7) {
                  z = Math.sin(x + y - z);
                  z *= turb;
                  if (depth > 8) {
                    x = -Math.cos(-x - y + z);
                    x *= turb;
                    if (depth > 9) {
                      y = -Math.sin(x - y + z);
                      y *= turb;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  if (turb !== 0) {
    turb *= 2;
    x /= turb;
    y /= turb;
    z /= turb;
  }

  const r = 0.5 - x;
  const g = 0.5 - y;
  const b = 0.5 - z;
  return { r, g, b, intensity: (r + g + b) / 3 };
}

/**
 * The same function as GLSL, returning Blender's intensity (`tin`) only —
 * that is the single channel the Displace modifier uses.
 *
 * Unrolled to depth 1, which is what the blend file is set to. Higher depths
 * need the remaining branches; GLSL has no early-out worth writing here, and
 * the file does not use them.
 */
export const MAGIC_GLSL = /* glsl */ `
float magicIntensity(vec3 p, float turbulence) {
  float turb = turbulence / 5.0;

  float x = sin((p.x + p.y + p.z) * 5.0);
  float y = cos((-p.x + p.y - p.z) * 5.0);
  float z = -cos((-p.x - p.y + p.z) * 5.0);

  // depth 1
  x *= turb;
  y *= turb;
  z *= turb;
  y = -cos(x - y + z);
  y *= turb;

  float t2 = turb * 2.0;
  x /= t2;
  y /= t2;
  z /= t2;

  float r = 0.5 - x;
  float g = 0.5 - y;
  float b = 0.5 - z;
  return (r + g + b) / 3.0;
}
`;
