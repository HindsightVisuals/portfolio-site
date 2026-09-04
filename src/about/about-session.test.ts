// @vitest-environment jsdom
// src/about/about-session.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DESTINATIONS } from '../three/world';
import { buildAboutPath } from './about-path';
import { createSession } from './about-session';
import type { AboutFlowDeps } from './about-flow';

const anchorRest = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ;
const path = buildAboutPath(new THREE.Vector3(0, 0, anchorRest));

function setup(reducedMotion = false) {
  const presentation = {
    apply: vi.fn(),
    resetBeat: vi.fn(),
    setOpenClass: vi.fn(),
    hideCanvas: vi.fn(),
    releaseSharedState: vi.fn(),
  };
  const flight = { start: vi.fn().mockResolvedValue(undefined), step: vi.fn(), inFlight: vi.fn(() => false) };
  const deps = {
    camera: new THREE.PerspectiveCamera(),
    director: { setSuspended: vi.fn(), syncTo: vi.fn() },
    world: { setAboutMode: vi.fn(), setAnchoredFade: vi.fn() },
    atmosphere: { setInk: vi.fn() },
    scrollNav: { setMode: vi.fn() },
    ferro: { placeAt: vi.fn().mockResolvedValue(undefined), show: vi.fn(), hide: vi.fn() },
    ferroEl: document.createElement('div'),
    cursor: { setOnDark: vi.fn() },
    background: { setInvertAmount: vi.fn() },
    setGround: vi.fn(),
    setTextInk: vi.fn(),
    reducedMotion,
  } as unknown as AboutFlowDeps;
  const session = createSession({ deps, path, presentation, flight });
  return { deps, presentation, flight, session };
}

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.className = '';
});

describe('the guard table', () => {
  it('setScrollForTest does nothing while closed', () => {
    const { presentation, session } = setup();
    session.setScrollForTest(0.5);
    expect(presentation.apply).not.toHaveBeenCalled();
  });

  it('setScrollForTest does nothing while paused — pause() detaches the listener, so the seam carries the term', () => {
    const { presentation, session } = setup();
    session.enter(document.body);
    session.pause();
    presentation.apply.mockClear();
    session.setScrollForTest(0.5);
    expect(presentation.apply).not.toHaveBeenCalled();
  });

  it('setScrollForTest does nothing under reduced motion', () => {
    const { presentation, session } = setup(true);
    session.enter(document.body);
    presentation.apply.mockClear();
    session.setScrollForTest(0.5);
    expect(presentation.apply).not.toHaveBeenCalled();
  });

  it('stepReturnForTest guards on open ALONE — legitimate while paused and under reduced motion', () => {
    const { flight, session } = setup(true);
    session.enter(document.body);
    session.pause();
    session.stepReturnForTest(0.5);
    expect(flight.step).toHaveBeenCalledWith(0.5);
  });

  it('pause() refuses while the flight is in the air', () => {
    const { presentation, flight, session } = setup();
    session.enter(document.body);
    flight.inFlight.mockReturnValue(true);
    session.pause();
    presentation.apply.mockClear();
    session.resume();
    // isOpen() alone would be true whether or not the guard works. The half
    // that actually did the damage is resume(): apply() writes
    // ferroEl.style.opacity and scrollDocumentTo fires the scroll listener —
    // both fighting the tween the flight is running. Nothing may reach the
    // presentation while the flight owns the corridor.
    expect(presentation.apply).not.toHaveBeenCalled();
    expect(session.isOpen()).toBe(true);
  });
});

describe('enter and exit', () => {
  it('enter suspends the director and puts the world in About mode', () => {
    const { deps, session } = setup();
    session.enter(document.body);
    expect(deps.director.setSuspended).toHaveBeenCalledWith(true);
    expect(deps.world.setAboutMode).toHaveBeenCalledWith(true);
    expect(session.isOpen()).toBe(true);
  });

  it('enter is idempotent', () => {
    const { deps, session } = setup();
    session.enter(document.body);
    session.enter(document.body);
    expect(deps.director.setSuspended).toHaveBeenCalledTimes(1);
  });

  it('reduced motion does NOT suspend the director', () => {
    const { deps, session } = setup(true);
    session.enter(document.body);
    expect(deps.director.setSuspended).not.toHaveBeenCalled();
    expect(deps.world.setAboutMode).not.toHaveBeenCalled();
  });

  it('exit cuts the camera to the anchor and releases the director LAST', () => {
    const { deps, session } = setup();
    session.enter(document.body);
    session.exit();
    expect(deps.camera.position.z).toBe(anchorRest);
    expect(deps.director.setSuspended).toHaveBeenLastCalledWith(false);
    expect(session.isOpen()).toBe(false);
  });

  it('exit is a no-op when never opened', () => {
    const { deps, session } = setup();
    session.exit();
    expect(deps.director.setSuspended).not.toHaveBeenCalled();
  });
});
