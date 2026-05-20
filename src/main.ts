import { initScene } from './three/scene';

const canvas = document.querySelector<HTMLCanvasElement>('#synth-canvas');

if (!canvas) {
  throw new Error('#synth-canvas not found');
}

initScene(canvas);
