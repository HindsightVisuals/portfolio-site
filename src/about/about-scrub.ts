// src/about/about-scrub.ts
import { ABOUT_MARKERS, type BeatId } from './about-markers';
import type { AboutPath } from './about-path';

/**
 * How much of the path one viewport of scrolling covers.
 *
 * This is the flow's pacing dial and the only place it lives. Lower means a
 * longer document and a slower corridor; higher means fewer screens of scroll.
 * 12 puts the ~76-unit path at a little over six screens, which is in the range
 * a long-form page occupies — the flow should not feel like an endurance test.
 *
 * Free scrub means the user sets the speed; this only sets how much travel a
 * gesture buys. Verify by feel in a foreground window, not by test.
 */
export const WORLD_UNITS_PER_VIEWPORT = 12;

/**
 * Scroll offset → path parameter. Linear and clamped: the spec calls for free
 * scrub at 1:1 with no snapping, so there is deliberately no easing here.
 */
export function scrollToT(scrollTop: number, scrollHeight: number, viewportH: number): number {
  const range = scrollHeight - viewportH;
  if (!(range > 0) || !Number.isFinite(scrollTop)) return 0;
  return Math.min(1, Math.max(0, scrollTop / range));
}

/** The document height that gives the path its pacing at this viewport. */
export function documentHeightFor(path: AboutPath, viewportH: number): number {
  const screens = path.length() / WORLD_UNITS_PER_VIEWPORT;
  return viewportH + screens * viewportH;
}

/**
 * The beat the scrub is currently in — the last marker reached, held until the
 * next one. Beats are ranges, not points: everything keyed off this (the ferro
 * z-flip, the palette, later the content reveals) needs a stable answer while
 * the camera is between two markers.
 */
export function beatAt(t: number, path: AboutPath): BeatId {
  let current: BeatId = ABOUT_MARKERS[0].id;
  for (const m of ABOUT_MARKERS) {
    if (t + 1e-9 >= path.tForBeat(m.id)) current = m.id;
    else break;
  }
  return current;
}

/** 0..1 through the current beat's range. 1 at the very end of the flow. */
export function beatProgress(t: number, path: AboutPath): number {
  const id = beatAt(t, path);
  const i = ABOUT_MARKERS.findIndex((m) => m.id === id);
  if (i >= ABOUT_MARKERS.length - 1) return 1;
  const a = path.tForBeat(ABOUT_MARKERS[i].id);
  const b = path.tForBeat(ABOUT_MARKERS[i + 1].id);
  return b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0;
}

/**
 * How far the footer has risen, 0..1, across the corridor's last beat.
 *
 * Adam's mockup (Figma 110:2) puts the footer at 804 of 1080px with the world
 * still visible as a 276px band above it — so this is not a takeover, and
 * nothing needs to compress. The footer simply covers the canvas as it rises;
 * what this number drives is the CHROME, which lifts out of its way: the nav
 * travels to the top of the viewport (where it already sits on the 2D pages)
 * and the bottom margin notes rise with the footer's edge.
 *
 * The ramp starts at 'contact', not 'ai': 'ai' is the FINAL marker, so
 * tForBeat('ai') is always 1 (see about-path's ts[last] = 1) — it is the
 * corridor's end point, not a beat with a range of its own. beatAt() only
 * ever reports 'ai' at t === 1 itself; everything from 'contact' up to that
 * point reports as the 'contact' beat. That range — contact through the very
 * end — is "the last beat" this ramps across.
 */
export function footerRiseAt(t: number, path: AboutPath): number {
  const start = path.tForBeat('contact');
  if (!Number.isFinite(t) || t <= start) return 0;
  if (start >= 1) return 1;
  return Math.min(1, (t - start) / (1 - start));
}

/**
 * Where a route lands inside the corridor.
 *
 * About and Contact stopped being destinations the camera flies to; they are
 * scroll positions in one continuous page. Contact is reachable two ways — here
 * as a place in the flow, and as a modal over anything via the nav emblem.
 */
export function corridorTForRoute(path: AboutPath, dest: 'about' | 'contact'): number {
  return dest === 'contact' ? path.tForBeat('contact') : 0;
}
