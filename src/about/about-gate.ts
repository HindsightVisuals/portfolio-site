/**
 * The footer gate — the page's last beat.
 *
 * At the end of the corridor, further scrolling does nothing at first except
 * accumulate intent against a threshold, with an indicator showing how far you
 * have pushed. Past it, you fly Home and the loop closes.
 *
 * It is a gate rather than a boundary because the corridor's end is also the
 * page's end: without something to push against, the scroll would simply stop
 * dead, and with an ordinary trigger you would fall out of the page by
 * accident.
 *
 * PLACEHOLDER: the threshold value and the indicator's treatment await Adam's
 * Figma. The mechanism here is real; the number is a guess.
 */

/** How much scroll past the footer arms the return. */
export const GATE_THRESHOLD_PX = 800;

export interface GateState {
  accumulated: number;
}

export function createGate(): GateState {
  return { accumulated: 0 };
}

/**
 * Feed the gate a wheel delta. Returns whether it is armed and how full it
 * reads, 0..1, for the indicator.
 *
 * Backward scroll drains it: the gate measures intent, and intent can be
 * withdrawn. Without draining, a stray downward flick would leave the gate
 * permanently half-armed.
 */
export function feedGate(state: GateState, deltaPx: number): { armed: boolean; amount: number } {
  if (Number.isFinite(deltaPx)) {
    state.accumulated = Math.max(0, state.accumulated + deltaPx);
  }
  const amount = Math.min(1, state.accumulated / GATE_THRESHOLD_PX);
  return { armed: state.accumulated >= GATE_THRESHOLD_PX, amount };
}
