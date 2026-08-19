/**
 * Framing margin around a focused tile, in px.
 *
 * Two measured anchors, lerped between: 248px reads well on a 4K display
 * (Adam: "on my large 4k they look great"), but the same fixed margin eats far
 * more of a 1080p viewport, leaving the tile about 25% too small there. 175px
 * at 1080 restores the proportion. Below 1080 it keeps shrinking proportionally
 * so the tile does not collapse on small screens.
 */
export function effectiveMarginPx(vpW: number, vpH: number): number {
  const smaller = Math.min(vpW, vpH);
  const AT_1080 = 175;
  const AT_2160 = 248;
  const t = (smaller - 1080) / (2160 - 1080);
  const lerped = AT_1080 + (AT_2160 - AT_1080) * Math.min(Math.max(t, 0), 1);
  // Proportional floor for viewports well below the 1080 anchor. 0.17 rather
  // than a rounder number so it does NOT bind at 1080 itself, where the
  // measured 175 should win outright.
  return Math.min(lerped, Math.max(32, 0.17 * smaller));
}

export function distanceForFraming(
  planeW: number, planeH: number, vpW: number, vpH: number, fovYDeg: number, marginPx: number,
): number {
  const fovY = (fovYDeg * Math.PI) / 180;
  const targetHFrac = (vpH - 2 * marginPx) / vpH;   // plane height as fraction of viewport
  const targetWFrac = (vpW - 2 * marginPx) / vpW;
  const dH = planeH / (2 * Math.tan(fovY / 2) * targetHFrac);
  const aspect = vpW / vpH;
  const dW = planeW / (2 * Math.tan(fovY / 2) * aspect * targetWFrac);
  return Math.max(dH, dW); // farther distance satisfies both margins
}

/**
 * How many world units one screen pixel covers at `distance` from the camera.
 *
 * The peek offset is specified in pixels (Adam asked for "about 350px"), but the
 * camera lives in world units, and the conversion depends on how far away the
 * subject is. Going through this keeps the lean the same apparent size at any
 * viewport.
 */
export function worldPerPx(distance: number, fovYDeg: number, vpH: number): number {
  if (vpH <= 0) return 0; // degenerate viewport: no lean rather than Infinity
  const fovY = (fovYDeg * Math.PI) / 180;
  return (2 * distance * Math.tan(fovY / 2)) / vpH;
}
