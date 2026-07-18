import gsap from 'gsap';
import * as THREE from 'three';
import { initStage } from '../three/stage';
import { initBackgroundLayer } from '../three/background';
import { initWorld, DESTINATIONS } from '../three/world';
import { initCameraDirector } from '../three/camera-director';

type Treatment = 'A' | 'B';

/** Rough 3D stand-ins for the home DOM used by treatment B. */
function makeHomeMock(): THREE.Group {
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

export function initFlyLab(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#bg-canvas');
  if (!canvas) throw new Error('#bg-canvas not found');

  // hide the normal homepage DOM except chrome; lab drives everything
  document.querySelector<HTMLElement>('.tagline')?.style.setProperty('display', 'none');

  const stage = initStage(canvas, { reducedMotion: false });
  stage.addLayer(initBackgroundLayer(stage.renderer, { reducedMotion: false, debug: false }));
  const world = initWorld({ reducedMotion: false });
  stage.addLayer(world);
  const director = initCameraDirector(world.camera, DESTINATIONS);
  world.setVelocitySource(() => director.getVelocity());
  stage.onFrame((dt) => director.update(dt));

  const homeMock = makeHomeMock();
  homeMock.visible = false;
  // world's scene is private — mount the mock via a tiny extra layer instead
  const mockScene = new THREE.Scene();
  mockScene.add(homeMock);
  stage.addLayer({
    render: (r) => r.render(mockScene, world.camera),
  });

  let treatment: Treatment = 'A';
  const domHome = [
    document.querySelector<HTMLElement>('.reticle-field'),
    document.querySelector<HTMLElement>('.chrome'),
  ].filter((x): x is HTMLElement => x !== null);

  const setTreatment = (t: Treatment): void => {
    treatment = t;
    homeMock.visible = t === 'B';
    for (const el of domHome) el.style.opacity = t === 'B' ? '0' : '1';
    help.textContent = helpText();
  };

  const reset = (): void => {
    director.jumpTo('home');
    gsap.set(domHome, { opacity: treatment === 'B' ? 0 : 1, scale: 1 });
    homeMock.visible = treatment === 'B';
  };

  const fly = (): void => {
    if (treatment === 'A') {
      // DOM scales past the viewport edges + fades as the camera launches
      gsap.to(domHome, { scale: 1.6, opacity: 0, duration: 0.3, ease: 'power2.in' });
    }
    void director.flyTo('work').then(() => {
      help.textContent = `${helpText()} — landed. R to reset.`;
    });
  };

  const helpText = (): string =>
    `FLY LAB · treatment ${treatment} (1=DOM scale+fade, 2=3D mock) · SPACE=fly · R=reset`;

  const help = document.createElement('div');
  help.style.cssText =
    'position:fixed;bottom:16px;left:16px;z-index:99;font:12px monospace;color:#141414;background:#ffffffcc;padding:8px 12px;';
  help.textContent = helpText();
  document.body.appendChild(help);

  window.addEventListener('keydown', (e) => {
    if (e.key === '1') setTreatment('A');
    if (e.key === '2') setTreatment('B');
    if (e.key === ' ') fly();
    if (e.key === 'r' || e.key === 'R') reset();
  });

  setTreatment('A');
  stage.start();
}
