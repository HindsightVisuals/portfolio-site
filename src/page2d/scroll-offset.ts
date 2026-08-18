/**
 * Offset of an element within a scroll container, in the container's scroll
 * space.
 *
 * NOT `el.offsetTop`. That is measured from the nearest *positioned* ancestor,
 * which for anything inside the pinned strip is `.cs-strip` (position: relative)
 * rather than the scroller — so the strip's own panels reported offsets an order
 * of magnitude too small, and the logo's hero -> landing handover range came out
 * inverted (end before start) and completed instantly.
 *
 * getBoundingClientRect is transform-aware, which is what we want everywhere
 * except here: the strip rail is translated, so callers that need a STABLE
 * offset must measure while the rail is at rest, or pass an element outside it.
 */
export function offsetWithin(el: HTMLElement, scroller: HTMLElement): number {
  return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
}
