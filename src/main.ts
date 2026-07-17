import '@fontsource/space-grotesk/700.css';
import '@fontsource/space-mono/400.css';
import './styles/base.css';

import { initBackground } from './three/background';

const canvas = document.querySelector<HTMLCanvasElement>('#bg-canvas');
if (!canvas) throw new Error('#bg-canvas not found');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const debug = new URLSearchParams(location.search).has('debug-rd');

initBackground(canvas, { reducedMotion, debug });

// Task 4: initTagline · Task 5: initReticles · Task 6: runHomeSequence
