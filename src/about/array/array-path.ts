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

const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

/**
 * Read the ring from a loaded `Displacement Path` node, in place.
 *
 * glTF has no curve type, so the path exports as a bare transform: position is
 * the centre, uniform scale is the radius, and the node's local +Y is the
 * plane normal. Reconstructing the circle from those three is exact, because
 * the source curve is a Blender Bézier circle of unit radius.
 *
 * Re-read every frame rather than cached, because the path is parented to the
 * dish and therefore rides its lean.
 */
export function updateRingFromNode(node: THREE.Object3D, ring: DisplacementRing): DisplacementRing {
  node.updateWorldMatrix(true, false);
  node.matrixWorld.decompose(ring.centre, _quat, _scale);
  ring.normal.set(0, 1, 0).applyQuaternion(_quat).normalize();
  ring.radius = (Math.abs(_scale.x) + Math.abs(_scale.y) + Math.abs(_scale.z)) / 3;
  return ring;
}

/** A fresh ring read from `node`. */
export function ringFromNode(node: THREE.Object3D): DisplacementRing {
  return updateRingFromNode(node, {
    centre: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 1, 0),
    radius: 1,
  });
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
export function ringPointAt(
  ring: DisplacementRing,
  angle: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const { u, v } = ringBasis(ring);
  return out
    .copy(ring.centre)
    .addScaledVector(u, Math.cos(angle) * ring.radius)
    .addScaledVector(v, Math.sin(angle) * ring.radius);
}

/**
 * A unit ring in the path node's OWN local space, for `?debug-path`.
 *
 * Drawn locally and parented to the path node so it rides the dish's lean for
 * free. A world-space helper would have to be rebuilt every frame, and would
 * drift out of step with the ring it is supposed to be showing.
 *
 * The node's local +Y is the plane normal, so the circle lies in local XZ, and
 * the node's own uniform scale supplies the radius.
 */
export function makeRingHelper(segments = 128): THREE.Line {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x61e891, transparent: true, opacity: 0.7 }),
  );
}

/**
 * Debug shells showing what the cursor actually reaches.
 *
 * The cursor is a sphere of `radius`, but the effect it drives extends well
 * past its surface: the emission halo dies `glowRadius` beyond it, and panels
 * stop moving `explodeFar` beyond it. Drawing only the sphere makes the effect
 * look mysteriously large, so all three shells are drawn.
 *
 * Distances arrive in WORLD units; the caller converts from the disc's local
 * space, where the thresholds are defined.
 */
export function makeCursorHelper(
  radius: number,
  glowRadius: number,
  explodeFar: number,
): THREE.Group {
  const g = new THREE.Group();
  const shell = (r: number, colour: number, opacity: number, segs: number): THREE.Mesh =>
    new THREE.Mesh(
      new THREE.SphereGeometry(r, segs, segs),
      new THREE.MeshBasicMaterial({
        color: colour,
        wireframe: true,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    );

  g.add(shell(radius, 0x61e891, 0.95, 16));
  g.add(shell(radius + glowRadius, 0x61e891, 0.3, 12));
  g.add(shell(radius + explodeFar, 0xffffff, 0.12, 10));
  return g;
}
