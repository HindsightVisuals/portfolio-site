import { describe, expect, it } from 'vitest';
import { focusReducer, type FocusEvent, type FocusState } from './focus';

describe('focusReducer', () => {
  const legal: Array<[FocusState, FocusEvent, FocusState]> = [
    ['free', 'fly', 'flying'],
    ['free', 'flyElsewhere', 'flying'],
    ['flying', 'fly', 'flying'],
    ['flying', 'flyElsewhere', 'flying'],
    ['flying', 'arrive', 'focused'],
    ['focused', 'fly', 'flying'],
    ['focused', 'flyElsewhere', 'flying'],
    ['focused', 'scroll', 'releasing'],
    ['releasing', 'fly', 'flying'],
    ['releasing', 'flyElsewhere', 'flying'],
    ['releasing', 'released', 'free'],
    ['free', 'scroll', 'free'],
  ];

  it.each(legal)('%s + %s -> %s', (from, event, to) => {
    expect(focusReducer(from, event)).toBe(to);
  });

  const illegal: Array<[FocusState, FocusEvent]> = [
    ['flying', 'scroll'],
    ['flying', 'released'],
    ['focused', 'arrive'],
    ['focused', 'released'],
    ['releasing', 'scroll'],
    ['releasing', 'arrive'],
    ['free', 'arrive'],
    ['free', 'released'],
  ];

  it.each(illegal)('%s + %s is illegal -> state unchanged', (from, event) => {
    expect(focusReducer(from, event)).toBe(from);
  });

  it('is a pure function (no shared mutable state across calls)', () => {
    const s1 = focusReducer('free', 'fly');
    const s2 = focusReducer('free', 'scroll');
    expect(s1).toBe('flying');
    expect(s2).toBe('free');
  });
});
