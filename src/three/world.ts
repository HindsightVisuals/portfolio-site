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
  const anchored: Array<{ mesh: THREE.Object3D; anchorZ: number }> = [];
  for (const dest of DESTINATIONS) {
    if (dest.id === 'home') continue; // the DOM homepage IS home — no plane
    const tex = makeLabelTexture(dest.id);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const geo = new THREE.PlaneGeometry(SCREEN_W, SCREEN_H);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, dest.anchorZ);
    scene.add(mesh);
    disposables.push(tex, mat, geo);
    anchored.push({ mesh, anchorZ: dest.anchorZ });
  }

  // treatment-B home mock: hidden 3D stand-in for the DOM homepage, shown
  // only while a flythrough is launching away from the home anchor.
  const homeAnchorZ = DESTINATIONS.find((d) => d.id === 'home')?.anchorZ ?? 0;
  const homeMock = makeHomeMock();
  homeMock.position.z = homeAnchorZ;
  homeMock.visible = false;
  scene.add(homeMock);
  anchored.push({ mesh: homeMock, anchorZ: homeAnchorZ });

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
        if (s.mesh === homeMock && s.mesh.visible) continue;
        s.mesh.position.z = nearestWrapped(s.anchorZ, camera.position.z);
      }
      atmosphere.update(dt, velocitySource());
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
