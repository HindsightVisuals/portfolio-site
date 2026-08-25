import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initScrollNav } from './scroll-nav';

// This suite runs under vitest's default node environment (no jsdom in this
// repo), which has neither `window` nor `WheelEvent`. scroll-nav.ts only
// needs addEventListener/removeEventListener/dispatchEvent, so a bare
// EventTarget stands in for window, plus a minimal WheelEvent carrying the
// two fields normalizeWheelDelta reads.
class TestWheelEvent extends Event {
  readonly deltaY: number;
  readonly deltaMode: number;
  constructor(type: string, init: { deltaY: number; deltaMode: number }) {
    super(type);
    this.deltaY = init.deltaY;
    this.deltaMode = init.deltaMode;
  }
}

beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('WheelEvent', TestWheelEvent);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const wheel = (deltaY: number): void => {
  window.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaMode: 0 }));
};

describe('initScrollNav', () => {
  it('feeds the director in world mode', () => {
    const onDelta = vi.fn();
    const nav = initScrollNav(onDelta);
    wheel(120);
    expect(onDelta).toHaveBeenCalledWith(120);
    nav.destroy();
  });

  it('swallows the wheel in takeover mode', () => {
    const onDelta = vi.fn();
    const nav = initScrollNav(onDelta);
    nav.setMode('takeover');
    wheel(120);
    expect(onDelta).not.toHaveBeenCalled();
    nav.destroy();
  });

  it('swallows the wheel in about mode — the document owns it there', () => {
    const onDelta = vi.fn();
    const nav = initScrollNav(onDelta);
    nav.setMode('about');
    wheel(120);
    expect(onDelta).not.toHaveBeenCalled();
    nav.destroy();
  });

  it('resumes feeding when the mode returns to world', () => {
    const onDelta = vi.fn();
    const nav = initScrollNav(onDelta);
    nav.setMode('about');
    wheel(120);
    nav.setMode('world');
    wheel(120);
    expect(onDelta).toHaveBeenCalledTimes(1);
    nav.destroy();
  });
});
