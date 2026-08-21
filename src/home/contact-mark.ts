/**
 * The contact mark (F11) — a live reaction-diffusion field in the bottom-right
 * corner that morphs into the word "contact" when you reach for it.
 *
 * This is the site's persistent contact affordance, and it is deliberately not
 * a button that says CONTACT. The brief's rule is "nothing announces itself;
 * everything is found": an ambient pattern that only resolves into a word on
 * approach has the reach of a sticky CTA and the register of a discovery. Flow
 * D calls it "a promise planted early, paid off later".
 *
 * The morph is not animated. background.ts's mask boundary is ABSORBING, so
 * ramping `setMaskMix` up makes the field die back into the letterforms, and
 * ramping it down lets the reaction grow back out of them. Both directions are
 * the simulation's own behaviour; all this module does is move a scalar.
 *
 * One instance serves the whole site — the home page, the 3D world and every
 * takeover — which is why it mounts outside `.chrome`. See mountLayer() below.
 */

import * as THREE from 'three';
import gsap from 'gsap';
import { initBackgroundLayer, type BackgroundLayer } from '../three/background';
import { onPageVisibility, pageVisible } from '../page-visibility';
import { makeLogotypeMask } from '../page2d/logotype-mask';

/** The word the mark resolves into. */
const MARK_TEXT = 'contact';

/** Reaching for it resolves the word; letting go lets the field grow back.
 *  Out is slower than in on purpose — recovery, not retraction. */
const MORPH_IN_S = 0.7;
const MORPH_OUT_S = 0.9;
const MORPH_IN_EASE = 'power2.out';
const MORPH_OUT_EASE = 'power2.inOut';

/**
 * PARKED (Adam, 2026-08-19): the resting state and the reveal choreography are
 * being designed in Figma. Until they land the mark sits fully resolved, so it
 * is legible and clickable rather than a near-invisible ghost.
 *
 * Set this to 0 to re-enable the ambient-field → word reveal; the tween
 * machinery below is intact and drives off it.
 */
const REST_MIX = 1;

/** Foreground tone ramps: [ground, ink] luminance for the masked surface.
 *  The masked branch never reads the background's ramp — see setMaskTone. */
const TONE_ON_LIGHT: [number, number] = [0.08, 0.45];
const TONE_ON_DARK: [number, number] = [0.3, 0.95];

/** Frames to settle the field when there is no loop to develop it. */
const SETTLE_STEPS = 60;

export interface ContactMark {
  /** Re-measure after a resize or once the real webfont lands. */
  measure(): void;
  /** Flip for the ground underneath — dark case study vs light home. */
  setInvert(on: boolean): void;
  destroy(): void;
}

export interface ContactMarkOpts {
  reducedMotion: boolean;
  /** Fired by click, Enter or Space. */
  onActivate(): void;
}

export function initContactMark(host: HTMLElement, opts: ContactMarkOpts): ContactMark | null {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'contact-mark';
  button.setAttribute('aria-label', 'Contact');

  // The word is really in the DOM, transparent, and it is what sizes the box.
  // makeLogotypeMask draws left-aligned at x=0 into the full rect, so the rect
  // has to BE the word's metrics — otherwise the letterforms sit in a corner of
  // an arbitrary CSS box and drift when the webfont swaps in. Same arrangement
  // as the case study footer's [data-rd-mask] element.
  const word = document.createElement('span');
  word.className = 'contact-mark-word';
  word.setAttribute('aria-hidden', 'true');
  word.textContent = MARK_TEXT;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  button.append(word, canvas);
  host.append(button);

  // alpha + transparent clear: outside the letterforms the page has to show
  // through rather than being painted over.
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  renderer.setClearColor(0x000000, 0);

  const layer: BackgroundLayer = initBackgroundLayer(renderer, {
    reducedMotion: opts.reducedMotion,
    debug: false,
    // Without this the sim is shaped by the window and sampled into a ~147x39
    // box, which stretches the pattern's features sideways and destroys 26px
    // letterforms outright.
    fitToCanvas: true,
  });

  const mask = makeLogotypeMask(MARK_TEXT);
  layer.setMask(mask.texture);
  layer.setMaskTone(...TONE_ON_LIGHT);

  // Touch has no hover, so there is nothing to reach for and no way to reveal
  // the word. Coarse pointers get the resolved state permanently and tap to
  // open. This is a local patch for this control, NOT an answer to F19.
  const finePointer = window.matchMedia?.('(pointer: fine)').matches ?? true;
  const morphs = finePointer && !opts.reducedMotion;

  /** Tweened, so hover and focus share one value instead of fighting. */
  const morph = { mix: morphs ? REST_MIX : 1 };
  layer.setMaskMix(morph.mix);

  let visible = pageVisible();
  let raf = 0;
  let last = performance.now();

  const measure = (): void => {
    const r = word.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, true);
    layer.resize?.(w, h);

    // Mask drawn at backing-store resolution so the letter edges are as sharp
    // as the field sampling them.
    const style = getComputedStyle(word);
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
    step();
    if (visible) raf = requestAnimationFrame(frame);
  };

  const offVisibility = onPageVisibility((v) => {
    visible = v;
    if (v && !opts.reducedMotion && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  });

  /** Retarget one tween; never stack two fighting over morph.mix. */
  const morphTo = (mix: number): void => {
    if (!morphs) return;
    gsap.to(morph, {
      mix,
      duration: mix > morph.mix ? MORPH_IN_S : MORPH_OUT_S,
      ease: mix > morph.mix ? MORPH_IN_EASE : MORPH_OUT_EASE,
      overwrite: true,
      onUpdate: () => layer.setMaskMix(morph.mix),
    });
  };

  const reach = (): void => morphTo(1);
  const release = (): void => morphTo(REST_MIX);
  const activate = (): void => opts.onActivate();

  button.addEventListener('pointerenter', reach);
  button.addEventListener('pointerleave', release);
  button.addEventListener('focus', reach);
  button.addEventListener('blur', release);
  button.addEventListener('click', activate);
  window.addEventListener('resize', measure);

  measure();
  // The mark's box comes from webfont metrics, so canvas and mask both have to
  // be redrawn once the real face replaces the fallback.
  void document.fonts?.ready
    .then(() => {
      measure();
      if (opts.reducedMotion) step();
    })
    .catch(() => {});

  if (!opts.reducedMotion) raf = requestAnimationFrame(frame);
  else {
    // No loop to develop the field, so settle it once — otherwise the
    // letterforms are empty on first sight.
    for (let i = 0; i < SETTLE_STEPS; i++) layer.update?.(1 / 60);
    layer.render?.(renderer);
  }

  return {
    measure,
    setInvert(on: boolean): void {
      // NOT layer.setInvert(): the masked branch of the view shader never reads
      // `lum`, so uInvert has no effect on a fully-masked surface. The ground
      // flip has to swap the tone ramp itself.
      layer.setMaskTone(...(on ? TONE_ON_DARK : TONE_ON_LIGHT));
    },
    destroy(): void {
      gsap.killTweensOf(morph);
      offVisibility();
      button.removeEventListener('pointerenter', reach);
      button.removeEventListener('pointerleave', release);
      button.removeEventListener('focus', reach);
      button.removeEventListener('blur', release);
      button.removeEventListener('click', activate);
      window.removeEventListener('resize', measure);
      if (raf) cancelAnimationFrame(raf);
      mask.destroy();
      layer.destroy();
      renderer.dispose();
      button.remove();
    },
  };
}
