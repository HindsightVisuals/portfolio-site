import * as THREE from 'three';
import { initStage } from '../three/stage';
import { initArray } from '../about/array/array';

/**
 * `?lab=array` — the comms array on its own, at fixed framing.
 *
 * Deliberately does NOT mount the corridor: the array is being built as a
 * standalone subsystem so it does not wait on the about-flow.ts split.
 */
export async function initArrayLab(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#bg-canvas');
  if (!canvas) throw new Error('#bg-canvas not found');

  document.querySelector<HTMLElement>('.tagline')?.style.setProperty('display', 'none');
  document.querySelector<HTMLElement>('.chrome')?.style.setProperty('opacity', '0');
  document.querySelector<HTMLElement>('.reticle-field')?.style.setProperty('display', 'none');

  const stage = initStage(canvas, { reducedMotion: false });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  // 50mm on a 36mm sensor at 16:9 -> about 22.9 degrees vertical.
  const camera = new THREE.PerspectiveCamera(
    22.9,
    window.innerWidth / window.innerHeight,
    0.01,
    100,
  );
  camera.position.set(0, 0.6, -4.5);
  camera.lookAt(0, 0.6, 0);

  // The rig's three lights, at their measured powers. World strength is 0 in
  // Blender, so there is deliberately no ambient or environment term — the
  // scene is meant to be near-black except where emission catches it.
  const area = new THREE.DirectionalLight(0xffffff, 1.6);
  area.position.set(0.086, 2.52, 0.287);
  const fill = new THREE.PointLight(0xffffff, 2.5, 0, 2);
  fill.position.set(0.079, 0.668, 0.857);
  const key = new THREE.PointLight(new THREE.Color(0.288, 1, 0.361), 0.4, 0, 2);
  key.position.set(0.47, 0.865, -0.264);
  scene.add(area, fill, key);

  const array = await initArray({ el: canvas, camera, reducedMotion: false });
  scene.add(array.group);

  stage.addLayer({
    update: (dt) => array.update(dt),
    render: (renderer) => renderer.render(scene, camera),
    resize: (w, h) => {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
  });
  stage.start();

  console.info('[array lab] ready');
}
