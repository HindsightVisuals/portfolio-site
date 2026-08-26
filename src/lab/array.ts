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

  /**
   * Blender's Z-up coordinates in Three's Y-up space.
   *
   * `(x, y, z)` becomes `(x, z, -y)` — note the NEGATED y. Dropping that sign
   * mirrors the scene through the origin, which put the camera behind the dish
   * and every light on the wrong side. It looks plausible enough in a dark
   * scene to survive a glance, so the conversion lives here rather than being
   * done by hand at each call site.
   */
  const fromBlender = (x: number, y: number, z: number): THREE.Vector3 =>
    new THREE.Vector3(x, z, -y);

  // 50mm on a 36mm sensor at 16:9 -> about 22.9 degrees vertical.
  const camera = new THREE.PerspectiveCamera(
    22.9,
    window.innerWidth / window.innerHeight,
    0.01,
    100,
  );
  camera.position.copy(fromBlender(0, -4.558, 0.578));
  camera.lookAt(0, 0.578, 0);

  // The rig's three lights, at their measured powers and world positions.
  // World strength is 0 in Blender, so there is deliberately no ambient or
  // environment term — the scene is meant to be near-black except where
  // emission catches it.
  const area = new THREE.DirectionalLight(0xffffff, 1.6);
  area.position.copy(fromBlender(0.0864, 0.2873, 2.521));
  const fill = new THREE.PointLight(0xffffff, 2.5, 0, 2);
  fill.position.copy(fromBlender(0.0786, 0.8569, 0.668));
  const key = new THREE.PointLight(new THREE.Color(0.288, 1, 0.361), 0.4, 0, 2);
  key.position.copy(fromBlender(0.4698, -0.2639, 0.8652));
  scene.add(area, fill, key);

  const array = await initArray({ el: canvas, camera, reducedMotion: false });
  scene.add(array.group);

  // The panel material is a raw ShaderMaterial, so Three's light uniforms do
  // not reach it — hand it the same three lights explicitly. Colours are
  // pre-multiplied by intensity because the shader divides by distance squared.
  array.setLights(
    [area.position, fill.position, key.position],
    [
      area.color.clone().multiplyScalar(area.intensity * 6),
      fill.color.clone().multiplyScalar(fill.intensity),
      key.color.clone().multiplyScalar(key.intensity),
    ],
  );

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
