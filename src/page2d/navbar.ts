import gsap from 'gsap';

/** Cloth-V rest depth (px) — the SVG path's dip when idle. */
export const CLOTH_REST_PX = 24;
/** Cloth-V hover depth (px) — the dip the elastic tween settles into. */
export const CLOTH_HOVER_PX = 52;
/** Hover-in tween duration (s), paired with `elastic.out(1, 0.5)`. */
export const CLOTH_HOVER_S = 0.7;
/** Leave tween duration (s), paired with `power2.out`. */
const CLOTH_LEAVE_S = 0.4;

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface NavbarOpts {
  reducedMotion: boolean;
  onCloth(): void;
  onWordmark(): void;
  onContact(): void;
}

/** Quadratic-curve `d` for the cloth-V — control point at `depth * 2` puts
 * the curve's midpoint (its deepest point) at exactly `depth`. */
function clothPathD(depth: number): string {
  return `M 0 0 Q 100 ${depth * 2} 200 0`;
}

/**
 * Builds the `<header class="nav2d">` that sits atop every 2D takeover page:
 * wordmark (left), cloth-V tab (center, revealing the live canvas through
 * its notch — see .nav2d in page2d.css), contact button (right).
 */
export function buildNavbar(opts: NavbarOpts): HTMLElement {
  const header = document.createElement('header');
  header.className = 'nav2d';

  const wordmark = document.createElement('button');
  wordmark.type = 'button';
  wordmark.className = 'nav2d-wordmark wordmark';
  wordmark.textContent = 'commms';
  wordmark.addEventListener('click', () => opts.onWordmark());

  const clothTab = document.createElement('button');
  clothTab.type = 'button';
  clothTab.className = 'cloth-tab';
  clothTab.setAttribute('aria-label', 'Close');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 64');
  svg.setAttribute('class', 'cloth-tab-svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#141414');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('d', clothPathD(CLOTH_REST_PX));
  svg.appendChild(path);
  clothTab.appendChild(svg);

  // Tween target — path `d` is recomputed from `depth` on every tick.
  const clothState = { depth: CLOTH_REST_PX };
  const applyDepth = (): void => {
    path.setAttribute('d', clothPathD(clothState.depth));
  };

  let clothTween: gsap.core.Tween | null = null;
  const tweenDepth = (depth: number, duration: number, ease: string): void => {
    // Kill hygiene: rapid enter/leave must retarget the same tween, never
    // stack multiple tweens fighting over `clothState.depth`.
    clothTween?.kill();
    clothTween = gsap.to(clothState, { depth, duration, ease, onUpdate: applyDepth });
  };

  if (!opts.reducedMotion) {
    const enter = (): void => tweenDepth(CLOTH_HOVER_PX, CLOTH_HOVER_S, 'elastic.out(1, 0.5)');
    const leave = (): void => tweenDepth(CLOTH_REST_PX, CLOTH_LEAVE_S, 'power2.out');
    clothTab.addEventListener('pointerenter', enter);
    clothTab.addEventListener('pointerleave', leave);
    // Keyboard-focus parity with pointer hover.
    clothTab.addEventListener('focus', enter);
    clothTab.addEventListener('blur', leave);
  }
  // Reduced motion: no listeners above are attached, so depth never leaves
  // CLOTH_REST_PX — but the click below still fires either way.
  clothTab.addEventListener('click', () => opts.onCloth());

  const contact = document.createElement('button');
  contact.type = 'button';
  contact.className = 'nav2d-contact';
  contact.textContent = 'contact';
  /* TODO(F11): RD contact morph */
  contact.addEventListener('click', () => opts.onContact());

  header.append(wordmark, clothTab, contact);
  return header;
}
