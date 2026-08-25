import { describe, expect, it } from 'vitest';
import { atCorridorEnd, createGate, feedGate, GATE_END_EPS, GATE_THRESHOLD_PX } from './about-gate';

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

describe('atCorridorEnd', () => {
  it('is true at an exact 1', () => {
    expect(atCorridorEnd(1)).toBe(true);
  });

  it('is true a rounding error short of 1 — the whole point of the epsilon', () => {
    // The defect: t is scrollY / (scrollHeight - innerHeight), scrollHeight is
    // a rounded integer, and at 125%/150% display scaling (the Windows 11
    // default) the real maximum scrollY lands a fraction short. A `t >= 1`
    // guard meant the gate could never arm, silently, on the owner's own
    // machine.
    const range = 6500; // ~6 screens of corridor at 1080 tall
    expect(atCorridorEnd((range - 0.5) / range)).toBe(true);
    expect(atCorridorEnd((range - 2) / range)).toBe(true);
  });

  it('is still false for a real gesture short of the end', () => {
    expect(atCorridorEnd(0.99)).toBe(false);
    expect(atCorridorEnd(0.5)).toBe(false);
    expect(atCorridorEnd(0)).toBe(false);
  });

  it('is a sub-pixel tolerance, not a slack one', () => {
    expect(GATE_END_EPS).toBeGreaterThan(0);
    expect(GATE_END_EPS).toBeLessThan(0.01);
  });
});
