/**
 * The case study page's live reaction-diffusion surfaces.
 *
 * Reuses `initBackgroundLayer` wholesale rather than forking the simulation:
 * that module already carries the tuned Gray-Scott parameters, the mouse-erase
 * brush, the seeding and the ping-pong plumbing, and duplicating any of it
 * would guarantee the two drift apart. It takes a renderer as an argument, so a
 * second instance on its own canvas costs nothing but the renderer.
 *
 * Two surfaces come out of one simulation:
 *   - the page background (brief 7.5), inverted to read as a light pattern on
 *     the dark ground, with scroll fed into the sim's own advection
 *   - the footer COMMMS mark (brief 7.8), where the same field is clipped to
 *     the letterforms so the pattern only ever spreads inside the word
 *
 * The footer is composited on a 2D canvas with `source-in` rather than a CSS
 * mask: an SVG-referenced `mask-image` on an HTML element is unevenly supported
 * in Chrome, whereas `fillText` + `source-in` + `drawImage` is exact, uses the
 * page's real webfont, and needs no extra asset.
 */

import * as THREE from 'three';
import { initBackgroundLayer, type BackgroundLayer } from '../three/background';
import { onPageVisibility, pageVisible } from '../page-visibility';

/** How much a pixel of scroll drifts the field, in sim uv per step. Tiny — it
 *  compounds every step, exactly as the press-and-hold pull does. */
const SCROLL_ADVECT_PER_PX = 0.0000019;
/** Ceiling on the drift, so a flick-scroll cannot tear the field apart. */
const ADVECT_MAX = 0.0011;
/**
 * Grey the COMMMS letterforms are lifted to, over the live field.
 *
 * The field is inverted for this page — a light pattern on a near-black ground
 * — so clipping it straight into the glyphs leaves them almost black against an
 * almost black page (measured: mean luminance 4/255). This lift floors them at
 * Figma's mid-grey while the pattern still modulates through, which is what the
 * mock shows.
 */
const MARK_LIFT = 'rgba(150, 150, 150, 0.52)';

export interface RdSurface {
  measure(): void;
  destroy(): void;
}

export interface RdSurfaceOpts {
  reducedMotion: boolean;
}

export function initRdSurface(article: HTMLElement, opts: RdSurfaceOpts): RdSurface | null {
  const content = article.querySelector<HTMLElement>('.cs-content');
  const markEl = article.querySelector<HTMLElement>('[data-rd-mask]');
  const scroller = article.closest<HTMLElement>('.takeover');
  if (!content || !scroller) return null;

  // --- the live field -------------------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.className = 'cs-rd-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  content.prepend(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  const layer: BackgroundLayer = initBackgroundLayer(renderer, {
    reducedMotion: opts.reducedMotion,
    debug: false,
    invert: true, // dark ground, light pattern — this page flips the palette
  });

  let lastScroll = scroller.scrollTop;
  let advectY = 0;
  layer.setAdvectProvider(() => ({ x: 0, y: advectY }));

  // --- the footer mark ------------------------------------------------------
  let markCanvas: HTMLCanvasElement | null = null;
  let markCtx: CanvasRenderingContext2D | null = null;
  let markVisible = false;
  let markObserver: IntersectionObserver | null = null;

  if (markEl) {
    markCanvas = document.createElement('canvas');
    markCanvas.className = 'cs-rd-mark';
    markCanvas.setAttribute('aria-hidden', 'true');
    markEl.append(markCanvas);
    markCtx = markCanvas.getContext('2d');
    // The composite is only worth paying for while the footer is on screen.
    markObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) markVisible = e.isIntersecting;
      },
      { root: scroller, threshold: 0 },
    );
    markObserver.observe(markEl);
  }

  const measure = (): void => {
    const w = scroller.clientWidth;
    const h = scroller.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, true);
    layer.resize?.(w, h);
    if (markCanvas && markEl) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = markEl.getBoundingClientRect();
      markCanvas.width = Math.max(1, Math.round(r.width * dpr));
      markCanvas.height = Math.max(1, Math.round(r.height * dpr));
      markCanvas.style.width = `${r.width}px`;
      markCanvas.style.height = `${r.height}px`;
    }
  };

  /** Clip the live field to the COMMMS letterforms (brief 7.8). */
  const drawMark = (): void => {
    if (!markCanvas || !markCtx || !markEl || !markVisible) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = markCanvas.width;
    const h = markCanvas.height;
    markCtx.setTransform(1, 0, 0, 1, 0, 0);
    markCtx.clearRect(0, 0, w, h);

    // The word first, then the field composited INTO it: source-in keeps only
    // the pixels that overlap the glyphs, so the pattern lives inside the
    // letterforms and nowhere else.
    const style = getComputedStyle(markEl);
    markCtx.font = `${style.fontWeight} ${parseFloat(style.fontSize) * dpr}px ${style.fontFamily}`;
    // 'middle' rather than a computed baseline: the mark's line-height is well
    // under 1, so anything derived from the box's own baseline clipped the
    // glyphs. Centring on the box matches where the transparent text sits.
    markCtx.textBaseline = 'middle';
    markCtx.fillStyle = '#fff';
    markCtx.fillText('commms', 0, h / 2);
    markCtx.globalCompositeOperation = 'source-in';
    markCtx.drawImage(canvas, 0, 0, w, h);
    // source-atop paints only where the glyphs already are, so the lift reaches
    // the letterforms and nothing around them.
    markCtx.globalCompositeOperation = 'source-atop';
    markCtx.fillStyle = MARK_LIFT;
    markCtx.fillRect(0, 0, w, h);
    markCtx.globalCompositeOperation = 'source-over';
  };

  let raf = 0;
  let visible = pageVisible();
  let last = performance.now();
  const frame = (): void => {
    raf = 0;
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    // Scroll travel, fed into the simulation rather than applied to the image.
    const top = scroller.scrollTop;
    const delta = top - lastScroll;
    lastScroll = top;
    const target = Math.max(-ADVECT_MAX, Math.min(ADVECT_MAX, delta * SCROLL_ADVECT_PER_PX));
    // Ease back to zero so the drift decays after the scroll stops instead of
    // running on forever.
    advectY += (target - advectY) * Math.min(dt * 6, 1);

    // Pin the field over the viewport — see .cs-rd-canvas in the CSS for why
    // this is a translate rather than position: fixed.
    canvas.style.transform = `translate3d(0, ${top}px, 0)`;

    layer.update?.(dt);
    layer.render?.(renderer);
    drawMark();
    if (visible) raf = requestAnimationFrame(frame);
  };

  const onScroll = (): void => {
    // Reduced motion has no frame loop, so the mark composite is driven by
    // scroll instead — without this it never appears at all for those users.
    if (opts.reducedMotion) drawMark();
  };

  const offVisibility = onPageVisibility((v) => {
    visible = v;
    if (v && !opts.reducedMotion && !raf) {
      last = performance.now(); // discard the idle gap rather than stepping it
      raf = requestAnimationFrame(frame);
    }
  });

  window.addEventListener('resize', measure);
  scroller.addEventListener('scroll', onScroll, { passive: true });
  measure();
  // The COMMMS mark's canvas is sized from its laid-out type, so it has to be
  // re-measured once the real webfont replaces the fallback.
  void document.fonts?.ready.then(() => {
    measure();
    drawMark();
  }).catch(() => {});
  if (!opts.reducedMotion) raf = requestAnimationFrame(frame);
  else {
    // No loop under reduced motion: one settled frame, then hold it.
    for (let i = 0; i < 60; i++) layer.update?.(1 / 60);
    layer.render?.(renderer);
    drawMark();
  }

  return {
    measure,
    destroy(): void {
      offVisibility();
      window.removeEventListener('resize', measure);
      scroller.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      markObserver?.disconnect();
      layer.destroy();
      renderer.dispose();
      canvas.remove();
      markCanvas?.remove();
    },
  };
}
