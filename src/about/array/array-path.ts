import * as THREE from 'three';

/**
 * The ring the cursor is confined to — Blender's `Displacement Path`.
 *
 * In the rig the `Cursor` sphere carries a FOLLOW_PATH constraint onto a cyclic
 * Bézier circle, so it cannot leave that ring. The web version has to do the
 * same: the pointer chooses WHERE ON THE RING the cursor sits, not a free
 * position on the dish. That is what makes the displaced region controllable
 * instead of wherever the mouse happens to be.
 *
 * Measured from `array-displacementPathAndCursor.glb`: the path node carries the
 * SAME rotation quaternion as the disc, so the ring is parallel to the dish's
 * face, floating in front of it. Sampled in the disc's local space, all 48
 * points sit at a constant depth — it really is a flat circle, not a spiral.
 */
export interface DisplacementRing {
  /** World-space centre. */
  centre: THREE.Vector3;
  /** Unit normal of the ring's plane — the dish's face normal. */
  normal: THREE.Vector3;
  radius: number;
}

/**
 * Read the ring from a loaded `Displacement Path` node.
 *
 * glTF has no curve type, so the path exports as a bare transform: position is
 * the centre, uniform scale is the radius, and the node's local +Y is the
 * plane normal. Reconstructing the circle from those three is exact, because
 * the source curve is a Blender Bézier circle of unit radius.
 */
export function ringFromNode(node: THREE.Object3D): DisplacementRing {
  node.updateWorldMatrix(true, false);
  const centre = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  node.matrixWorld.decompose(centre, quat, scale);

  return {
    centre,
    normal: new THREE.Vector3(0, 1, 0).applyQuaternion(quat).normalize(),
    radius: (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3,
  };
}

/**
 * Put `point` onto the ring, writing the result into `out`.
 *
 * The pointer's position on the ring's plane gives a DIRECTION from the ring's
 * centre; the cursor sits at that bearing, always exactly on the circle. So
 * sweeping the mouse around the dish walks the displacement around the ring,
 * and moving toward or away from the centre does nothing — which is the whole
 * point of constraining it.
 *
 * Returns false when `point` is degenerately close to the centre, where the
 * bearing is undefined. The caller should hold the previous position rather
 * than let the cursor jump.
 */
export function projectOntoRing(
  point: THREE.Vector3,
  ring: DisplacementRing,
  out: THREE.Vector3,
  epsilon = 1e-5,
): boolean {
  out.subVectors(point, ring.centre);
  // Flatten into the ring's plane. A pointer hit is already coplanar, but a
  // caller passing an arbitrary point should still get a sensible bearing.
  out.addScaledVector(ring.normal, -out.dot(ring.normal));

  const len = out.length();
  if (len < epsilon) {
    out.copy(ring.centre);
    return false;
  }

  out.multiplyScalar(ring.radius / len).add(ring.centre);
  return true;
}

/**
 * Two perpendicular axes spanning the ring's plane.
 *
 * Derived from the normal rather than assuming an up vector, which would be
 * degenerate whenever the ring happens to face that way.
 */
export function ringBasis(ring: DisplacementRing): { u: THREE.Vector3; v: THREE.Vector3 } {
  const u = new THREE.Vector3(1, 0, 0);
  if (Math.abs(u.dot(ring.normal)) > 0.9) u.set(0, 1, 0);
  u.addScaledVector(ring.normal, -u.dot(ring.normal)).normalize();
  return { u, v: new THREE.Vector3().crossVectors(ring.normal, u).normalize() };
}

/**
 * A deterministic point on the ring at `angle` radians.
 *
 * Gives the pointer somewhere sensible to sit before it has ever resolved a
 * bearing — the very first frame can land dead on the ring's centre, where the
 * bearing is undefined and there is no previous position to hold.
 */
export function ringPointAt(ring: DisplacementRing, angle: number, out: THREE.Vector3): THREE.Vector3 {
  const { u, v } = ringBasis(ring);
  return out
    .copy(ring.centre)
    .addScaledVector(u, Math.cos(angle) * ring.radius)
    .addScaledVector(v, Math.sin(angle) * ring.radius);
}

/** A thin ring for `?debug-path`, so the constraint can be seen rather than inferred. */
export function makeRingHelper(ring: DisplacementRing, segments = 128): THREE.Line {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    pts.push(ringPointAt(ring, (i / segments) * Math.PI * 2, new THREE.Vector3()));
  }

  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x61e891 }),
  );
}
