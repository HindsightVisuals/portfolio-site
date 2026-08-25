import * as THREE from 'three';

/**
 * Blender units → world units.
 *
 * Two independent derivations, documented because they disagree by ~3% and the
 * value is therefore a judgement, not a measurement:
 *
 *   - The Home and Work markers span 34.61 Blender units. The site spaces those
 *     same two destinations SPACING = 60 apart. 60 / 34.61 = 1.734.
 *   - The Work camera sits ~20.3 Blender units from the Work wall. The site's
 *     camera sits CAMERA_OFFSET = 34 from its screens. 34 / 20.3 = 1.678.
 *
 * 1.70 splits them. Retune here — nothing else in the codebase knows the rate.
 *
 * Note what this constant does NOT do: it does not place the About beats in the
 * world. Blender's absolute positions are discarded (see D1); only offsets from
 * the anchor marker survive the conversion.
 */
export const BLENDER_TO_WORLD = 1.7;

export interface BlenderVec { x: number; y: number; z: number }

/**
 * Blender is Z-up and films along +Y; Three is Y-up and films along -Z.
 * So: Blender +Y → Three -Z, Blender +Z → Three +Y, Blender +X → Three +X.
 */
export function blenderToWorld(b: BlenderVec): THREE.Vector3 {
  return new THREE.Vector3(
    b.x * BLENDER_TO_WORLD,
    b.z * BLENDER_TO_WORLD,
    -b.y * BLENDER_TO_WORLD,
  );
}

/**
 * The flow's camera has pitch and nothing else — the inventory records no yaw
 * and no roll at any of the nine markers, and every marker sits at x = 0. So a
 * single rotation about X carries the whole orientation.
 *
 * Blender pitch 90 is level. Under the axis map above, level in Blender is
 * already level in Three, so 90 must produce the identity — hence the -90.
 */
export function pitchToQuaternion(pitchDeg: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(THREE.MathUtils.degToRad(pitchDeg - 90), 0, 0, 'XYZ'),
  );
}
