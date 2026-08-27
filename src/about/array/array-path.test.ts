import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeRingHelper, projectOntoRing, ringFromNode, type DisplacementRing } from './array-path';

/** The measured ring from array-displacementPathAndCursor.glb. */
const MEASURED: DisplacementRing = {
  centre: new THREE.Vector3(0.1474, 0.8736, -0.0549),
  normal: new THREE.Vector3(0.341, 0.543, 0.767).normalize(),
  radius: 0.6001,
};

describe('ringFromNode', () => {
  it('reads centre, radius and plane from a bare transform', () => {
    // glTF has no curve type, so the path exports as position + uniform scale +
    // rotation. That is enough, because the source is a unit Bezier circle.
    const node = new THREE.Object3D();
    node.position.set(0.1474, 0.8736, -0.0549);
    node.scale.setScalar(0.6001);
    node.quaternion.set(0.4727, 0.2333, -0.0713, 0.8468).normalize();

    const ring = ringFromNode(node);
    expect(ring.centre.x).toBeCloseTo(0.1474, 4);
    expect(ring.radius).toBeCloseTo(0.6001, 4);
    // The path node shares the disc's rotation, so its +Y is the dish's face
    // normal — measured as (0.341, 0.543, 0.767).
    expect(ring.normal.x).toBeCloseTo(0.341, 2);
    expect(ring.normal.y).toBeCloseTo(0.543, 2);
    expect(ring.normal.z).toBeCloseTo(0.767, 2);
  });

  it('survives a parent transform', () => {
    const parent = new THREE.Object3D();
    parent.position.set(1, 2, 3);
    const node = new THREE.Object3D();
    node.scale.setScalar(0.5);
    parent.add(node);
    parent.updateMatrixWorld(true);

    const ring = ringFromNode(node);
    expect(ring.centre.toArray()).toEqual([1, 2, 3]);
    expect(ring.radius).toBeCloseTo(0.5, 5);
  });
});

describe('projectOntoRing', () => {
  it('lands exactly on the circle, whatever the input distance', () => {
    const out = new THREE.Vector3();
    for (const scale of [0.05, 1, 40]) {
      const p = new THREE.Vector3(1, 0, 0)
        .addScaledVector(MEASURED.normal, -1 * new THREE.Vector3(1, 0, 0).dot(MEASURED.normal))
        .normalize()
        .multiplyScalar(scale)
        .add(MEASURED.centre);
      expect(projectOntoRing(p, MEASURED, out)).toBe(true);
      expect(out.distanceTo(MEASURED.centre)).toBeCloseTo(MEASURED.radius, 5);
    }
  });

  it('stays in the ring plane', () => {
    const out = new THREE.Vector3();
    // A point well off the plane still projects into it.
    const p = new THREE.Vector3()
      .copy(MEASURED.centre)
      .addScaledVector(MEASURED.normal, 5)
      .add(new THREE.Vector3(0.3, 0, 0));
    projectOntoRing(p, MEASURED, out);
    const height = out.clone().sub(MEASURED.centre).dot(MEASURED.normal);
    expect(height).toBeCloseTo(0, 5);
  });

  it('keeps the bearing — moving toward the centre does not move the cursor', () => {
    // This is the whole point of the constraint: the pointer chooses WHERE ON
    // the ring, and radial distance is ignored.
    const near = new THREE.Vector3();
    const far = new THREE.Vector3();
    const dir = new THREE.Vector3(1, 0, 0)
      .addScaledVector(MEASURED.normal, -new THREE.Vector3(1, 0, 0).dot(MEASURED.normal))
      .normalize();

    projectOntoRing(MEASURED.centre.clone().addScaledVector(dir, 0.1), MEASURED, near);
    projectOntoRing(MEASURED.centre.clone().addScaledVector(dir, 9), MEASURED, far);
    expect(near.distanceTo(far)).toBeCloseTo(0, 5);
  });

  it('sweeps around the ring as the bearing sweeps', () => {
    const u = new THREE.Vector3(1, 0, 0)
      .addScaledVector(MEASURED.normal, -new THREE.Vector3(1, 0, 0).dot(MEASURED.normal))
      .normalize();
    const v = new THREE.Vector3().crossVectors(MEASURED.normal, u).normalize();
    const out = new THREE.Vector3();
    const seen: THREE.Vector3[] = [];

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const p = MEASURED.centre
        .clone()
        .addScaledVector(u, Math.cos(a))
        .addScaledVector(v, Math.sin(a));
      projectOntoRing(p, MEASURED, out);
      seen.push(out.clone());
    }
    // Four distinct quarter-turn positions, each on the circle.
    expect(seen[0].distanceTo(seen[2])).toBeCloseTo(MEASURED.radius * 2, 4);
    expect(seen[1].distanceTo(seen[3])).toBeCloseTo(MEASURED.radius * 2, 4);
  });

  it('reports failure at the centre instead of jumping', () => {
    const out = new THREE.Vector3();
    expect(projectOntoRing(MEASURED.centre.clone(), MEASURED, out)).toBe(false);
  });
});

describe('makeRingHelper', () => {
  it('draws a closed circle in the ring plane', () => {
    const line = makeRingHelper(MEASURED, 64);
    const pos = line.geometry.getAttribute('position');
    expect(pos.count).toBe(65); // closed: last point repeats the first

    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      expect(p.distanceTo(MEASURED.centre)).toBeCloseTo(MEASURED.radius, 4);
      expect(p.clone().sub(MEASURED.centre).dot(MEASURED.normal)).toBeCloseTo(0, 4);
    }
  });

  it('picks a valid in-plane basis even when the normal is +X', () => {
    const ring: DisplacementRing = {
      centre: new THREE.Vector3(),
      normal: new THREE.Vector3(1, 0, 0),
      radius: 1,
    };
    const pos = makeRingHelper(ring, 8).geometry.getAttribute('position');
    const p = new THREE.Vector3().fromBufferAttribute(pos, 0);
    expect(Number.isNaN(p.x)).toBe(false);
    expect(p.length()).toBeCloseTo(1, 5);
  });
});
