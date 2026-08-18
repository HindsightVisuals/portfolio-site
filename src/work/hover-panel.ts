/**
 * The WORK wall's hover panel — the rectangle that springs out of the cursor
 * carrying a project's name and brief.
 *
 * DOM rather than a 3D plane: the mock is crisp small type over a transparent
 * fill, which a canvas texture in the scene would only make blurry, and the 2D
 * chrome already sits above the canvas.
 *
 * Sizing lives in CSS; this module reads the rendered box back so the placement
 * maths works on real numbers rather than a duplicated guess.
 */

import gsap from 'gsap';
import { getProject } from '../content/projects';
import { tileSource } from './tiles';
import { panelPlacement } from './hover-math';

/** Spring-out duration. */
const OPEN_S = 0.34;
const OPEN_EASE = 'power3.out';
/** Retract is quicker than the spring — it should snap back into the cursor. */
const CLOSE_S = 0.2;
const CLOSE_EASE = 'power2.in';

export interface HoverPanel {
  show(slug: string, cx: number, cy: number): void;
  move(cx: number, cy: number): void;
  hide(): void;
  destroy(): void;
}

export interface HoverPanelOpts {
  reducedMotion: boolean;
}

export function initHoverPanel(opts: HoverPanelOpts): HoverPanel {
  const el = document.createElement('aside');
  el.className = 'work-panel';
  // Decorative duplicate of information the screen-proxy buttons already carry,
  // and it tracks a pointer a screen-reader user does not have.
  el.setAttribute('aria-hidden', 'true');
  el.style.opacity = '0';

  const markEl = document.createElement('span');
  markEl.className = 'work-panel__mark';
  const titleEl = document.createElement('h2');
  titleEl.className = 'work-panel__title';
  const briefEl = document.createElement('p');
  briefEl.className = 'work-panel__brief';
  el.append(markEl, titleEl, briefEl);
  document.body.appendChild(el);

  let current: string | null = null;

  const place = (cx: number, cy: number): void => {
    // offsetWidth/Height are the CSS-declared box; read them rather than
    // duplicating the numbers here, so a CSS tweak cannot desync the flip.
    const p = panelPlacement(
      cx,
      cy,
      el.offsetWidth,
      el.offsetHeight,
      window.innerWidth,
      window.innerHeight,
    );
    el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    el.style.transformOrigin = `${p.originX} ${p.originY}`;
  };

  return {
    show(slug: string, cx: number, cy: number): void {
      const project = getProject(slug);
      const src = tileSource(slug);
      titleEl.textContent = project.title;
      briefEl.textContent = project.brief;
      // No per-project logo marks exist yet, so the slot carries the archival
      // index tag the case study design uses. src.mark is the seam for real art.
      markEl.textContent = src.mark ?? `ID/${String(project.order).padStart(2, '0')}`;

      const changed = current !== slug;
      current = slug;
      place(cx, cy);

      if (opts.reducedMotion) {
        gsap.set(el, { opacity: 1, scale: 1 });
        return;
      }
      // Moving between tiles re-plays the spring, so the panel reads as a new
      // object arriving rather than the old one sliding across.
      gsap.killTweensOf(el);
      gsap.fromTo(
        el,
        { opacity: changed ? 0 : 1, scale: changed ? 0 : 1 },
        { opacity: 1, scale: 1, duration: OPEN_S, ease: OPEN_EASE },
      );
    },

    move(cx: number, cy: number): void {
      if (current === null) return;
      place(cx, cy);
    },

    hide(): void {
      if (current === null) return;
      current = null;
      if (opts.reducedMotion) {
        gsap.set(el, { opacity: 0, scale: 0 });
        return;
      }
      gsap.killTweensOf(el);
      gsap.to(el, { opacity: 0, scale: 0, duration: CLOSE_S, ease: CLOSE_EASE });
    },

    destroy(): void {
      gsap.killTweensOf(el);
      el.remove();
    },
  };
}
