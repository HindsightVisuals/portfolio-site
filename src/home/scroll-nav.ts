import { normalizeWheelDelta } from './wheel';

/**
 * 'world'    — the wheel drives the camera director along the spine.
 * 'takeover' — a 2D page covers the world; the wheel belongs to that page.
 * 'about'    — the About corridor; the scrolling document owns the wheel and
 *              drives the camera itself through about-flow.ts. Distinct from
 *              'takeover' because main.ts reads this same value to gate arrow
 *              -key navigation, which must not fly the camera off the corridor
 *              mid-scrub.
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
