import * as THREE from 'three';

export function initScene(canvas: HTMLCanvasElement): void {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f1e8);

  const camera = new THREE.PerspectiveCamera(
    35,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(3, 2.5, 5);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(5, 5, 5);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffe4b5, 0.5);
  fill.position.set(-3, 2, 2);
  scene.add(fill);

  const chassisGeometry = new THREE.BoxGeometry(2.2, 0.6, 1.4);
  const chassisMaterial = new THREE.MeshStandardMaterial({
    color: 0xff7e6b,
    roughness: 0.55,
    metalness: 0.08,
  });
  const chassis = new THREE.Mesh(chassisGeometry, chassisMaterial);
  scene.add(chassis);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const tick = (): void => {
    chassis.rotation.y += 0.005;
    chassis.rotation.x += 0.002;
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };

  tick();
}
