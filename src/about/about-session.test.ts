// @vitest-environment jsdom
// src/about/about-session.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DESTINATIONS } from '../three/world';
import { GATE_THRESHOLD_PX } from './about-gate';
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
    const { deps, flight, session } = setup();
    session.enter(document.body);
    // Set first so its removal — pause()'s own observable side effect, the
    // one line its body actually runs (see pause()'s own doc) — is what
    // proves the guard fired, rather than something read through resume().
    deps.ferroEl!.classList.add('ferro-stage--behind');
    flight.inFlight.mockReturnValue(true);
    session.pause();
    // Asserting through resume() doesn't isolate pause()'s own guard: with
    // pause() refusing, `paused` never becomes true, so resume()'s own
    // `!paused` term short-circuits first and the deleted
    // `flight.inFlight()` in pause() is never exercised — see the sibling
    // test below, which isolates resume()'s guard by pausing for real
    // first. This test instead reads pause()'s own effect directly.
    expect(deps.ferroEl!.classList.contains('ferro-stage--behind')).toBe(true);
  });

  it('resume() refuses while the flight is in the air — the half that fought the tween', () => {
    const { presentation, flight, session } = setup();
    session.enter(document.body);
    // Pause for REAL first, with the flight on the ground, so `paused` genuinely
    // becomes true. Without that, resume()'s own `!paused` term short-circuits
    // and the guard under test is never reached — which is exactly how the test
    // above passes with resume()'s flight check deleted. This one isolates it.
    session.pause();
    flight.inFlight.mockReturnValue(true);
    presentation.apply.mockClear();
    const addSpy = vi.spyOn(window, 'addEventListener');
    session.resume();
    // The two writes that fight the running tween: apply() writes
    // ferroEl.style.opacity, the very property the flight is animating, and
    // scrollDocumentTo fires the listener resume() had just re-attached.
    expect(presentation.apply).not.toHaveBeenCalled();
    expect(addSpy.mock.calls.some(([type]) => type === 'scroll')).toBe(false);
    // And the hold still holds: a scroll event cannot reach the camera.
    window.dispatchEvent(new Event('scroll'));
    expect(presentation.apply).not.toHaveBeenCalled();
    addSpy.mockRestore();
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
    const { deps, presentation, session } = setup();
    session.enter(document.body);
    // Real THREE methods, not mocks — spy without replacing them so their
    // invocationCallOrder is observable alongside the mocks below. This is
    // what actually catches "released LAST": presentation.releaseSharedState
    // alone only proves setSuspended(false) runs after releaseAll(), which
    // is still true even if setSuspended(false) were moved to right after
    // releaseAll() but ABOVE the camera cut — exactly the undetected mutation
    // this test exists to catch. Pinning it after the camera-cut calls too
    // closes that gap.
    const positionSet = vi.spyOn(deps.camera.position, 'set');
    const quaternionIdentity = vi.spyOn(deps.camera.quaternion, 'identity');
    session.exit();
    expect(deps.camera.position.z).toBe(anchorRest);
    expect(deps.director.setSuspended).toHaveBeenLastCalledWith(false);
    expect(session.isOpen()).toBe(false);
    // "Released LAST" (see exit()'s own comment) means after everything else
    // exit() does — releaseAll() (presentation.releaseSharedState here;
    // gateCtl.release() has no mock to spy on, but it runs inside the same
    // releaseAll() call) AND the camera cut that follows it — not merely
    // after SOME earlier step.
    const suspendedOrder = vi.mocked(deps.director.setSuspended).mock.invocationCallOrder.at(-1)!;
    expect(presentation.releaseSharedState.mock.invocationCallOrder[0]).toBeLessThan(suspendedOrder);
    expect(positionSet.mock.invocationCallOrder[0]).toBeLessThan(suspendedOrder);
    expect(quaternionIdentity.mock.invocationCallOrder[0]).toBeLessThan(suspendedOrder);
  });

  it('exit is a no-op when never opened', () => {
    const { deps, session } = setup();
    session.exit();
    expect(deps.director.setSuspended).not.toHaveBeenCalled();
  });

  it('enter resets the gate — a previous visit armed partway must not fire on the next visit\'s first small push', () => {
    // The session builds its own GateControl internally (about-session.ts),
    // so there is no gateCtl stub to assert against directly — go through
    // the observable effect instead: arm the gate PARTWAY (not enough to
    // depart) on one visit, exit, enter again, and feed a small delta. If
    // enter() forgot to reset the gate, the accumulator from the first visit
    // would still be sitting there and this second, small push would tip it
    // over GATE_THRESHOLD_PX and depart — exactly the bug reset() exists to
    // prevent (see gateCtl.reset()'s own doc in about-session.ts's enter()).
    //
    // The second enter() lands directly at startT = 1 (the corridor's end),
    // deliberately, not the default 0: entering at 0 runs scrubTo(0) ->
    // gateCtl.syncAt(0), whose OWN "leaving the end" branch also zeroes the
    // accumulator (t=0 isn't the end) — which would clear a leftover
    // accumulator as a side effect and mask a deleted reset() call. Landing
    // at t=1 keeps syncAt's leave-the-end branch from firing (atCorridorEnd
    // is true there), so reset() is the only thing left that can clear it.
    const { flight, session } = setup();
    session.enter(document.body);
    session.setScrollForTest(1);
    session.feedGateForTest(GATE_THRESHOLD_PX - 10);
    session.exit();
    session.enter(document.body, 1);
    session.feedGateForTest(20);
    expect(flight.start).not.toHaveBeenCalled();
    session.exit();
  });
});
