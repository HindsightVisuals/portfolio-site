// @vitest-environment jsdom
// src/about/about-nav.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { buildAboutPath } from './about-path';
import { ABOUT_MARKERS } from './about-markers';
import { nextBeatId, scrollDocumentTo, scrollToBeat } from './about-nav';

const path = buildAboutPath(new THREE.Vector3(0, 0, -26));
const first = ABOUT_MARKERS[0].id;
const last = ABOUT_MARKERS[ABOUT_MARKERS.length - 1].id;

describe('nextBeatId', () => {
  it('steps forward to the next marker', () => {
    expect(nextBeatId(path, path.tForBeat(first), 1)).toBe(ABOUT_MARKERS[1].id);
  });

  it('clamps forward at the last beat — leaving forward is the gate, not an arrow', () => {
    expect(nextBeatId(path, path.tForBeat(last), 1)).toBe(last);
  });

  it('steps backward from a beat start to the previous beat', () => {
    const second = ABOUT_MARKERS[1].id;
    expect(nextBeatId(path, path.tForBeat(second), -1)).toBe(first);
  });

  it('backward from partway through a beat returns to that beat own start first', () => {
    const second = ABOUT_MARKERS[1].id;
    const third = ABOUT_MARKERS[2].id;
    const partway = (path.tForBeat(second) + path.tForBeat(third)) / 2;
    expect(nextBeatId(path, partway, -1)).toBe(second);
  });

  it('clamps backward at the first beat', () => {
    expect(nextBeatId(path, path.tForBeat(first), -1)).toBe(first);
  });
});

describe('scrollDocumentTo', () => {
  let scrollTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 3000,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps a 0..1 target onto the scrollable range', () => {
    scrollDocumentTo(0.5);
    expect(scrollTo).toHaveBeenCalledWith(0, 1000);
  });

  it('clamps out-of-range targets', () => {
    scrollDocumentTo(2);
    expect(scrollTo).toHaveBeenCalledWith(0, 2000);
    scrollDocumentTo(-1);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('does nothing when there is no scrollable range', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 1000,
      configurable: true,
    });
    scrollDocumentTo(0.5);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('scrollToBeat lands on the beat own t', () => {
    scrollToBeat(path, last);
    expect(scrollTo).toHaveBeenCalledWith(0, 2000 * path.tForBeat(last));
  });
});
