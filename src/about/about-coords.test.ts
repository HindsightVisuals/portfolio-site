import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BLENDER_TO_WORLD, blenderToWorld, pitchToQuaternion } from './about-coords';

describe('blenderToWorld', () => {
  it('maps Blender +Y (forward) onto Three -Z', () => {
    const v = blenderToWorld({ x: 0, y: 1, z: 0 });
    expect(v.x).toBeCloseTo(0, 10);
    expect(v.y).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(-BLENDER_TO_WORLD, 10);
  });

  it('maps Blender +Z (up) onto Three +Y', () => {
    const v = blenderToWorld({ x: 0, y: 0, z: 1 });
    expect(v.y).toBeCloseTo(BLENDER_TO_WORLD, 10);
    expect(v.z).toBeCloseTo(0, 10);
  });

  it('maps Blender +X onto Three +X', () => {
    expect(blenderToWorld({ x: 1, y: 0, z: 0 }).x).toBeCloseTo(BLENDER_TO_WORLD, 10);
  });

  it('scales at the rate the two independent derivations agree on', () => {
    // Home->Work marker span 34.61 Blender units against the site's 60-unit
    // SPACING gives 1.734; camera-to-wall 20.3 against CAMERA_OFFSET 34 gives
    // 1.678. See D1 in the plan. The constant sits between them.
    expect(BLENDER_TO_WORLD).toBeGreaterThan(1.67);
    expect(BLENDER_TO_WORLD).toBeLessThan(1.74);
  });
});

describe('pitchToQuaternion', () => {
  it('is identity at 90 degrees — Blender level is Three level', () => {
    // Blender's camera at pitch 90 looks along +Y; Three's default camera looks
    // along -Z. The axis map sends one to the other, so level is no rotation.
    const q = pitchToQuaternion(90);
    expect(q.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 10);
  });

  it('points the camera straight up at 180 degrees', () => {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(pitchToQuaternion(180));
    expect(dir.x).toBeCloseTo(0, 6);
    expect(dir.y).toBeCloseTo(1, 6);
    expect(dir.z).toBeCloseTo(0, 6);
  });

  it('is a pure X rotation — the flow has no yaw and no roll', () => {
    const e = new THREE.Euler().setFromQuaternion(pitchToQuaternion(105.3), 'XYZ');
    expect(e.y).toBeCloseTo(0, 10);
    expect(e.z).toBeCloseTo(0, 10);
    expect(THREE.MathUtils.radToDeg(e.x)).toBeCloseTo(15.3, 6);
  });
});
