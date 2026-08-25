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
