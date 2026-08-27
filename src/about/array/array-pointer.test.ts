// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CURSOR_FRONT_OFFSET, initArrayPointer, isDisengaged } from './array-pointer';

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

/** A camera at +z looking back at the origin, the way the lab frames the dish. */
function camAt(z: number): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  c.position.set(0, 0, z);
  c.lookAt(0, 0, 0);
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

describe('the cursor plane', () => {
  it('is false before any pointer movement', () => {
    const p = initArrayPointer(elWithBox(800, 600));
    expect(p.update(camAt(5), new THREE.Vector3(), new THREE.Vector3())).toBe(false);
    p.destroy();
  });

  it('puts screen centre at the anchor, not off to one side', () => {
    // The original bug: a sphere proxy returned points on the hemisphere facing
    // the camera, so centre-screen mapped to the upper left of the dish.
    const el = elWithBox(800, 600);
    const p = initArrayPointer(el);
    move(el, 400, 300);

    const out = new THREE.Vector3();
    expect(p.update(camAt(5), new THREE.Vector3(0, 0, 0), out)).toBe(true);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(0, 5);
    p.destroy();
  });

  it('sits the plane in front of the anchor, toward the camera', () => {
    const el = elWithBox(800, 600);
    const p = initArrayPointer(el);
    move(el, 400, 300);

    const out = new THREE.Vector3();
    p.update(camAt(5), new THREE.Vector3(0, 0, 0), out);
    expect(out.z).toBeCloseTo(CURSOR_FRONT_OFFSET, 5);
    p.destroy();
  });

  it('maps right-of-centre to +x and above-centre to +y', () => {
    const el = elWithBox(800, 600);
    const p = initArrayPointer(el);
    const out = new THREE.Vector3();
    const cam = camAt(5);

    move(el, 600, 300);
    p.update(cam, new THREE.Vector3(), out);
    expect(out.x).toBeGreaterThan(0);

    move(el, 400, 150);
    p.update(cam, new THREE.Vector3(), out);
    expect(out.y).toBeGreaterThan(0);
    p.destroy();
  });

  it('keeps hitting well outside the dish, so the edges cannot glitch', () => {
    // A plane never misses. Off-dish positions fall off through proximity
    // instead of through a raycast miss, which is what made the perimeter
    // jump when the target was a sphere.
    const el = elWithBox(800, 600);
    const p = initArrayPointer(el);
    const out = new THREE.Vector3();
    move(el, 799, 1);
    expect(p.update(camAt(5), new THREE.Vector3(), out)).toBe(true);
    expect(Number.isFinite(out.x)).toBe(true);
    p.destroy();
  });

  it('moves continuously across the frame — no jump at the silhouette', () => {
    const el = elWithBox(800, 600);
    const p = initArrayPointer(el);
    const cam = camAt(5);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const anchor = new THREE.Vector3();

    let prev: THREE.Vector3 | null = null;
    let maxStep = 0;
    for (let x = 0; x <= 800; x += 20) {
      move(el, x, 300);
      p.update(cam, anchor, a);
      if (prev) maxStep = Math.max(maxStep, a.distanceTo(prev));
      prev = b.copy(a).clone();
    }
    // Even steps across the whole width; a sphere would spike near the limb.
    expect(maxStep).toBeLessThan(0.5);
    p.destroy();
  });
});
