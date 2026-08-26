import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * The array ships as several GLBs purely because that is how they were
 * exported; the runtime does not care which file a node came from and pulls
 * everything out by node name. Nothing here carries materials — every array
 * surface is authored in GLSL, which is what keeps these files at 283 KB for
 * 34,734 triangles.
 */
export const ARRAY_ASSETS: readonly string[] = [
  'array-disc.glb',
  'array-disc_supporting_wireframe.glb',
  'array-core.glb',
  'array-frame.glb',
  'array-signal.glb',
  'array-ground.glb',
];

/**
 * The two meshes that carry the baked `_ISLAND_C` attribute and take the panel
 * material. `Circle` is the dish (224 islands); `Circle.012` is the wireframe
 * scaffold beneath it (256 islands) and gets the SAME treatment — same
 * material, same explode, same emission.
 */
export const DISC_NODES: readonly string[] = ['Circle', 'Circle.012'];

/**
 * Every `Mesh` in the tree, keyed by node name.
 *
 * First-wins on a name collision. Silently overwriting would make a duplicated
 * node look like a missing one at the point of use, which is a much worse place
 * to discover it.
 */
export function splitByName(root: THREE.Object3D): Map<string, THREE.Mesh> {
  const out = new Map<string, THREE.Mesh>();
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !out.has(o.name)) out.set(o.name, o as THREE.Mesh);
  });
  return out;
}

/**
 * Candidate spellings of the baked island attribute, in likelihood order.
 *
 * GLTFLoader renames anything it does not recognise:
 *   `ATTRIBUTES[name] || name.toLowerCase()`
 * so the `_ISLAND_C` written in Blender arrives as `_island_c`. Looking for the
 * original spelling finds nothing — and because the attribute is only read at
 * load, that surfaces as an undefined-attribute crash rather than as anything
 * pointing at the exporter.
 */
const ISLAND_ATTR_NAMES = ['_island_c', '_ISLAND_C', 'island_c', 'ISLAND_C'] as const;

/**
 * The island-centroid attribute, whatever the loader decided to call it.
 * Throws with the geometry's actual attribute list, which is the one thing that
 * makes a missing-attribute failure diagnosable.
 */
export function getIslandAttribute(
  geometry: THREE.BufferGeometry,
  label: string,
): THREE.BufferAttribute {
  for (const n of ISLAND_ATTR_NAMES) {
    const a = geometry.getAttribute(n);
    if (a) return a as THREE.BufferAttribute;
  }
  const present = Object.keys(geometry.attributes).join(', ') || '(none)';
  throw new Error(
    `${label}: no island attribute found (looked for ${ISLAND_ATTR_NAMES.join(', ')}). ` +
      `Present: ${present}. Re-export from Blender with Data > Mesh > Attributes enabled.`,
  );
}

/**
 * The Blender parent of each node, from the scene's own hierarchy.
 *
 * The array was exported across six files, and Blender bakes a world transform
 * onto any node whose parent is not in the same export. So every mesh arrives
 * correctly PLACED but with no parent — which is invisible at rest and breaks
 * the moment anything moves, since the dish's children have to ride its
 * TRACK_TO lean.
 *
 * Ordered parents-first so a rebuild walks down the tree rather than across it.
 */
export const PARENT_OF: ReadonlyArray<readonly [child: string, parent: string]> = [
  ['Circle', 'Cube.001'],
  ['Circle.013', 'Cube.001'],
  ['Circle.014', 'Cube.001'],
  ['Cube.002', 'Cube.001'],
  ['Circle.001', 'Circle'],
  ['Circle.002', 'Circle'],
  ['Circle.003', 'Circle'],
  ['Circle.004', 'Circle'],
  ['Circle.005', 'Circle'],
  ['Circle.006', 'Circle'],
  ['Circle.007', 'Circle'],
  ['Circle.008', 'Circle'],
  ['Circle.009', 'Circle'],
  ['Circle.010', 'Circle'],
  ['Circle.011', 'Circle'],
  ['Circle.012', 'Circle'],
  ['Cube', 'Circle'],
  ['Cylinder', 'Circle'],
];

/**
 * Restore the Blender parenting without moving anything.
 *
 * Uses `attach()`, not `add()`: `add()` keeps the LOCAL transform and therefore
 * teleports a node whose world transform was baked, while `attach()` keeps the
 * world transform and recomputes the local one. World matrices must be current
 * before it is called, which is why the caller updates them first.
 *
 * Returns the names it could not resolve, so a missing node is reported rather
 * than silently leaving an orphan that looks fine until the dish moves.
 */
export function rebuildHierarchy(meshes: Map<string, THREE.Mesh>): string[] {
  const missing: string[] = [];
  for (const [childName, parentName] of PARENT_OF) {
    const child = meshes.get(childName);
    const parent = meshes.get(parentName);
    if (!child || !parent) {
      missing.push(`${childName} -> ${parentName}`);
      continue;
    }
    parent.attach(child);
  }
  return missing;
}

export interface LoadedArray {
  /** Each file's scene root, hierarchy intact. Add THESE to the scene. */
  roots: THREE.Object3D[];
  /** Every mesh by node name, for material and attribute work. */
  meshes: Map<string, THREE.Mesh>;
}

export async function loadArray(baseUrl: string = import.meta.env.BASE_URL): Promise<LoadedArray> {
  const draco = new DRACOLoader();
  draco.setDecoderPath(`${baseUrl}draco/`);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  const scenes = await Promise.all(
    ARRAY_ASSETS.map((f) => loader.loadAsync(`${baseUrl}lander/${f}`)),
  );

  const roots: THREE.Object3D[] = [];
  const meshes = new Map<string, THREE.Mesh>();
  for (const gltf of scenes) {
    roots.push(gltf.scene);
    for (const [name, mesh] of splitByName(gltf.scene)) {
      if (!meshes.has(name)) meshes.set(name, mesh);
    }
  }
  draco.dispose();
  return { roots, meshes };
}
