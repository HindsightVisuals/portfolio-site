import * as THREE from 'three';
import { clusterIslandCentres, detectIslandSpace, toGltfSpace } from './array-geometry';
import {
  DISC_NODES,
  PATH_NODE,
  TEXTURED_NODES,
  allNodeNames,
  findByName,
  getIslandAttribute,
  loadArray,
  rebuildHierarchy,
} from './array-load';
import { createIdleModel, updateIdle } from './array-idle';
import { makePanelMaterial, type PanelMaterialHandle } from './array-material';
import { makeSignalMaterial, type SignalMaterialHandle } from './array-signal';
import { initArrayPointer, isDisengaged } from './array-pointer';
import { CURSOR_TAU, CURSOR_WORLD_RADIUS, EXPLODE_FAR, GLOW_RADIUS, dampAngle } from './array-math';
import {
  makeCursorHelper,
  makeRingHelper,
  ringAngleOf,
  ringFromNode,
  ringPointAt,
  updateRingFromNode,
  type DisplacementRing,
} from './array-path';

/**
 * TRACK_TO influence on the dish, from the rig. Blender's constraint is
 * `track_axis: TRACK_Z, up_axis: UP_Y, influence: 0.1592`.
 */
const TRACK_INFLUENCE = 0.1592;

/** Expected island counts — a wrong count means the clustering epsilon is off. */
const EXPECTED_ISLANDS: Record<string, number> = { Circle: 224, 'array-discScaffold': 256 };

export interface ArrayHandle {
  group: THREE.Group;
  /** The dish. The lab frames the camera against it. */
  disc: THREE.Mesh;
  /** The ring the cursor is confined to. */
  ring: DisplacementRing;
  /**
   * The dish's VISUAL centre in world space, not its node origin.
   *
   * The two differ by about 0.39 in y — the node origin sits low on the dish —
   * so aiming the camera at the origin puts the middle of the dish above screen
   * centre, and the pointer mapping inherits the same offset.
   */
  discCentre: THREE.Vector3;
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

  // Add the scene ROOTS, never the individual meshes. `group.add(mesh)` would
  // detach each one from its glTF parent and flatten the whole tree — which is
  // invisible at rest and then leaves the dish's children behind the moment it
  // leans.
  for (const root of roots) group.add(root);

  // One part per file, so Blender baked world transforms onto nodes whose
  // parents live elsewhere. Put the tree back before anything reads a transform.
  group.updateMatrixWorld(true);
  const missing = rebuildHierarchy(meshes);
  if (missing.length > 0) console.warn(`[array] unresolved parenting: ${missing.join(', ')}`);

  // The scratch map drives roughness on the panels, as it does in Blender.
  const scratches = new THREE.TextureLoader().load(
    `${import.meta.env.BASE_URL}lander/scratches.jpg`,
  );
  scratches.wrapS = THREE.RepeatWrapping;
  scratches.wrapT = THREE.RepeatWrapping;
  scratches.colorSpace = THREE.NoColorSpace; // a roughness mask, not colour

  // Blender's `Array Material` on the frame, struts and stand: grey metal whose
  // roughness comes from the same scratch map as the panels. A flat roughness
  // left the structure reading as plastic against a scratched dish.
  const dressing = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    metalness: 1,
    roughness: 0.45,
    roughnessMap: scratches,
    // Bump from the same map, so the tower reads as scratched metal rather than
    // as a smooth shape with a mottled sheen. Small: it is surface relief, not
    // geometry, and at this scale anything larger reads as noise.
    bumpMap: scratches,
    bumpScale: 0.035,
  });

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
  let cursorMesh: THREE.Mesh | null = null;
  let signal: SignalMaterialHandle | null = null;
  let signalMesh: THREE.Mesh | null = null;

  for (const [name, mesh] of meshes) {
    if (DISC_NODES.includes(name)) {
      const attr = getIslandAttribute(mesh.geometry, name);
      const posArr = mesh.geometry.getAttribute('position').array as Float32Array;
      let islandArr = attr.array as Float32Array;

      // The exporter rotates POSITION from Z-up to Y-up but has no way to know
      // a CUSTOM attribute holds positions, so `_ISLAND_C` arrives unrotated.
      // Left alone, the shader compares centroids in one space against a cursor
      // in another and the displacement lands nowhere near the pointer.
      const detected = detectIslandSpace(posArr, islandArr);
      if (detected.space === 'blender') islandArr = toGltfSpace(islandArr);

      const { centres, count } = clusterIslandCentres(islandArr);
      mesh.geometry.setAttribute('aIslandC', new THREE.BufferAttribute(centres, 3));

      const expected = EXPECTED_ISLANDS[name];
      // A centroid belongs to its own vertex's island, so this distance is
      // bounded by island size. A large value means a STALE bake — the mesh
      // moved after the attribute was written — which looks exactly like a
      // mis-mapped cursor and is worth naming rather than inferring.
      const fit = Math.min(detected.meanAsGltf, detected.meanAsBlender);
      const ok = (expected === undefined || count === expected) && fit < 0.25;
      console[ok ? 'info' : 'warn'](
        `[array] ${name}: ${count} islands` +
          `${expected !== undefined && count !== expected ? ` — EXPECTED ${expected}` : ''}` +
          ` | space=${detected.space} fit=${fit.toFixed(3)}` +
          `${fit >= 0.25 ? ' — STALE BAKE, re-bake _ISLAND_C in Blender' : ''}`,
      );
      const handle = makePanelMaterial(scratches);
      mesh.material = handle.material;
      panels.push({ mesh, handle });
    } else if (TEXTURED_NODES.includes(name)) {
      // The ground brings its own baked BaseColor/Normal/Roughness maps.
      // Overwriting them — as every non-disc mesh used to be — is what left the
      // terrain untextured.
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (m && 'roughness' in m) m.envMapIntensity = 0;
    } else if (name === 'Cylinder') {
      // The signal beam. It was taking the grey dressing material, which is why
      // it read as a dark pipe rather than the flowing ribbon the rig renders.
      signal = makeSignalMaterial();
      signalMesh = mesh;
      mesh.material = signal.material;
    } else if (mesh.name === 'Cursor') {
      // The driver sphere is an INPUT, not scenery — Blender never renders it —
      // so it stays hidden unless ?debug-path asks for it. It is exported at the
      // true influence radius, so it shows the real extent, not a stand-in.
      mesh.visible = false;
      cursorMesh = mesh;
    } else {
      mesh.material = dressing;
    }
  }

  const disc = meshes.get('Circle');
  if (!disc) throw new Error('array: Circle node not found');

  // The dish's rest orientation and visual centre, both fixed at load.
  // Everything that aims at the dish uses these rather than its live transform,
  // which the cursor is busy rotating.
  disc.updateMatrixWorld(true);
  // The dish's OWN geometry, not `setFromObject(disc)` — that walks children,
  // and the frame, scaffold, supports and signal beam all hang off the dish now.
  // The beam alone spans 2.6 units up and to the right, which drags the centre
  // clean off the dish and takes the camera aim and the lights with it.
  disc.geometry.computeBoundingBox();
  const discCentre = disc.geometry
    .boundingBox!.getCenter(new THREE.Vector3())
    .applyMatrix4(disc.matrixWorld);

  /**
   * The ring, PARENTED TO THE DISH so it rides the lean.
   *
   * The displacement path is a feature of the dish, not of the world: as the
   * dish tracks the cursor, the ring has to stay in the same place relative to
   * it, or the region the pointer controls slides across the panels.
   *
   * `attach` rather than `add`, to keep the world placement the export baked in.
   *
   * This does close a loop — cursor moves the dish, the dish moves the ring, the
   * ring moves the cursor — but a converging one, not a runaway. The lean is
   * recomputed from the dish's REST quaternion every frame rather than
   * accumulated, so it is a one-step fixed point with a gain of 0.159; it
   * settles instead of drifting.
   */
  const pathNode = findByName(roots, PATH_NODE);
  if (!pathNode) {
    throw new Error(
      `array: "${PATH_NODE}" node not found. Present: ${allNodeNames(roots).join(', ')}`,
    );
  }
  disc.attach(pathNode);
  const ring = ringFromNode(pathNode);
  console.info(
    `[array] ring r=${ring.radius.toFixed(3)} at ` +
      `${ring.centre.toArray().map((v) => v.toFixed(2)).join(', ')} (parented to dish)`,
  );

  const debugPath = new URLSearchParams(location.search).has('debug-path');
  let cursorHelper: THREE.Group | null = null;
  if (debugPath) {
    // Parented to the path node, so it rides the dish for free and cannot drift
    // out of step with the ring it is meant to be showing.
    pathNode.add(makeRingHelper());

    // The thresholds are defined in the disc's local space; the helper draws in
    // world units, so convert through the disc's own scale.
    const discScale = disc.getWorldScale(new THREE.Vector3()).x || 1;
    cursorHelper = makeCursorHelper(
      CURSOR_WORLD_RADIUS,
      GLOW_RADIUS * discScale,
      EXPLODE_FAR * discScale,
    );
    group.add(cursorHelper);

    if (cursorMesh) {
      cursorMesh.visible = true;
      cursorMesh.material = new THREE.MeshBasicMaterial({
        color: 0x61e891,
        wireframe: true,
        transparent: true,
        opacity: 0.4,
      });
    }
  }

  const pointer = initArrayPointer(opts.el);
  const idle = createIdleModel();

  // Hoisted — update() runs every frame and must not allocate.
  const cursorLocal = new THREE.Vector3();
  const cursorWorld = new THREE.Vector3();
  const cursorTarget = new THREE.Vector3();
  let cursorAngle = 0;
  let hasAngle = false;
  const discWorld = new THREE.Vector3();
  const camWorld = new THREE.Vector3();
  const meshScale = new THREE.Vector3();
  const signalLocal = new THREE.Vector3();
  const signalWorld = new THREE.Vector3();
  const trackDir = new THREE.Vector3();
  const trackQuat = new THREE.Quaternion();
  const parentWorldQuat = new THREE.Quaternion();
  const restQuat = disc.quaternion.clone();
  /**
   * The dish's face normal, in its own local space.
   *
   * Blender's constraint is TRACK_Z — the dish's local +Z aims at the cursor —
   * but the glTF Y-up conversion rotates the mesh data by -90 degrees about X,
   * so Blender's local +Z arrives as glTF local **+Y**. The geometry confirms
   * it: the disc's local POSITION extent is thin in Y (0.371 to 0.630) and wide
   * in X and Z, which is only true if Y is the face normal.
   *
   * Using (0,0,1) here aims an in-plane axis at the pointer and swings the dish
   * through itself.
   */
  const FACE_AXIS = new THREE.Vector3(0, 1, 0);
  let time = 0;

  return {
    group,
    disc,
    discCentre,
    ring,
    setLights(positions, colours) {
      for (const p of panels) p.handle.setLights(positions, colours);
    },
    update(dt: number): void {
      time += dt;
      const now = performance.now();
      opts.camera.getWorldPosition(camWorld);
      disc.getWorldPosition(discWorld);

      // Re-read the ring: it is parented to the dish, so last frame's lean has
      // already moved it. Reading a stale ring would leave the cursor slightly
      // off the path whenever the dish is in motion.
      updateRingFromNode(pathNode, ring);

      const hit = pointer.update(opts.camera, ring, cursorTarget);
      const disengaged = opts.reducedMotion || !hit || isDisengaged(pointer.sample(), now);

      // Damp the cursor ALONG THE RING, as an angle — not through 3D space.
      // Interpolating the position directly would cut a chord across the circle
      // and briefly leave the path; easing the bearing slides along it, which is
      // what the FOLLOW_PATH constraint does in Blender.
      if (hit) {
        const targetAngle = ringAngleOf(cursorTarget, ring);
        cursorAngle = hasAngle
          ? dampAngle(cursorAngle, targetAngle, dt, CURSOR_TAU)
          : targetAngle; // no lurch from an arbitrary start on the first frame
        hasAngle = true;
      }
      ringPointAt(ring, cursorAngle, cursorWorld);

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

      if (signal && signalMesh) {
        signalLocal.copy(cursorWorld);
        signalMesh.worldToLocal(signalLocal);
        signal.setCursorLocal(signalLocal);
        signal.setCursorDistance(cursorWorld.distanceTo(signalMesh.getWorldPosition(signalWorld)));
        signal.setTime(time);
      }

      if (debugPath) {
        // Both sit under `group`, whose transform is not guaranteed to be
        // identity — go through the parent rather than assuming world space.
        for (const helper of [cursorHelper, cursorMesh]) {
          if (!helper) continue;
          helper.position.copy(cursorWorld);
          helper.parent?.worldToLocal(helper.position);
        }
      }

      // Soft TRACK_TO. Blender's constraint is TRACK_Z: the dish's +Z axis
      // points AT the cursor. `Matrix4.lookAt` is the opposite convention —
      // it aims -Z at the target, the way a camera does — so using it here
      // aimed the dish's back at the pointer and made it snap through.
      if (hit && !opts.reducedMotion) {
        trackDir.subVectors(cursorWorld, discWorld).normalize();
        if (trackDir.lengthSq() > 0) {
          trackQuat.setFromUnitVectors(FACE_AXIS, trackDir);
          // setFromUnitVectors gives a WORLD orientation; disc.quaternion is
          // LOCAL to its parent, so it comes back through the parent's inverse.
          if (disc.parent) {
            disc.parent.getWorldQuaternion(parentWorldQuat);
            trackQuat.premultiply(parentWorldQuat.invert());
          }
          disc.quaternion.copy(restQuat).slerp(trackQuat, TRACK_INFLUENCE * idle.cursor);
        }
      }
    },
    dispose(): void {
      pointer.destroy();
      for (const p of panels) p.handle.dispose();
      signal?.dispose();
      dressing.dispose();
      scratches.dispose();
      group.clear();
    },
  };
}
