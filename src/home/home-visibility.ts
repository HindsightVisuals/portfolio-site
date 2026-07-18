import { HOME_REST_Z } from '../three/world';

/** Distance (world units) over which the home DOM fades as the camera leaves. */
const FADE_DIST = 30;

export interface HomeVisibility {
  update(dt: number): void;
  setSuppressed(v: boolean): void;
}

/**
 * Drives the home DOM layer's opacity/pointer-events from camera position,
 * fading it out as the camera travels away from the home rest position and
 * disabling its pointer events once it is mostly gone.
 *
 * While suppressed (treatment-B flythrough departures), camera-derived
 * writes are skipped and the layer is forced fully hidden instead — a
 * separate writer (main.ts) owns visibility for the duration of the flight.
 */
export function bindHomeVisibility(
  els: HTMLElement[],
  getCameraZ: () => number,
): HomeVisibility {
  let lastOpacity = -1;
  let suppressed = false;
  let suppressedWritten = false;

  return {
    update(): void {
      if (suppressed) {
        if (suppressedWritten) return;
        suppressedWritten = true;
        for (const el of els) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
        }
        return;
      }
      const away = Math.min(Math.max((HOME_REST_Z - getCameraZ()) / FADE_DIST, 0), 1);
      const opacity = 1 - away;
      if (Math.abs(opacity - lastOpacity) < 0.001) return;
      lastOpacity = opacity;
      for (const el of els) {
        el.style.opacity = String(opacity);
        el.style.pointerEvents = opacity < 0.5 ? 'none' : '';
      }
    },

    setSuppressed(v: boolean): void {
      suppressed = v;
      if (v) {
        suppressedWritten = false;
      } else {
        lastOpacity = -1; // force the next update() to rewrite from camera state
      }
    },
  };
}
