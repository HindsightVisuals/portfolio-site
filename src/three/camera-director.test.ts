/**
 * Integration tests for the camera director.
 *
 * These exist because the two faults they cover are timing faults, and timing
 * is exactly what the pure modules (magnet.ts, snap.ts) cannot see. The unit
 * tests prove `approachExp` converges and `shouldSnapNow` fires; only driving
 * the real director — real gsap tweens, real update() loop — proves that zoom
 * and pan actually LAND TOGETHER, and that a scroll actually settles when the
 * wheel goes quiet.
 *
 * Determinism comes from two injections:
 *  - `gsap.globalTimeline.time(t)` scrubs every live tween to an absolute time,
 *    so a flight can be advanced without waiting on a ticker or a frame loop.
 *  - the director takes a `now` source, so the scroll-idle clock is ours to
 *    move rather than the wall clock's.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import gsap from 'gsap';
import * as THREE from 'three';
import { initCameraDirector, type CameraDirector } from './camera-director';
import type { Destination } from './world';
import type { DestId } from '../routes';

const SPACING = 60;
const CAMERA_OFFSET = 34;
const DESTINATIONS: Destination[] = (['home', 'work', 'about', 'contact'] as DestId[]).map(
  (id, i) => ({ id, anchorZ: -SPACING * i, cameraZ: -SPACING * i + CAMERA_OFFSET }),
);

/** camera-director only ever touches `.position`, so a plain vector will do. */
function makeCamera(): { position: { x: number; y: number; z: number } } {
  return { position: { x: 0, y: 0, z: CAMERA_OFFSET } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asCamera = (c: ReturnType<typeof makeCamera>): any => c;

/**
 * Comfortably past the end of any flight (longest is FLY_S = 2.0s).
 * Deliberately generous: gsap.to() wakes the ticker, so the captured base time
 * drifts by however long the test body took to reach the flight. These
 * assertions are all about the landed state, so overshooting costs nothing.
 */
const FLIGHT_SETTLED_S = 8;

/** Advance wall-clock-free: scrub gsap to an absolute time, then tick update(). */
function scrub(director: CameraDirector, base: number, to: number, dt = 1 / 60): void {
  gsap.globalTimeline.time(base + to);
  director.update(dt);
}

describe('camera director', () => {
  // gsap's ticker runs on real time even in node, so the global timeline drifted
  // between beforeEach and the assertions — a test that took 100ms of wall clock
  // scrubbed to 100ms short of its tween's end. Sleeping the ticker means the
  // timeline moves ONLY when a scrub moves it, which is the whole premise here.
  beforeAll(() => {
    gsap.ticker.sleep();
  });
  afterAll(() => {
    gsap.ticker.wake();
  });

  let camera: ReturnType<typeof makeCamera>;
  let director: CameraDirector;
  let clock: number;
  let t0: number;

  beforeEach(() => {
    camera = makeCamera();
    clock = 0;
    director = initCameraDirector(asCamera(camera), DESTINATIONS, { now: () => clock });
    t0 = gsap.globalTimeline.time();
  });

  describe('a flight lands as ONE movement', () => {
    it('finishes the pan on the same frame as the zoom, not seconds later', async () => {
      const target = { x: 3.95, y: 2.65, z: -26 - 20 };
      const flight = director.flyToFocus(target);

      // Mid-flight both axes must be genuinely under way — if x/y were still
      // being lag-filtered they would trail far behind z's progress.
      scrub(director, t0, 1.0);
      expect(camera.position.x).not.toBeCloseTo(0, 2);

      // Past the end of the flight's duration (FLY_S = 2.0s) every axis is home.
      // Scrubbed a touch beyond rather than exactly onto it: the global timeline
      // carries time accrued by earlier tests, so landing precisely on the tween
      // end is not reliable when the whole suite runs.
      scrub(director, t0, FLIGHT_SETTLED_S);
      await flight;

      expect(camera.position.z).toBeCloseTo(target.z, 3);
      expect(camera.position.x).toBeCloseTo(target.x, 3);
      expect(camera.position.y).toBeCloseTo(target.y, 3);
    });

    it('leaves no lateral tail creeping in after the zoom has stopped', async () => {
      const target = { x: 3.95, y: -2.65, z: -26 - 20 };
      const flight = director.flyToFocus(target);
      scrub(director, t0, FLIGHT_SETTLED_S);
      await flight;

      const landedX = camera.position.x;
      const landedY = camera.position.y;

      // Several frames later, with the pointer still centred, nothing has moved.
      // This is the regression: the old lag filter kept easing x/y toward the
      // target for roughly a second after z had already arrived.
      for (let i = 0; i < 10; i++) scrub(director, t0, FLIGHT_SETTLED_S);
      expect(camera.position.x).toBeCloseTo(landedX, 6);
      expect(camera.position.y).toBeCloseTo(landedY, 6);
    });

    it('holds the same rule for a plain destination flight from home', async () => {
      // Start off-axis so returning to 0 is a real movement to measure.
      director.jumpToFocus({ x: 5, y: 3, z: -26 - 20 });
      expect(camera.position.x).toBeCloseTo(5, 6);

      const t = gsap.globalTimeline.time();
      const flight = director.flyTo('home');
      scrub(director, t, FLIGHT_SETTLED_S);
      await flight;

      expect(camera.position.x).toBeCloseTo(0, 3);
      expect(camera.position.y).toBeCloseTo(0, 3);
      expect(camera.position.z).toBeCloseTo(DESTINATIONS[0].cameraZ, 3);
    });

    it('suspends the pointer magnet during flight, so it cannot skew the landing', async () => {
      director.setPointer(1, 1); // pointer parked hard in a corner
      const target = { x: 3.95, y: 2.65, z: -26 - 20 };
      const flight = director.flyToFocus(target);

      // Mid-flight the magnet contributes nothing: the camera is exactly on the
      // tween's base, not dragged a full MAGNET_X (1.2) toward the corner.
      scrub(director, t0, 1.0);
      const midX = camera.position.x;
      scrub(director, t0, 1.0); // same tween time, another frame of magnet easing
      expect(camera.position.x).toBeCloseTo(midX, 6);

      scrub(director, t0, FLIGHT_SETTLED_S);
      await flight;

      // On the landing frame the flight has completed, so the magnet is
      // released and takes its FIRST grow-in step — a fraction of a frame's
      // ease, not a jump. The base is on target; the deviation is that one step.
      expect(Math.abs(camera.position.x - target.x)).toBeLessThan(0.05);
      expect(Math.abs(camera.position.y - target.y)).toBeLessThan(0.05);
    });
  });

  describe('the magnet still works at rest', () => {
    it('eases the camera toward the pointer once a flight has ended', async () => {
      const flight = director.flyTo('work');
      scrub(director, t0, FLIGHT_SETTLED_S);
      await flight;
      expect(camera.position.x).toBeCloseTo(0, 3);

      director.setPointer(1, 0);
      for (let i = 0; i < 240; i++) director.update(1 / 60);
      // MAGNET_X = 1.2 at full strength, unfocused.
      expect(camera.position.x).toBeCloseTo(1.2, 1);
    });

    it('grows in from zero after arrival rather than popping', async () => {
      director.setPointer(1, 0);
      const flight = director.flyTo('work');
      scrub(director, t0, FLIGHT_SETTLED_S);
      await flight;

      const atArrival = camera.position.x;
      director.update(1 / 60);
      const oneFrameLater = camera.position.x;
      // A pop would be a jump straight to ~1.2; a grow-in is a small step.
      expect(Math.abs(oneFrameLater - atArrival)).toBeLessThan(0.1);
    });
  });

  describe('scrolling settles when the wheel goes quiet', () => {
    it('does not settle while the gesture is still live', () => {
      director.feedScroll(300);
      // 50ms later — a wheel-notch train's cadence. Still scrolling.
      clock += 50;
      director.update(1 / 60);
      expect(director.getVelocity()).not.toBe(0);
    });

    it('settles onto a rest once the wheel has been quiet past the idle window', () => {
      director.feedScroll(300);
      director.update(1 / 60);
      clock += 150; // past SCROLL_IDLE_MS
      director.update(1 / 60);

      // Settling is under way: scrub to the end of SETTLE_S and check we landed
      // on an actual destination rest rather than stopping wherever momentum died.
      scrub(director, gsap.globalTimeline.time(), 0.6);
      const rests = DESTINATIONS.map((d) => d.cameraZ);
      const nearest = rests.reduce((a, b) =>
        Math.abs(b - camera.position.z) < Math.abs(a - camera.position.z) ? b : a,
      );
      expect(camera.position.z).toBeCloseTo(nearest, 1);
    });

    it('settles toward the direction of travel, not backwards to where it came from', () => {
      // Scroll down (positive px) travels deeper: home (34) -> work (-26).
      director.feedScroll(400);
      director.update(1 / 60);
      clock += 150;
      director.update(1 / 60);
      scrub(director, gsap.globalTimeline.time(), 0.6);

      expect(camera.position.z).toBeCloseTo(DESTINATIONS[1].cameraZ, 1);
    });

    it('a fresh scroll during the settle takes back control', () => {
      director.feedScroll(300);
      director.update(1 / 60);
      clock += 150;
      director.update(1 / 60); // settling now

      director.feedScroll(300); // user grabs it again
      expect(director.getVelocity()).not.toBe(0);
      director.update(1 / 60);
      // Still travelling deeper rather than parked on the previous target.
      expect(camera.position.z).toBeLessThan(CAMERA_OFFSET);
    });
  });

  describe('cuts', () => {
    it('jumpTo lands x, y and z immediately with no residual magnet', () => {
      director.setPointer(1, 1);
      director.update(1 / 60); // let a magnet offset build
      director.jumpTo('about');

      expect(camera.position.x).toBe(0);
      expect(camera.position.y).toBe(0);
      expect(camera.position.z).toBeCloseTo(DESTINATIONS[2].cameraZ, 6);
    });

    it('jumpToFocus frames the tile exactly, with no update() tick needed', () => {
      director.setPointer(-1, -1);
      director.update(1 / 60);
      director.jumpToFocus({ x: -3.95, y: 2.65, z: -46 });

      expect(camera.position.x).toBeCloseTo(-3.95, 6);
      expect(camera.position.y).toBeCloseTo(2.65, 6);
      expect(camera.position.z).toBeCloseTo(-46, 6);
    });
  });

  describe('peek lean', () => {
    const FOCUS = { x: 3.95, y: 2.65, z: -46 };

    const landOnFocus = async (): Promise<void> => {
      const flight = director.flyToFocus(FOCUS);
      scrub(director, t0, FLIGHT_SETTLED_S);
      await flight;
    };

    it('offsets the camera without disturbing the focus target', async () => {
      await landOnFocus();

      const t = gsap.globalTimeline.time();
      director.peekTo(3.5, 0);
      scrub(director, t, 1.6); // past PEEK_S plus the elastic settle

      expect(camera.position.x).toBeCloseTo(FOCUS.x + 3.5, 1);
      expect(camera.position.y).toBeCloseTo(FOCUS.y, 1);
      // z is untouched by a peek — it is a lateral lean, not a flight
      expect(camera.position.z).toBeCloseTo(FOCUS.z, 3);
    });

    it('returns exactly to the focus position when cleared', async () => {
      await landOnFocus();
      const focusedX = camera.position.x;

      let t = gsap.globalTimeline.time();
      director.peekTo(3.5, 0);
      scrub(director, t, 1.6);

      t = gsap.globalTimeline.time();
      director.clearPeek();
      scrub(director, t, 1.6);

      expect(camera.position.x).toBeCloseTo(focusedX, 2);
    });

    it('a departure cancels a live peek rather than flying from a leaned camera', async () => {
      await landOnFocus();

      director.peekTo(3.5, 0);
      director.update(1 / 60);

      const t = gsap.globalTimeline.time();
      const away = director.flyTo('home');
      scrub(director, t, FLIGHT_SETTLED_S);
      await away;

      // Landed on the home axis, not 3.5 units off it.
      expect(camera.position.x).toBeCloseTo(0, 2);
    });

    it('cuts instead of tweening under reduced motion', () => {
      const c = makeCamera();
      const d = initCameraDirector(asCamera(c), DESTINATIONS, { now: () => clock, reducedMotion: true });
      d.peekTo(3.5, -2);
      d.update(1 / 60);
      expect(c.position.x).toBeCloseTo(3.5, 6);
      expect(c.position.y).toBeCloseTo(-2, 6);
      d.clearPeek();
      d.update(1 / 60);
      expect(c.position.x).toBeCloseTo(0, 6);
      d.destroy();
    });
  });
});

describe('setSuspended', () => {
  // Needed only by the peek-parking test below, which scrubs the global
  // timeline to put a peek tween mid-flight before suspending — see the
  // 'camera director' describe's identical comment for why sleeping the
  // ticker is what makes that deterministic.
  beforeAll(() => {
    gsap.ticker.sleep();
  });
  afterAll(() => {
    gsap.ticker.wake();
  });

  it('stops writing the camera so another controller can own it', () => {
    const camera = new THREE.PerspectiveCamera();
    const director = initCameraDirector(camera, DESTINATIONS, {});
    director.update(0.016);
    director.setSuspended(true);
    camera.position.set(1, 2, 3);
    director.feedScroll(500);
    director.update(0.016);
    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    director.destroy();
  });

  it('resumes from wherever it left off, without a jump', () => {
    const camera = new THREE.PerspectiveCamera();
    const director = initCameraDirector(camera, DESTINATIONS, {});
    director.jumpTo('about');
    const z = camera.position.z;
    director.setSuspended(true);
    director.update(0.016);
    director.setSuspended(false);
    director.update(0.016);
    expect(camera.position.z).toBeCloseTo(z, 6);
    director.destroy();
  });

  it('swallows scroll while suspended rather than banking momentum', () => {
    // Without this, every wheel event during the About scrub accumulates
    // velocity that fires the instant the corridor is exited.
    const camera = new THREE.PerspectiveCamera();
    const director = initCameraDirector(camera, DESTINATIONS, {});
    director.jumpTo('about');
    const z = camera.position.z;
    director.setSuspended(true);
    for (let i = 0; i < 40; i++) director.feedScroll(400);
    director.setSuspended(false);
    director.update(0.016);
    expect(camera.position.z).toBeCloseTo(z, 3);
    director.destroy();
  });

  it('parks a live peek so it does not reappear as a jump on resume', () => {
    const camera = new THREE.PerspectiveCamera();
    const director = initCameraDirector(camera, DESTINATIONS, {});
    director.jumpTo('about');
    const baseX = camera.position.x;
    const baseY = camera.position.y;

    director.peekTo(5, 3);
    // Put the peek tween mid-flight (non-zero) before suspending, so this
    // test actually exercises the parking rather than trivially passing
    // because the tween never got anywhere.
    const t = gsap.globalTimeline.time();
    gsap.globalTimeline.time(t + 0.3);
    director.update(0.016);
    expect(camera.position.x).not.toBeCloseTo(baseX, 3);

    director.setSuspended(true);
    director.setSuspended(false);
    director.update(0.016);

    expect(camera.position.x).toBeCloseTo(baseX, 6);
    expect(camera.position.y).toBeCloseTo(baseY, 6);
    director.destroy();
  });
});
