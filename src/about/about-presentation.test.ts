// @vitest-environment jsdom
// src/about/about-presentation.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DESTINATIONS } from '../three/world';
import { DAY_INK } from './about-palette';
import { buildAboutPath } from './about-path';
import { createPresentation, type PresentationDeps } from './about-presentation';

const anchorRest = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ;
const path = buildAboutPath(new THREE.Vector3(0, 0, anchorRest));

function setup(reducedMotion = false) {
  const ferroEl = document.createElement('div');
  const deps: PresentationDeps = {
    camera: new THREE.PerspectiveCamera(),
    world: { setAboutMode: vi.fn(), setAnchoredFade: vi.fn() },
    atmosphere: { setInk: vi.fn() },
    scrollNav: { setMode: vi.fn() },
    ferro: { placeAt: vi.fn().mockResolvedValue(undefined), show: vi.fn(), hide: vi.fn() },
    ferroEl,
    cursor: { setOnDark: vi.fn() },
    background: { setInvertAmount: vi.fn() },
    setGround: vi.fn(),
    setTextInk: vi.fn(),
    reducedMotion,
  };
  return { deps, ferroEl, presentation: createPresentation(deps, path) };
}

afterEach(() => {
  document.documentElement.style.cssText = '';
  document.documentElement.className = '';
});

describe('createPresentation.apply', () => {
  it('writes the camera pose sampled from the path', () => {
    const { deps, presentation } = setup();
    presentation.apply(0.5);
    const expected = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    path.sample(0.5, expected);
    expect(deps.camera.position.distanceTo(expected.position)).toBeCloseTo(0, 6);
    expect(deps.camera.quaternion.angleTo(expected.quaternion)).toBeCloseTo(0, 6);
  });

  it('fans the palette out to ground, ink, atmosphere, cursor and background', () => {
    const { deps, presentation } = setup();
    presentation.apply(0.5);
    expect(deps.setGround).toHaveBeenCalled();
    expect(deps.setTextInk).toHaveBeenCalled();
    expect(deps.atmosphere.setInk).toHaveBeenCalled();
    expect(deps.cursor!.setOnDark).toHaveBeenCalled();
    expect(deps.background!.setInvertAmount).toHaveBeenCalled();
  });

  it('writes --footer-rise every scrub', () => {
    const { presentation } = setup();
    presentation.apply(1);
    expect(
      document.documentElement.style.getPropertyValue('--footer-rise'),
    ).not.toBe('');
  });

  it('does NOT write --gate or --gate-show — that is the gate control now', () => {
    const { presentation } = setup();
    presentation.apply(1);
    expect(document.documentElement.style.getPropertyValue('--gate-show')).toBe('');
  });

  it('toggles the blob behind-class once per beat change, not per frame', () => {
    const { ferroEl, presentation } = setup();
    presentation.apply(0);
    const first = ferroEl.className;
    const spy = vi.spyOn(ferroEl.classList, 'toggle');
    presentation.apply(0.001);
    expect(spy).not.toHaveBeenCalled();
    expect(ferroEl.className).toBe(first);
  });

  it('resetBeat forces the next apply to re-toggle the behind-class', () => {
    const { ferroEl, presentation } = setup();
    presentation.apply(0);
    presentation.resetBeat();
    const spy = vi.spyOn(ferroEl.classList, 'toggle');
    presentation.apply(0);
    expect(spy).toHaveBeenCalled();
  });

  it('allocates nothing per frame — the camera vector identity is stable', () => {
    const { deps, presentation } = setup();
    const before = deps.camera.position;
    presentation.apply(0.2);
    presentation.apply(0.7);
    expect(deps.camera.position).toBe(before);
  });
});

describe('createPresentation.releaseSharedState', () => {
  it('restores background, atmosphere and cursor unconditionally', () => {
    const { deps, presentation } = setup();
    presentation.apply(0.5);
    presentation.releaseSharedState();
    expect(deps.background!.setInvertAmount).toHaveBeenLastCalledWith(0);
    expect(deps.atmosphere.setInk).toHaveBeenLastCalledWith(DAY_INK);
    expect(deps.cursor!.setOnDark).toHaveBeenLastCalledWith(false);
  });

  it('clears the escape-hatch custom properties', () => {
    // --ground and --ink are pre-seeded with garbage values before apply()
    // runs specifically so their being empty afterward actually proves
    // releaseSharedState() cleared them, rather than merely never having
    // been set by the (mocked, non-DOM-touching) setGround/setTextInk in
    // this test — see about-flow.test.ts's own "restores every site-wide
    // default" test for the same reasoning.
    document.documentElement.style.setProperty('--ground', '#123456');
    document.documentElement.style.setProperty('--ink', '#abcdef');
    const { presentation } = setup();
    presentation.apply(0.5);
    presentation.releaseSharedState();
    const s = document.documentElement.style;
    expect(s.getPropertyValue('--ground')).toBe('');
    expect(s.getPropertyValue('--ink')).toBe('');
    expect(s.getPropertyValue('--footer-rise')).toBe('');
  });

  it('leaves ferro, scrollNav and world alone under reduced motion', () => {
    const { deps, presentation } = setup(true);
    presentation.releaseSharedState();
    expect(deps.ferro!.hide).not.toHaveBeenCalled();
    expect(deps.scrollNav!.setMode).not.toHaveBeenCalled();
    expect(deps.world.setAboutMode).not.toHaveBeenCalled();
  });

  it('restores ferro, scrollNav and world when motion is allowed', () => {
    const { deps, presentation } = setup(false);
    presentation.releaseSharedState();
    expect(deps.ferro!.hide).toHaveBeenCalled();
    expect(deps.scrollNav!.setMode).toHaveBeenCalledWith('world');
    expect(deps.world.setAboutMode).toHaveBeenCalledWith(false);
  });
});
