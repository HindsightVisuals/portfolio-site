/**
 * F15 — Cursor system. A black square that swells and turns green over anything
 * clickable, trailing a short green ghost path that blurs, fades, and lightly
 * frosts the backdrop as it dies.
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
 */

import {
  pruneTrail,
  pointAge,
  trailAlpha,
  trailWidth,
  blurBucket,
  glassStrength,
  shouldMount,
  type TrailPoint,
} from './cursor-math';

/** Anything that should trigger the green swell. `.reticle` is a <button>, so it is covered. */
const HOVER_SELECTOR =
  'a[href], button, [role="button"], input, textarea, select, label, summary, [data-nav]';

/** Green of the hover state and the trail. */
const CURSOR_GREEN = '97, 232, 145'; // #61E891
/** Number of masked backdrop-filter nodes riding the trail. Drop to 1 if compositing costs frames. */
const GLASS_NODES = 3;
/** Where along the trail (0 = oldest) each glass node sits. Node size lives in base.css (.cursor-glass). */
const GLASS_POSITIONS = [0, 0.15, 0.3];

export interface Cursor {
  /** Fed by main.ts's world raycast — true when a WORK tile or the ABOUT screen is under the pointer. */
  setWorldHover(hovering: boolean): void;
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

  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  const glassNodes: HTMLElement[] = [];

  if (!reducedMotion) {
    canvas = document.createElement('canvas');
    canvas.className = 'cursor-trail';
    layer.appendChild(canvas);
    ctx = canvas.getContext('2d');

    for (let i = 0; i < GLASS_NODES; i++) {
      const g = document.createElement('div');
      g.className = 'cursor-glass';
      g.style.opacity = '0';
      layer.appendChild(g);
      glassNodes.push(g);
    }
  }

  const square = document.createElement('div');
  square.className = 'cursor-square';
  square.style.opacity = '0'; // revealed on first move, so it never flashes at 0,0
  layer.appendChild(square);

  document.body.appendChild(layer);
  document.documentElement.classList.add('has-custom-cursor');

  // --- state --------------------------------------------------------------
  let px = 0;
  let py = 0;
  let lastSampledX = Number.NaN;
  let lastSampledY = Number.NaN;
  let seen = false;
  let domHover = false;
  let worldHover = false;
  let hoverApplied = false;
  let points: TrailPoint[] = [];
  let raf = 0;

  const sizeCanvas = (): void => {
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  sizeCanvas();

  const applyHover = (): void => {
    const next = domHover || worldHover;
    if (next === hoverApplied) return;
    hoverApplied = next;
    square.classList.toggle('cursor-square--hover', next);
  };

  const applySquare = (): void => {
    square.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%)`;
  };

  const updateDomHover = (): void => {
    const el = document.elementFromPoint(px, py);
    domHover = el instanceof Element && el.closest(HOVER_SELECTOR) !== null;
    applyHover();
  };

  const drawTrail = (now: number): void => {
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (points.length < 2) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Points run oldest -> newest, so ages decrease monotonically and the blur
    // bucket can only step down: at most three ctx.filter writes per frame.
    let currentBlur = -1;
    for (let i = 0; i < points.length - 1; i++) {
      const age = pointAge(points[i], now);
      const blur = blurBucket(age);
      if (blur !== currentBlur) {
        ctx.filter = blur === 0 ? 'none' : `blur(${blur}px)`;
        currentBlur = blur;
      }
      ctx.strokeStyle = `rgba(${CURSOR_GREEN}, ${trailAlpha(age)})`;
      ctx.lineWidth = trailWidth(age);
      ctx.beginPath();
      ctx.moveTo(points[i].x, points[i].y);
      ctx.lineTo(points[i + 1].x, points[i + 1].y);
      ctx.stroke();
    }
    ctx.filter = 'none';
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

  const frame = (): void => {
    raf = 0;
    const now = performance.now();

    // Sample a new point only when the pointer actually moved, so a parked
    // pointer lets the trail drain instead of stacking points in one spot.
    if (seen && (px !== lastSampledX || py !== lastSampledY)) {
      points.push({ x: px, y: py, t: now });
      lastSampledX = px;
      lastSampledY = py;
    }
    points = pruneTrail(points, now);

    drawTrail(now);
    updateGlass(now);

    // Park once there is nothing left to animate; pointermove restarts us.
    if (points.length > 0) raf = requestAnimationFrame(frame);
  };

  const ensureFrame = (): void => {
    if (!reducedMotion && !raf) raf = requestAnimationFrame(frame);
  };

  // --- listeners ----------------------------------------------------------
  const onPointerMove = (e: PointerEvent): void => {
    px = e.clientX;
    py = e.clientY;
    if (!seen) {
      seen = true;
      square.style.opacity = '1';
    }
    applySquare();
    updateDomHover();
    ensureFrame();
  };

  const onPointerOut = (e: PointerEvent): void => {
    // relatedTarget null => the pointer left the window entirely
    if (e.relatedTarget === null) square.style.opacity = '0';
  };

  const onPointerOver = (): void => {
    if (seen) square.style.opacity = '1';
  };

  const onResize = (): void => sizeCanvas();

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerout', onPointerOut, { passive: true });
  window.addEventListener('pointerover', onPointerOver, { passive: true });
  window.addEventListener('resize', onResize);

  return {
    setWorldHover(hovering: boolean): void {
      worldHover = hovering;
      applyHover();
    },
    destroy(): void {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerout', onPointerOut);
      window.removeEventListener('pointerover', onPointerOver);
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      layer.remove();
      document.documentElement.classList.remove('has-custom-cursor');
    },
  };
}
