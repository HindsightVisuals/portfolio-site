import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ARRAY_ASSETS, DISC_NODES, getIslandAttribute, splitByName } from './array-load';

function meshNamed(name: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  m.name = name;
  return m;
}

describe('ARRAY_ASSETS', () => {
  it('lists every exported file exactly once', () => {
    expect(ARRAY_ASSETS).toHaveLength(6);
    expect(new Set(ARRAY_ASSETS).size).toBe(6);
    expect(ARRAY_ASSETS).toContain('array-disc.glb');
    expect(ARRAY_ASSETS).toContain('array-disc_supporting_wireframe.glb');
  });
});

describe('DISC_NODES', () => {
  it('names the two meshes that carry _ISLAND_C', () => {
    expect(DISC_NODES).toEqual(['Circle', 'Circle.012']);
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
