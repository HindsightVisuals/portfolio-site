import '@fontsource/space-grotesk/700.css';
import '@fontsource/space-mono/400.css';
import './styles/base.css';

import gsap from 'gsap';
import { initStage } from './three/stage';
import { initBackgroundLayer } from './three/background';
import { initWorld, DESTINATIONS, HOME_REST_Z } from './three/world';
import { initCameraDirector } from './three/camera-director';
import { initTagline } from './home/tagline';
import { initReticles } from './home/reticles';
import { runHomeSequence } from './home/sequence';
import { initScrollNav } from './home/scroll-nav';
import { initRouter } from './router';
import { bindHomeVisibility } from './home/home-visibility';
import { wrapDelta } from './three/loop';
import { DEST_ORDER, destForPath, type DestId } from './routes';

// Lab mode check at the top
if (new URLSearchParams(location.search).get('lab') === 'fly') {
  void import('./lab/fly').then((m) => m.initFlyLab());
} else {
  // Normal site boot
  function initSite(): void {
    const canvas = document.querySelector<HTMLCanvasElement>('#bg-canvas');
    const taglineEl = document.querySelector<HTMLElement>('.tagline');
    const fieldEl = document.querySelector<HTMLElement>('.reticle-field');
    if (!canvas || !taglineEl || !fieldEl) throw new Error('homepage DOM incomplete');

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const debug = new URLSearchParams(location.search).has('debug-rd');
    const debugWorld = new URLSearchParams(location.search).has('debug-world');
    const HOME_LEAVE_DIST = 10; // leaving-home threshold for intro interrupt + treatment B

    const stage = initStage(canvas, { reducedMotion });
    const bg = initBackgroundLayer(stage.renderer, { reducedMotion, debug }, () => {
      if (reducedMotion) stage.requestFrame();
    });
    stage.addLayer(bg);
    const world = initWorld({ reducedMotion });
    bg.setCameraProvider(() => world.camera.position);
    stage.addLayer(world);
    const distFromHome = (): number => Math.abs(wrapDelta(HOME_REST_Z, world.camera.position.z));

    const director = initCameraDirector(world.camera, DESTINATIONS);
    if (debugWorld) director.jumpTo('work');
    world.setVelocitySource(() => director.getVelocity());
    stage.onFrame((dt) => director.update(dt));

    // TODO(phase3): retain handle — setMode('takeover') needed for 2D case-study mode
    if (!reducedMotion) {
      initScrollNav((px) => director.feedScroll(px));
      window.addEventListener('mousemove', (e) => {
        director.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
      });
    }
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
        Math.abs(wrapDelta(d.cameraZ, world.camera.position.z)) <
        Math.abs(wrapDelta(best.cameraZ, world.camera.position.z))
          ? d
          : best,
      );
      const idx = DEST_ORDER.indexOf(current.id) + (e.key === 'ArrowDown' ? 1 : -1);
      const next = DEST_ORDER[(idx + DEST_ORDER.length) % DEST_ORDER.length];
      if (next !== current.id) router.navigate(next);
    });

    // home DOM fades as the camera leaves (reticles; chrome stays). Tagline
    // opacity is owned solely by tagline.ts (via the intro sequence or the
    // scroll-away interrupt below) — it must not also be written here.
    // TODO(phase3): toggle aria-hidden/inert alongside the fade for screen-reader correctness
    const homeEls: HTMLElement[] = [fieldEl];
    const homeVisibility = bindHomeVisibility(homeEls, () => world.camera.position.z);
    stage.onFrame((dt) => homeVisibility.update(dt));

    // reduced motion has no frame loop: force a repaint after every cut
    director.onArrive(() => {
      if (reducedMotion) {
        homeVisibility.update(0);
        stage.requestFrame();
      }
    });

    stage.start();
    const tagline = initTagline(taglineEl);
    const reticles = initReticles(fieldEl, { reducedMotion });

    const bootDest = destForPath(location.pathname) ?? 'home';
    // intro is a single-shot writer racing bindHomeVisibility; kill it the moment
    // the camera leaves home so only one writer touches tagline/reticle opacity
    let introInterrupted = false;
    if (bootDest === 'home') {
      void runHomeSequence({ tagline, reticles, reducedMotion, shouldAbort: () => introInterrupted });
    } else {
      // arriving elsewhere: home content goes straight to its end-state, faded by home-visibility
      tagline.hideInstant();
      reticles.showInstant();
    }

    stage.onFrame(() => {
      if (introInterrupted) return;
      if (distFromHome() > HOME_LEAVE_DIST) { // >10 units from home rest — user is leaving
        introInterrupted = true;
        tagline.hideInstant(); // kills tagline tweens — single writer (home-visibility) remains
        reticles.showInstant(); // reticles present when the user scrolls back home
      }
    });

    // treatment B: on a flythrough departing the home zone, hide the DOM
    // home instantly and show the 3D mock streaking past; on any arrival,
    // hide the mock and restore chrome (reticle field returns to
    // home-visibility's camera-driven fade). Cuts (reduced motion) don't fly,
    // so this is normal-motion only.
    if (!reducedMotion) {
      const chromeEl = document.querySelector<HTMLElement>('.chrome');
      director.onDepart(() => {
        if (distFromHome() < HOME_LEAVE_DIST) { // launching from the home zone
          introInterrupted = true; // stop any in-flight intro for good
          tagline.hideInstant();
          homeVisibility.setSuppressed(true);
          if (chromeEl) gsap.set(chromeEl, { autoAlpha: 0 });
          world.setHomeMockVisible(true);
        }
      });
      director.onArrive((id) => {
        world.setHomeMockVisible(false);
        if (chromeEl) gsap.set(chromeEl, { autoAlpha: 1 });
        homeVisibility.setSuppressed(false);
        if (id === 'home') reticles.showInstant();
      });
    }
  }

  initSite();
}
