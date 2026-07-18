import * as THREE from 'three';
import type { DestId } from '../routes';
import type { StageLayer } from './stage';
import { initAtmosphere, type Atmosphere } from './atmosphere';
import { makeHomeMock } from './home-mock';
import { nearestWrapped } from './loop';

export const CAMERA_OFFSET = 34;
const SPACING = 60;
const SCREEN_W = 32;
const SCREEN_H = 20;
const INK = '#141414';
const SCREEN_BG = '#fdfdfd';

const MATERIALIZE_NEAR = 38;
const MATERIALIZE_FAR = 55;
const MATERIALIZE_SCALE = 0.04; // slight grow-in as it focuses

function materializeAmount(dist: number): number {
  const t = (dist - MATERIALIZE_NEAR) / (MATERIALIZE_FAR - MATERIALIZE_NEAR);
  const clamped = Math.min(Math.max(t, 0), 1);
  return 1 - clamped * clamped * (3 - 2 * clamped); // smoothstep, inverted
}

const PROJECTS = ['Know Good', 'Addax', 'Spy Hop', 'Juan Valdez', 'Naboso', 'Animal', 'Babaloo', 'Hindsight'];
const TILE_W = 7;
const TILE_H = 4.4;
const TILE_GAP = 0.9;

export interface Destination {
  id: DestId;
  anchorZ: number;
  cameraZ: number;
}

export const DESTINATIONS: Destination[] = (['home', 'work', 'about', 'contact'] as DestId[]).map(
  (id, i) => ({ id, anchorZ: -SPACING * i, cameraZ: -SPACING * i + CAMERA_OFFSET }),
);

export const HOME_REST_Z = DESTINATIONS[0].cameraZ; // home camera rest — single source of truth

export interface WorldLayer extends StageLayer {
  camera: THREE.PerspectiveCamera;
  setVelocitySource(fn: () => number): void;
  setHomeMockVisible(v: boolean): void;
  destroy(): void;
}

function makeLabelTexture(label: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 640;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const draw = (): void => {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = SCREEN_BG;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, c.width - 20, c.height - 20);
    // corner brackets echoing the reticle language
    const inset = 34;
    const arm = 30;
    ctx.lineWidth = 5;
    const corners: Array<[number, number, number, number]> = [
      [inset, inset, 1, 1],
      [c.width - inset, inset, -1, 1],
      [inset, c.height - inset, 1, -1],
      [c.width - inset, c.height - inset, -1, -1],
    ];
    for (const [x, y, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + arm * sx, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + arm * sy);
      ctx.stroke();
    }
    ctx.fillStyle = INK;
    ctx.font = '700 96px loos-extended, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.toUpperCase(), c.width / 2, c.height / 2);
    tex.needsUpdate = true;
  };

  draw();
  // redraw once the real font is available
  document.fonts.ready.then(draw).catch(() => {});
  return tex;
}

function makeTileTexture(name: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 320;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const draw = (): void => {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = SCREEN_BG;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, c.width - 2, c.height - 2);
    // corner brackets echoing the reticle language
    const inset = 16;
    const arm = 16;
    ctx.lineWidth = 3;
    const corners: Array<[number, number, number, number]> = [
      [inset, inset, 1, 1],
      [c.width - inset, inset, -1, 1],
      [inset, c.height - inset, 1, -1],
      [c.width - inset, c.height - inset, -1, -1],
    ];
    for (const [x, y, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + arm * sx, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + arm * sy);
      ctx.stroke();
    }
    ctx.fillStyle = INK;
    ctx.font = '700 44px loos-extended, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.toUpperCase(), c.width / 2, c.height / 2);
    tex.needsUpdate = true;
  };

  draw();
  // redraw once the real font is available
  document.fonts.ready.then(draw).catch(() => {});
  return tex;
}

export function initWorld(_opts: { reducedMotion: boolean }): WorldLayer {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    500,
  );
  camera.position.set(0, 0, CAMERA_OFFSET);

  const atmosphere: Atmosphere = initAtmosphere();
  scene.add(atmosphere.object);

  const disposables: Array<{ dispose(): void }> = [];
  const anchored: Array<{
    root: THREE.Object3D;
    anchorZ: number;
    materials: THREE.MeshBasicMaterial[];
  }> = [];
  for (const dest of DESTINATIONS) {
    if (dest.id === 'home') continue; // the DOM homepage IS home — no plane

    if (dest.id === 'work') {
      // WORK: 2x4 wall of project thumbnail tiles instead of a single label plane
      const group = new THREE.Group();
      const materials: THREE.MeshBasicMaterial[] = [];
      for (let i = 0; i < PROJECTS.length; i++) {
        const row = Math.floor(i / 4);
        const col = i % 4;
        const tex = makeTileTexture(PROJECTS[i]);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
        const geo = new THREE.PlaneGeometry(TILE_W, TILE_H);
        const tile = new THREE.Mesh(geo, mat);
        tile.position.set(
          (col - 1.5) * (TILE_W + TILE_GAP),
          row === 0 ? (TILE_H + TILE_GAP) / 2 : -(TILE_H + TILE_GAP) / 2,
          0,
        );
        group.add(tile);
        disposables.push(tex, mat, geo);
        materials.push(mat);
      }
      group.position.set(0, 0, dest.anchorZ);
      scene.add(group);
      anchored.push({ root: group, anchorZ: dest.anchorZ, materials });
      continue;
    }

    const tex = makeLabelTexture(dest.id);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const geo = new THREE.PlaneGeometry(SCREEN_W, SCREEN_H);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, dest.anchorZ);
    scene.add(mesh);
    disposables.push(tex, mat, geo);
    anchored.push({ root: mesh, anchorZ: dest.anchorZ, materials: [mat] });
  }

  // treatment-B home mock: hidden 3D stand-in for the DOM homepage, shown
  // only while a flythrough is launching away from the home anchor.
  // Excluded from materialization — its visibility is treatment-B-managed.
  const homeAnchorZ = DESTINATIONS.find((d) => d.id === 'home')?.anchorZ ?? 0;
  const homeMock = makeHomeMock();
  homeMock.position.z = homeAnchorZ;
  homeMock.visible = false;
  scene.add(homeMock);
  anchored.push({ root: homeMock, anchorZ: homeAnchorZ, materials: [] });

  let velocitySource: () => number = () => 0;

  return {
    camera,
    setVelocitySource(fn: () => number): void {
      velocitySource = fn;
    },
    setHomeMockVisible(v: boolean): void {
      homeMock.visible = v;
    },
    update(dt: number): void {
      for (const s of anchored) {
        // The home mock's position is only correct at the moment it's shown;
        // re-anchoring it mid-flight while it's on screen pops it visibly
        // across the wrap (see antipodal Home<->About flight). Freeze it
        // while visible — it re-anchors only once hidden again. Screens
        // (never toggled invisible) always re-anchor as before.
        if (s.root === homeMock && s.root.visible) continue;
        s.root.position.z = nearestWrapped(s.anchorZ, camera.position.z);
      }
      // materialize screens (not the home mock — flight-only, treatment B managed)
      for (const s of anchored) {
        if (s.root === homeMock) continue;
        const dist = Math.abs(camera.position.z - s.root.position.z);
        const a = materializeAmount(dist);
        s.root.visible = a > 0.01;
        const sc = 1 - MATERIALIZE_SCALE * (1 - a);
        s.root.scale.setScalar(sc);
        for (const m of s.materials) m.opacity = a;
      }
      atmosphere.update(dt, velocitySource(), camera.position.z);
    },
    render(renderer: THREE.WebGLRenderer): void {
      renderer.render(scene, camera);
    },
    resize(width: number, height: number): void {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    destroy(): void {
      atmosphere.destroy();
      for (const d of disposables) d.dispose();
      homeMock.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.dispose();
        }
      });
    },
  };
}
