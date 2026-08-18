/**
 * Scroll-to-translateX mapping for the pinned horizontal strip.
 *
 * Pure so the mapping is testable without a scroll container. The section pins
 * for exactly its horizontal overrun, so the strip finishes travelling at the
 * moment the section finishes scrolling — no dead pin time at either end.
 */

/** Total scroll distance the section occupies beyond one viewport height. */
export function stripScrollLength(stripWidth: number, vpW: number): number {
  return Math.max(0, stripWidth - vpW);
}

/**
 * translateX (negative, in px) and 0..1 progress for the strip.
 *
 * `scrollTop` is the scroll container's position; `sectionTop` the section's
 * offset within it. Progress is clamped, so scrolling past the section leaves
 * the strip parked at its end rather than running off.
 */
export function stripTransform(
  scrollTop: number,
  sectionTop: number,
  stripWidth: number,
  vpW: number,
): { x: number; progress: number } {
  const length = stripScrollLength(stripWidth, vpW);
  if (length === 0) return { x: 0, progress: 0 }; // strip fits — nothing to travel
  const raw = (scrollTop - sectionTop) / length;
  const progress = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  // Guard the sign of zero: -0 * length is -0, which compares unequal to 0 in
  // structural assertions and reads oddly in a transform string.
  return { x: progress === 0 ? 0 : -progress * length, progress };
}
