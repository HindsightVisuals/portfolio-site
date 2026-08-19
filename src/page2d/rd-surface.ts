/**
 * The case study footer's COMMMS mark — a reaction-diffusion field confined to
 * the letterforms.
 *
 * The logotype does not mask a picture of a simulation; the logotype IS the
 * simulation's world (Adam, 2026-08-18). The mask is applied inside the
 * feedback loop, so the reaction diffuses up to the edge of a letter and dies
 * there. The pattern genuinely grows, crawls and heals within the word, and
 * cannot exist outside it.
 *
 * That also removed a whole layer. The previous version rendered a full-screen
 * field and clipped it with a per-frame `source-in` composite on a second 2D
 * canvas; now the view pass writes the letterform shape straight into its alpha
 * channel, so there is one canvas, one pass, and no compositing at all — which
 * matters, because this used to be one of three renderers running at once.
 *
 * The page-background field this module also used to paint is gone entirely.
 */

import * as THREE from 'three';
import { initBackgroundLayer, type BackgroundLayer } from '../three/background';
import { onPageVisibility, pageVisible } from '../page-visibility';
import { makeLogotypeMask } from './logotype-mask';

/** Word the mark spells. Matches the footer element's own text. */
const MARK_TEXT = 'commms';

export interface RdSurface {
  measure(): void;
  destroy(): void;
}

export interface RdSurfaceOpts {
  reducedMotion: boolean;
}

export function initRdSurface(article: HTMLElement, opts: RdSurfaceOpts): RdSurface | null {
  const markEl = article.querySelector<HTMLElement>('[data-rd-mask]');
  const scroller = article.closest<HTMLElement>('.takeover');
  if (!markEl || !scroller) return null;

  const canvas = document.createElement('canvas');
  canvas.className = 'cs-rd-mark';
  canvas.setAttribute('aria-hidden', 'true');
  markEl.append(canvas);

  // alpha, and a transparent clear: everything outside the letterforms has to
  // let the page through rather than painting a background over it.
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  renderer.setClearColor(0x000000, 0);

  const layer: BackgroundLayer = initBackgroundLayer(renderer, {
    reducedMotion: opts.reducedMotion,
    debug: false,
    invert: true, // light pattern on this page's dark ground
  });

  const mask = makeLogotypeMask(MARK_TEXT);
  layer.setMask(mask.texture);

  let visible = pageVisible();
  /** Whether the footer is on screen. The sim is the most expensive thing here
   *  and the footer is off screen for almost all of a case study. */
  let markVisible = false;
  let raf = 0;
  let last = performance.now();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) markVisible = e.isIntersecting;
    },
    { root: scroller, threshold: 0 },
  );
  observer.observe(markEl);

  const measure = (): void => {
    const r = markEl.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, true);
    layer.resize?.(w, h);

    // The mask is drawn at the backing-store resolution, so the letter edges
    // are as sharp as the field sampling them.
    const style = getComputedStyle(markEl);
    const font = `${style.fontWeight} ${parseFloat(style.fontSize) * dpr}px ${style.fontFamily}`;
    mask.update(w * dpr, h * dpr, font);
  };

  const step = (): void => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    layer.update?.(dt);
    layer.render?.(renderer);
  };

  const frame = (): void => {
    raf = 0;
    if (markVisible) step();
    else last = performance.now(); // do not bank idle time into the next dt
    if (visible) raf = requestAnimationFrame(frame);
  };

  const offVisibility = onPageVisibility((v) => {
    visible = v;
    if (v && !opts.reducedMotion && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  });

  const onScroll = (): void => {
    // Reduced motion has no loop, so scrolling the footer into view is what
    // paints it. One settled frame is enough — it just will not evolve.
    if (opts.reducedMotion && markVisible) step();
  };

  window.addEventListener('resize', measure);
  scroller.addEventListener('scroll', onScroll, { passive: true });
  measure();
  // The mark's box comes from webfont metrics, so both the canvas and the mask
  // have to be redrawn once the real face replaces the fallback.
  void document.fonts?.ready
    .then(() => {
      measure();
      if (opts.reducedMotion) step();
    })
    .catch(() => {});

  if (!opts.reducedMotion) raf = requestAnimationFrame(frame);
  else {
    // Settle the field so the letterforms are not empty on first sight.
    for (let i = 0; i < 60; i++) layer.update?.(1 / 60);
    layer.render?.(renderer);
  }

  return {
    measure,
    destroy(): void {
      offVisibility();
      window.removeEventListener('resize', measure);
      scroller.removeEventListener('scroll', onScroll);
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
      mask.destroy();
      layer.destroy();
      renderer.dispose();
      canvas.remove();
    },
  };
}
