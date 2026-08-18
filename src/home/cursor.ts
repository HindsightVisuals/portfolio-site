/**
 * F15 — Cursor system. A black square that swells and turns green over anything
 * clickable, trailing a short green ghost path that blurs, bleeds outward, and
 * lightly frosts the backdrop as it dies.
 *
 * Spec: docs/superpowers/specs/2026-08-14-f15-cursor-system-design.md
 *
 * Ownership: this module owns pointer position, its own RAF, trail state and the
 * hover class. It does NOT raycast — main.ts already runs a pick for tile hover
 * and pushes the result in via setWorldHover(). Nothing here imports from three/.
 *
 * The RAF is deliberately self-owned rather than hooked onto stage.onFrame: the
 * cursor must keep working during 2D takeovers (where the world loop is
 * irrelevant) and under reduced motion (where there is no continuous loop).
 *
 * SMOOTHNESS (2026-08-15): the trail is not sampled once per frame. It records
 * every coalesced pointer sample the browser has buffered — real device rate,
 * commonly 125–1000Hz rather than 60 — then Catmull-Rom subdivides those samples
 * into a curve. Sampling per frame and joining the samples with straight lines
 * is what made the old trail read as discrete animation frames.
 */

import {
  TRAIL_BANDS,
  TRAIL_SUBDIVISIONS,
  BLEED_WIDTH_MULT,
  BLEED_ALPHA_MULT,
  pruneTrail,
  pointAge,
  trailAlpha,
  trailWidth,
  coreBlur,
  glassStrength,
  smoothTrail,
  bandSlices,
  shouldMount,
  holdRamp,
  holdShapeRamp,
  holdRelease,
  holdSize,
  holdAlpha,
  holdRadiusPct,
  holdColorMix,
  CLICK_SUPPRESS_MS,
  type TrailPoint,
} from './cursor-math';
import { onPageVisibility, pageVisible } from '../page-visibility';

/** Anything that should trigger the green swell. `.reticle` is a <button>, so it is covered. */
const HOVER_SELECTOR =
  'a[href], button, [role="button"], input, textarea, select, label, summary, [data-nav]';

/** Green of the hover state and the trail. */
const CURSOR_GREEN = '97, 232, 145'; // #61E891
/** Resting ink of the square, as the same rgb triple so a hold can interpolate between them. */
const CURSOR_INK = '20, 20, 20'; // #141414

/** Linear rgb interpolation between the two triples above, as an `r, g, b` string. */
function mixInk(mix: number): string {
  const a = CURSOR_INK.split(',').map(Number);
  const b = CURSOR_GREEN.split(',').map(Number);
  return a.map((v, i) => Math.round(v + (b[i] - v) * mix)).join(', ');
}
/** Number of masked backdrop-filter nodes riding the trail. Drop to 1 if compositing costs frames. */
const GLASS_NODES = 3;
/** Where along the trail (0 = oldest) each glass node sits. Node size lives in base.css (.cursor-glass). */
const GLASS_POSITIONS = [0, 0.15, 0.3];
/**
 * Above this many raw samples the input is already dense enough that spline
 * subdivision only adds geometry cost — a 1000Hz mouse delivers ~250 samples per
 * trail window on its own.
 */
const DENSE_SAMPLES = 60;
const SEMI_DENSE_SAMPLES = 30;

export interface Cursor {
  /** Fed by main.ts's world raycast — true when a WORK tile or the ABOUT screen is under the pointer. */
  setWorldHover(hovering: boolean): void;
  /** 0..1 press-and-hold progress. Drives the RD pull in background.ts. */
  getHoldProgress(): number;
  /**
   * Show a CTA label inside the cursor — the case study's "visit site" pill.
   * Null clears it. Fed to the existing cursor rather than drawn as a separate
   * element elsewhere, so there is still exactly one cursor on the site.
   */
  setLabel(label: string | null): void;
  destroy(): void;
}

export interface CursorOpts {
  reducedMotion: boolean;
}

/**
 * Mounts the cursor system. Returns null — and touches nothing — on coarse
 * pointers, so callers treat "no cursor system" as a normal state.
 */
export function initCursor(opts: CursorOpts): Cursor | null {
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  if (!shouldMount(finePointer)) return null;

  const { reducedMotion } = opts;

  // --- layers -------------------------------------------------------------
  const layer = document.createElement('div');
  layer.className = 'cursor-layer';
  layer.setAttribute('aria-hidden', 'true');

  let bleed: HTMLCanvasElement | null = null;
  let core: HTMLCanvasElement | null = null;
  let bleedCtx: CanvasRenderingContext2D | null = null;
  let coreCtx: CanvasRenderingContext2D | null = null;
  const glassNodes: HTMLElement[] = [];

  if (!reducedMotion) {
    // Two layers: the bleed carries a big CSS blur (one GPU pass, cheap) and
    // supplies the wide halo; the core carries a per-band canvas blur ramp for
    // age-varying softness. Doing the whole bleed with canvas filters instead
    // would mean a 20px+ blur per band, every frame.
    bleed = document.createElement('canvas');
    bleed.className = 'cursor-trail cursor-trail--bleed';
    layer.appendChild(bleed);
    bleedCtx = bleed.getContext('2d');

    core = document.createElement('canvas');
    core.className = 'cursor-trail cursor-trail--core';
    layer.appendChild(core);
    coreCtx = core.getContext('2d');

    for (let i = 0; i < GLASS_NODES; i++) {
      const g = document.createElement('div');
      g.className = 'cursor-glass';
      g.style.opacity = '0';
      layer.appendChild(g);
      glassNodes.push(g);
    }
  }

  // The CTA pill. Its own element so the square's hold morph and this can never
  // fight over the same inline styles.
  const label = document.createElement('div');
  label.className = 'cursor-label';
  label.style.opacity = '0';
  layer.appendChild(label);

  const square = document.createElement('div');
  square.className = 'cursor-square';
  square.style.opacity = '0'; // revealed on first move, so it never flashes at 0,0
  layer.appendChild(square);

  document.body.appendChild(layer);
  document.documentElement.classList.add('has-custom-cursor');

  // --- state --------------------------------------------------------------
  let px = 0;
  let py = 0;
  let seen = false;
  let domHover = false;
  let worldHover = false;
  let hoverApplied = false;
  let points: TrailPoint[] = [];
  let raf = 0;
  let visible = pageVisible();

  // Press-and-hold: ramping while the button is down, easing out after release.
  // Two ramps over the same press — `holdValue` drives the RD pull (slow, 5.5s),
  // `shapeValue` drives the cursor's own morph (fast, ~0.9s). See
  // HOLD_SHAPE_RAMP_MS in cursor-math.ts.
  let holdSince: number | null = null;
  let releaseAt: number | null = null;
  let releaseFrom = 0;
  let releaseShapeFrom = 0;
  let holdValue = 0;
  let shapeValue = 0;
  let shapeApplied = false;
  let pendingClickSuppressor: (() => void) | null = null;

  const sizeCanvases = (): void => {
    const dpr = window.devicePixelRatio || 1;
    for (const [cv, cx] of [
      [bleed, bleedCtx],
      [core, coreCtx],
    ] as Array<[HTMLCanvasElement | null, CanvasRenderingContext2D | null]>) {
      if (!cv || !cx) continue;
      cv.width = Math.round(window.innerWidth * dpr);
      cv.height = Math.round(window.innerHeight * dpr);
      cv.style.width = `${window.innerWidth}px`;
      cv.style.height = `${window.innerHeight}px`;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  };
  sizeCanvases();

  const applyHover = (): void => {
    const next = domHover || worldHover;
    if (next === hoverApplied) return;
    hoverApplied = next;
    square.classList.toggle('cursor-square--hover', next);
  };

  const updateDomHover = (): void => {
    const el = document.elementFromPoint(px, py);
    domHover = el instanceof Element && el.closest(HOVER_SELECTOR) !== null;
    applyHover();
  };

  /** Stroke points[a..b] as ONE path — a single stroke() composites once, so a
   *  self-overlapping band cannot build up alpha at its joins. */
  const strokeBand = (
    cx: CanvasRenderingContext2D,
    pts: TrailPoint[],
    a: number,
    b: number,
  ): void => {
    cx.beginPath();
    cx.moveTo(pts[a].x, pts[a].y);
    for (let i = a + 1; i <= b; i++) cx.lineTo(pts[i].x, pts[i].y);
    cx.stroke();
  };

  const drawTrail = (now: number): void => {
    if (!core || !coreCtx || !bleed || !bleedCtx) return;
    coreCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    bleedCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (points.length < 2) return;

    const sub =
      points.length > DENSE_SAMPLES ? 1 : points.length > SEMI_DENSE_SAMPLES ? 3 : TRAIL_SUBDIVISIONS;
    const sm = smoothTrail(points, sub);
    const slices = bandSlices(sm.length, TRAIL_BANDS);

    for (const cx of [coreCtx, bleedCtx]) {
      // butt caps, not round: adjacent bands share an endpoint, so butt ends
      // meet exactly instead of overlapping into a brighter bead at every join.
      cx.lineCap = 'butt';
      cx.lineJoin = 'round';
      cx.strokeStyle = `rgb(${CURSOR_GREEN})`;
    }

    for (const [a, b] of slices) {
      const age = pointAge(sm[Math.floor((a + b) / 2)], now);
      const alpha = trailAlpha(age);
      if (alpha <= 0.001) continue;
      const width = trailWidth(age);

      const blur = coreBlur(age);
      coreCtx.filter = blur < 0.05 ? 'none' : `blur(${blur}px)`;
      coreCtx.globalAlpha = alpha;
      coreCtx.lineWidth = width;
      strokeBand(coreCtx, sm, a, b);

      bleedCtx.globalAlpha = alpha * BLEED_ALPHA_MULT;
      bleedCtx.lineWidth = width * BLEED_WIDTH_MULT;
      strokeBand(bleedCtx, sm, a, b);
    }

    coreCtx.filter = 'none';
    coreCtx.globalAlpha = 1;
    bleedCtx.globalAlpha = 1;
  };

  const updateGlass = (now: number): void => {
    if (!glassNodes.length) return;
    for (let k = 0; k < glassNodes.length; k++) {
      const node = glassNodes[k];
      if (points.length < 2) {
        node.style.opacity = '0';
        continue;
      }
      const idx = Math.min(
        points.length - 1,
        Math.floor(GLASS_POSITIONS[k] * (points.length - 1)),
      );
      const p = points[idx];
      const strength = glassStrength(pointAge(p, now));
      if (strength <= 0.01) {
        node.style.opacity = '0';
        continue;
      }
      node.style.opacity = '1';
      node.style.backdropFilter = `blur(${strength}px)`;
      node.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%)`;
    }
  };

  /** RD-pull progress, ramping while down and easing out after release. */
  const currentHold = (now: number): number => {
    if (holdSince !== null) return holdRamp(now - holdSince);
    if (releaseAt !== null) return holdRelease(releaseFrom, now - releaseAt);
    return 0;
  };

  /** Cursor shape-morph progress — the same press on its own faster ramp. */
  const currentShape = (now: number): number => {
    if (holdSince !== null) return holdShapeRamp(now - holdSince);
    if (releaseAt !== null) {
      const v = holdRelease(releaseShapeFrom, now - releaseAt);
      // The release timer is cleared by whichever ramp outlives the other; both
      // read it, so it is retired here only once BOTH have gone quiet.
      if (v <= 0.001 && holdValue <= 0.001) releaseAt = null;
      return v;
    }
    return 0;
  };

  /**
   * The square IS the hold shape — it rounds its corners to a circle, then
   * scales up and turns green. There is no second element: a separate circle
   * would read as the cursor gaining a shape rather than becoming one.
   *
   * Inline writes here would otherwise fight `.cursor-square`'s 220ms hover
   * transitions, so `--holding` suspends them for the duration, and every
   * property written is removed again at the end so the hover CSS resumes
   * cleanly rather than being permanently overridden by stale inline values.
   */
  const updateHold = (): void => {
    if (reducedMotion) return;
    const holding = shapeValue > 0.001;
    if (holding !== shapeApplied) {
      shapeApplied = holding;
      square.classList.toggle('cursor-square--holding', holding);
      if (!holding) {
        square.style.removeProperty('width');
        square.style.removeProperty('height');
        square.style.removeProperty('border-radius');
        square.style.removeProperty('border-color');
        square.style.removeProperty('background');
        if (seen) square.style.opacity = '1';
      }
    }
    if (!holding) return;

    const size = holdSize(shapeValue);
    const mix = holdColorMix(shapeValue);
    const rgb = mixInk(mix);
    square.style.width = `${size}px`;
    square.style.height = `${size}px`;
    square.style.borderRadius = `${holdRadiusPct(shapeValue)}%`;
    // Opaque stroke, translucent centre — no soft edge, no blur.
    square.style.borderColor = `rgb(${rgb})`;
    square.style.background = `rgba(${rgb}, ${holdAlpha(shapeValue)})`;
  };

  const frame = (): void => {
    raf = 0;
    const now = performance.now();
    points = pruneTrail(points, now);
    holdValue = currentHold(now);
    shapeValue = currentShape(now);
    drawTrail(now);
    updateGlass(now);
    updateHold();
    // Park once there is nothing left to animate; pointermove restarts us.
    if (visible && (points.length > 0 || holdSince !== null || holdValue > 0.001 || shapeValue > 0.001)) {
      raf = requestAnimationFrame(frame);
    }
  };

  const ensureFrame = (): void => {
    // A hidden tab has no cursor to draw; the trail is rebuilt from live
    // pointer samples on return, so nothing is lost by stopping.
    if (!reducedMotion && !raf && visible) raf = requestAnimationFrame(frame);
  };

  const offVisibility = onPageVisibility((v) => {
    visible = v;
    if (!v && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });

  // --- listeners ----------------------------------------------------------
  const pushSample = (x: number, y: number, t: number): void => {
    const last = points[points.length - 1];
    if (last && last.x === x && last.y === y) return; // idle jitter adds nothing
    points.push({ x, y, t });
  };

  const onPointerMove = (e: PointerEvent): void => {
    const now = performance.now();

    if (!reducedMotion) {
      // Every hardware sample since the last frame, not just the latest one.
      const batch = e.getCoalescedEvents?.() ?? [];
      for (const ce of batch.length ? batch : [e]) {
        // Event timestamps share performance.now()'s origin, but guard against
        // a stale or bogus stamp rather than poisoning the age ramp with it.
        const t = ce.timeStamp > 0 && now - ce.timeStamp < 1000 ? ce.timeStamp : now;
        pushSample(ce.clientX, ce.clientY, t);
      }
    }

    px = e.clientX;
    py = e.clientY;
    if (!seen) {
      seen = true;
      square.style.opacity = '1';
    }
    square.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%)`;
    label.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%)`;
    updateDomHover();
    ensureFrame();
  };

  const onPointerOut = (e: PointerEvent): void => {
    // relatedTarget null => the pointer left the window entirely
    if (e.relatedTarget === null) square.style.opacity = '0';
  };

  const onPointerOver = (): void => {
    // pointerover fires on every element transition, not just window re-entry.
    // Safe to write unconditionally now that a hold morphs the square in place
    // rather than dissolving it — nothing else owns this opacity.
    if (seen) square.style.opacity = '1';
  };

  const onResize = (): void => sizeCanvases();

  /**
   * Swallow the click that ends a long press, so a hold on a reticle or a WORK
   * tile can build and release without navigating. Capture phase on window runs
   * ahead of every target handler. The timeout is a safety net for presses that
   * produce no click at all (drag out, pointercancel).
   */
  const suppressNextClick = (): void => {
    pendingClickSuppressor?.();
    const onClick = (e: MouseEvent): void => {
      e.stopPropagation();
      e.preventDefault();
      cleanup();
    };
    const timer = window.setTimeout(() => cleanup(), 400);
    function cleanup(): void {
      window.removeEventListener('click', onClick, true);
      window.clearTimeout(timer);
      pendingClickSuppressor = null;
    }
    window.addEventListener('click', onClick, true);
    pendingClickSuppressor = cleanup;
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (reducedMotion || e.button !== 0) return;
    holdSince = performance.now();
    releaseAt = null;
    ensureFrame();
  };

  const endHold = (): void => {
    if (holdSince === null) return;
    const now = performance.now();
    const heldMs = now - holdSince;
    releaseFrom = holdRamp(heldMs);
    releaseShapeFrom = holdShapeRamp(heldMs);
    releaseAt = now;
    holdSince = null;
    if (heldMs >= CLICK_SUPPRESS_MS) suppressNextClick();
    ensureFrame();
  };

  const onPointerUp = (): void => endHold();
  const onWindowBlur = (): void => endHold();

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerUp, { passive: true });
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('pointerout', onPointerOut, { passive: true });
  window.addEventListener('pointerover', onPointerOver, { passive: true });
  window.addEventListener('resize', onResize);

  return {
    setWorldHover(hovering: boolean): void {
      worldHover = hovering;
      applyHover();
    },
    getHoldProgress(): number {
      return holdValue;
    },
    setLabel(text: string | null): void {
      if (text) {
        label.textContent = text;
        label.style.opacity = '1';
        square.classList.add('cursor-square--labelled');
      } else {
        label.style.opacity = '0';
        square.classList.remove('cursor-square--labelled');
      }
    },
    destroy(): void {
      offVisibility();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerout', onPointerOut);
      window.removeEventListener('pointerover', onPointerOver);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('resize', onResize);
      pendingClickSuppressor?.();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      layer.remove();
      document.documentElement.classList.remove('has-custom-cursor');
    },
  };
}
