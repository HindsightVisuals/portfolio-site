import { describe, it, expect } from 'vitest';
import {
  IDLE_SILENCE_MS,
  RISE_MS,
  FALL_MS,
  smootherstep,
  createIdleModel,
  updateIdle,
  type IdleModel,
} from './array-idle';

/** Drive the model in small steps, the way a frame loop would. */
function run(m: IdleModel, ms: number, disengaged: boolean): void {
  const step = 16;
  for (let t = 0; t < ms; t += step) updateIdle(m, step, disengaged);
}

describe('engaged', () => {
  it('brings both ambient and cursor up', () => {
    const m = createIdleModel();
    run(m, RISE_MS * 1.5, false);
    expect(m.state).toBe('engaged');
    expect(m.ambient).toBeCloseTo(1, 2);
    expect(m.cursor).toBeCloseTo(1, 2);
  });
});

describe('the silence after disengaging', () => {
  it('drops BOTH to zero — the array goes still', () => {
    const m = createIdleModel();
    run(m, RISE_MS * 1.5, false);
    run(m, FALL_MS * 1.5, true);
    expect(m.state).toBe('silent');
    expect(m.ambient).toBeCloseTo(0, 2);
    expect(m.cursor).toBeCloseTo(0, 2);
  });

  it('is still silent just before the threshold', () => {
    const m = createIdleModel();
    run(m, RISE_MS * 1.5, false);
    run(m, IDLE_SILENCE_MS - 100, true);
    expect(m.state).toBe('silent');
  });
});

describe('the keep-alive breath', () => {
  it('flips to breathing once the silence elapses', () => {
    const m = createIdleModel();
    run(m, RISE_MS * 1.5, false);
    run(m, IDLE_SILENCE_MS + 100, true);
    expect(m.state).toBe('breathing');
  });

  it('brings ambient back WITHOUT bringing the cursor back', () => {
    const m = createIdleModel();
    run(m, RISE_MS * 1.5, false);
    run(m, IDLE_SILENCE_MS + RISE_MS * 1.5, true);
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
    run(m, RISE_MS * 1.5, false);
    expect(m.cursor).toBeCloseTo(1, 2);
  });
});

describe('allocation discipline', () => {
  it('mutates in place and returns nothing', () => {
    const m = createIdleModel();
    expect(updateIdle(m, 16, false)).toBeUndefined();
  });
});


describe('the heavy ease', () => {
  it('rises far slower than it falls', () => {
    // Waking up should feel like something heavy getting going; settling back
    // to rest is allowed to be quick.
    expect(RISE_MS).toBeGreaterThan(FALL_MS * 1.5);
  });

  it('starts and stops with no kick', () => {
    // Smootherstep is flat to SECOND order at both ends. Plain smoothstep only
    // flattens the first derivative, and at this speed the residual kick shows.
    const d = (t: number, h = 1e-4) =>
      (smootherstep(t + h) - smootherstep(t - h)) / (2 * h);
    expect(d(0.002)).toBeLessThan(0.01);
    expect(d(0.998)).toBeLessThan(0.01);
    expect(d(0.5)).toBeGreaterThan(1.5); // and moves properly in the middle
  });

  it('is an S-curve, not a straight line', () => {
    expect(smootherstep(0.25)).toBeLessThan(0.25);
    expect(smootherstep(0.75)).toBeGreaterThan(0.75);
    expect(smootherstep(0.5)).toBeCloseTo(0.5, 6);
  });

  it('pins the ends exactly and clamps beyond them', () => {
    expect(smootherstep(0)).toBe(0);
    expect(smootherstep(1)).toBe(1);
    expect(smootherstep(-3)).toBe(0);
    expect(smootherstep(9)).toBe(1);
  });

  it('lags the raw ramp early on — the point of the ease', () => {
    const m = createIdleModel();
    for (let t = 0; t < RISE_MS * 0.3; t += 16) updateIdle(m, 16, false);
    expect(m.cursor).toBeLessThan(m.cursorRaw);
  });
});
