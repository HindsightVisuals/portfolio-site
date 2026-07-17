import '@fontsource/space-grotesk/700.css';
import '@fontsource/space-mono/400.css';
import './styles/base.css';

import { initBackground } from './three/background';
import { initTagline } from './home/tagline';
import { initReticles } from './home/reticles';

const canvas = document.querySelector<HTMLCanvasElement>('#bg-canvas');
if (!canvas) throw new Error('#bg-canvas not found');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const debug = new URLSearchParams(location.search).has('debug-rd');

initBackground(canvas, { reducedMotion, debug });

const tagline = initTagline(document.querySelector<HTMLElement>('.tagline')!);
// TEMP demo (replaced by sequence in Task 6):
tagline.dissolveIn().then(() => tagline.startFloat());

const reticles = initReticles(document.querySelector<HTMLElement>('.reticle-field')!);
// TEMP demo (replaced by sequence in Task 6):
reticles.buildOn();
