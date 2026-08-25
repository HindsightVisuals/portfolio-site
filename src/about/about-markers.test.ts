import { describe, expect, it } from 'vitest';
import { ABOUT_MARKERS, ANCHOR_FRAME } from './about-markers';

describe('ABOUT_MARKERS', () => {
  it('carries the six markers the About flow scrubs through', () => {
    // The nine Blender markers include Home and Work, which the site owns and
    // the scrub never visits. The path starts at the anchor (Work Page) and
    // runs to AI Transparency.
    expect(ABOUT_MARKERS.map((m) => m.id)).toEqual([
      'anchor', 'transition', 'lander', 'team', 'clientWall', 'capabilities', 'contact', 'ai',
    ]);
  });

  it('starts at the anchor frame', () => {
    expect(ABOUT_MARKERS[0].frame).toBe(ANCHOR_FRAME);
    expect(ANCHOR_FRAME).toBe(64);
  });

  it('has strictly increasing frames — the path never doubles back in time', () => {
    for (let i = 1; i < ABOUT_MARKERS.length; i++) {
      expect(ABOUT_MARKERS[i].frame).toBeGreaterThan(ABOUT_MARKERS[i - 1].frame);
    }
  });

  it('never leaves the x = 0 plane', () => {
    for (const m of ABOUT_MARKERS) expect(m.blender.x).toBe(0);
  });

  it('matches the measured inventory at the two poses that define the move', () => {
    const lander = ABOUT_MARKERS.find((m) => m.id === 'lander')!;
    expect(lander.frame).toBe(105);
    expect(lander.blender.y).toBeCloseTo(36.83, 2);
    expect(lander.blender.z).toBeCloseTo(6.02, 2);
    expect(lander.pitchDeg).toBeCloseTo(179.9, 1);

    const ai = ABOUT_MARKERS.find((m) => m.id === 'ai')!;
    expect(ai.frame).toBe(258);
    expect(ai.blender.y).toBeCloseTo(55.46, 2);
    expect(ai.blender.z).toBeCloseTo(18.23, 2);
    expect(ai.pitchDeg).toBeCloseTo(89.9, 1);
  });
});
