import * as THREE from 'three';
import { MOTIONLESS_MS } from './array-idle';

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

/**
 * The raycast target.
 *
 * NOT the disc itself: the disc's orientation is driven by the cursor
 * (TRACK_TO at influence 0.159), so raycasting it would close a feedback loop.
 * A static proxy in the disc's local space lags by one frame, which at that
 * influence is imperceptible and unconditionally stable.
 */
export function makeProxy(radius: number): THREE.Mesh {
  const proxy = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 16),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  proxy.visible = false;
  return proxy;
}

export interface ArrayPointer {
  /**
   * Write the cursor position, in WORLD space, into `out`.
   * Returns false when the pointer misses the proxy entirely.
   *
   * World, not disc-local: more than one mesh runs the panel shader and each
   * has its own local space, so the conversion has to happen per mesh at the
   * call site rather than once here.
   */
  update(camera: THREE.Camera, out: THREE.Vector3): boolean;
  lastMovedAt(): number;
  sample(): PointerSample | null;
  destroy(): void;
}

export function initArrayPointer(el: HTMLElement, proxy: THREE.Mesh): ArrayPointer {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let current: PointerSample | null = null;
  const hits: THREE.Intersection[] = [];

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
    update(camera, out) {
      if (!current) return false;
      ndc.set(current.x, current.y);
      ray.setFromCamera(ndc, camera);
      hits.length = 0;
      // Raycast the proxy DIRECTLY — Three skips invisible objects during
      // scene traversal, so intersectObjects would never see it.
      proxy.updateMatrixWorld(true);
      proxy.raycast(ray, hits);
      if (hits.length === 0) return false;
      out.copy(hits[0].point);
      return true;
    },
    lastMovedAt: () => current?.movedAt ?? -Infinity,
    sample: () => current,
    destroy() {
      el.removeEventListener('pointermove', onMove);
    },
  };
}
