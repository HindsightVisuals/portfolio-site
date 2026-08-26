import { describe, it, expect } from 'vitest';
import { IDLE_SILENCE_MS, AMBIENT_EASE_MS, createIdleModel, updateIdle, type IdleModel } from './array-idle';

/** Drive the model in small steps, the way a frame loop would. */
function run(m: IdleModel, ms: number, disengaged: boolean): void {
  const step = 16;
  for (let t = 0; t < ms; t += step) updateIdle(m, step, disengaged);
}

describe('engaged', () => {
  it('brings both ambient and cursor up', () => {
    const m = createIdleModel();
    run(m, AMBIENT_EASE_MS * 1.5, false);
    expect(m.state).toBe('engaged');
    expect(m.ambient).toBeCloseTo(1, 2);
    expect(m.cursor).toBeCloseTo(1, 2);
  });
});

describe('the silence after disengaging', () => {
  it('drops BOTH to zero — the array goes still', () => {
    const m = createIdleModel();
    run(m, AMBIENT_EASE_MS * 1.5, false);
    run(m, AMBIENT_EASE_MS * 1.5, true);
    expect(m.state).toBe('silent');
    expect(m.ambient).toBeCloseTo(0, 2);
    expect(m.cursor).toBeCloseTo(0, 2);
  });

  it('is still silent just before the threshold', () => {
    const m = createIdleModel();
    run(m, AMBIENT_EASE_MS * 1.5, false);
    run(m, IDLE_SILENCE_MS - 100, true);
    expect(m.state).toBe('silent');
  });
});

describe('the keep-alive breath', () => {
  it('flips to breathing once the silence elapses', () => {
    const m = createIdleModel();
    run(m, AMBIENT_EASE_MS * 1.5, false);
    run(m, IDLE_SILENCE_MS + 100, true);
    expect(m.state).toBe('breathing');
  });

  it('brings ambient back WITHOUT bringing the cursor back', () => {
    const m = createIdleModel();
    run(m, AMBIENT_EASE_MS * 1.5, false);
    run(m, IDLE_SILENCE_MS + AMBIENT_EASE_MS * 1.5, true);
    expect(m.ambient).toBeCloseTo(1, 2);
    expect(m.cursor).toBeCloseTo(0, 2);
  });
});

describe('re-engaging', () => {
  it('resets the timer so the next departure gets a full silence', () => {
    const m = createIdleModel();
    run(m, IDLE_SILENCE_MS + 100, true);
    expect(m.state).toBe('breathing');
    updateIdle(m, 16, false);
    expect(m.state).toBe('engaged');
    expect(m.sinceDisengage).toBe(0);
  });

  it('brings the cursor back up', () => {
    const m = createIdleModel();
    run(m, IDLE_SILENCE_MS + 500, true);
    run(m, AMBIENT_EASE_MS * 1.5, false);
    expect(m.cursor).toBeCloseTo(1, 2);
  });
});

describe('allocation discipline', () => {
  it('mutates in place and returns nothing', () => {
    const m = createIdleModel();
    expect(updateIdle(m, 16, false)).toBeUndefined();
  });
});
