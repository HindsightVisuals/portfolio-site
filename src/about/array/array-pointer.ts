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
   * The cursor rides a plane PARALLEL TO THE DISH'S FACE, sitting
   * `CURSOR_FRONT_OFFSET` above it — the same thing as sliding the `Cursor`
   * sphere across the dish in Blender, which is what the rig does.
   *
   * The plane must be dish-aligned, not screen-aligned. The dish is tilted, so
   * a view-perpendicular plane cuts THROUGH it: the panels nearest that plane
   * form a band across the dish instead of a pool under the pointer, and the
   * effect stops following the mouse.
   *
   * `faceNormal` is the dish's REST normal, never its current one. The dish is
   * oriented by the cursor (TRACK_TO), so feeding back its live orientation
   * closes a loop; at an influence of 0.159 the rest normal is close enough
   * that the difference is invisible, and it is unconditionally stable.
   *
   * A plane also never misses, so leaving the dish falls off through proximity
   * rather than through a raycast miss — which is what made the perimeter
   * glitchy when the target was a sphere.
   *
   * Returns false only when there has been no pointer at all.
   */
  update(
    camera: THREE.Camera,
    anchor: THREE.Vector3,
    faceNormal: THREE.Vector3,
    out: THREE.Vector3,
  ): boolean;
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
    update(camera, anchor, faceNormal, out) {
      if (!current) return false;

      // Face the plane's normal toward the camera, so the offset lifts the
      // cursor onto the viewer's side of the dish whichever way it points.
      camera.getWorldPosition(camPos);
      normal.copy(faceNormal).normalize();
      if (normal.dot(camPos.clone().sub(anchor)) < 0) normal.negate();

      planePoint.copy(anchor).addScaledVector(normal, CURSOR_FRONT_OFFSET);
      plane.setFromNormalAndCoplanarPoint(normal, planePoint);

      ndc.set(current.x, current.y);
      ray.setFromCamera(ndc, camera);
      // Misses only when the view grazes the dish edge-on, where there is no
      // sensible answer anyway; the caller treats that as no cursor.
      return ray.ray.intersectPlane(plane, out) !== null;
    },
    lastMovedAt: () => current?.movedAt ?? -Infinity,
    sample: () => current,
    destroy() {
      el.removeEventListener('pointermove', onMove);
    },
  };
}
