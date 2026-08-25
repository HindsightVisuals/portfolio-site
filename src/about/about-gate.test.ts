import { describe, expect, it } from 'vitest';
import { createGate, feedGate, GATE_THRESHOLD_PX } from './about-gate';

describe('feedGate', () => {
  it('accumulates forward scroll toward the threshold', () => {
    const g = createGate();
    const a = feedGate(g, GATE_THRESHOLD_PX / 4);
    expect(a.amount).toBeCloseTo(0.25, 6);
    expect(a.armed).toBe(false);
    const b = feedGate(g, GATE_THRESHOLD_PX / 4);
    expect(b.amount).toBeCloseTo(0.5, 6);
  });

  it('arms once the threshold is crossed', () => {
    const g = createGate();
    expect(feedGate(g, GATE_THRESHOLD_PX).armed).toBe(true);
    expect(feedGate(g, 0).amount).toBe(1);
  });

  it('drains on backward scroll — the gate is intent, and intent can be withdrawn', () => {
    const g = createGate();
    feedGate(g, GATE_THRESHOLD_PX / 2);
    const back = feedGate(g, -GATE_THRESHOLD_PX / 4);
    expect(back.amount).toBeCloseTo(0.25, 6);
    expect(back.armed).toBe(false);
  });

  it('never drains below zero', () => {
    const g = createGate();
    expect(feedGate(g, -9999).amount).toBe(0);
  });

  it('clamps the reported amount at 1 however far past the threshold you push', () => {
    const g = createGate();
    expect(feedGate(g, GATE_THRESHOLD_PX * 10).amount).toBe(1);
  });

  it('ignores a non-finite delta rather than poisoning the accumulator', () => {
    const g = createGate();
    feedGate(g, GATE_THRESHOLD_PX / 2);
    expect(feedGate(g, NaN).amount).toBeCloseTo(0.5, 6);
  });

  it('has a threshold that takes deliberate effort but is not a workout', () => {
    expect(GATE_THRESHOLD_PX).toBeGreaterThan(300);
    expect(GATE_THRESHOLD_PX).toBeLessThan(2000);
  });
});
