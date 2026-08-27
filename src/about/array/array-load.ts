import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * The array ships as several GLBs, each named for the part it holds. Nothing
 * here carries materials — every array surface is authored in GLSL, which is
 * what keeps these files at ~280 KB for 34,000 triangles. The ground is the
 * exception and brings its own baked maps.
 */
export const ARRAY_ASSETS: readonly string[] = [
  'array-disc.glb',
  'array-discScaffold.glb',
  'array-discFrame.glb',
  'array-discSupports.glb',
  'array-signal.glb',
  'array-stand.glb',
  'array-ground.glb',
  'array-displacementPathAndCursor.glb',
];

/**
 * The two meshes that carry the baked `_ISLAND_C` attribute and take the panel
 * material: the dish itself (224 islands) and the wireframe scaffold beneath it
 * (256 islands). The scaffold gets the SAME treatment — same explode, same
 * emission — it is simply separate geometry.
 */
export const DISC_NODES: readonly string[] = ['Circle', 'array-discScaffold'];

/** The Blender curve the cursor is confined to. Exports as a bare transform. */
export const PATH_NODE = 'Displacement Path';

/** Meshes that arrive with their own textured glTF material, which must survive. */
export const TEXTURED_NODES: readonly string[] = ['Landscape'];

/**
 * The Blender parent of each node.
 *
 * The array is exported one part per file, and Blender bakes a WORLD transform
 * onto any node whose parent is not in the same export. Every mesh therefore
 * arrives correctly placed but parentless — invisible at rest, and wrong the
 * moment the dish leans, because its children have to ride that lean.
 *
 * Verified against `array-WHOLESCENE.glb`, which carries the true hierarchy:
 * everything below hangs off `Circle`, and `array-stand` is static.
 */
export const PARENT_OF: ReadonlyArray<readonly [child: string, parent: string]> = [
  ['array-discFrame', 'Circle'],
  ['array-discScaffold', 'Circle'],
  ['array-discSupports', 'Circle'],
  ['Cylinder', 'Circle'],
];

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

/**
 * Any node by name, meshes included.
 *
 * `splitByName` only collects meshes, which is right for material work but
 * misses the displacement path — glTF has no curve type, so it arrives as a
 * bare transform with no mesh attached.
 *
 * Tries the sanitised spelling too. GLTFLoader runs every node name through
 * `PropertyBinding.sanitizeNodeName`, which REPLACES SPACES WITH UNDERSCORES,
 * so Blender's `Displacement Path` arrives as `Displacement_Path` and an exact
 * lookup finds nothing. Same trap as `_ISLAND_C` arriving lowercased.
 */
export function findByName(roots: THREE.Object3D[], name: string): THREE.Object3D | null {
  const candidates = [name, name.replace(/\s/g, '_')];
  for (const root of roots) {
    for (const candidate of candidates) {
      const found = root.getObjectByName(candidate);
      if (found) return found;
    }
  }
  return null;
}

/** Every node name in the tree — for making a not-found failure diagnosable. */
export function allNodeNames(roots: THREE.Object3D[]): string[] {
  const names: string[] = [];
  for (const root of roots) root.traverse((o) => o.name && names.push(o.name));
  return names;
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
