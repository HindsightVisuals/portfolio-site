// src/about/about-scrub.test.ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildAboutPath } from './about-path';
import {
  beatAt, beatProgress, documentHeightFor, scrollToT, WORLD_UNITS_PER_VIEWPORT,
} from './about-scrub';
import { DESTINATIONS } from '../three/world';

const ANCHOR_Z = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ; // -26
const path = buildAboutPath(new THREE.Vector3(0, 0, ANCHOR_Z));

describe('scrollToT', () => {
  it('is 0 at the top and 1 at the bottom', () => {
    expect(scrollToT(0, 5000, 1000)).toBe(0);
    expect(scrollToT(4000, 5000, 1000)).toBe(1);
  });

  it('is linear in between — free scrub, 1:1, no easing', () => {
    expect(scrollToT(2000, 5000, 1000)).toBeCloseTo(0.5, 10);
    expect(scrollToT(1000, 5000, 1000)).toBeCloseTo(0.25, 10);
  });

  it('clamps rather than overshooting on rubber-band scroll', () => {
    expect(scrollToT(-300, 5000, 1000)).toBe(0);
    expect(scrollToT(9999, 5000, 1000)).toBe(1);
  });

  it('returns 0 for a document no taller than the viewport', () => {
    // Nothing to scrub. Dividing by the zero-length scroll range would give
    // Infinity and put the camera at the end of the flow on a short viewport.
    expect(scrollToT(0, 800, 800)).toBe(0);
    expect(scrollToT(50, 600, 800)).toBe(0);
  });
});

describe('documentHeightFor', () => {
  it('gives every world unit of path a consistent number of scrolled pixels', () => {
    const h = documentHeightFor(path, 1000);
    expect(h).toBeCloseTo(1000 + (path.length() / WORLD_UNITS_PER_VIEWPORT) * 1000, 6);
  });

  it('is always at least one viewport, so the page is never shorter than the screen', () => {
    expect(documentHeightFor(path, 1000)).toBeGreaterThanOrEqual(1000);
  });

  it('scales with the viewport — the same flow takes the same number of screens', () => {
    const short = documentHeightFor(path, 800);
    const tall = documentHeightFor(path, 1600);
    expect((short - 800) * 2).toBeCloseTo(tall - 1600, 6);
  });
});

describe('beatAt', () => {
  it('reports the beat whose marker the scrub has most recently reached', () => {
    expect(beatAt(0, path)).toBe('anchor');
    expect(beatAt(1, path)).toBe('ai');
    expect(beatAt(path.tForBeat('team'), path)).toBe('team');
  });

  it('holds the previous beat until the next marker is actually reached', () => {
    const t = (path.tForBeat('team') + path.tForBeat('clientWall')) / 2;
    expect(beatAt(t, path)).toBe('team');
  });
});

describe('beatProgress', () => {
  it('is 0 on a marker and approaches 1 at the next one', () => {
    expect(beatProgress(path.tForBeat('lander'), path)).toBeCloseTo(0, 6);
    const mid = (path.tForBeat('lander') + path.tForBeat('team')) / 2;
    expect(beatProgress(mid, path)).toBeCloseTo(0.5, 6);
  });

  it('is 1 at the very end rather than restarting', () => {
    expect(beatProgress(1, path)).toBe(1);
  });
});
