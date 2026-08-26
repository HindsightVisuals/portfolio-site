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

export async function loadArray(
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<Map<string, THREE.Mesh>> {
  const draco = new DRACOLoader();
  draco.setDecoderPath(`${baseUrl}draco/`);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  const scenes = await Promise.all(
    ARRAY_ASSETS.map((f) => loader.loadAsync(`${baseUrl}lander/${f}`)),
  );

  const all = new Map<string, THREE.Mesh>();
  for (const gltf of scenes) {
    for (const [name, mesh] of splitByName(gltf.scene)) {
      if (!all.has(name)) all.set(name, mesh);
    }
  }
  draco.dispose();
  return all;
}
