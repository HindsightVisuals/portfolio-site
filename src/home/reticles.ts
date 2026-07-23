import gsap from 'gsap';
import { magneticOffset } from './magnetics';
import { iconIndexAt } from './cycle';

const RETICLE_COUNT = 8;
const PER_ROW = 4;
const STAGGER_S = 0.12;
const MAGNET_RADIUS = 120;
const BRACKET_MAX = 12;
const ICON_MAX = 6;
const CYCLE_TICK_MS = 250;

/*
 * Placeholder glyph set — archival/sci-fi instrument-scanning language.
 * 24x24, stroke-width 2, stroke currentColor, no fill (dots are the only
 * filled marks — a literal "dot"). Final icons supplied by Adam.
 */
const GLYPHS: string[] = [
  // 0: circled plus (existing)
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
    <path d="M12 7v10M7 12h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>`,
  // 1: circled X
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
    <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>`,
  // 2: triangle with center dot
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
    <path d="M12 4L20.5 19H3.5L12 4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
    <circle cx="12" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
  </svg>`,
  // 3: square with center +
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" stroke="currentColor" stroke-width="2" />
    <path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>`,
  // 4: hexagon with center dot
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
    <path d="M12 3L19.8 7.5L19.8 16.5L12 21L4.2 16.5L4.2 7.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>`,
  // 5: concentric circles
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
    <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2" />
  </svg>`,
  // 6: diamond with slash
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
    <path d="M12 3L21 12L12 21L3 12Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
    <path d="M7 7L17 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>`,
  // 7: quartered circle (cross reaches the rim, unlike glyph 0)
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
    <path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>`,
];

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
  opts: { reducedMotion: boolean; onActivate?(index: number): void } = { reducedMotion: false },
): ReticleField {
  const rows = field.querySelectorAll<HTMLElement>('.reticle-row');
  if (rows.length < 2) throw new Error('.reticle-row elements not found');

  const reticles: HTMLButtonElement[] = [];
  const iconEls: HTMLElement[] = [];
  const hovered: boolean[] = new Array(RETICLE_COUNT).fill(false);
  const focused: boolean[] = new Array(RETICLE_COUNT).fill(false);
  const shownIndex: number[] = new Array(RETICLE_COUNT).fill(0);

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
      <span class="icon">${GLYPHS[0]}</span>`;
    btn.addEventListener('click', () => {
      if (opts.onActivate) {
        opts.onActivate(i);
      } else {
        // Stub — destinations are a follow-up design conversation.
        console.info(`[reticle] slot ${i} clicked — destination TBD`);
      }
    });
    // Cycling pause: hovered/focused reticles hold their current glyph until
    // the pointer leaves or focus moves on (native <button> click already
    // handles Enter/Space). Hover and keyboard focus are tracked separately
    // so one ending (e.g. the mouse drifting off a keyboard-focused reticle)
    // can't prematurely resume cycling while the other still applies; the
    // `is-hover` class only comes off once neither is active.
    const syncPauseClass = (): void => {
      btn.classList.toggle('is-hover', hovered[i] || focused[i]);
    };
    btn.addEventListener('mouseenter', () => {
      hovered[i] = true;
      syncPauseClass();
    });
    btn.addEventListener('mouseleave', () => {
      hovered[i] = false;
      syncPauseClass();
    });
    // Same pause, keyboard-driven: a tabbed-to reticle holds its glyph too,
    // so it doesn't visibly change under a sighted keyboard user's focus.
    btn.addEventListener('focus', () => {
      focused[i] = true;
      syncPauseClass();
    });
    btn.addEventListener('blur', () => {
      focused[i] = false;
      syncPauseClass();
    });
    rows[Math.floor(i / PER_ROW)].appendChild(btn);
    reticles.push(btn);
    iconEls.push(btn.querySelector<HTMLElement>('.icon')!);
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

  // Instrument-scan icon cycling: one shared timer drives all 8 reticles,
  // each reading its own phase-shifted index off the same clock (cycle.ts).
  // Hard cuts only — no fades. Reduced motion never cycles.
  let cycleTimer: ReturnType<typeof setInterval> | null = null;
  if (!opts.reducedMotion) {
    cycleTimer = setInterval(() => {
      const now = performance.now();
      for (let i = 0; i < RETICLE_COUNT; i++) {
        if (hovered[i] || focused[i]) continue;
        const idx = iconIndexAt(now, i, RETICLE_COUNT);
        if (idx !== shownIndex[i]) {
          shownIndex[i] = idx;
          iconEls[i].innerHTML = GLYPHS[idx];
        }
      }
    }, CYCLE_TICK_MS);
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
      if (cycleTimer !== null) {
        clearInterval(cycleTimer);
        cycleTimer = null;
      }
      buildTl?.kill();
      buildTl = null;
      for (const btn of reticles) {
        gsap.killTweensOf([btn, btn.querySelector('.brackets'), btn.querySelector('.icon')]);
        btn.remove();
      }
    },
  };
}
