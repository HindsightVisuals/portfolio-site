import { describe, expect, it } from 'vitest';
import { panelPlacement, peekOffset } from './hover-math';

const A = { x: 0, y: 0 };

describe('peekOffset', () => {
  it('leans toward a neighbour on the right', () => {
    const o = peekOffset(A, { x: 7.9, y: 0 }, 350, 0.01);
    expect(o.x).toBeCloseTo(3.5, 6);
    expect(o.y).toBeCloseTo(0, 6);
  });

  it('leans up toward a neighbour above', () => {
    const o = peekOffset(A, { x: 0, y: 5.3 }, 350, 0.01);
    expect(o.x).toBeCloseTo(0, 6);
    expect(o.y).toBeCloseTo(3.5, 6);
  });

  it('is the same magnitude whatever the neighbour distance — it is a lean, not a travel', () => {
    const near = peekOffset(A, { x: 1, y: 0 }, 350, 0.01);
    const far = peekOffset(A, { x: 100, y: 0 }, 350, 0.01);
    expect(near.x).toBeCloseTo(far.x, 6);
  });

  it('handles a diagonal neighbour with a unit-length direction', () => {
    const o = peekOffset(A, { x: 3, y: 4 }, 350, 0.01);
    expect(Math.hypot(o.x, o.y)).toBeCloseTo(3.5, 6);
  });

  it('is zero when the target is the tile you are already on', () => {
    expect(peekOffset(A, { x: 0, y: 0 }, 350, 0.01)).toEqual({ x: 0, y: 0 });
  });

  it('is zero on a degenerate viewport where worldPerPixel is 0', () => {
    expect(peekOffset(A, { x: 7.9, y: 0 }, 350, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('panelPlacement', () => {
  const W = 450;
  const H = 222;
  const VP_W = 1920;
  const VP_H = 1080;

  it('grows down and to the right from the cursor in open space', () => {
    expect(panelPlacement(200, 200, W, H, VP_W, VP_H)).toEqual({
      x: 200,
      y: 200,
      originX: 'left',
      originY: 'top',
    });
  });

  it('flips left when it would overflow the right edge', () => {
    const p = panelPlacement(1800, 200, W, H, VP_W, VP_H);
    expect(p.originX).toBe('right');
    expect(p.x).toBe(1800 - W);
  });

  it('flips up when it would overflow the bottom edge', () => {
    const p = panelPlacement(200, 1000, W, H, VP_W, VP_H);
    expect(p.originY).toBe('bottom');
    expect(p.y).toBe(1000 - H);
  });

  it('flips both axes in the bottom-right corner', () => {
    const p = panelPlacement(1880, 1050, W, H, VP_W, VP_H);
    expect(p.originX).toBe('right');
    expect(p.originY).toBe('bottom');
  });

  it('keeps the growth origin on the cursor after a flip', () => {
    // Flipped horizontally the panel's RIGHT edge sits at the cursor, so growing
    // from originX 'right' still emanates from the pointer.
    const p = panelPlacement(1800, 200, W, H, VP_W, VP_H);
    expect(p.x + W).toBe(1800);
  });

  it('respects the padding when deciding to flip', () => {
    const cx = VP_W - W; // exactly enough room without padding, not enough with it
    expect(panelPlacement(cx, 200, W, H, VP_W, VP_H, 0).originX).toBe('left');
    expect(panelPlacement(cx, 200, W, H, VP_W, VP_H, 16).originX).toBe('right');
  });
});
