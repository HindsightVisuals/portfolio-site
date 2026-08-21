import '@fontsource/space-grotesk/700.css';
import '@fontsource/space-mono/400.css';
import './styles/base.css';

import gsap from 'gsap';
import { initStage } from './three/stage';
import { initBackgroundLayer } from './three/background';
import { initWorld, DESTINATIONS, HOME_REST_Z, SLUGS } from './three/world';
import { getProject } from './content/projects';
import { initCameraDirector } from './three/camera-director';
import { initTagline } from './home/tagline';
import { initReticles } from './home/reticles';
import { runHomeSequence } from './home/sequence';
import { initScrollNav, type ScrollNav } from './home/scroll-nav';
import { initRouter } from './router';
import { bindHomeVisibility } from './home/home-visibility';
import { wrapDelta } from './three/loop';
import { DEST_ORDER, destForPath, slugForPath, withBase, type DestId } from './routes';
import { initTakeover } from './page2d/takeover';
import type { Strip } from './page2d/strip';
import type { LogoStage } from './page2d/logo-stage';
import type { RdSurface } from './page2d/rd-surface';
import type { CurtainLive } from './page2d/curtain-live';
import type { BehindPanel } from './page2d/behind-panel';

/**
 * Everything a takeover page needs, loaded on first open. Keeps GLTFLoader and
 * the case-study stylesheet out of the initial bundle — nothing here is
 * reachable until the user opens a page.
 */
type TakeoverPageMods = typeof import('./page2d/takeover-page');
let pageMods: TakeoverPageMods | null = null;
let pageModsLoading: Promise<TakeoverPageMods> | null = null;
const loadPageMods = (): Promise<TakeoverPageMods> => {
  if (pageMods) return Promise.resolve(pageMods);
  pageModsLoading ??= import('./page2d/takeover-page').then((m) => {
    pageMods = m;
    return m;
  });
  return pageModsLoading;
};
import { initScreenProxies } from './home/screen-proxies';
import { initCursor } from './home/cursor';
import { initFerro, type FerroController } from './ferro/ferro';
import type { Rect } from './ferro/ferro-placement';
import { isDarkTile } from './work/tiles';
import { initHoverPanel } from './work/hover-panel';
import { initWorkHover } from './work/work-hover';

// Module-level input mode tracking; Task 12's takeover controller will update
// inputMode and call scrollNav.setMode() — keep both names greppable for future refactors.
let inputMode: 'world' | 'takeover' = 'world';

// Disposer for the currently-open takeover page's mountReveal() observer
// (page2d/reveal.ts). mountReveal returns a cleanup fn that disconnects its
// IntersectionObserver and drops its references to the (detached-on-close)
// article; nothing else in the close paths (Escape, popstate, cloth click,
// wordmark/contact) invokes it, so each open leaked an observer + the whole
// article subtree. Cleared here on the takeover's 'world' onModeChange —
// which runOpen/runClose (page2d/takeover.ts) fire on every close path
// except destroy() (page-lifetime teardown, not a mode change) — and
// defensively before every new mountReveal() call in case a caller ever
// opens a second page without an intervening close.
let activeRevealCleanup: (() => void) | null = null;

// The pinned horizontal strip measures against the live .takeover scroll root,
// so like mountReveal it binds after open() and is torn down on close.
let activeStrip: Strip | null = null;

// The 3D logo frames itself against DOM rects inside the live takeover, so it
// mounts after open() alongside the strip and is disposed on close.
let activeLogo: LogoStage | null = null;

// The case study page runs its own reaction-diffusion field on a second
// renderer — page background plus the RD-filled COMMMS mark.
let activeRd: RdSurface | null = null;

// The curtain's warp/ripple loop and the "logo goes behind" panel's magnetism,
// both bound to the live page and torn down with it.
let activeCurtain: CurtainLive | null = null;
let activeBehind: BehindPanel | null = null;

// Lab mode check at the top
const lab = new URLSearchParams(location.search).get('lab');
if (lab === 'ferro') {
  void import('./lab/ferro').then((m) => m.initFerroLab());
} else if (lab === 'fly') {
  void import('./lab/fly').then((m) => m.initFlyLab());
} else {
  // Normal site boot
  function initSite(): void {
    const canvas = document.querySelector<HTMLCanvasElement>('#bg-canvas');
    const taglineEl = document.querySelector<HTMLElement>('.tagline');
    const fieldEl = document.querySelector<HTMLElement>('.reticle-field');
    const screenProxiesEl = document.querySelector<HTMLElement>('.screen-proxies');
    if (!canvas || !taglineEl || !fieldEl || !screenProxiesEl) throw new Error('homepage DOM incomplete');

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const debug = new URLSearchParams(location.search).has('debug-rd');
    const debugWorld = new URLSearchParams(location.search).has('debug-world');
    const HOME_LEAVE_DIST = 10; // leaving-home threshold for intro interrupt + treatment B

    const stage = initStage(canvas, { reducedMotion });
    // F15: null on coarse pointers, where the whole system is gated off and the
    // OS cursor is left alone. Every consumer below treats null as normal.
    const cursor = initCursor({ reducedMotion });
    // Mounted further down, once router/takeover exist; declared here so the
    // ground-flip call sites below can reach it.
    let ferro: FerroController | null = null;

    /**
     * The blob's home on a 2D page. From *Work - Contact Ferro Placement*
     * (`87:2240`): 227x218 at x1693,y862 in a 1920x1080 frame — i.e. flush to
     * the bottom-right margin, sized ~11.8% of viewport width.
     */
    const cornerRect = (): Rect => {
      const w = Math.round(window.innerWidth * 0.118);
      return { x: window.innerWidth - w - 48, y: window.innerHeight - w - 48, w, h: w };
    };
    const bg = initBackgroundLayer(stage.renderer, { reducedMotion, debug }, () => {
      if (reducedMotion) stage.requestFrame();
    });
    stage.addLayer(bg);
    const world = initWorld({ reducedMotion });
    bg.setCameraProvider(() => world.camera.position);
    stage.addLayer(world);
    const distFromHome = (): number => Math.abs(wrapDelta(HOME_REST_Z, world.camera.position.z));

    const director = initCameraDirector(world.camera, DESTINATIONS, { reducedMotion });
    // RD travel stretch: the background deforms along the axis of travel while
    // the camera is moving (scroll, flythroughs and settling all feed this).
    bg.setVelocityProvider(() => director.getVelocity());
    // Press-and-hold sucks the RD field toward the cursor. Null cursor (coarse
    // pointer) means no pull, which is the right behaviour on touch anyway.
    bg.setPullProvider(() => cursor?.getHoldProgress() ?? 0);
    // WORK wall hover: tile colour, the cursor-anchored panel, and the camera
    // lean toward a peeked neighbour, all behind one controller.
    const workHover = initWorkHover({
      world,
      director,
      panel: initHoverPanel({ reducedMotion }),
    });
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
        // The ferrofluid rides 2D pages only — the home world has the synth nav
        // for that job (architecture spec §1).
        if (mode === 'takeover') {
          void ferro?.placeAt(cornerRect(), { instant: true });
          ferro?.setGlow(true);
          ferro?.show();
        } else {
          ferro?.hide();
        }
        // A takeover with no window onto the world can pause it immediately
        // (About). A case study keeps it alive until its curtain scrolls off —
        // see the scroll handler below, which owns the pause from then on.
        if (mode === 'world') stage.setPaused(false);
        if (mode === 'world') {
          // Back to the light world; the wall hover takes over from here.
          cursor?.setOnDark(false);
          activeRevealCleanup?.();
          activeRevealCleanup = null;
          activeStrip?.destroy();
          activeStrip = null;
          activeLogo?.destroy();
          activeLogo = null;
          activeRd?.destroy();
          activeRd = null;
          activeCurtain?.destroy();
          activeCurtain = null;
          activeBehind?.destroy();
          activeBehind = null;
        }
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

    // takeover.close() unwinds its own pushed history entry via an async
    // history.back(); that popstate lands on the path that was current before
    // the takeover opened (matching router.currentPath, so router.onPop
    // no-ops). Any history push made before that unwind lands (navigateToProject,
    // or a plain router.navigate) moves currentPath first, so the unwind then
    // looks like a real back-navigation and router.onPop re-flies to the OLD
    // destination — clobbering the navigation that was just requested. Every
    // takeover-close-then-navigate path (Next, wordmark, contact) must await
    // the unwind before pushing again. The listener is registered in the
    // microtask after close() resolves — ahead of the queued popstate
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

    const closeTakeoverThenNavigate = async (id: DestId): Promise<void> => {
      await takeover.close();
      await afterTakeoverHistoryUnwind();
      router.navigate(id);
    };

    const makeTakeoverNavbar = (m: TakeoverPageMods): HTMLElement =>
      m.buildNavbar({
        reducedMotion,
        // No onCloth: the v1 cloth-V tab is gone from takeover pages entirely.
        // The curtain replaced it on case studies, and Escape covers the rest.
        onWordmark: () => void closeTakeoverThenNavigate('home'),
        onNav: (dest) => void closeTakeoverThenNavigate(dest),
      });

    // open() appends the page synchronously (before its swipe tween — verified
    // in takeover.ts runOpen), so mountReveal can bind the reveal observer to
    // the now-live `.takeover` scroll root immediately, without awaiting the
    // animation. Pages are built fresh per open (no caching).
    const openCaseStudy = async (slug: string): Promise<void> => {
      const m = await loadPageMods();
      // The module arrives a tick later, so re-check: a second activation
      // during the load must not open a second page on top of the first.
      if (takeover.isOpen()) return;
      const page = m.buildCaseStudy(slug, {
        reducedMotion,
        navbar: makeTakeoverNavbar(m),
        deferReveal: true,
        // The curtain is the close affordance now (brief 7.9) — same
        // takeover.close() the navbar cloth notch used to call.
        onClose: () => void takeover.close(),
        // Footer site nav — same close-then-navigate path the navbar uses.
        onNav: (dest) => void closeTakeoverThenNavigate(dest),
        onNext: async (next) => {
          await takeover.close();
          await afterTakeoverHistoryUnwind();
          // Fly to the neighbour and then open it, rather than stopping at the
          // framed tile and making the user click again — Adam, 2026-08-18:
          // "it should bring you straight to the next case study, not back out
          // to the work thumbnails". The flight still plays, so the move
          // between projects reads as travel rather than a cut.
          await router.navigateToProject(next, { abbreviated: true });
          void openCaseStudy(next);
        },
      });
      void takeover.open(page);
      cursor?.setOnDark(true); // the case study page inverts the palette
      activeRevealCleanup?.(); // defensive: dispose any still-live observer before overwriting
      activeRevealCleanup = m.mountReveal(page, { reducedMotion });
      activeStrip?.destroy();
      activeStrip = m.initStrip(page);
      activeLogo?.destroy();
      activeLogo = m.initLogoStage(page, withBase, { reducedMotion, slug });
      activeRd?.destroy();
      // The page-background RD is gone (Adam, 2026-08-18: "kill the RD on the
      // case study pages"). The surface now exists solely for the footer
      // logotype, and idles unless that mark is on screen.
      activeRd = m.initRdSurface(page, { reducedMotion });
      activeCurtain?.destroy();
      activeCurtain = m.mountCurtain(page, { reducedMotion });
      activeBehind?.destroy();
      activeBehind = m.initBehindPanel(page, {
        reducedMotion,
        setCursorLabel: (l) => cursor?.setLabel(l),
      });
    };

    // openContact() is gone with the summon that was its only caller. The
    // Pass-1 contact takeover it opened is a placeholder that beat 4 replaces
    // wholesale (architecture spec §7.2), so Plan 2 builds its successor rather
    // than inheriting it. `buildContact` still ships from the page2d chunk.
    // Contact-as-a-place is unaffected: it is a camera destination in the
    // world, which the footer, the nav and a /contact deep link all still fly to.

    const openAbout = async (): Promise<void> => {
      const m = await loadPageMods();
      if (takeover.isOpen()) return;
      const page = m.buildAbout({
        reducedMotion,
        navbar: makeTakeoverNavbar(m),
        deferReveal: true,
        onContact: () => void closeTakeoverThenNavigate('contact'),
      });
      void takeover.open(page);
      activeRevealCleanup?.(); // defensive: dispose any still-live observer before overwriting
      activeRevealCleanup = m.mountReveal(page, { reducedMotion });
    };

    // Shared routing decision for a WORK tile / the ABOUT screen, used by
    // BOTH the canvas click handler (mouse, via raycast pick) and the
    // keyboard-only screen-proxy buttons below (spec: Accessibility section
    // of docs/superpowers/specs/2026-07-22-phase3-signature-journey-design.md
    // — tiles/About need keyboard-reachable proxies since the 3D hit targets
    // otherwise only respond to a mouse click). Framed already → open in
    // place; not framed → navigate/fly to frame it (a second activation then
    // opens — same two-step the mouse already requires).
    const activateTile = (slug: string): void => {
      if (takeover.isOpen()) return;
      if (director.isFocused() && slug === slugForPath(location.pathname)) void openCaseStudy(slug);
      else navToProject(slug);
    };
    // The contact SUMMON is gone with the RD mark. Contact is a real routed
    // page now, entered through the beat 2-4 transition, so the ordering bug
    // that forced the summon to leave the URL alone no longer applies: the
    // route is pushed at the START of the transition rather than by onArrive
    // ~2s later, which is what used to land /contact on top of the takeover's
    // own history marker and kill the back button. See
    // docs/superpowers/specs/2026-08-21-contact-flow-architecture.md §7.
    //
    // Until Plan 3 builds the nav emblem that triggers that transition, there
    // is no contact PAGE — see the openContact note above. Contact as a place
    // in the world is untouched: the footer, the nav and a /contact deep link
    // all still fly the camera to its screen, so the scroll loop still closes.

    const activateAbout = (): void => {
      if (takeover.isOpen()) return;
      if (Math.abs(wrapDelta(aboutRest, world.camera.position.z)) < ABOUT_REST_EPS) void openAbout();
      else router.navigate('about');
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
        const scrolled = t.scrollTop > NOTCH_SCROLL_THRESHOLD_PX;
        nav?.classList.toggle('nav2d--scrolled', scrolled);
        // Stop the 3D world once the curtain — the only window onto it — has
        // scrolled out of frame. Nothing of the world is visible past that
        // point, and on a 4K display it is the most expensive thing running.
        const curtain = t.querySelector<HTMLElement>('.cs-curtain');
        if (curtain) {
          const gone = curtain.getBoundingClientRect().bottom <= 0;
          stage.setPaused(gone);
        }
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
      // The blob only lives on 2D pages, but it reads the pointer from the one
      // throttled handler either way — a second raw listener would double the
      // per-move work for no gain.
      ferro?.setPointer(p);
      if (takeover.isOpen()) {
        world.setTileHover(null);
        workHover.setHovered(null);
        // The takeover covers the canvas; its own DOM drives hover from here.
        if (cursor) cursor.setWorldHover(false);
        else canvas.style.cursor = '';
        return;
      }
      const ndcX = (p.x / window.innerWidth) * 2 - 1;
      const ndcY = -((p.y / window.innerHeight) * 2 - 1);
      const hit = world.pick(ndcX, ndcY);
      const hoveredSlug = hit?.kind === 'tile' ? hit.slug : null;
      // A black cursor disappears on Naboso, Spy Hop and Animal; tell it to go
      // white over those rather than hoping a blend mode sorts it out.
      cursor?.setOnDark(hoveredSlug !== null && isDarkTile(hoveredSlug));
      world.setTileHover(hoveredSlug);
      workHover.setPointer(p.x, p.y);
      workHover.setHovered(hoveredSlug);
      // With the custom cursor mounted the OS cursor is hidden, so the inline
      // 'pointer' write is meaningless — feed the square instead. The inline
      // write survives only as the coarse-pointer fallback.
      if (cursor) cursor.setWorldHover(!!hit);
      else canvas.style.cursor = hit ? 'pointer' : '';
    };
    window.addEventListener('mousemove', (e) => {
      pendingPointer = { x: e.clientX, y: e.clientY };
      if (!hoverRaf) hoverRaf = requestAnimationFrame(processHover);
    });
    // Pointer gone from the window entirely: let the drift ease back to its
    // unsteered Z travel rather than holding the last steer forever.
    document.documentElement.addEventListener('pointerleave', () => {
      pendingPointer = null;
      ferro?.setPointer(null);
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
      if (hit.kind === 'tile') activateTile(hit.slug);
      else if (hit.dest === 'about') activateAbout();
    });

    // Nav links AND the wordmark fly (full-length flythrough). The selector is
    // any [data-nav] inside .chrome rather than just .site-nav anchors, so the
    // wordmark's home button is picked up by the same wiring.
    for (const el of document.querySelectorAll<HTMLElement>('.chrome [data-nav]')) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        if (takeover.isOpen()) return; // a takeover covers the chrome; its own navbar handles nav
        router.navigate(el.dataset.nav as DestId);
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
    // (home-visibility.ts also toggles `inert` alongside the fade — see its
    // own doc comment for the ownership split with takeover.ts.)
    const homeEls: HTMLElement[] = [fieldEl];
    const homeVisibility = bindHomeVisibility(homeEls, () => world.camera.position.z);
    stage.onFrame((dt) => homeVisibility.update(dt));

    // Which tile is framed, for tile colour and the panel. The router keeps
    // /work/[slug] current on every project arrival, so the URL is the source of
    // truth — the same one activateTile() reads.
    director.onArrive(() => {
      workHover.setFocused(director.isFocused() ? slugForPath(location.pathname) : null);
    });
    director.onDepart(() => workHover.setFocused(null));

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
      // SLUGS[i] -> its project's real title (content/projects.ts is the
      // single source of truth), not the WORK-wall tile label array in
      // world.ts (that one's private) — keeps reticles.ts a plain UI
      // component driven entirely by opts, no dependency on either the
      // three.js world module or the content loader.
      titles: SLUGS.map((slug) => getProject(slug).title),
      onActivate: (i) => {
        if (takeover.isOpen()) return; // guard: takeover mode swallows home nav
        navToProject(SLUGS[i]);
      },
    });
    initScreenProxies(screenProxiesEl, {
      slugs: SLUGS,
      onTile: activateTile,
      onAbout: activateAbout,
    });

    // One stage, mounted once, hidden until a 2D page asks for it.
    ferro = initFerro({ reducedMotion });

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
