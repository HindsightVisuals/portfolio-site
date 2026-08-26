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
 * PLACEHOLDER: the threshold VALUE awaits Adam's Figma — the mechanism here is
 * real; the number is a guess. The indicator's treatment no longer does: it
 * shipped from Figma 110:473 (about-document.ts builds it, about.css dresses
 * it).
 */

/**
 * How much scroll past the footer arms the return.
 *
 * Raised from 800 per Adam's QA: "I want to double/triple the scroll it
 * takes to return home." 2000 sits squarely between double (1600) and triple
 * (2400) — a round number that reads as deliberate rather than a leftover
 * arithmetic result. Still a placeholder pending Adam's Figma per this
 * module's own doc comment above; only the guess changed, not its status.
 */
export const GATE_THRESHOLD_PX = 2000;

/**
 * How close to t = 1 counts as the end of the corridor.
 *
 * The gate cannot arm on an exact `t === 1`. `t` is
 * `scrollY / (scrollHeight - innerHeight)`, and `scrollHeight` is a ROUNDED
 * integer while the browser's real maximum `scrollY` is not — at 125% or 150%
 * display scaling (the Windows 11 default) the two can disagree by a fraction
 * of a pixel, so a fully scrolled document reports t ≈ 0.9999 forever. The gate
 * would then never arm, silently, with the indicator never moving.
 *
 * Sized in `t`, not px, because `t` is all the flow has. The corridor's
 * document runs a little over six screens, so on a 1080-tall viewport 1e-3 of
 * the ~6500px range is ~7px — comfortably more than any rounding shortfall,
 * and far less than a deliberate scroll gesture.
 */
export const GATE_END_EPS = 1e-3;

/**
 * True when `t` has reached the corridor's end, within GATE_END_EPS.
 *
 * Note the asymmetry with shouldLeaveCorridor's `t <= 0` at the other end,
 * which needs no epsilon: scrollToT clamps through Math.max(0, …), so a
 * document scrolled to the top yields EXACTLY zero.
 */
export function atCorridorEnd(t: number): boolean {
  return t >= 1 - GATE_END_EPS;
}

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
