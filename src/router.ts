import type { CameraDirector } from './three/camera-director';
import { destForPath, pathForDest, pathForSlug, slugForPath, type DestId } from './routes';
import { tileFocusTarget } from './three/world';

export interface InitRouterOpts {
  reducedMotion: boolean;
  /**
   * About and Contact are corridor scroll positions now, not destinations the
   * camera flies to — DESTINATIONS no longer lists them, so flyTo would reject
   * and jumpTo would silently no-op. Called instead of touching the director,
   * so whoever owns that corridor can jump the camera to its own anchor and
   * scrub to the right place itself. This router never needs to know what a
   * corridor is — only that these two ids are somebody else's to handle.
   */
  onCorridorRoute?(dest: 'about' | 'contact'): void;
}

export interface Router {
  navigate(id: DestId): void;
  navigateToProject(slug: string, opts?: { abbreviated?: boolean }): Promise<void>;
  /**
   * One-shot: skip this router's own URL sync for the very next arrival the
   * director reports. For a caller that is about to move the camera onto a
   * REST this router tracks (e.g. anchoring on Work to hand off to a corridor
   * that owns a different route) for a reason that has nothing to do with
   * actually being on that page — the caller owns the URL for that case and
   * has already set it correctly, so the router's own "sync the URL to
   * wherever the camera just arrived" reaction must not run this once.
   */
  ignoreNextArrival(): void;
  /**
   * Record a history push made OUTSIDE this router (e.g. the contact wipe's
   * own raw `history.pushState('/contact')` before it opens the takeover),
   * so `onPop`'s "did the underlying page actually change" guard compares
   * against the real current path instead of a stale one. Call this
   * immediately after the push it corresponds to — same discipline as
   * ignoreNextArrival, just for the URL side of this router's bookkeeping
   * rather than the arrival side.
   */
  notePush(path: string): void;
  destroy(): void;
}

export function initRouter(director: CameraDirector, opts: InitRouterOpts): Router {
  // The pathname the router last knew about (from a push it made, or a
  // popstate it acted on). A popstate landing on the SAME pathname has
  // nothing for us to react to — notably, the takeover controller
  // (src/page2d/takeover.ts) pushes its OWN `{ takeover: true }` history
  // entries on top of whatever page path is already showing, and pops them
  // on close without the underlying path ever changing. Without this guard,
  // that pop would still reach the slug/dest branch below and re-trigger a
  // pointless flight back to a tile the camera never left.
  let currentPath = window.location.pathname;

  // Armed by ignoreNextArrival(); consumed by the very next onArrive fire.
  let ignoreArrival = false;

  const go = (id: DestId, abbreviated: boolean): void => {
    if (id === 'about' || id === 'contact') {
      // Not a flight: the URL is the one piece of this that IS ours to keep
      // current (onCorridorRoute's caller owns everything else). Push only if
      // it isn't already right — a deep link or a popstate landing here has
      // the browser's own URL already correct, and pushing again would add a
      // redundant history entry.
      const path = pathForDest(id);
      if (destForPath(window.location.pathname) !== id) {
        window.history.pushState({ dest: id }, '', path);
      }
      currentPath = path;
      opts.onCorridorRoute?.(id);
      return;
    }
    if (opts.reducedMotion) director.jumpTo(id);
    else void director.flyTo(id, { abbreviated });
  };

  // Reduced motion uses jumpToFocus — a true instant cut, camera position
  // set directly with no tween and no dependency on a following update()
  // tick (there is no continuous frame loop under reduced motion; see
  // camera-director.ts's jumpToFocus doc comment).
  const goToProject = (slug: string, abbreviated: boolean): Promise<void> => {
    const target = tileFocusTarget(slug, window.innerWidth, window.innerHeight);
    if (opts.reducedMotion) {
      director.jumpToFocus(target);
      return Promise.resolve();
    }
    return director.flyToFocus(target, { abbreviated });
  };

  // URL reflects arrivals (settles and flight landings alike). Compared by
  // dest-equivalence (destForPath), not raw pathname equality, so landing on
  // 'work' after a project focus flight doesn't clobber the /work/[slug]
  // path navigateToProject already pushed for this same arrival.
  //
  // Known wart, accepted for now: scroll-defocusing away from a focused
  // project tile also arrives back at 'work' (via the director's own
  // settle-to-rest, not a router-initiated flight) — destForPath still
  // reports 'work' for the un-navigated-away-from /work/[slug] URL, so this
  // guard skips the pushState and the URL is left pointing at a project the
  // camera has since defocused from. Distinguishing "arrived at work
  // focused-and-framed" from "arrived at work via defocus-settle" needs more
  // state than this router tracks today.
  const offArrive = director.onArrive((id) => {
    if (ignoreArrival) {
      ignoreArrival = false;
      return;
    }
    const path = pathForDest(id);
    if (destForPath(window.location.pathname) !== id) {
      window.history.pushState({ dest: id }, '', path);
      currentPath = path;
    }
  });

  const onPop = (): void => {
    const state = window.history.state as { takeover?: boolean } | null;
    if (state?.takeover === true) return; // takeover controller owns these entries (Task 12)
    const path = window.location.pathname;
    if (path === currentPath) return; // underlying page didn't change (e.g. a takeover entry unwound)
    currentPath = path;
    const slug = slugForPath(path);
    if (slug) {
      void goToProject(slug, true);
      return;
    }
    const dest = destForPath(path);
    if (dest) go(dest, true);
  };
  window.addEventListener('popstate', onPop);

  // deep link: arrive with an abbreviated fly-in (instant in reduced motion)
  const bootSlug = slugForPath(window.location.pathname);
  if (bootSlug) {
    void goToProject(bootSlug, true);
  } else {
    const initial = destForPath(window.location.pathname);
    // 'about'/'contact' are deliberately excluded here even though go()
    // itself now knows how to hand them to onCorridorRoute: that callback is
    // wired to code (the corridor) that is constructed later than this
    // router is, elsewhere in boot. Calling it from here, synchronously
    // during construction, would reach through to state that doesn't exist
    // yet. The corridor's own boot path calls router.navigate() once it's
    // ready instead, well after this constructor returns — see main.ts.
    if (initial && initial !== 'home' && initial !== 'about' && initial !== 'contact') go(initial, true);
  }

  return {
    navigate(id: DestId): void {
      go(id, false);
    },
    ignoreNextArrival(): void {
      ignoreArrival = true;
    },
    notePush(path: string): void {
      currentPath = path;
    },
    navigateToProject(slug: string, navOpts?: { abbreviated?: boolean }): Promise<void> {
      const path = pathForSlug(slug);
      // Validate against SLUGS (via the route helpers, so router.ts doesn't
      // need its own SLUGS import) BEFORE touching history — an unknown
      // slug must reject cleanly, not pollute history and then throw once
      // tileFocusTarget() hits it downstream.
      if (slugForPath(path) !== slug) {
        return Promise.reject(new Error(`navigateToProject: unknown project slug "${slug}"`));
      }
      window.history.pushState({ dest: 'work', slug }, '', path);
      currentPath = path;
      return goToProject(slug, navOpts?.abbreviated ?? false);
    },
    destroy(): void {
      offArrive();
      window.removeEventListener('popstate', onPop);
    },
  };
}
