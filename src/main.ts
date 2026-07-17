import '@fontsource/space-grotesk/700.css';
import '@fontsource/space-mono/400.css';
import './styles/base.css';

import { initBackground } from './three/background';
import { initTagline } from './home/tagline';
import { initReticles } from './home/reticles';
import { runHomeSequence } from './home/sequence';

const canvas = document.querySelector<HTMLCanvasElement>('#bg-canvas');
const taglineEl = document.querySelector<HTMLElement>('.tagline');
const fieldEl = document.querySelector<HTMLElement>('.reticle-field');
if (!canvas || !taglineEl || !fieldEl) throw new Error('homepage DOM incomplete');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const debug = new URLSearchParams(location.search).has('debug-rd');

initBackground(canvas, { reducedMotion, debug });
const tagline = initTagline(taglineEl);
const reticles = initReticles(fieldEl);

void runHomeSequence({ tagline, reticles, reducedMotion });
