export type FocusState = 'free' | 'flying' | 'focused' | 'releasing';
export type FocusEvent = 'fly' | 'arrive' | 'scroll' | 'released' | 'flyElsewhere';

/**
 * Legal transitions, keyed by current state then event. Any event not listed
 * for the current state is illegal and leaves the state unchanged (see the
 * `?? state` fallback in `focusReducer`).
 */
const TRANSITIONS: Record<FocusState, Partial<Record<FocusEvent, FocusState>>> = {
  free: { fly: 'flying', flyElsewhere: 'flying', scroll: 'free' },
  flying: { fly: 'flying', flyElsewhere: 'flying', arrive: 'focused' },
  focused: { fly: 'flying', flyElsewhere: 'flying', scroll: 'releasing' },
  releasing: { fly: 'flying', flyElsewhere: 'flying', released: 'free' },
};

/** Pure focus-mode state machine. Illegal events are no-ops. */
export function focusReducer(state: FocusState, event: FocusEvent): FocusState {
  return TRANSITIONS[state][event] ?? state;
}
