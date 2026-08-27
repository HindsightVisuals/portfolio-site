import * as THREE from 'three';
import { MOTIONLESS_MS } from './array-idle';

export interface PointerSample {
  /** Normalised device coords, -1..1. */
  x: number;
  y: number;
  movedAt: number;
}

/**
 * How far in front of the disc's centre the cursor floats, in world units,
 * measured along the camera's view axis.
 *
 * From the corridor scene: the `Cursor` sphere sits 3.607 from the camera and
 * the disc's centre 4.106, a flat offset of 0.4985 toward the viewer. So the
 * cursor is not ON the dish — it hovers just off its face, which is what lets
 * proximity open the panels rather than clipping through them.
 */
export const CURSOR_FRONT_OFFSET = 0.4985;

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
   * The cursor rides a plane perpendicular to the camera's view axis, sitting
   * `CURSOR_FRONT_OFFSET` in front of `anchor`. Two reasons it is a plane and
   * not the dish or a proxy sphere:
   *
   * - A SPHERE returns points on the hemisphere facing the camera, so screen
   *   centre maps to somewhere up and left on the dish and the mapping breaks
   *   down entirely near the silhouette. That was the original bug.
   * - The DISH ITSELF is oriented by the cursor (TRACK_TO), so raycasting it
   *   closes a feedback loop.
   *
   * A screen-aligned plane is linear in screen space, stable under the lean,
   * and never misses — off-dish positions are handled by proximity falloff
   * rather than by a raycast miss, which is what makes the edges smooth.
   *
   * Returns false only when there has been no pointer at all.
   */
  update(camera: THREE.Camera, anchor: THREE.Vector3, out: THREE.Vector3): boolean;
  lastMovedAt(): number;
  sample(): PointerSample | null;
  destroy(): void;
}

export function initArrayPointer(el: HTMLElement): ArrayPointer {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const camDir = new THREE.Vector3();
  const planePoint = new THREE.Vector3();
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
    update(camera, anchor, out) {
      if (!current) return false;

      camera.getWorldDirection(camDir);
      // The plane sits in front of the anchor, facing the camera.
      planePoint.copy(anchor).addScaledVector(camDir, -CURSOR_FRONT_OFFSET);
      plane.setFromNormalAndCoplanarPoint(camDir.clone().negate(), planePoint);

      ndc.set(current.x, current.y);
      ray.setFromCamera(ndc, camera);
      // Only fails if the ray is exactly parallel to the plane, which cannot
      // happen for a plane built from this camera's own direction.
      return ray.ray.intersectPlane(plane, out) !== null;
    },
    lastMovedAt: () => current?.movedAt ?? -Infinity,
    sample: () => current,
    destroy() {
      el.removeEventListener('pointermove', onMove);
    },
  };
}
