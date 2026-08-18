import * as THREE from 'three';
import gsap from 'gsap';
import type { DestId } from '../routes';
import type { StageLayer } from './stage';
import { initAtmosphere, type Atmosphere } from './atmosphere';
import { makeHomeMock } from './home-mock';
import { nearestWrapped } from './loop';
import { distanceForFraming, effectiveMarginPx } from './framing';
import { makeTileMaterial, type TileMaterialHandle } from './tile-material';
import { tileStillUrl } from '../work/tiles';

export const CAMERA_OFFSET = 34;
export const CAMERA_FOV = 45;
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

// The WORK wall is row-major (row = floor(i/4), col = i%4); tile index i is
// SLUGS[i]'s tile, picked/focused by that slug and given its image by
// work/tiles.ts. Content Audit order — FROZEN, the router and reticles both
// derive from it.
export const SLUGS = ['know-good', 'addax', 'spy-hop', 'juan-valdez', 'naboso', 'animal', 'babaloo', 'hindsight'] as const;
export const TILE_W = 7;
export const TILE_H = 4.4;
export const TILE_GAP = 0.9;
export const HOVER_SCALE = 1.02;
const HOVER_DURATION = 0.25;
const HOVER_EASE = 'power2.out';

/** Row-major local (x, y) of tile i within the WORK wall group (z is the group's). */
export function tileLocalPosition(i: number): { x: number; y: number } {
  const row = Math.floor(i / 4);
  const col = i % 4;
  return {
    x: (col - 1.5) * (TILE_W + TILE_GAP),
    y: row === 0 ? (TILE_H + TILE_GAP) / 2 : -(TILE_H + TILE_GAP) / 2,
  };
}

/** Index of `slug` in SLUGS, or -1 if unknown. */
export function tileIndexForSlug(slug: string): number {
  return (SLUGS as readonly string[]).indexOf(slug);
}

/** The next tile's slug, wrapping from the 8th tile back to the 1st. */
export function nextSlug(slug: string): string {
  const i = tileIndexForSlug(slug);
  if (i < 0) throw new Error(`unknown slug ${slug}`);
  return SLUGS[(i + 1) % SLUGS.length];
}

/**
 * True when `obj` and every ancestor up to the scene root has `.visible`
 * true. Raycaster does NOT consult Object3D.visible (only the renderer
 * does), so pick() must gate on this explicitly — otherwise a ray toward a
 * fully-faded-out WORK wall or ABOUT screen (materializeAmount ~0, which
 * world.ts already expresses as `root.visible = false`) would still report
 * a hit the user cannot see.
 */
export function isEffectivelyVisible(obj: THREE.Object3D): boolean {
  let o: THREE.Object3D | null = obj;
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

/**
 * World-space camera focus target for a tile: its center x/y (the WORK
 * group has no x/y offset) and a z framed to fill the viewport, using the
 * same framing math as other destinations (Task 1).
 */
export function tileFocusTarget(slug: string, vpW: number, vpH: number): { x: number; y: number; z: number } {
  const i = tileIndexForSlug(slug);
  if (i < 0) throw new Error(`unknown slug ${slug}`);
  const { x, y } = tileLocalPosition(i);
  const workAnchorZ = DESTINATIONS.find((d) => d.id === 'work')?.anchorZ ?? 0;
  const margin = effectiveMarginPx(vpW, vpH);
  const dist = distanceForFraming(TILE_W, TILE_H, vpW, vpH, CAMERA_FOV, margin);
  return { x, y, z: workAnchorZ + dist };
}

export interface Destination {
  id: DestId;
  anchorZ: number;
  cameraZ: number;
}

export const DESTINATIONS: Destination[] = (['home', 'work', 'about', 'contact'] as DestId[]).map(
  (id, i) => ({ id, anchorZ: -SPACING * i, cameraZ: -SPACING * i + CAMERA_OFFSET }),
);

export const HOME_REST_Z = DESTINATIONS[0].cameraZ; // home camera rest — single source of truth

export type PickResult = { kind: 'tile'; slug: string } | { kind: 'screen'; dest: DestId };

export interface WorldLayer extends StageLayer {
  camera: THREE.PerspectiveCamera;
  setVelocitySource(fn: () => number): void;
  setHomeMockVisible(v: boolean): void;
  pick(ndcX: number, ndcY: number): PickResult | null;
  setTileHover(slug: string | null): void;
  setTileColor(slug: string, on: boolean): void;
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

export function initWorld(opts: { reducedMotion: boolean }): WorldLayer {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV,
    window.innerWidth / window.innerHeight,
    0.1,
    500,
  );
  camera.position.set(0, 0, CAMERA_OFFSET);

  const atmosphere: Atmosphere = initAtmosphere();
  scene.add(atmosphere.object);

  // pickable meshes for pick(): the 8 WORK tiles (userData.slug) plus the
  // ABOUT destination screen (userData.dest). HOME/WORK-placeholder/CONTACT
  // screens are not pickable this phase.
  const pickables: THREE.Object3D[] = [];
  const tileMeshes: THREE.Mesh[] = [];
  const raycaster = new THREE.Raycaster();
  let hoveredMesh: THREE.Mesh | null = null;

  const disposables: Array<{ dispose(): void }> = [];
  const anchored: Array<{
    root: THREE.Object3D;
    anchorZ: number;
    /** Materialize fade. Label screens write Material.opacity; tiles write uFade. */
    setFade: (a: number) => void;
  }> = [];
  const loader = new THREE.TextureLoader();
  const tileHandles: TileMaterialHandle[] = [];
  // gsap needs an object to interpolate; each tile's saturation rides one.
  const satProxies = SLUGS.map(() => ({ v: 0 }));
  for (const dest of DESTINATIONS) {
    if (dest.id === 'home') continue; // the DOM homepage IS home — no plane

    if (dest.id === 'work') {
      // WORK: 2x4 wall of project thumbnail tiles instead of a single label plane
      const group = new THREE.Group();
      for (let i = 0; i < SLUGS.length; i++) {
        const tex = loader.load(tileStillUrl(SLUGS[i]));
        tex.anisotropy = 4;
        const handle = makeTileMaterial(tex);
        const geo = new THREE.PlaneGeometry(TILE_W, TILE_H);
        const tile = new THREE.Mesh(geo, handle.material);
        const { x, y } = tileLocalPosition(i);
        tile.position.set(x, y, 0);
        tile.userData.slug = SLUGS[i];
        group.add(tile);
        disposables.push(tex, handle, geo);
        tileHandles.push(handle);
        pickables.push(tile);
        tileMeshes.push(tile);
      }
      group.position.set(0, 0, dest.anchorZ);
      scene.add(group);
      anchored.push({
        root: group,
        anchorZ: dest.anchorZ,
        setFade: (a) => {
          for (const h of tileHandles) h.setFade(a);
        },
      });
      continue;
    }

    const tex = makeLabelTexture(dest.id);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const geo = new THREE.PlaneGeometry(SCREEN_W, SCREEN_H);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, dest.anchorZ);
    scene.add(mesh);
    disposables.push(tex, mat, geo);
    anchored.push({
      root: mesh,
      anchorZ: dest.anchorZ,
      setFade: (a) => {
        mat.opacity = a;
      },
    });
    if (dest.id === 'about') {
      mesh.userData.dest = dest.id;
      pickables.push(mesh);
    }
  }

  // treatment-B home mock: hidden 3D stand-in for the DOM homepage, shown
  // only while a flythrough is launching away from the home anchor.
  // Excluded from materialization — its visibility is treatment-B-managed.
  const homeAnchorZ = DESTINATIONS.find((d) => d.id === 'home')?.anchorZ ?? 0;
  const homeMock = makeHomeMock();
  homeMock.position.z = homeAnchorZ;
  homeMock.visible = false;
  scene.add(homeMock);
  anchored.push({ root: homeMock, anchorZ: homeAnchorZ, setFade: () => {} });

  let velocitySource: () => number = () => 0;

  return {
    camera,
    setVelocitySource(fn: () => number): void {
      velocitySource = fn;
    },
    setHomeMockVisible(v: boolean): void {
      homeMock.visible = v;
    },
    pick(ndcX: number, ndcY: number): PickResult | null {
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const hits = raycaster.intersectObjects(pickables, false);
      for (const hit of hits) {
        // skip hits on geometry that's faded out (materialize state) — Raycaster
        // ignores Object3D.visible, so this must be checked explicitly (see
        // isEffectivelyVisible).
        if (!isEffectivelyVisible(hit.object)) continue;
        const { userData } = hit.object;
        if (typeof userData.slug === 'string') return { kind: 'tile', slug: userData.slug };
        if (typeof userData.dest === 'string') return { kind: 'screen', dest: userData.dest as DestId };
      }
      return null;
    },
    setTileHover(slug: string | null): void {
      const mesh = slug !== null ? (tileMeshes[tileIndexForSlug(slug)] ?? null) : null;
      if (mesh === hoveredMesh) return;
      if (hoveredMesh) {
        gsap.killTweensOf(hoveredMesh.scale);
        if (opts.reducedMotion) hoveredMesh.scale.setScalar(1);
        else gsap.to(hoveredMesh.scale, { x: 1, y: 1, z: 1, duration: HOVER_DURATION, ease: HOVER_EASE });
      }
      if (mesh) {
        gsap.killTweensOf(mesh.scale);
        if (opts.reducedMotion) mesh.scale.setScalar(HOVER_SCALE);
        else {
          gsap.to(mesh.scale, {
            x: HOVER_SCALE,
            y: HOVER_SCALE,
            z: HOVER_SCALE,
            duration: HOVER_DURATION,
            ease: HOVER_EASE,
          });
        }
      }
      hoveredMesh = mesh;
    },
    /**
     * Bring a tile to full colour, or return it to grey. The wall sits grey at
     * rest; the pointer and the focused case study are the only two things that
     * put colour on it, and WorkHover arbitrates between them.
     */
    setTileColor(slug: string, on: boolean): void {
      const i = tileIndexForSlug(slug);
      if (i < 0) return;
      const proxy = satProxies[i];
      const handle = tileHandles[i];
      if (!handle) return;
      const target = on ? 1 : 0;
      gsap.killTweensOf(proxy);
      if (opts.reducedMotion) {
        proxy.v = target;
        handle.setSaturation(target);
        return;
      }
      gsap.to(proxy, {
        v: target,
        duration: HOVER_DURATION,
        ease: HOVER_EASE,
        onUpdate: () => handle.setSaturation(proxy.v),
      });
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
        s.setFade(a);
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
      for (const mesh of tileMeshes) gsap.killTweensOf(mesh.scale);
      for (const p of satProxies) gsap.killTweensOf(p);
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
