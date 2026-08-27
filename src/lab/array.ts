import * as THREE from 'three';
import { initStage } from '../three/stage';
import { initArray } from '../about/array/array';

/**
 * Blender's Z-up coordinates in Three's Y-up space.
 *
 * `(x, y, z)` becomes `(x, z, -y)` — note the NEGATED y. Dropping that sign
 * mirrors the scene through the origin, which puts the camera behind the dish
 * and every light on the wrong side. It looks plausible enough in a dark scene
 * to survive a glance, so the conversion lives in one named place.
 */
const fromBlender = (x: number, y: number, z: number): THREE.Vector3 =>
  new THREE.Vector3(x, z, -y);

/**
 * Where the corridor's camera sits relative to the dish, in Three space.
 *
 * Measured in `Threejs Flow1.blend` at the About Page Beat (frame 105): the
 * camera is at Blender (0, 36.269, 4.52) and the dish's centre at
 * (-0.016, 36.735, 8.695). The camera is therefore 4.17 BELOW the dish and
 * looking up at it — which is what the marker's 179.9-degree pitch encodes.
 */
const CAM_OFFSET_FROM_DISC = fromBlender(0.0163, -0.4656, -4.1747);

/**
 * `?lab=array` — the comms array on its own, framed as the corridor frames it.
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

  // Blender renders under Filmic / Medium High Contrast. Three has no Filmic;
  // AgX is the nearest built-in and rolls the bright emission off instead of
  // clipping it to flat green. Both of these are TUNING VALUES, not measured.
  stage.renderer.toneMapping = THREE.AgXToneMapping;
  stage.renderer.toneMappingExposure = 1.35;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  // 50mm on a 36mm sensor -> 39.6 degrees horizontal. Three's fov is VERTICAL,
  // so it is derived per aspect below, keeping the horizontal field matched to
  // Blender whatever shape the window is.
  const H_FOV = 39.6;
  const vFovFor = (aspect: number): number =>
    THREE.MathUtils.radToDeg(
      2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(H_FOV) / 2) / Math.max(aspect, 1e-6)),
    );

  const aspect0 = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(vFovFor(aspect0), aspect0, 0.01, 200);

  const array = await initArray({ el: canvas, camera, reducedMotion: false });
  scene.add(array.group);

  // Frame the dish exactly as the corridor does, wherever the export put it.
  array.group.updateMatrixWorld(true);
  const discWorld = array.disc.getWorldPosition(new THREE.Vector3());
  camera.position.copy(discWorld).add(CAM_OFFSET_FROM_DISC);
  camera.lookAt(discWorld);

  // The rig's three lights, at their measured positions relative to the dish.
  // World strength is 0 in Blender, so there is deliberately no ambient or
  // environment term — the scene is near-black except where emission catches it.
  const at = (bx: number, by: number, bz: number): THREE.Vector3 =>
    discWorld.clone().add(fromBlender(bx, by, bz));

  const area = new THREE.PointLight(0xffffff, 3.2, 0, 2);
  area.position.copy(at(0.1, 0.26, 3.28));
  const fill = new THREE.PointLight(0xffffff, 2.2, 0, 2);
  fill.position.copy(at(0.1, -0.03, 0.47));
  const key = new THREE.PointLight(new THREE.Color(0.288, 1, 0.361), 1.4, 0, 2);
  key.position.copy(at(0.22, -0.86, 2.73));
  scene.add(area, fill, key);

  // The panel material is a raw ShaderMaterial, so Three's light uniforms do
  // not reach it — hand it the same three lights explicitly. Colours are
  // pre-multiplied by intensity because the shader divides by distance squared.
  array.setLights(
    [area.position, fill.position, key.position],
    [
      area.color.clone().multiplyScalar(area.intensity),
      fill.color.clone().multiplyScalar(fill.intensity),
      key.color.clone().multiplyScalar(key.intensity),
    ],
  );

  stage.addLayer({
    update: (dt) => array.update(dt),
    render: (renderer) => renderer.render(scene, camera),
    resize: (w, h) => {
      camera.aspect = w / h;
      camera.fov = vFovFor(camera.aspect);
      camera.updateProjectionMatrix();
    },
  });
  stage.start();

  console.info('[array lab] ready');
}
