/**
 * Drives the curtain: idle warp, pointer-crossing ripples, and the elastic
 * pull-down that signals the page can be closed (brief 7.9).
 *
 * The shape itself is pure (`curtain-math.ts`); this is the shell that owns the
 * rAF loop, the pointer state and the live ripple list.
 *
 * Crossing detection is a sign change of `pointerY - curtainY(pointerX)` between
 * two consecutive pointer samples. That single test both detects the crossing
 * and hands back the x it happened at, which is exactly where the ripple has to
 * be centred — no second search needed.
 */

import {
  CURTAIN_VIEW_H,
  CURTAIN_VIEW_W,
  crossedCurtain,
  curtainPath,
  curtainY,
  pruneRipples,
  type Ripple,
} from './curtain-math';
import { onPageVisibility, pageVisible } from '../page-visibility';

/** How fast the hover pull eases in and out, per second. */
const PULL_EASE = 3.4;

export interface CurtainLive {
  destroy(): void;
}

export function mountCurtain(
  article: HTMLElement,
  opts: { reducedMotion: boolean },
): CurtainLive | null {
  const wrap = article.querySelector<HTMLElement>('.cs-curtain');
  const path = article.querySelector<SVGPathElement>('.cs-curtain-path');
  if (!wrap || !path) return null;

  let ripples: Ripple[] = [];
  let pull = 0;
  let pullTarget = 0;
  let prev: { x: number; y: number } | null = null;
  let raf = 0;
  let visible = pageVisible();
  const startedAt = performance.now();

  /** Pointer position in the SVG's own user space. */
  const toView = (e: PointerEvent): { x: number; y: number } | null => {
    const r = wrap.getBoundingClientRect();
    if (r.height === 0) return null;
    return {
      x: ((e.clientX - r.x) / r.width) * CURTAIN_VIEW_W,
      y: ((e.clientY - r.y) / r.height) * CURTAIN_VIEW_H,
    };
  };

  const onPointerMove = (e: PointerEvent): void => {
    const p = toView(e);
    if (!p) return;
    const now = performance.now();
    const t = (now - startedAt) / 1000;

    if (prev) {
      const hit = crossedCurtain(prev, p, t, pull);
      if (hit) ripples.push({ x: hit.x, speed: hit.speed, born: now });
    }
    prev = p;

    // Above the wave is the window onto the 3D world — hovering it pulls the
    // whole curve down, telegraphing that a click drops the curtain.
    const above = p.y < curtainY(p.x, t, pull) && p.y >= 0;
    pullTarget = above ? 1 : 0;
    wrap.classList.toggle('cs-curtain--armed', above);
  };

  const onPointerLeave = (): void => {
    prev = null;
    pullTarget = 0;
    wrap.classList.remove('cs-curtain--armed');
  };

  let last = performance.now();
  let offVisibility: (() => void) | null = null;
  const frame = (): void => {
    raf = 0;
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    ripples = pruneRipples(ripples, now);
    pull += (pullTarget - pull) * Math.min(dt * PULL_EASE, 1);

    const t = (now - startedAt) / 1000;
    path.setAttribute('d', curtainPath(t, pull, ripples, now));
    if (visible) raf = requestAnimationFrame(frame);
  };

  if (opts.reducedMotion) {
    // Static rest shape — no warp, no ripple, no elastic pull.
    path.setAttribute('d', curtainPath(0, 0));
  } else {
    offVisibility = onPageVisibility((v) => {
      visible = v;
      if (v && !raf) {
        last = performance.now(); // discard the idle gap
        raf = requestAnimationFrame(frame);
      }
    });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    raf = requestAnimationFrame(frame);
  }

  return {
    destroy(): void {
      offVisibility?.();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      if (raf) cancelAnimationFrame(raf);
    },
  };
}
