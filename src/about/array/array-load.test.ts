import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ARRAY_ASSETS,
  DISC_NODES,
  allNodeNames,
  findByName,
  getIslandAttribute,
  rebuildHierarchy,
  splitByName,
} from './array-load';

function meshNamed(name: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  m.name = name;
  return m;
}

describe('ARRAY_ASSETS', () => {
  it('lists every exported file exactly once', () => {
    expect(ARRAY_ASSETS).toHaveLength(8);
    expect(new Set(ARRAY_ASSETS).size).toBe(8);
    expect(ARRAY_ASSETS).toContain('array-displacementPathAndCursor.glb');
    expect(ARRAY_ASSETS).toContain('array-disc.glb');
    expect(ARRAY_ASSETS).toContain('array-discScaffold.glb');
    expect(ARRAY_ASSETS).toContain('array-ground.glb');
  });
});

describe('DISC_NODES', () => {
  it('names the two meshes that carry _ISLAND_C', () => {
    expect(DISC_NODES).toEqual(['Circle', 'array-discScaffold']);
  });
});

describe('rebuildHierarchy', () => {
  it('re-parents without moving anything in world space', () => {
    // Blender bakes a world transform onto a node whose parent is in another
    // file. attach() must preserve that placement; add() would teleport it.
    const meshes = new Map<string, THREE.Mesh>();
    const parent = meshNamed('Circle');
    parent.position.set(1, 2, 3);
    const child = meshNamed('array-discScaffold');
    child.position.set(4, 5, 6); // already world-correct
    const scene = new THREE.Group();
    scene.add(parent, child);
    scene.updateMatrixWorld(true);

    meshes.set('Circle', parent);
    meshes.set('array-discScaffold', child);
    meshes.set('Cube.001', meshNamed('Cube.001'));

    const before = child.getWorldPosition(new THREE.Vector3());
    rebuildHierarchy(meshes);
    scene.updateMatrixWorld(true);
    const after = child.getWorldPosition(new THREE.Vector3());

    expect(child.parent).toBe(parent);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
    expect(after.z).toBeCloseTo(before.z, 5);
  });

  it('makes children follow the dish once it leans', () => {
    const meshes = new Map<string, THREE.Mesh>();
    const disc = meshNamed('Circle');
    const scaffold = meshNamed('array-discScaffold');
    const scene = new THREE.Group();
    scene.add(disc, scaffold);
    scene.updateMatrixWorld(true);
    meshes.set('Circle', disc);
    meshes.set('array-discScaffold', scaffold);

    rebuildHierarchy(meshes);
    disc.position.set(0, 10, 0);
    scene.updateMatrixWorld(true);

    expect(scaffold.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(10, 5);
  });

  it('reports what it could not resolve rather than leaving a silent orphan', () => {
    const meshes = new Map<string, THREE.Mesh>();
    meshes.set('Circle', meshNamed('Circle'));
    const missing = rebuildHierarchy(meshes);
    expect(missing.some((m) => m.startsWith('Cylinder'))).toBe(true);
    expect(missing.some((m) => m.startsWith('array-discFrame'))).toBe(true);
  });
});

describe('getIslandAttribute', () => {
  it('finds the attribute under the name GLTFLoader actually gives it', () => {
    // GLTFLoader renames unknown attributes with `name.toLowerCase()`, so the
    // `_ISLAND_C` written in Blender arrives as `_island_c`. Looking for the
    // original spelling finds nothing at all.
    const g = new THREE.BufferGeometry();
    g.setAttribute('_island_c', new THREE.BufferAttribute(new Float32Array([1, 2, 3]), 3));
    expect(getIslandAttribute(g, 'Circle').count).toBe(1);
  });

  it('still accepts the original spelling', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('_ISLAND_C', new THREE.BufferAttribute(new Float32Array([1, 2, 3]), 3));
    expect(getIslandAttribute(g, 'Circle').count).toBe(1);
  });

  it('names the attributes it DID find, so the failure is diagnosable', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    expect(() => getIslandAttribute(g, 'Circle')).toThrow(/Present: position/);
  });
});

describe('splitByName', () => {
  it('keys every mesh in the tree by its node name', () => {
    const root = new THREE.Group();
    const a = meshNamed('Circle');
    const b = meshNamed('Cylinder');
    a.add(b); // nested, not a sibling
    root.add(a);

    const found = splitByName(root);
    expect(found.get('Circle')).toBe(a);
    expect(found.get('Cylinder')).toBe(b);
    expect(found.size).toBe(2);
  });

  it('ignores non-mesh nodes', () => {
    const root = new THREE.Group();
    const empty = new THREE.Object3D();
    empty.name = 'Empty.001';
    root.add(empty, meshNamed('Circle'));

    const found = splitByName(root);
    expect(found.has('Empty.001')).toBe(false);
    expect(found.size).toBe(1);
  });

  it('keeps the first mesh when names collide, rather than silently overwriting', () => {
    const root = new THREE.Group();
    const first = meshNamed('Circle');
    const second = meshNamed('Circle');
    root.add(first, second);
    expect(splitByName(root).get('Circle')).toBe(first);
  });
});

describe('measuring the dish', () => {
  it('must use the dish geometry alone, not setFromObject', () => {
    // setFromObject walks CHILDREN, and the frame, scaffold, supports and
    // signal beam all hang off the dish. The beam spans 2.6 units up and to the
    // right, so including it drags the "centre" clean off the dish — which
    // moves the camera aim and the lights with it.
    const disc = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.2, 2),
      new THREE.MeshBasicMaterial(),
    );
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 0.4), new THREE.MeshBasicMaterial());
    beam.position.set(0.6, 1.6, 1.0);
    disc.add(beam);
    disc.updateMatrixWorld(true);

    const withChildren = new THREE.Box3().setFromObject(disc).getCenter(new THREE.Vector3());

    disc.geometry.computeBoundingBox();
    const geometryOnly = disc.geometry
      .boundingBox!.getCenter(new THREE.Vector3())
      .applyMatrix4(disc.matrixWorld);

    expect(geometryOnly.y).toBeCloseTo(0, 5);
    expect(withChildren.y).toBeGreaterThan(0.5);
  });
});

describe('findByName', () => {
  it('finds a node whose spaces GLTFLoader turned into underscores', () => {
    // PropertyBinding.sanitizeNodeName replaces whitespace, so Blender's
    // "Displacement Path" arrives as "Displacement_Path" and an exact lookup
    // finds nothing at all.
    const root = new THREE.Group();
    const node = new THREE.Object3D();
    node.name = 'Displacement_Path';
    root.add(node);
    expect(findByName([root], 'Displacement Path')).toBe(node);
  });

  it('still finds an exact match', () => {
    const root = new THREE.Group();
    const node = new THREE.Object3D();
    node.name = 'Circle';
    root.add(node);
    expect(findByName([root], 'Circle')).toBe(node);
  });

  it('returns null when genuinely absent', () => {
    expect(findByName([new THREE.Group()], 'Nope')).toBeNull();
  });

  it('lists node names so a not-found failure is diagnosable', () => {
    const root = new THREE.Group();
    const a = new THREE.Object3D();
    a.name = 'Circle';
    root.add(a);
    expect(allNodeNames([root])).toContain('Circle');
  });
});
