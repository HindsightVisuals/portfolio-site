/**
 * The ferrofluid itself — a black-chrome icosphere with the displacement patch.
 *
 * Ported from the verified `?lab=ferro` build, which Adam tuned and signed off
 * on 2026-08-21. The material is fixed by the blend file; the look values are
 * art direction. Neither is a knob to turn toward "correctness".
 *
 * GL shell — no unit tests. The field math it uses is tested in ferro-field.ts.
 */

import * as THREE from 'three';
import { FERRO_DEFAULTS, FERRO_GLSL } from './ferro-field';

export interface FerroObject {
  mesh: THREE.Mesh;
  /** The Blender Empty's position — drift moves this, not the mesh. */
  setOffset(x: number, y: number, z: number): void;
  setStrength(v: number): void;
  setTexScale(v: number): void;
  dispose(): void;
}

export function createFerroObject(): FerroObject {
  // IcosahedronGeometry, not SphereGeometry (poles bunch vertices) and not a
  // subdivided BoxGeometry (three has no subdiv — it stays a cube and
  // duplicates border verts). 20 * 65^2 = 84,500 triangles.
  const geometry = new THREE.IcosahedronGeometry(FERRO_DEFAULTS.radius, FERRO_DEFAULTS.detail);

  /**
   * The blend file's "Ferro" Principled BSDF, read off the live file:
   * Base Color linear 0.0371 (= sRGB #363636), Metallic 1, Roughness 0,
   * Coat Weight 0. Black chrome — a mirror, not glossy plastic.
   *
   * three's colour management takes the hex as sRGB and converts, which lands
   * back on 0.0369 linear. Do not "correct" this to a darker hex.
   */
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x363636,
    metalness: 1,
    roughness: 0,
    clearcoat: 0,
  });

  // Typed explicitly: FERRO_DEFAULTS is frozen, so its members narrow to literal
  // types and an inferred uniform would be `{ value: 1.05 }` — unassignable.
  const uniforms: {
    uEmpty: { value: THREE.Vector3 };
    uStrength: { value: number };
    uMidLevel: { value: number };
    uTexScale: { value: number };
    uRecalcNormals: { value: number };
  } = {
    uEmpty: { value: new THREE.Vector3(0, 0, 10) }, // the Blender Empty
    uStrength: { value: FERRO_DEFAULTS.strength },
    uMidLevel: { value: FERRO_DEFAULTS.midLevel },
    uTexScale: { value: FERRO_DEFAULTS.texScale },
    uRecalcNormals: { value: FERRO_DEFAULTS.recalcNormals ? 1 : 0 },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FERRO_GLSL}`)
      .replace(
        '#include <beginnormal_vertex>',
        'vec3 objectNormal = ferroNormal( position, normal );',
      )
      .replace(
        '#include <begin_vertex>',
        'vec3 transformed = position + normal * ferroDisp( position );',
      );
  };

  const mesh = new THREE.Mesh(geometry, material);
  // The displaced silhouette leaves the base sphere's bounds, and three would
  // otherwise frustum-cull the blob the moment its centre left the view.
  mesh.frustumCulled = false;

  return {
    mesh,
    setOffset(x, y, z) {
      uniforms.uEmpty.value.set(x, y, z);
    },
    setStrength(v) {
      uniforms.uStrength.value = v;
    },
    setTexScale(v) {
      uniforms.uTexScale.value = v;
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
