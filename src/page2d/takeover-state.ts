export type TakeoverState = 'closed' | 'opening' | 'open' | 'closing';
export type TakeoverEvent = 'open' | 'opened' | 'close' | 'closed';

/**
 * Pure state machine for the 2D takeover overlay.
 *
 *   closed --open--> opening --opened--> open --close--> closing --closed--> closed
 *
 * `open` is a no-op unless the machine is `closed`; `close` is a no-op
 * unless the machine is `open`. Any other (state, event) pair — including
 * combinations not reachable in practice — is also a no-op: the state is
 * returned unchanged.
 */
export function takeoverReducer(state: TakeoverState, event: TakeoverEvent): TakeoverState {
  switch (state) {
    case 'closed':
      return event === 'open' ? 'opening' : state;
    case 'opening':
      return event === 'opened' ? 'open' : state;
    case 'open':
      return event === 'close' ? 'closing' : state;
    case 'closing':
      return event === 'closed' ? 'closed' : state;
  }
}
