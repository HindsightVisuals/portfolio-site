import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { isDisengaged, makeProxy } from './array-pointer';

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

describe('makeProxy', () => {
  it('is invisible', () => {
    const p = makeProxy(1.6);
    expect(p.visible).toBe(false);
    expect(p.geometry).toBeInstanceOf(THREE.SphereGeometry);
  });

  it('stays raycastable despite being invisible', () => {
    // Three skips invisible objects in Raycaster.intersectObjects, so the proxy
    // must be raycast directly rather than relied on via scene traversal.
    const p = makeProxy(1.6);
    p.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
    const hits: THREE.Intersection[] = [];
    p.raycast(ray, hits);
    expect(hits.length).toBeGreaterThan(0);
  });
});
