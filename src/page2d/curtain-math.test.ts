import { describe, expect, it } from 'vitest';
import {
  RIPPLE_MS,
  RIPPLE_FULL_SPEED,
  pruneRipples,
  rippleOffset,
  CURTAIN_VIEW_W,
  HOVER_PULL,
  WARP_AMPLITUDE,
  crossedCurtain,
  curtainPath,
  curtainY,
} from './curtain-math';

describe('curtainY', () => {
  it('sits near the top edge at both ends, as the Figma path does', () => {
    expect(Math.abs(curtainY(0, 0))).toBeLessThan(WARP_AMPLITUDE * 2);
    expect(Math.abs(curtainY(CURTAIN_VIEW_W, 0))).toBeLessThan(WARP_AMPLITUDE * 2);
  });

  it('dips deepest around the middle-right, matching the design', () => {
    const mid = curtainY(CURTAIN_VIEW_W * 0.53, 0);
    expect(mid).toBeGreaterThan(curtainY(CURTAIN_VIEW_W * 0.1, 0));
    expect(mid).toBeGreaterThan(curtainY(CURTAIN_VIEW_W * 0.95, 0));
    expect(mid).toBeGreaterThan(90);
  });

  it('warps over time, but only slightly — this is keep-alive, not decoration', () => {
    const x = CURTAIN_VIEW_W * 0.4;
    const rest = curtainY(x, 0);
    for (let t = 0; t < 40; t += 0.37) {
      expect(Math.abs(curtainY(x, t) - rest)).toBeLessThanOrEqual(WARP_AMPLITUDE * 3.2);
    }
  });

  it('actually moves — a static curve would be a silent failure', () => {
    const x = CURTAIN_VIEW_W * 0.4;
    const samples = [0, 2, 4, 6, 8].map((t) => curtainY(x, t));
    expect(new Set(samples.map((v) => v.toFixed(4))).size).toBeGreaterThan(1);
  });

  it('drops the whole curve by HOVER_PULL at full pull', () => {
    const x = CURTAIN_VIEW_W * 0.3;
    expect(curtainY(x, 0, 1) - curtainY(x, 0, 0)).toBeCloseTo(HOVER_PULL, 6);
  });

  it('clamps pull rather than letting it run away', () => {
    const x = CURTAIN_VIEW_W * 0.3;
    expect(curtainY(x, 0, 5)).toBeCloseTo(curtainY(x, 0, 1), 6);
    expect(curtainY(x, 0, -5)).toBeCloseTo(curtainY(x, 0, 0), 6);
  });
});

describe('curtainPath', () => {
  it('is a closed path spanning the full view width', () => {
    const d = curtainPath(0);
    expect(d.startsWith(`M${CURTAIN_VIEW_W}`)).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('emits no NaN — one bad sample poisons the whole shape silently', () => {
    expect(curtainPath(3.7, 0.5)).not.toMatch(/NaN/);
  });
});

describe('crossedCurtain', () => {
  // Anchored to the curve so these stay correct as the rest shape is tuned.
  const above = (x: number) => ({ x, y: curtainY(x, 0) - 30 });
  const below = (x: number) => ({ x, y: curtainY(x, 0) + 30 });

  it('detects a downward crossing and reports where', () => {
    const hit = crossedCurtain(above(600), below(600), 0);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeGreaterThan(0);
    expect(hit!.x).toBeLessThan(CURTAIN_VIEW_W);
  });

  it('detects an upward crossing too', () => {
    expect(crossedCurtain(below(600), above(600), 0)).not.toBeNull();
  });

  it('ignores a move that stays above the wave', () => {
    expect(crossedCurtain(above(300), above(900), 0)).toBeNull();
  });

  it('ignores a move that stays below the wave', () => {
    expect(crossedCurtain(below(300), below(900), 0)).toBeNull();
  });

  it('reports speed, so the ripple can scale with how fast you cut through', () => {
    // Straddle the curve where it actually is rather than assuming a depth —
    // the rest shape is tuned by eye and will move again.
    const x = 900;
    const y = curtainY(x, 0);
    const slow = crossedCurtain({ x, y: y - 4 }, { x: x + 3, y: y + 4 }, 0);
    const fast = crossedCurtain({ x, y: y - 90 }, { x: x + 120, y: y + 90 }, 0);
    expect(slow).not.toBeNull();
    expect(fast).not.toBeNull();
    expect(fast!.speed).toBeGreaterThan(slow!.speed);
  });
});

describe('rippleOffset', () => {
  const at = (born: number, x = 900, speed = RIPPLE_FULL_SPEED) => [{ x, speed, born }];

  it('displaces the curve at the crossing point', () => {
    expect(Math.abs(rippleOffset(900, at(0), 1))).toBeGreaterThan(1);
  });

  it('is silent far from the crossing', () => {
    expect(Math.abs(rippleOffset(100, at(0), 1))).toBeLessThan(0.5);
  });

  it('decays to nothing by the end of its life', () => {
    expect(rippleOffset(900, at(0), RIPPLE_MS)).toBe(0);
    expect(rippleOffset(900, at(0), RIPPLE_MS * 2)).toBe(0);
  });

  it('gets weaker as it ages', () => {
    const young = Math.abs(rippleOffset(900, at(0), 60));
    const old = Math.abs(rippleOffset(900, at(0), RIPPLE_MS * 0.85));
    expect(old).toBeLessThan(young);
  });

  it('scales with how fast the pointer cut through', () => {
    const slow = Math.abs(rippleOffset(900, at(0, 900, 5), 40));
    const fast = Math.abs(rippleOffset(900, at(0, 900, RIPPLE_FULL_SPEED), 40));
    expect(fast).toBeGreaterThan(slow);
  });

  it('saturates rather than exploding on an absurd pointer speed', () => {
    const full = Math.abs(rippleOffset(900, at(0, 900, RIPPLE_FULL_SPEED), 40));
    const absurd = Math.abs(rippleOffset(900, at(0, 900, 100000), 40));
    expect(absurd).toBeCloseTo(full, 6);
  });

  it('sums several ripples rather than replacing them', () => {
    const one = rippleOffset(900, [{ x: 900, speed: RIPPLE_FULL_SPEED, born: 0 }], 40);
    const two = rippleOffset(
      900,
      [
        { x: 900, speed: RIPPLE_FULL_SPEED, born: 0 },
        { x: 900, speed: RIPPLE_FULL_SPEED, born: 0 },
      ],
      40,
    );
    expect(two).toBeCloseTo(one * 2, 6);
  });

  it('is zero with no ripples at all', () => {
    expect(rippleOffset(900, [], 1000)).toBe(0);
  });
});

describe('pruneRipples', () => {
  it('drops only the expired ones', () => {
    const live = { x: 1, speed: 1, born: 900 };
    const dead = { x: 2, speed: 1, born: 0 };
    expect(pruneRipples([live, dead], 1500)).toEqual([live]);
  });

  it('keeps everything when nothing has expired', () => {
    const rs = [{ x: 1, speed: 1, born: 1000 }];
    expect(pruneRipples(rs, 1100)).toEqual(rs);
  });
});
