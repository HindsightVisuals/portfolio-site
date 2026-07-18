import * as THREE from 'three';

/** Rough 3D stand-ins for the home DOM used by treatment B (home-exit streak-past). */
export function makeHomeMock(): THREE.Group {
  const group = new THREE.Group();
  const ink = new THREE.MeshBasicMaterial({ color: 0x141414 });
  // 8 reticle stand-ins, two rows of four, roughly matching home layout scale
  const tile = new THREE.PlaneGeometry(1.6, 1.6);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(tile, ink);
    const row = Math.floor(i / 4);
    m.position.set((i % 4) * 2.6 - 3.9, row === 0 ? 3.4 : -3.4, 0);
    group.add(m);
  }
  // wordmark bar stand-in
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9), ink);
  bar.position.set(-12, 0, 0);
  group.add(bar);
  group.position.set(0, 0, 0); // home anchor
  return group;
}
