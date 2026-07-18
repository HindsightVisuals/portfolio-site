import { normalizeWheelDelta } from './wheel';

export type ScrollMode = 'world' | 'takeover';

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
