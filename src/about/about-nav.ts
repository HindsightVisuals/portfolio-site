// src/about/about-nav.ts
import type { AboutPath } from './about-path';
import { ABOUT_MARKERS, type BeatId } from './about-markers';
import { beatAt } from './about-scrub';

/**
 * Put the real document's scroll position where path parameter `target`
 * sits — the inverse of scrollToT, and the one place that conversion lives.
 *
 * Callers: enter()'s two branches (so the first real scroll event doesn't snap
 * the camera back to the top), scrollToBeat below, and resume().
 */
export function scrollDocumentTo(target: number): void {
  const range = document.documentElement.scrollHeight - window.innerHeight;
  if (range > 0) window.scrollTo(0, range * Math.min(1, Math.max(0, target)));
}

/**
 * Scroll the real document to where a beat's t sits, driving the camera there
 * through the ordinary scroll pipeline (onScroll/apply) — the same mechanism a
 * raw scroll gesture uses. Used by the footer's site nav for 'about' and
 * 'contact', and by the arrow keys: all of them are scroll positions inside
 * THIS document now (D2/the corridor spec), not places to fly to or reopen, so
 * there is nothing to hand off to — just move the scrollbar. Under reduced
 * motion this is also correct and sufficient: the browser's own scroll position
 * is the only "position" that mode has, and mountAboutDocument lays the
 * document out identically regardless of reducedMotion.
 */
export function scrollToBeat(path: AboutPath, id: BeatId): void {
  scrollDocumentTo(path.tForBeat(id));
}

/**
 * Which beat one arrow-key step from `t` lands on.
 *
 * Backward from a beat you are partway through goes to that beat's own start
 * first, then to the previous one — the ordinary prev-section convention.
 * Forward past the last beat clamps: t = 1 IS the last marker, and leaving
 * forward is the footer gate's job, not an arrow's.
 *
 * Leaving the corridor backward from t = 0 is NOT decided here — that is the
 * session's call (it calls exit()), because it is a lifecycle decision rather
 * than navigation maths. This function is only ever asked about steps that
 * stay inside the corridor.
 */
export function nextBeatId(path: AboutPath, t: number, dir: 1 | -1): BeatId {
  const i = ABOUT_MARKERS.findIndex((m) => m.id === beatAt(t, path));
  const here = path.tForBeat(ABOUT_MARKERS[i].id);
  const j = dir > 0 ? i + 1 : t > here + 1e-6 ? i : i - 1;
  return ABOUT_MARKERS[Math.min(ABOUT_MARKERS.length - 1, Math.max(0, j))].id;
}
