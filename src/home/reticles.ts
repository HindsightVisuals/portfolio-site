import gsap from 'gsap';
import { magneticOffset } from './magnetics';

const RETICLE_COUNT = 8;
const PER_ROW = 4;
const STAGGER_S = 0.12;
const MAGNET_RADIUS = 120;
const BRACKET_MAX = 12;
const ICON_MAX = 6;

/* Placeholder ⊕ — archival/sci-fi circled plus. Final icons supplied by Adam. */
const PLACEHOLDER_ICON = `
<svg viewBox="0 0 64 64" width="64" height="64" fill="none" aria-hidden="true">
  <circle cx="32" cy="32" r="16" stroke="currentColor" stroke-width="2.5" />
  <path d="M32 23v18M23 32h18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
</svg>`;

export interface ReticleField {
  buildOn(): Promise<void>;
  showInstant(): void;
  destroy(): void;
}

interface Mover {
  el: HTMLButtonElement;
  center: { x: number; y: number };
  bx: (v: number) => void;
  by: (v: number) => void;
  ix: (v: number) => void;
  iy: (v: number) => void;
}

export function initReticles(
  field: HTMLElement,
  opts: { reducedMotion: boolean } = { reducedMotion: false },
): ReticleField {
  const rows = field.querySelectorAll<HTMLElement>('.reticle-row');
  if (rows.length < 2) throw new Error('.reticle-row elements not found');

  const reticles: HTMLButtonElement[] = [];
  for (let i = 0; i < RETICLE_COUNT; i++) {
    const btn = document.createElement('button');
    btn.className = 'reticle';
    btn.type = 'button';
    btn.dataset.slot = String(i);
    btn.setAttribute('aria-label', `Navigation slot ${i + 1} (coming soon)`);
    btn.innerHTML = `
      <span class="brackets" aria-hidden="true">
        <span class="overlay"></span>
        <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      </span>
      <span class="icon">${PLACEHOLDER_ICON}</span>`;
    btn.addEventListener('click', () => {
      // Stub — destinations are a follow-up design conversation.
      console.info(`[reticle] slot ${i} clicked — destination TBD`);
    });
    rows[Math.floor(i / PER_ROW)].appendChild(btn);
    reticles.push(btn);
  }

  gsap.set(reticles, { autoAlpha: 0 });

  const movers: Mover[] = opts.reducedMotion
    ? []
    : reticles.map((el) => ({
        el,
        center: { x: 0, y: 0 },
        bx: gsap.quickTo(el.querySelector('.brackets'), 'x', { duration: 0.35, ease: 'power3.out' }),
        by: gsap.quickTo(el.querySelector('.brackets'), 'y', { duration: 0.35, ease: 'power3.out' }),
        ix: gsap.quickTo(el.querySelector('.icon'), 'x', { duration: 0.35, ease: 'power3.out' }),
        iy: gsap.quickTo(el.querySelector('.icon'), 'y', { duration: 0.35, ease: 'power3.out' }),
      }));

  let buildTl: gsap.core.Timeline | null = null;

  const refreshCenters = (): void => {
    for (const m of movers) {
      const r = m.el.getBoundingClientRect();
      m.center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
  };
  refreshCenters();
  window.addEventListener('resize', refreshCenters);

  const onMove = (e: MouseEvent): void => {
    for (const m of movers) {
      const s = magneticOffset({ x: e.clientX, y: e.clientY }, m.center, {
        radius: MAGNET_RADIUS,
        bracketMax: BRACKET_MAX,
        iconMax: ICON_MAX,
      });
      m.bx(s.bracket.x);
      m.by(s.bracket.y);
      m.ix(s.icon.x);
      m.iy(s.icon.y);
    }
  };
  if (!opts.reducedMotion) {
    window.addEventListener('mousemove', onMove);
  }

  return {
    buildOn(): Promise<void> {
      refreshCenters();
      return new Promise((resolve) => {
        const tl = gsap.timeline({ onComplete: resolve });
        buildTl = tl;
        reticles.forEach((btn, i) => {
          const brackets = btn.querySelector('.brackets');
          tl.to(btn, { autoAlpha: 1, duration: 0.4, ease: 'power2.out' }, i * STAGGER_S);
          tl.fromTo(
            brackets,
            { scale: 0.7 },
            { scale: 1, duration: 0.5, ease: 'power3.out' },
            i * STAGGER_S,
          );
        });
      });
    },

    showInstant(): void {
      gsap.set(reticles, { autoAlpha: 1 });
      refreshCenters();
    },

    destroy(): void {
      if (!opts.reducedMotion) {
        window.removeEventListener('mousemove', onMove);
      }
      window.removeEventListener('resize', refreshCenters);
      buildTl?.kill();
      buildTl = null;
      for (const btn of reticles) {
        gsap.killTweensOf([btn, btn.querySelector('.brackets'), btn.querySelector('.icon')]);
        btn.remove();
      }
    },
  };
}
