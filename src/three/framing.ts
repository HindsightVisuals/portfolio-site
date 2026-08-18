export function effectiveMarginPx(vpW: number, vpH: number): number {
  const smaller = Math.min(vpW, vpH);
  const FULL = 248;
  return FULL * 2 > smaller * 0.55 ? Math.max(32, 0.12 * smaller) : FULL;
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
