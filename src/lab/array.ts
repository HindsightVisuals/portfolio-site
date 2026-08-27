import * as THREE from 'three';
import { initStage } from '../three/stage';
import { initArray } from '../about/array/array';

/**
 * Where the camera sits relative to the dish, in Three space.
 *
 * Taken from AboutLander_Model.blend's OWN camera, which is the framing the
 * model was authored against: Blender (0, -4.558, 0.578) against a dish at
 * (-0.0163, 0.3823, 0.6395).
 *
 * NOT the corridor camera. Threejs Flow1.blend reaches its look-up framing by
 * rotating the whole About Lander collection 90 degrees about X, so relative to
 * the model's own axes its camera is still level and in front. Copying the
 * corridor's offset put the camera 4.17 below the dish -- underneath a terrain
 * whose floor is at -0.20, i.e. buried.
 */
const CAM_OFFSET_FROM_DISC = new THREE.Vector3(0.0163, -0.0615, 4.9403);

/**
 * `?lab=array` — the comms array on its own, at the model's own framing.
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
  stage.renderer.toneMappingExposure = 1.0;

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

  // Frame the dish wherever the export put it.
  array.group.updateMatrixWorld(true);
  // Aim at the dish's VISUAL centre, not its node origin — they differ by
  // about 0.39 in y, which is enough to push the dish off screen centre and
  // take the pointer mapping with it.
  const discNode = array.disc.getWorldPosition(new THREE.Vector3());
  const discWorld = discNode;
  camera.position.copy(discNode).add(CAM_OFFSET_FROM_DISC);
  camera.lookAt(array.discCentre);

  // A camera that ends up inside the terrain renders a screenful of rock and
  // nothing else, with no error to explain it. Say so.
  const groundBox = new THREE.Box3().setFromObject(array.group);
  console.info(
    `[array lab] camera ${camera.position.toArray().map((v) => v.toFixed(2)).join(', ')} | ` +
      `dish ${discWorld.toArray().map((v) => v.toFixed(2)).join(', ')} | ` +
      `scene y ${groundBox.min.y.toFixed(2)}..${groundBox.max.y.toFixed(2)}`,
  );

  // The rig's three lights, at their measured positions relative to the dish.
  // World strength is 0 in Blender, so there is deliberately no ambient or
  // environment term — the scene is near-black except where emission catches it.
  // Offsets are each light's world position in AboutLander_Model.blend minus
  // the dish's, converted to Three space. Intensities are CONVERTED GUESSES --
  // Blender watts do not map onto Three candela directly, so these are the
  // first knob to reach for if the scene reads too hot or too dark.
  const at = (o: THREE.Vector3): THREE.Vector3 => discWorld.clone().add(o);

  // Intensity is chosen for a TARGET RADIANCE at the light's own distance,
  // because inverse-square at these ranges is brutal: the fill sits 0.48 from
  // the dish, so a nominal intensity of 10 arrives as 43 and burns the panels
  // to white. `lit(offset, radiance)` removes that trap.
  const lit = (o: THREE.Vector3, radiance: number): number => radiance * o.lengthSq();

  const areaOff = new THREE.Vector3(0.1027, 1.8815, 0.095);
  const fillOff = new THREE.Vector3(0.0949, 0.0285, -0.4746);
  const keyOff = new THREE.Vector3(0.4861, 0.2257, 0.6462);

  const area = new THREE.PointLight(0xffffff, lit(areaOff, 1.5), 0, 2);
  area.position.copy(at(areaOff));
  const fill = new THREE.PointLight(0xffffff, lit(fillOff, 1.1), 0, 2);
  fill.position.copy(at(fillOff));
  const key = new THREE.PointLight(new THREE.Color(0.288, 1, 0.361), lit(keyOff, 0.7), 0, 2);
  key.position.copy(at(keyOff));
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

  // Expose for debugging: automation tabs have no rAF, so the only way to
  // inspect live geometry is to reach into it from the console.
  if (new URLSearchParams(location.search).has('debug-path')) {
    (window as unknown as { __array: unknown }).__array = array;
  }

  console.info('[array lab] ready');
}
