// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import gsap from 'gsap';
import { initCameraDirector } from '../three/camera-director';
import { initWorld, DESTINATIONS, HOME_REST_Z, type WorldLayer } from '../three/world';
import { initAboutFlow, type AboutFlow, type AboutFlowDeps } from './about-flow';

/**
 * The two defects this file exists for only appear at a module BOUNDARY, which
 * is exactly why they shipped: every unit test around them passed a `vi.fn()`
 * where the real collaborator goes, and a stub has no state to be wrong about.
 *
 * C1 — the director keeps its own `state.z`, frozen at the Work rest for the
 *      corridor's whole lifetime, and writes camera.position.z from it on
 *      every non-suspended frame. Handing the camera back at Home without
 *      telling it teleported the camera back to the Work rest one tick later.
 * C2 — world.setAboutMode(true) hides every anchored root instantly, and with
 *      DESTINATIONS down to [home, work] the only one left is the Work tile
 *      wall, which at t = 0 sits 34 units dead ahead at full opacity.
 *
 * So these use the REAL camera-director and the REAL world. Nothing here is
 * stubbed except the leaves the corridor is allowed not to have (ferro,
 * cursor, background, scrollNav).
 */

// jsdom has no document.fonts (FontFaceSet); world.ts's label texture waits on
// it. Same stub world-about-mode.test.ts uses.
if (!document.fonts) {
  Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve() } });
}

const WORK_REST_Z = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ; // -26

let parent: HTMLElement;
let world: WorldLayer;
let director: ReturnType<typeof initCameraDirector>;
let flow: AboutFlow;

const build = (over: Partial<AboutFlowDeps> = {}): void => {
  world = initWorld({ reducedMotion: true });
  director = initCameraDirector(world.camera, DESTINATIONS, { reducedMotion: true });
  flow = initAboutFlow({
    camera: world.camera,
    director,
    world,
    atmosphere: world.atmosphere,
    scrollNav: null,
    ferro: null,
    ferroEl: null,
    cursor: null,
    background: null,
    setGround: () => {},
    setTextInk: () => {},
    reducedMotion: false,
    ...over,
  });
};

/**
 * Park the camera on the Work rest the way the site actually does — through
 * the director — before the corridor takes it over. This matters: the whole
 * class of bug here is the director's remembered pose drifting from the
 * camera's real one, so a test that enters the corridor while the director
 * still thinks it is at Home is testing the wrong disagreement.
 */
const parkAtWork = (): void => {
  director.jumpTo('work');
  expect(world.camera.position.z).toBeCloseTo(WORK_REST_Z, 4);
};

beforeEach(() => {
  parent = document.createElement('div');
  document.body.appendChild(parent);
});

afterEach(() => {
  flow?.destroy();
  director?.destroy();
  world?.destroy();
  parent.remove();
  // returnHome() leaves a live 1.6s gsap tween behind whenever a test steps
  // the flight to its end by hand rather than waiting it out; without this it
  // keeps writing the camera into the NEXT test.
  gsap.globalTimeline.clear();
  document.documentElement.classList.remove('about-open');
  document.documentElement.style.removeProperty('--ground');
  document.documentElement.style.removeProperty('--ink');
});

describe('C1: the corridor hands the camera back to the real director', () => {
  it('proves the hazard: an unsynced director snaps the camera back on the next tick', () => {
    build();
    parkAtWork();
    // The bug, reproduced against the real director with no corridor involved:
    // suspend, move the camera somewhere else, unsuspend, tick once.
    director.setSuspended(true);
    world.camera.position.set(0, 0, HOME_REST_Z);
    director.setSuspended(false);
    director.update(1 / 60);
    expect(world.camera.position.z).toBeCloseTo(WORK_REST_Z, 4);
  });

  it('syncTo makes the director agree with where the camera actually is', () => {
    build();
    parkAtWork();
    director.setSuspended(true);
    world.camera.position.set(0, 0, HOME_REST_Z);
    director.syncTo(HOME_REST_Z);
    director.setSuspended(false);
    director.update(1 / 60);
    expect(world.camera.position.z).toBeCloseTo(HOME_REST_Z, 4);
    // ...and keeps agreeing: nothing is left banked to fire a frame later.
    for (let i = 0; i < 30; i++) director.update(1 / 60);
    expect(world.camera.position.z).toBeCloseTo(HOME_REST_Z, 4);
  });

  it('syncTo emits nothing — no depart, no arrive', () => {
    build();
    const depart = vi.fn();
    const arrive = vi.fn();
    director.onDepart(depart);
    director.onArrive(arrive);
    director.syncTo(HOME_REST_Z);
    expect(depart).not.toHaveBeenCalled();
    expect(arrive).not.toHaveBeenCalled();
    // The contrast that makes this matter: main.ts subscribes
    // `onDepart(() => aboutFlow.exit())`, so jumpTo would have cut the camera
    // to the Work rest itself.
    director.jumpTo('home');
    expect(depart).toHaveBeenCalledTimes(1);
  });

  it('the loop closes: the camera is still Home a frame after the flight lands', () => {
    build();
    parkAtWork();
    flow.enter(parent);
    // enter() lands on the Work rest; the corridor then carries the camera far
    // off the spine, which is precisely what the director does not know about.
    expect(world.camera.position.z).toBeCloseTo(WORK_REST_Z, 4);
    flow.setScrollForTest(1);
    expect(world.camera.position.y).toBeGreaterThan(20);

    void flow.returnHome();
    flow.stepReturnForTest(1);
    expect(world.camera.position.z).toBeCloseTo(HOME_REST_Z, 4);
    expect(flow.isOpen()).toBe(false);

    // The frame that used to undo the whole flight. Synchronous, so no rAF can
    // slip in between.
    director.update(1 / 60);
    expect(world.camera.position.z).toBeCloseTo(HOME_REST_Z, 4);
    for (let i = 0; i < 30; i++) director.update(1 / 60);
    expect(world.camera.position.z).toBeCloseTo(HOME_REST_Z, 4);
    expect(world.camera.position.y).toBeCloseTo(0, 4);
  });

  it('exit() still hands back consistently — the corridor cuts to the rest the director remembers', () => {
    build();
    parkAtWork();
    flow.enter(parent);
    flow.setScrollForTest(0.6);
    flow.exit();
    director.update(1 / 60);
    expect(world.camera.position.z).toBeCloseTo(WORK_REST_Z, 4);
  });
});

describe('C2: the Work wall fades out of the corridor rather than blinking', () => {
  const wallVisible = (): boolean => world.anchoredVisibleCount() > 0;

  it('is still there at the handover, where it fills the frame 34 units ahead', () => {
    build();
    parkAtWork();
    world.update?.(1 / 60);
    expect(wallVisible()).toBe(true);
    flow.enter(parent); // t = 0
    expect(wallVisible()).toBe(true);
    // And a world frame must not undo it: About mode freezes the materialize
    // pass, so the corridor's own fade is the only writer.
    world.update?.(1 / 60);
    expect(wallVisible()).toBe(true);
  });

  it('fades monotonically, and is gone by the transition beat', () => {
    build();
    parkAtWork();
    flow.enter(parent);
    const transitionT = flow.path().tForBeat('transition');
    expect(transitionT).toBeGreaterThan(0);

    flow.setScrollForTest(transitionT * 0.5);
    expect(wallVisible()).toBe(true); // mid-fade, still on screen

    flow.setScrollForTest(transitionT);
    expect(wallVisible()).toBe(false);

    flow.setScrollForTest(0.5);
    expect(wallVisible()).toBe(false); // and stays gone for the climb
    world.update?.(1 / 60);
    expect(wallVisible()).toBe(false);
  });

  it('a deep link past the transition beat lands with the wall already gone', () => {
    build();
    parkAtWork();
    flow.enter(parent, 0.5);
    expect(wallVisible()).toBe(false);
  });

  it('comes back on exit', () => {
    build();
    parkAtWork();
    flow.enter(parent);
    flow.setScrollForTest(0.5);
    expect(wallVisible()).toBe(false);
    flow.exit();
    world.update?.(1 / 60);
    expect(wallVisible()).toBe(true);
  });

  it('comes back after the return flight home', () => {
    build();
    parkAtWork();
    flow.enter(parent);
    flow.setScrollForTest(1);
    void flow.returnHome();
    flow.stepReturnForTest(1);
    // Home is 60 units from the wall's anchor, so it materializes back to
    // whatever that distance says — the point is that About mode's hard hide
    // has been released and update() owns the fade again.
    world.update?.(1 / 60);
    director.update(1 / 60);
    world.update?.(1 / 60);
    world.camera.position.set(0, 0, WORK_REST_Z);
    world.update?.(1 / 60);
    expect(wallVisible()).toBe(true);
  });

  it('reduced motion never engages About mode, so the wall is never touched', () => {
    build({ reducedMotion: true });
    parkAtWork();
    world.update?.(1 / 60);
    expect(wallVisible()).toBe(true);
    flow.enter(parent);
    world.update?.(1 / 60);
    expect(wallVisible()).toBe(true);
    flow.exit();
    world.update?.(1 / 60);
    expect(wallVisible()).toBe(true);
  });
});
