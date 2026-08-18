/**
 * Pure geometry for the WORK wall's hover interaction. No DOM, no three.js — so
 * the awkward parts (which way to lean, which corner to grow a panel from) are
 * testable without a renderer or a browser.
 */

export interface Point {
  x: number;
  y: number;
}

/** How far the camera leans toward a peeked neighbour, in screen pixels. */
export const PEEK_DISTANCE_PX = 350;

/**
 * The camera's lateral lean when peeking from tile `from` toward tile `to`.
 *
 * A fixed-magnitude nudge in the neighbour's direction, NOT a partial journey
 * toward it: the point is to signal "there is something over here", so a distant
 * tile and an adjacent one lean by the same amount.
 */
export function peekOffset(
  from: Point,
  to: Point,
  distancePx: number,
  worldPerPixel: number,
): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0 || worldPerPixel === 0) return { x: 0, y: 0 };
  const reach = distancePx * worldPerPixel;
  return { x: (dx / len) * reach, y: (dy / len) * reach };
}

export interface Placement {
  /** Panel's top-left in viewport pixels. */
  x: number;
  y: number;
  /** Corner the panel scales out of — always the corner touching the cursor. */
  originX: 'left' | 'right';
  originY: 'top' | 'bottom';
}

/** Breathing room kept between the panel and the viewport edge, in px. */
export const PANEL_EDGE_PAD = 16;

/**
 * Where to put the hover panel and which corner it grows from.
 *
 * It springs down-right out of the cursor by default. Near an edge that would
 * push it off screen it flips — and the transform origin flips with it, so the
 * growth still emanates from the pointer rather than sliding in from somewhere
 * the cursor is not.
 */
export function panelPlacement(
  cx: number,
  cy: number,
  panelW: number,
  panelH: number,
  vpW: number,
  vpH: number,
  pad: number = PANEL_EDGE_PAD,
): Placement {
  const flipX = cx + panelW + pad > vpW;
  const flipY = cy + panelH + pad > vpH;
  return {
    x: flipX ? cx - panelW : cx,
    y: flipY ? cy - panelH : cy,
    originX: flipX ? 'right' : 'left',
    originY: flipY ? 'bottom' : 'top',
  };
}
