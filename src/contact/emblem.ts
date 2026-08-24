/**
 * The 64x64 nav emblem (Figma 84:462) — a lattice of 25 small squares that
 * scale under the pointer, and the site's contact affordance. It is a
 * `<button>`, not a div: it must be focusable, Enter/Space-activatable and
 * announced. The 25 cells are pure decoration, so they are inert `<span>`s —
 * `aria-hidden` keeps them out of the accessibility tree and the button's own
 * `aria-label="Contact"` is the whole story for a screen reader.
 *
 * Two writers ever touch a cell's `--s`: the pointer pass (beat 1, proximity)
 * and `setFill` (beat 2, a timeline-driven "every cell snaps to full"). They
 * are mutually exclusive by construction — `setFill` sets a flag that makes
 * the pointer pass a no-op until `setFill(0)` clears it — so they can never
 * fight over the same property in the same frame.
 *
 * No pointermove listener lives here. The app already runs one rAF-throttled
 * pointer handler and calls `setPointer` from it; a second listener here
 * would double the per-move work for no benefit. `setPointer` itself still
 * rAF-throttles its own write pass, because it can be called more than once
 * per frame (e.g. once from the real pointer handler, once from whatever
 * drives magnetic proximity) and 25 DOM writes should happen at most once
 * per frame regardless.
 */

import '../styles/emblem.css';

import { EMBLEM_CELLS, cellScale } from './emblem-grid';
import type { EmblemCell } from './emblem-grid';

/** Falloff radius and boost fed to `cellScale`, matching the Figma proximity feel. */
const POINTER_OPTS = { radius: 90, boost: 0.6 };

export interface Emblem {
  el: HTMLButtonElement;
  setPointer(p: { x: number; y: number } | null): void;
  setFill(t: number): void;
  destroy(): void;
}

export interface EmblemOpts {
  reducedMotion: boolean;
  onActivate(): void;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function buildEmblem(opts: EmblemOpts): Emblem {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'emblem';
  el.setAttribute('aria-label', 'Contact');

  const cellEls: HTMLSpanElement[] = EMBLEM_CELLS.map((cell) => {
    const span = document.createElement('span');
    span.className = 'emblem-cell';
    span.setAttribute('aria-hidden', 'true');
    span.style.left = `${cell.x * 100}%`;
    span.style.top = `${cell.y * 100}%`;
    span.style.setProperty('--s', String(cell.restScale));
    el.append(span);
    return span;
  });

  let pointer: { x: number; y: number } | null = null;
  let fillT = 0; // 0 = rest, >0 while a fill is in progress
  let filling = false;
  let raf = 0;

  const writeCell = (cell: EmblemCell, cellEl: HTMLSpanElement): void => {
    const scale = filling ? lerp(cell.restScale, 1, fillT) : cellScale(cell, pointer, POINTER_OPTS);
    cellEl.style.setProperty('--s', String(scale));
  };

  const writeAll = (): void => {
    raf = 0;
    for (let i = 0; i < EMBLEM_CELLS.length; i++) {
      writeCell(EMBLEM_CELLS[i], cellEls[i]);
    }
  };

  const scheduleWrite = (): void => {
    if (!raf) raf = requestAnimationFrame(writeAll);
  };

  const onClick = (): void => opts.onActivate();
  el.addEventListener('click', onClick);

  return {
    el,

    setPointer(p: { x: number; y: number } | null): void {
      if (opts.reducedMotion) return; // proximity is decoration, not information
      if (filling) return; // a fill in progress owns --s; don't fight it
      pointer = p;
      scheduleWrite();
    },

    setFill(t: number): void {
      fillT = Math.min(1, Math.max(0, t));
      filling = fillT > 0;
      scheduleWrite();
    },

    destroy(): void {
      el.removeEventListener('click', onClick);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
