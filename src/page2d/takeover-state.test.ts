import { describe, expect, it } from 'vitest';
import { takeoverReducer, type TakeoverState, type TakeoverEvent } from './takeover-state';

describe('takeoverReducer — valid transitions', () => {
  it('closed + open -> opening', () => {
    expect(takeoverReducer('closed', 'open')).toBe('opening');
  });
  it('opening + opened -> open', () => {
    expect(takeoverReducer('opening', 'opened')).toBe('open');
  });
  it('open + close -> closing', () => {
    expect(takeoverReducer('open', 'close')).toBe('closing');
  });
  it('closing + closed -> closed', () => {
    expect(takeoverReducer('closing', 'closed')).toBe('closed');
  });
});

describe('takeoverReducer — spec no-ops', () => {
  it('open while open is a no-op', () => {
    expect(takeoverReducer('open', 'open')).toBe('open');
  });
  it('open while opening is a no-op', () => {
    expect(takeoverReducer('opening', 'open')).toBe('opening');
  });
  it('close while closed is a no-op', () => {
    expect(takeoverReducer('closed', 'close')).toBe('closed');
  });
  it('close while closing is a no-op', () => {
    expect(takeoverReducer('closing', 'close')).toBe('closing');
  });
});

describe('takeoverReducer — remaining combinations are no-ops', () => {
  const states: TakeoverState[] = ['closed', 'opening', 'open', 'closing'];
  const events: TakeoverEvent[] = ['open', 'opened', 'close', 'closed'];
  const validPairs = new Set(['closed:open', 'opening:opened', 'open:close', 'closing:closed']);

  for (const state of states) {
    for (const event of events) {
      const key = `${state}:${event}`;
      if (validPairs.has(key)) continue;
      it(`${state} + ${event} -> ${state} (no-op)`, () => {
        expect(takeoverReducer(state, event)).toBe(state);
      });
    }
  }
});
