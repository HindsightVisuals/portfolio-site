import * as THREE from 'three';
import { clusterIslandCentres } from './array-geometry';
import { DISC_NODES, getIslandAttribute, loadArray, rebuildHierarchy } from './array-load';
import { createIdleModel, updateIdle } from './array-idle';
import { makePanelMaterial, type PanelMaterialHandle } from './array-material';
import { initArrayPointer, isDisengaged, makeProxy } from './array-pointer';
import { CURSOR_WORLD_RADIUS } from './array-math';

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

  /**
   * One panel material PER disc mesh, not one shared between them.
   *
   * `_ISLAND_C` is baked in each mesh's OWN local space, and the scaffold disc
   * is a child of the dish with its own transform. A single shared material
   * carries a single `uCursor`, which can only ever be correct for one of
   * them — the other silently compares its centroids against a cursor in the
   * wrong space and never reacts.
   */
  const panels: Array<{ mesh: THREE.Mesh; handle: PanelMaterialHandle }> = [];

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
      const handle = makePanelMaterial();
      mesh.material = handle.material;
      panels.push({ mesh, handle });
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
  const meshScale = new THREE.Vector3();
  const parentWorldQuat = new THREE.Quaternion();
  let time = 0;

  return {
    group,
    setLights(positions, colours) {
      for (const p of panels) p.handle.setLights(positions, colours);
    },
    update(dt: number): void {
      time += dt;
      const now = performance.now();
      opts.camera.getWorldPosition(camWorld);

      const hit = pointer.update(opts.camera, cursorWorld);
      const disengaged = opts.reducedMotion || !hit || isDisengaged(pointer.sample(), now);

      updateIdle(idle, dt * 1000, disengaged);

      for (const { mesh, handle } of panels) {
        // Convert the world cursor into THIS mesh's local space, and scale the
        // sphere radius by the same amount, so both discs measure proximity in
        // the space their own `_ISLAND_C` was baked in.
        cursorLocal.copy(cursorWorld);
        mesh.worldToLocal(cursorLocal);
        mesh.getWorldScale(meshScale);
        const s = (meshScale.x + meshScale.y + meshScale.z) / 3;
        handle.setCursorRadius(CURSOR_WORLD_RADIUS / (s || 1));
        handle.setCursor(cursorLocal.x, cursorLocal.y, cursorLocal.z);
        handle.setCursorAmount(idle.cursor);
        handle.setAmbient(opts.reducedMotion ? 0 : idle.ambient);
        handle.setTime(time);
        handle.setCameraPos(camWorld);
      }

      // Soft TRACK_TO: the dish leans toward the cursor at 0.159, never fully.
      if (hit && !opts.reducedMotion) {
        disc.getWorldPosition(discWorld);
        lookMatrix.lookAt(discWorld, cursorWorld, disc.up);
        lookTarget.setFromRotationMatrix(lookMatrix);
        // lookAt gives a WORLD orientation but `disc.quaternion` is LOCAL to
        // its parent, so it has to come back through the parent's inverse —
        // otherwise the lean is skewed by whatever rotation the mount carries.
        if (disc.parent) {
          disc.parent.getWorldQuaternion(parentWorldQuat);
          lookTarget.premultiply(parentWorldQuat.invert());
        }
        disc.quaternion.copy(restQuat).slerp(lookTarget, TRACK_INFLUENCE * idle.cursor);
      }
    },
    dispose(): void {
      pointer.destroy();
      for (const p of panels) p.handle.dispose();
      dressing.dispose();
      group.clear();
    },
  };
}
