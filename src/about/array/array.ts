import * as THREE from 'three';
import { clusterIslandCentres } from './array-geometry';
import { DISC_NODES, getIslandAttribute, loadArray, rebuildHierarchy } from './array-load';
import { createIdleModel, updateIdle } from './array-idle';
import { makePanelMaterial } from './array-material';
import { initArrayPointer, isDisengaged, makeProxy } from './array-pointer';

/** Disc local radius, measured in Blender. Sizes the raycast proxy. */
const DISC_LOCAL_RADIUS = 1.611;

/** TRACK_TO influence on the dish, from the rig. */
const TRACK_INFLUENCE = 0.159;

/** Expected island counts — a wrong count means the clustering epsilon is off. */
const EXPECTED_ISLANDS: Record<string, number> = { Circle: 224, 'Circle.012': 256 };

export interface ArrayHandle {
  group: THREE.Group;
  update(dt: number): void;
  /**
   * Hand the panel shader the scene's three lights, in world space.
   *
   * The panels are Metallic 1 in a scene with no environment light, so their
   * entire read is specular — Three's own light uniforms are not available to
   * a raw ShaderMaterial, so they are passed explicitly.
   */
  setLights(positions: THREE.Vector3[], colours: THREE.Color[]): void;
  dispose(): void;
}

export async function initArray(opts: {
  el: HTMLElement;
  camera: THREE.PerspectiveCamera;
  reducedMotion: boolean;
}): Promise<ArrayHandle> {
  const { roots, meshes } = await loadArray();
  const group = new THREE.Group();
  const panel = makePanelMaterial();
  const dressing = new THREE.MeshStandardMaterial({
    color: 0x222222,
    metalness: 1,
    roughness: 0.5,
  });

  // Add the scene ROOTS, never the individual meshes. `group.add(mesh)` would
  // detach each one from its glTF parent and flatten the whole tree — which is
  // invisible at rest and then leaves the dish's children behind the moment it
  // leans.
  for (const root of roots) group.add(root);

  // The export is split across six files, so Blender baked world transforms
  // onto nodes whose parents live in another file. Put the tree back before
  // anything reads a transform.
  group.updateMatrixWorld(true);
  const missing = rebuildHierarchy(meshes);
  if (missing.length > 0) console.warn(`[array] unresolved parenting: ${missing.join(', ')}`);

  for (const [name, mesh] of meshes) {
    if (DISC_NODES.includes(name)) {
      const attr = getIslandAttribute(mesh.geometry, name);
      const { centres, count } = clusterIslandCentres(attr.array as Float32Array);
      mesh.geometry.setAttribute('aIslandC', new THREE.BufferAttribute(centres, 3));
      const expected = EXPECTED_ISLANDS[name];
      const ok = expected === undefined || count === expected;
      // Load-bearing check: every panel downstream is wrong if this is wrong.
      console[ok ? 'info' : 'warn'](
        `[array] ${name}: ${count} islands${ok ? '' : ` — EXPECTED ${expected}`}`,
      );
      mesh.material = panel.material;
    } else {
      mesh.material = dressing;
    }
  }

  const disc = meshes.get('Circle');
  if (!disc) throw new Error('array: Circle node not found');

  const proxy = makeProxy(DISC_LOCAL_RADIUS);
  disc.add(proxy);

  const pointer = initArrayPointer(opts.el, proxy);
  const idle = createIdleModel();

  // Hoisted — update() runs every frame and must not allocate.
  const cursorLocal = new THREE.Vector3();
  const cursorWorld = new THREE.Vector3();
  const discWorld = new THREE.Vector3();
  const lookMatrix = new THREE.Matrix4();
  const lookTarget = new THREE.Quaternion();
  const restQuat = disc.quaternion.clone();
  const camWorld = new THREE.Vector3();
  let time = 0;

  return {
    group,
    setLights(positions, colours) {
      panel.setLights(positions, colours);
    },
    update(dt: number): void {
      time += dt;
      const now = performance.now();

      panel.setCameraPos(opts.camera.getWorldPosition(camWorld));

      const hit = pointer.update(opts.camera, disc, cursorLocal);
      const disengaged = opts.reducedMotion || !hit || isDisengaged(pointer.sample(), now);

      updateIdle(idle, dt * 1000, disengaged);

      panel.setCursor(cursorLocal.x, cursorLocal.y, cursorLocal.z);
      panel.setCursorAmount(idle.cursor);
      panel.setAmbient(opts.reducedMotion ? 0 : idle.ambient);
      panel.setTime(time);

      // Soft TRACK_TO: the dish leans toward the cursor at 0.159, never fully.
      if (hit && !opts.reducedMotion) {
        cursorWorld.copy(cursorLocal);
        disc.localToWorld(cursorWorld);
        disc.getWorldPosition(discWorld);
        lookMatrix.lookAt(discWorld, cursorWorld, disc.up);
        lookTarget.setFromRotationMatrix(lookMatrix);
        disc.quaternion.copy(restQuat).slerp(lookTarget, TRACK_INFLUENCE * idle.cursor);
      }
    },
    dispose(): void {
      pointer.destroy();
      panel.dispose();
      dressing.dispose();
      group.clear();
    },
  };
}
