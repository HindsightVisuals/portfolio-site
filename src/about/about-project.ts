import * as THREE from 'three';
import { worldPerPx } from '../three/framing';

/**
 * Where a world-space sphere lands on screen, as a CSS rect.
 *
 * This is what lets the ferro travel through the world without being in it.
 * The blob renders on its own canvas with its own fixed camera, and `placeAt`
 * positions it by CSS rect — so a rect is all the corridor has to produce. Feed
 * it the projection of a world point and the blob appears to occupy that point:
 * it moves as the camera moves, and it grows as the camera closes, because the
 * projection does both.
 *
 * Returns null rather than a rect when there is nothing sensible to draw — the
 * point is behind the camera, or the viewport has no size yet. A mirrored ghost
 * behind the viewer is the failure mode this exists to prevent.
 *
 * PRECONDITION: the camera's world matrix must already be up to date for the
 * pose you want to project through. `world.project(camera)` consumes
 * `camera.matrixWorldInverse`, which nothing refreshes on its own —
 * WebGLRenderer.render() updates it, but that happens on the NEXT rAF, after
 * the corridor has written this frame's pose. Getting this wrong is not merely
 * one frame late, it is internally INCONSISTENT: `depth` below is read
 * straight off the fresh `camera.position`/`camera.quaternion`, so the blob's
 * SIZE would come from this frame and its POSITION from the last one. Callers
 * must call `camera.updateMatrixWorld()` first (about-presentation.ts's apply() does).
 */
export function projectToRect(
  world: THREE.Vector3,
  radius: number,
  camera: THREE.PerspectiveCamera,
  viewport: { w: number; h: number },
): { x: number; y: number; w: number; h: number } | null {
  if (!(viewport.w > 0) || !(viewport.h > 0)) return null;

  // Distance along the camera's own forward axis, not straight-line distance:
  // apparent size depends on depth in view space, and a point far off to the
  // side is further away without being any deeper.
  const toPoint = world.clone().sub(camera.position);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const depth = toPoint.dot(forward);
  if (depth <= 0) return null; // behind the camera

  const ndc = world.clone().project(camera);
  const cx = (ndc.x * 0.5 + 0.5) * viewport.w;
  // Screen y grows downward, NDC y grows up.
  const cy = (-ndc.y * 0.5 + 0.5) * viewport.h;

  const wpp = worldPerPx(depth, camera.fov, viewport.h);
  if (!(wpp > 0)) return null;
  const side = (2 * radius) / wpp;

  return { x: cx - side / 2, y: cy - side / 2, w: side, h: side };
}
