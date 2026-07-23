import '@fontsource/space-grotesk/700.css';
import '@fontsource/space-mono/400.css';
import './styles/base.css';

import gsap from 'gsap';
import { initStage } from './three/stage';
import { initBackgroundLayer } from './three/background';
import { initWorld, DESTINATIONS, HOME_REST_Z, SLUGS } from './three/world';
import { initCameraDirector } from './three/camera-director';
import { initTagline } from './home/tagline';
import { initReticles } from './home/reticles';
import { runHomeSequence } from './home/sequence';
import { initScrollNav, type ScrollNav } from './home/scroll-nav';
import { initRouter } from './router';
import { bindHomeVisibility } from './home/home-visibility';
import { wrapDelta } from './three/loop';
import { DEST_ORDER, destForPath, slugForPath, type DestId } from './routes';
import { initTakeover } from './page2d/takeover';
import { buildNavbar } from './page2d/navbar';
import { buildCaseStudy } from './page2d/case-study';
import { buildAbout } from './page2d/about';
import { mountReveal } from './page2d/reveal';

// Module-level input mode tracking; Task 12's takeover controller will update
// inputMode and call scrollNav.setMode() — keep both names greppable for future refactors.
let inputMode: 'world' | 'takeover' = 'world';

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

    let scrollNav: ScrollNav | null = null;
    if (!reducedMotion) {
      scrollNav = initScrollNav((px) => director.feedScroll(px));
      window.addEventListener('mousemove', (e) => {
        director.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
      });
    }
    const router = initRouter(director, { reducedMotion });

    // --- 2D takeover wiring (Task 12): the DOM side of the signature journey ---
    const aboutRest = DESTINATIONS.find((d) => d.id === 'about')!.cameraZ;
    // Camera within this wrapped-z distance of the ABOUT screen's rest counts
    // as "framed at rest" — a click then opens the About takeover in place
    // rather than flying to it first.
    const ABOUT_REST_EPS = 2;
    // scrollTop past which the nav2d notch closes (paints #fdfdfd over the
    // live-canvas window) — see .nav2d--scrolled in page2d.css.
    const NOTCH_SCROLL_THRESHOLD_PX = 32;

    const takeover = initTakeover({
      reducedMotion,
      onModeChange(mode) {
        // Both gates share this single source of truth: the arrow-key handler
        // reads the module-let `inputMode`; the wheel handler reads scrollNav's
        // own mode. (scrollNav is null under reduced motion — no wheel nav.)
        inputMode = mode;
        scrollNav?.setMode(mode);
      },
    });

    // The slug the camera is framed on is derived from the URL at click time,
    // never stored: the router keeps /work/[slug] current on EVERY project
    // arrival (navigate, next, pop, deep-link), so slugForPath(location.pathname)
    // is always the framed tile. (The router's known stale-URL wart — scroll-
    // defocus leaves the /work/[slug] URL in place — is harmless here because
    // director.isFocused() is false by then, so the open-guard below falls
    // through to a re-navigate regardless.)
    const navToProject = (slug: string): void => {
      void router.navigateToProject(slug);
    };

    const makeTakeoverNavbar = (): HTMLElement =>
      buildNavbar({
        reducedMotion,
        onCloth: () => void takeover.close(),
        onWordmark: () => void takeover.close().then(() => router.navigate('home')),
        onContact: () => void takeover.close().then(() => router.navigate('contact')),
      });

    // takeover.close() unwinds its own pushed history entry via an async
    // history.back(); that popstate lands on the current project path (matching
    // router.currentPath, so router.onPop no-ops). A push made before it lands
    // (navigateToProject) moves currentPath first, so the unwind then looks like
    // a real back-navigation and router.onPop re-flies to the OLD slug. Await
    // the unwind before pushing the next project. The listener is registered in
    // the microtask after close() resolves — ahead of the queued popstate
    // macrotask — so it can't be missed; the timeout is a safety net for paths
    // that pushed no history entry.
    const afterTakeoverHistoryUnwind = (): Promise<void> =>
      new Promise((resolve) => {
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          window.removeEventListener('popstate', finish);
          clearTimeout(timer);
          resolve();
        };
        window.addEventListener('popstate', finish);
        const timer = setTimeout(finish, 100);
      });

    // open() appends the page synchronously (before its swipe tween — verified
    // in takeover.ts runOpen), so mountReveal can bind the reveal observer to
    // the now-live `.takeover` scroll root immediately, without awaiting the
    // animation. Pages are built fresh per open (no caching).
    const openCaseStudy = (slug: string): void => {
      const page = buildCaseStudy(slug, {
        reducedMotion,
        navbar: makeTakeoverNavbar(),
        deferReveal: true,
        onNext: async (next) => {
          await takeover.close();
          await afterTakeoverHistoryUnwind();
          await router.navigateToProject(next, { abbreviated: true });
        },
      });
      void takeover.open(page);
      mountReveal(page, { reducedMotion });
    };

    const openAbout = (): void => {
      const page = buildAbout({
        reducedMotion,
        navbar: makeTakeoverNavbar(),
        deferReveal: true,
        onContact: () => void takeover.close().then(() => router.navigate('contact')),
      });
      void takeover.open(page);
      mountReveal(page, { reducedMotion });
    };

    // nav2d notch: close the live-canvas window once the takeover body scrolls
    // past the threshold, reopen it at the top. Capture phase because scroll
    // events don't bubble; matches on the `.takeover` container so it tracks
    // whichever page is currently open. Reduced motion behaves identically —
    // this is a visibility correctness rule, not decorative motion.
    window.addEventListener(
      'scroll',
      (e) => {
        const t = e.target;
        if (!(t instanceof HTMLElement) || !t.classList.contains('takeover')) return;
        const nav = t.querySelector<HTMLElement>('.nav2d');
        nav?.classList.toggle('nav2d--scrolled', t.scrollTop > NOTCH_SCROLL_THRESHOLD_PX);
      },
      true,
    );

    // Pointer hover over the world: RAF-throttled pick drives tile hover + the
    // canvas cursor. No-ops while a takeover covers the viewport.
    let pendingPointer: { x: number; y: number } | null = null;
    let hoverRaf = 0;
    const processHover = (): void => {
      hoverRaf = 0;
      const p = pendingPointer;
      if (!p) return;
      if (takeover.isOpen()) {
        world.setTileHover(null);
        canvas.style.cursor = '';
        return;
      }
      const ndcX = (p.x / window.innerWidth) * 2 - 1;
      const ndcY = -((p.y / window.innerHeight) * 2 - 1);
      const hit = world.pick(ndcX, ndcY);
      world.setTileHover(hit?.kind === 'tile' ? hit.slug : null);
      canvas.style.cursor = hit ? 'pointer' : '';
    };
    window.addEventListener('mousemove', (e) => {
      pendingPointer = { x: e.clientX, y: e.clientY };
      if (!hoverRaf) hoverRaf = requestAnimationFrame(processHover);
    });

    // Click routing: a focused tile opens its takeover; any other tile flies to
    // frame it; the ABOUT screen at rest opens the About takeover, otherwise
    // flies there. No-ops while a takeover is open (it also covers the canvas).
    canvas.addEventListener('click', (e) => {
      if (takeover.isOpen()) return;
      const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      const ndcY = -((e.clientY / window.innerHeight) * 2 - 1);
      const hit = world.pick(ndcX, ndcY);
      if (!hit) return;
      if (hit.kind === 'tile') {
        if (director.isFocused() && hit.slug === slugForPath(location.pathname)) openCaseStudy(hit.slug);
        else navToProject(hit.slug);
      } else if (hit.dest === 'about') {
        if (Math.abs(wrapDelta(aboutRest, world.camera.position.z)) < ABOUT_REST_EPS) openAbout();
        else router.navigate('about');
      }
    });

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
      if (inputMode === 'takeover') return; // Task 12: takeover mode disables world navigation
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

    // First render must follow initRouter: under reduced motion the router's
    // deep-link boot does an instant jumpTo/jumpToFocus (no frame loop to paint
    // it later), so the camera must be positioned before this first paint or
    // the deep-linked cut arrives one frame stale.
    stage.start();
    const tagline = initTagline(taglineEl);
    const reticles = initReticles(fieldEl, {
      reducedMotion,
      onActivate: (i) => {
        if (takeover.isOpen()) return; // guard: takeover mode swallows home nav
        navToProject(SLUGS[i]);
      },
    });

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
