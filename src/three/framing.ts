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
