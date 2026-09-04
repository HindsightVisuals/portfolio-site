// @vitest-environment jsdom
// src/about/about-gate-control.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GATE_THRESHOLD_PX } from './about-gate';
import { createGateControl, GATE_IDLE_MS } from './about-gate-control';

const showValue = (): string =>
  document.documentElement.style.getPropertyValue('--gate-show');

describe('createGateControl', () => {
  let root: HTMLElement;
  let onArmed: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement('div');
    onArmed = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.style.removeProperty('--gate-show');
  });

  const make = () => createGateControl({ docRoot: () => root, onArmed });

  it('ignores feeds away from the corridor end', () => {
    const gate = make();
    gate.feed(500, 0.5);
    expect(root.style.getPropertyValue('--gate')).toBe('');
    expect(showValue()).toBe('');
  });

  it('writes --gate and reveals the panel on the first push at the end', () => {
    const gate = make();
    gate.feed(100, 1);
    expect(Number(root.style.getPropertyValue('--gate'))).toBeGreaterThan(0);
    expect(showValue()).toBe('1');
  });

  it('arms once the threshold is crossed', () => {
    const gate = make();
    gate.feed(GATE_THRESHOLD_PX + 1, 1);
    expect(onArmed).toHaveBeenCalledTimes(1);
  });

  it('drains the fill after the idle timeout but leaves the panel shown', () => {
    const gate = make();
    gate.feed(100, 1);
    vi.advanceTimersByTime(GATE_IDLE_MS + 1);
    expect(root.style.getPropertyValue('--gate')).toBe('');
    expect(showValue()).toBe('1');
  });

  it('syncAt at the end, after an idle drain, still shows the panel — accumulated and gateFed diverge on purpose', () => {
    // The module's own doc records the split this proves: the idle-retreat
    // timer drains gate.accumulated to zero so the FILL can visibly ease
    // down, but gateFed stays true so the panel itself is still on screen to
    // show that easing — see syncGateShow's own doc. The test above only
    // reads the '1' feed()'s own syncGateShow call already wrote; nothing
    // there calls syncAt() after the drain while still at the end, so a
    // syncShow that read gate.accumulated > 0 instead of gateFed would drain
    // the panel right along with the fill and still pass. This one calls
    // syncAt(1) — the syncGateShow that runs every apply() — AFTER the idle
    // drain has already zeroed the accumulator, while `t` is still at the
    // end, and checks the panel is still offered.
    const gate = make();
    gate.feed(100, 1);
    vi.advanceTimersByTime(GATE_IDLE_MS + 1);
    gate.syncAt(1);
    expect(showValue()).toBe('1');
  });

  it('rearms the idle clock on every push, so it fires after the LAST one', () => {
    const gate = make();
    gate.feed(100, 1);
    vi.advanceTimersByTime(GATE_IDLE_MS - 100);
    gate.feed(100, 1);
    vi.advanceTimersByTime(GATE_IDLE_MS - 100);
    expect(root.style.getPropertyValue('--gate')).not.toBe('');
    vi.advanceTimersByTime(200);
    expect(root.style.getPropertyValue('--gate')).toBe('');
  });

  it('does not start an idle timer for a push that arms the gate', () => {
    const gate = make();
    gate.feed(GATE_THRESHOLD_PX + 1, 1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('syncAt withdraws the whole offer on leaving the end', () => {
    const gate = make();
    gate.feed(100, 1);
    gate.syncAt(0.5);
    expect(root.style.getPropertyValue('--gate')).toBe('');
    expect(showValue()).toBe('0');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('syncAt at the end leaves a fed gate alone', () => {
    const gate = make();
    gate.feed(100, 1);
    const filled = root.style.getPropertyValue('--gate');
    gate.syncAt(1);
    expect(root.style.getPropertyValue('--gate')).toBe(filled);
    expect(showValue()).toBe('1');
  });

  it('reset clears the accumulator so a later visit needs a fresh full push', () => {
    const gate = make();
    gate.feed(GATE_THRESHOLD_PX - 10, 1);
    gate.reset();
    gate.feed(20, 1);
    expect(onArmed).not.toHaveBeenCalled();
  });

  it('release removes --gate-show', () => {
    const gate = make();
    gate.feed(100, 1);
    gate.release();
    expect(showValue()).toBe('');
  });
});
