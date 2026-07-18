import '@fontsource/space-grotesk/700.css';
import '@fontsource/space-mono/400.css';
import './styles/base.css';

import { initStage } from './three/stage';
import { initBackgroundLayer } from './three/background';
import { initWorld, DESTINATIONS } from './three/world';
import { initCameraDirector } from './three/camera-director';
import { initTagline } from './home/tagline';
import { initReticles } from './home/reticles';
import { runHomeSequence } from './home/sequence';
import { initScrollNav } from './home/scroll-nav';
import { initRouter } from './router';
import { bindHomeVisibility } from './home/home-visibility';
import { DEST_ORDER, destForPath, type DestId } from './routes';

const canvas = document.querySelector<HTMLCanvasElement>('#bg-canvas');
const taglineEl = document.querySelector<HTMLElement>('.tagline');
const fieldEl = document.querySelector<HTMLElement>('.reticle-field');
if (!canvas || !taglineEl || !fieldEl) throw new Error('homepage DOM incomplete');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const debug = new URLSearchParams(location.search).has('debug-rd');
const debugWorld = new URLSearchParams(location.search).has('debug-world');

const stage = initStage(canvas, { reducedMotion });
stage.addLayer(
  initBackgroundLayer(stage.renderer, { reducedMotion, debug }, () => {
    if (reducedMotion) stage.requestFrame();
  }),
);
const world = initWorld({ reducedMotion });
if (debugWorld) world.camera.position.z = -26;
stage.addLayer(world);

const director = initCameraDirector(world.camera, DESTINATIONS);
world.setVelocitySource(() => director.getVelocity());
stage.onFrame((dt) => director.update(dt));

if (!reducedMotion) initScrollNav((px) => director.feedScroll(px));
const router = initRouter(director, { reducedMotion });

// nav links fly (full-length flythrough)
for (const a of document.querySelectorAll<HTMLAnchorElement>('.site-nav a[data-nav]')) {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    router.navigate(a.dataset.nav as DestId);
  });
}

// keyboard: arrows step through the page order
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const current = DESTINATIONS.reduce((best, d) =>
    Math.abs(d.cameraZ - world.camera.position.z) < Math.abs(best.cameraZ - world.camera.position.z) ? d : best,
  );
  const idx = DEST_ORDER.indexOf(current.id) + (e.key === 'ArrowDown' ? 1 : -1);
  const next = DEST_ORDER[Math.min(Math.max(idx, 0), DEST_ORDER.length - 1)];
  if (next !== current.id) router.navigate(next);
});

// home DOM fades as the camera leaves (reticles; chrome stays). Tagline
// opacity is owned solely by tagline.ts (via the intro sequence or the
// scroll-away interrupt below) — it must not also be written here.
const homeEls: HTMLElement[] = [fieldEl];
const updateHomeVisibility = bindHomeVisibility(homeEls, () => world.camera.position.z);
stage.onFrame(updateHomeVisibility);

// reduced motion has no frame loop: force a repaint after every cut
director.onArrive(() => {
  if (reducedMotion) {
    updateHomeVisibility(0);
    stage.requestFrame();
  }
});

stage.start();
const tagline = initTagline(taglineEl);
const reticles = initReticles(fieldEl, { reducedMotion });

const bootDest = destForPath(location.pathname) ?? 'home';
if (bootDest === 'home') {
  void runHomeSequence({ tagline, reticles, reducedMotion, shouldAbort: () => introInterrupted });
} else {
  // arriving elsewhere: home content goes straight to its end-state, faded by home-visibility
  tagline.hideInstant();
  reticles.showInstant();
}

// intro is a single-shot writer racing bindHomeVisibility; kill it the moment
// the camera leaves home so only one writer touches tagline/reticle opacity
let introInterrupted = false;
stage.onFrame(() => {
  if (introInterrupted) return;
  if (world.camera.position.z < 24) { // >10 units from home rest (34) — user is leaving
    introInterrupted = true;
    tagline.hideInstant(); // kills tagline tweens — single writer (home-visibility) remains
    reticles.showInstant(); // reticles present when the user scrolls back home
  }
});
