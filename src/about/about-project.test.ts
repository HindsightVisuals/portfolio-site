import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAMERA_FOV } from '../three/world';
import { projectToRect } from './about-project';

const VP = { w: 1000, h: 800 };

const cam = (): THREE.PerspectiveCamera => {
  const c = new THREE.PerspectiveCamera(CAMERA_FOV, VP.w / VP.h, 0.1, 500);
  c.position.set(0, 0, 0);
  c.updateMatrixWorld(true);
  return c;
};

describe('projectToRect', () => {
  it('puts a point straight ahead at the centre of the viewport', () => {
    const r = projectToRect(new THREE.Vector3(0, 0, -10), 0.49, cam(), VP)!;
    expect(r.x + r.w / 2).toBeCloseTo(VP.w / 2, 4);
    expect(r.y + r.h / 2).toBeCloseTo(VP.h / 2, 4);
  });

  it('grows as the point approaches', () => {
    const far = projectToRect(new THREE.Vector3(0, 0, -20), 0.49, cam(), VP)!;
    const near = projectToRect(new THREE.Vector3(0, 0, -5), 0.49, cam(), VP)!;
    expect(near.w).toBeGreaterThan(far.w);
    // Apparent size is inverse in distance: 4x closer is 4x bigger.
    expect(near.w / far.w).toBeCloseTo(4, 1);
  });

  it('is square — the blob is round, so one dimension governs', () => {
    const r = projectToRect(new THREE.Vector3(0, 0, -10), 0.49, cam(), VP)!;
    expect(r.w).toBeCloseTo(r.h, 10);
  });

  it('moves right when the point moves right, and DOWN when the point moves up', () => {
    // Screen y grows downward; world y grows up. Getting this backwards is the
    // classic projection bug and it looks plausible until you scroll.
    const c = cam();
    const base = projectToRect(new THREE.Vector3(0, 0, -10), 0.49, c, VP)!;
    const right = projectToRect(new THREE.Vector3(2, 0, -10), 0.49, c, VP)!;
    const up = projectToRect(new THREE.Vector3(0, 2, -10), 0.49, c, VP)!;
    expect(right.x).toBeGreaterThan(base.x);
    expect(up.y).toBeLessThan(base.y);
  });

  it('returns null for a point behind the camera', () => {
    expect(projectToRect(new THREE.Vector3(0, 0, 10), 0.49, cam(), VP)).toBeNull();
  });

  it('returns null for a degenerate viewport rather than Infinity', () => {
    expect(projectToRect(new THREE.Vector3(0, 0, -10), 0.49, cam(), { w: 0, h: 0 })).toBeNull();
  });
});
