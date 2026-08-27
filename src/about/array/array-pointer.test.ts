// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { initArrayPointer, isDisengaged } from './array-pointer';

describe('isDisengaged', () => {
  it('is true when there has never been a pointer', () => {
    expect(isDisengaged(null, 1000)).toBe(true);
  });

  it('is false right after a move', () => {
    expect(isDisengaged({ x: 0, y: 0, movedAt: 900 }, 1000, 2000)).toBe(false);
  });

  it('is true once the pointer has been motionless past the threshold', () => {
    expect(isDisengaged({ x: 0, y: 0, movedAt: 0 }, 2500, 2000)).toBe(true);
  });

  it('treats exactly-at-threshold as disengaged', () => {
    expect(isDisengaged({ x: 0, y: 0, movedAt: 0 }, 2000, 2000)).toBe(true);
  });
});

/** The measured ring, so the tests exercise the real geometry. */
const RING = {
  centre: new THREE.Vector3(0.1474, 0.8736, -0.0549),
  normal: new THREE.Vector3(0.341, 0.543, 0.767).normalize(),
  radius: 0.6001,
};

/** A camera looking at the ring from along its own normal. */
function camFacingRing(distance = 5): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  c.position.copy(RING.centre).addScaledVector(RING.normal, distance);
  c.lookAt(RING.centre);
  c.updateMatrixWorld(true);
  return c;
}

function move(el: HTMLElement, clientX: number, clientY: number): void {
  el.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY, bubbles: true }));
}

/** jsdom gives every element a zero box, so the rect has to be stubbed. */
function elWithBox(w: number, h: number): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0 }) as DOMRect;
  return el;
}

describe('the cursor is confined to the ring', () => {
  it('is false before any pointer movement', () => {
    const p = initArrayPointer(elWithBox(800, 600));
    expect(p.update(camFacingRing(), RING, new THREE.Vector3())).toBe(false);
    p.destroy();
  });

  it('always lands exactly on the ring, wherever the pointer is', () => {
    const el = elWithBox(800, 600);
    const p = initArrayPointer(el);
    const cam = camFacingRing();
    const out = new THREE.Vector3();

    // Not [400, 300]: dead centre maps to the ring's centre, where the
    // bearing is undefined — covered by its own test below.
    for (const [cx, cy] of [
      [560, 220],
      [120, 500],
      [799, 1],
    ]) {
      move(el, cx, cy);
      expect(p.update(cam, RING, out)).toBe(true);
      expect(out.distanceTo(RING.centre)).toBeCloseTo(RING.radius, 4);
      // and in the ring's plane
      expect(out.clone().sub(RING.centre).dot(RING.normal)).toBeCloseTo(0, 4);
    }
    p.destroy();
  });

  it('sweeps around the ring as the pointer sweeps around the centre', () => {
    const el = elWithBox(800, 600);
    const p = initArrayPointer(el);
    const cam = camFacingRing();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();

    move(el, 700, 300);
    p.update(cam, RING, a);
    move(el, 100, 300);
    p.update(cam, RING, b);
    // Opposite sides of the frame put the cursor on opposite sides of the ring.
    expect(a.distanceTo(b)).toBeCloseTo(RING.radius * 2, 3);
    p.destroy();
  });

  it('ignores radial distance — only the bearing matters', () => {
    const el = elWithBox(800, 600);
    const p = initArrayPointer(el);
    const cam = camFacingRing();
    const near = new THREE.Vector3();
    const far = new THREE.Vector3();

    // Two points on the same bearing from frame centre, different radii.
    move(el, 500, 300);
    p.update(cam, RING, near);
    move(el, 780, 300);
    p.update(cam, RING, far);
    expect(near.distanceTo(far)).toBeCloseTo(0, 4);
    p.destroy();
  });

  it('sits on the ring even if the FIRST frame lands dead centre', () => {
    // Screen centre maps straight to the ring centre, so this is the common
    // case on load, not an edge case. Without a seeded fallback the cursor
    // starts at the origin.
    const el = elWithBox(800, 600);
    const p = initArrayPointer(el);
    const out = new THREE.Vector3();
    move(el, 400, 300);
    expect(p.update(camFacingRing(), RING, out)).toBe(true);
    expect(out.distanceTo(RING.centre)).toBeCloseTo(RING.radius, 4);
    p.destroy();
  });

  it('holds the last position at the exact centre rather than jumping', () => {
    const el = elWithBox(800, 600);
    const p = initArrayPointer(el);
    const cam = camFacingRing();
    const edge = new THREE.Vector3();
    const centre = new THREE.Vector3();

    move(el, 700, 300);
    p.update(cam, RING, edge);
    move(el, 400, 300); // dead centre — bearing undefined
    expect(p.update(cam, RING, centre)).toBe(true);
    expect(centre.distanceTo(edge)).toBeCloseTo(0, 4);
    p.destroy();
  });
});
