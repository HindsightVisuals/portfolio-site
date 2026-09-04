import { normalizeWheelDelta } from './wheel';

/**
 * 'world'    — the wheel drives the camera director along the spine.
 * 'takeover' — a 2D page covers the world; the wheel belongs to that page.
 * 'about'    — the About corridor; the scrolling document (about-document.ts)
 *              owns the wheel and drives the camera itself through
 *              about-session.ts's own scroll listener. This mode exists purely
 *              so `onWheel` below stops feeding the director scroll deltas
 *              while the corridor is open — behaviourally identical to
 *              'takeover' in this file, kept as a separate name because the
 *              REASON the wheel is off-limits differs (a scroll-driven
 *              document, not a covering 2D page).
 *
 *              NOT the same gate as main.ts's arrow-key handler, despite the
 *              similar-sounding job: that reads a separate module-level
 *              `inputMode` ('world' | 'takeover'), written only by
 *              takeover.onModeChange, which this value never touches or is
 *              touched by — 'about' never reaches `inputMode`. Arrow keys
 *              stay live during the corridor by design: they route through
 *              the director, which fires onDepart and cleanly exits.
 */
export type ScrollMode = 'world' | 'takeover' | 'about';

export interface ScrollNav {
  setMode(mode: ScrollMode): void;
  destroy(): void;
}

export function initScrollNav(onDelta: (px: number) => void): ScrollNav {
  let mode: ScrollMode = 'world';

  const onWheel = (e: WheelEvent): void => {
    if (mode !== 'world') return;
    onDelta(normalizeWheelDelta(e.deltaY, e.deltaMode));
  };
  window.addEventListener('wheel', onWheel, { passive: true });

  return {
    setMode(m: ScrollMode): void {
      mode = m;
    },
    destroy(): void {
      window.removeEventListener('wheel', onWheel);
    },
  };
}
