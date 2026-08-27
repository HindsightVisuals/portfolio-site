import * as THREE from 'three';
import { MOTIONLESS_MS } from './array-idle';
import { projectOntoRing, ringPointAt, type DisplacementRing } from './array-path';

export interface PointerSample {
  /** Normalised device coords, -1..1. */
  x: number;
  y: number;
  movedAt: number;
}

/**
 * Disengaged is far OR motionless — a pointer parked on the dish and one that
 * has left get the same silence-then-breathe treatment.
 */
export function isDisengaged(
  sample: PointerSample | null,
  now: number,
  motionlessMs: number = MOTIONLESS_MS,
): boolean {
  if (!sample) return true;
  return now - sample.movedAt >= motionlessMs;
}

export interface ArrayPointer {
  /**
   * Write the cursor position, in WORLD space, into `out`.
   *
   * The cursor is CONFINED TO THE RING, matching the rig: in Blender the
   * `Cursor` sphere carries a FOLLOW_PATH constraint onto the displacement
   * path and cannot leave it. The pointer therefore chooses a BEARING around
   * the ring, not a free position — which is what makes the displaced region
   * controllable rather than wherever the mouse happens to land.
   *
   * The ring's plane is the dish's face plane, so the pointer maps linearly
   * across a tilted dish. It is the dish's REST plane, never its live one: the
   * dish is oriented by the cursor, so feeding its live orientation back would
   * close a loop.
   *
   * Returns false only when there has been no pointer at all, or when the ray
   * grazes the ring plane edge-on.
   */
  update(camera: THREE.Camera, ring: DisplacementRing, out: THREE.Vector3): boolean;
  lastMovedAt(): number;
  sample(): PointerSample | null;
  destroy(): void;
}

export function initArrayPointer(el: HTMLElement): ArrayPointer {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const planePoint = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const last = new THREE.Vector3();
  let hasLast = false;
  let current: PointerSample | null = null;

  const onMove = (e: PointerEvent): void => {
    const r = el.getBoundingClientRect();
    current = {
      x: ((e.clientX - r.left) / r.width) * 2 - 1,
      y: -(((e.clientY - r.top) / r.height) * 2 - 1),
      movedAt: performance.now(),
    };
  };
  el.addEventListener('pointermove', onMove, { passive: true });

  return {
    update(camera, ring, out) {
      if (!current) return false;

      // Raycast the ring's own plane, then slide the hit onto the circle. The
      // plane is the dish's face plane, so a tilted dish maps linearly; the
      // projection is what confines the cursor to the path.
      normal.copy(ring.normal);
      camera.getWorldPosition(camPos);
      if (normal.dot(camPos.clone().sub(ring.centre)) < 0) normal.negate();
      plane.setFromNormalAndCoplanarPoint(normal, ring.centre);

      ndc.set(current.x, current.y);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, planePoint)) return false;

      // At the exact centre the bearing is undefined — which the very first
      // frame hits routinely, since screen centre maps straight to the ring's
      // centre. Hold the last position, or pick a deterministic one if there
      // is not one yet.
      if (!projectOntoRing(planePoint, ring, out)) {
        if (hasLast) out.copy(last);
        else ringPointAt(ring, 0, out);
        return true;
      }
      last.copy(out);
      hasLast = true;
      return true;
    },
    lastMovedAt: () => current?.movedAt ?? -Infinity,
    sample: () => current,
    destroy() {
      el.removeEventListener('pointermove', onMove);
    },
  };
}
