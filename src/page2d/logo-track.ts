/**
 * Pure tracking maths for the case study's 3D logo.
 *
 * The logo does not have a position of its own — it is framed against a DOM
 * element's rect, and it hands over from one element to another as the page
 * scrolls. Expressing it that way is what makes the brief's third phase free:
 * once the logo is tracking the strip's landing panel, the panel travelling
 * off-screen carries the logo with it (brief 7.3) with no extra case.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Smoothstep — the handover eases in and out rather than starting abruptly. */
export function ease(t: number): number {
  const v = clamp01(t);
  return v * v * (3 - 2 * v);
}

/**
 * How far through the hero -> landing handover the page has scrolled, 0..1.
 *
 * Clamped at both ends: before `startTop` the logo sits on the hero stage, and
 * after `endTop` it is fully handed over to the landing panel and simply tracks
 * it from then on.
 */
export function trackProgress(scrollTop: number, startTop: number, endTop: number): number {
  if (endTop <= startTop) return scrollTop >= endTop ? 1 : 0;
  return clamp01((scrollTop - startTop) / (endTop - startTop));
}

/** Component-wise interpolation between two screen rects. */
export function rectLerp(a: Rect, b: Rect, t: number): Rect {
  const k = clamp01(t);
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    width: a.width + (b.width - a.width) * k,
    height: a.height + (b.height - a.height) * k,
  };
}

export type LogoPhase = 'animating' | 'stuck' | 'leaving';

/**
 * Which of the brief's three phases the logo is in.
 *
 * 'stuck' and 'leaving' are the same tracking behaviour — both follow the
 * landing panel — and are distinguished only so the caller can tell them apart
 * for debugging and so the clip is not re-scrubbed once it has landed. The
 * landing panel moving is what turns one into the other.
 */
export function logoPhase(progress: number, landingX: number, landingRestX: number): LogoPhase {
  if (progress < 1) return 'animating';
  // The strip has started travelling once the landing panel has left its rest x.
  return Math.abs(landingX - landingRestX) > 1 ? 'leaving' : 'stuck';
}

/** Centre of a rect, in the same coordinate space. */
export function rectCenter(r: Rect): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}
