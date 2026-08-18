/**
 * The "logo goes behind" panel's two interactions (brief 7.6): it is slightly
 * magnetic to the pointer, and over it the cursor becomes a green CTA reading
 * "visit site".
 *
 * Magnetism reuses `magneticOffset` from the home reticles rather than a second
 * implementation — same smoothstep falloff, same feel, one place to tune.
 *
 * The CTA is fed to the existing F15 cursor rather than drawn here. There is
 * exactly one cursor on the site and it already owns its own element, hover
 * state and RAF; giving it a label input keeps that true.
 */

import { magneticOffset } from '../home/magnetics';

/** Pull radius, px — generous, since the panel itself is large. */
const RADIUS = 520;
/** How far the panel travels toward the pointer at most, px. Slight, per the brief. */
const MAX_PULL = 18;
/** Approach rate per second, so the panel eases rather than snapping. */
const EASE = 5;

export interface BehindPanel {
  destroy(): void;
}

export interface BehindPanelOpts {
  reducedMotion: boolean;
  /** Feeds the cursor's CTA label. Null clears it. */
  setCursorLabel(label: string | null): void;
}

export function initBehindPanel(article: HTMLElement, opts: BehindPanelOpts): BehindPanel | null {
  const panel = article.querySelector<HTMLElement>('[data-magnetic]');
  if (!panel) return null;

  const href = panel.dataset.href ?? '';
  const cta = panel.dataset.cta ?? '';

  let px = 0;
  let py = 0;
  let inside = false;
  let offX = 0;
  let offY = 0;
  let raf = 0;

  const openSite = (): void => {
    if (!href) return;
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  // A real button, so the panel is keyboard-reachable and announces itself —
  // a bare div with a pointer handler would be invisible to anything but a
  // mouse. Only added when there is somewhere to go.
  let link: HTMLAnchorElement | null = null;
  if (href) {
    link = document.createElement('a');
    link.className = 'cs-behind-link';
    link.href = href;
    link.rel = 'noopener noreferrer';
    link.target = '_blank';
    link.textContent = cta || 'visit site';
    panel.append(link);
  }

  const frame = (): void => {
    raf = 0;
    const r = panel.getBoundingClientRect();
    const centre = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    const target = inside
      ? magneticOffset({ x: px, y: py }, centre, {
          radius: RADIUS,
          bracketMax: MAX_PULL,
          iconMax: MAX_PULL,
        }).bracket
      : { x: 0, y: 0 };

    const k = Math.min((1 / 60) * EASE, 1);
    offX += (target.x - offX) * k;
    offY += (target.y - offY) * k;
    panel.style.transform = `translate3d(${offX.toFixed(2)}px, ${offY.toFixed(2)}px, 0)`;

    // Park once settled and back at rest; pointermove restarts the loop.
    if (inside || Math.abs(offX) > 0.05 || Math.abs(offY) > 0.05) {
      raf = requestAnimationFrame(frame);
    }
  };

  const ensureFrame = (): void => {
    if (!opts.reducedMotion && !raf) raf = requestAnimationFrame(frame);
  };

  const onPointerMove = (e: PointerEvent): void => {
    px = e.clientX;
    py = e.clientY;
    const r = panel.getBoundingClientRect();
    const nowInside = e.clientX >= r.x && e.clientX <= r.right && e.clientY >= r.y && e.clientY <= r.bottom;
    if (nowInside !== inside) {
      inside = nowInside;
      opts.setCursorLabel(nowInside && cta ? cta : null);
    }
    ensureFrame();
  };

  const onClick = (e: MouseEvent): void => {
    // The anchor handles its own activation; this is the rest of the panel.
    if (e.target === link) return;
    if (inside) openSite();
  };

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  panel.addEventListener('click', onClick);

  return {
    destroy(): void {
      window.removeEventListener('pointermove', onPointerMove);
      panel.removeEventListener('click', onClick);
      if (raf) cancelAnimationFrame(raf);
      opts.setCursorLabel(null);
      link?.remove();
      panel.style.transform = '';
    },
  };
}
