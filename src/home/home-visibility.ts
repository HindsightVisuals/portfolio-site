/** Distance (world units) over which the home DOM fades as the camera leaves. */
const FADE_DIST = 30;
const HOME_REST_Z = 34;

/**
 * Returns a per-frame updater that fades the home DOM layer out as the camera
 * travels away from the home rest position, and disables its pointer events
 * once it is mostly gone.
 */
export function bindHomeVisibility(
  els: HTMLElement[],
  getCameraZ: () => number,
): (dt: number) => void {
  let lastOpacity = -1;
  return () => {
    const away = Math.min(Math.max((HOME_REST_Z - getCameraZ()) / FADE_DIST, 0), 1);
    const opacity = 1 - away;
    if (Math.abs(opacity - lastOpacity) < 0.001) return;
    lastOpacity = opacity;
    for (const el of els) {
      el.style.opacity = String(opacity);
      el.style.pointerEvents = opacity < 0.5 ? 'none' : '';
    }
  };
}
