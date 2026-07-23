import { wrapDelta } from '../three/loop';
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
          // Faded home is non-interactive: `inert` also neutralizes descendant
          // controls (reticle buttons keep their own pointer-events:auto, so a
          // bare pointer-events:none on the field can't disable them) and hides
          // them from assistive tech. home-visibility is the SOLE owner of the
          // field's fade-inert; takeover.ts saves/restores whatever state it
          // finds so it never clobbers this (see takeover.ts setInert).
          el.toggleAttribute('inert', true);
        }
        return;
      }
      const away = Math.min(Math.abs(wrapDelta(HOME_REST_Z, getCameraZ())) / FADE_DIST, 1);
      const opacity = 1 - away;
      if (Math.abs(opacity - lastOpacity) < 0.001) return;
      lastOpacity = opacity;
      const faded = opacity < 0.5;
      for (const el of els) {
        el.style.opacity = String(opacity);
        el.style.pointerEvents = faded ? 'none' : '';
        el.toggleAttribute('inert', faded);
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
