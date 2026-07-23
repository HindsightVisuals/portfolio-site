import type { CameraDirector } from './three/camera-director';
import { destForPath, pathForDest, pathForSlug, slugForPath, type DestId } from './routes';
import { tileFocusTarget } from './three/world';

export interface Router {
  navigate(id: DestId): void;
  navigateToProject(slug: string, opts?: { abbreviated?: boolean }): Promise<void>;
  destroy(): void;
}

export function initRouter(director: CameraDirector, opts: { reducedMotion: boolean }): Router {
  // The pathname the router last knew about (from a push it made, or a
  // popstate it acted on). A popstate landing on the SAME pathname has
  // nothing for us to react to — notably, the takeover controller
  // (src/page2d/takeover.ts) pushes its OWN `{ takeover: true }` history
  // entries on top of whatever page path is already showing, and pops them
  // on close without the underlying path ever changing. Without this guard,
  // that pop would still reach the slug/dest branch below and re-trigger a
  // pointless flight back to a tile the camera never left.
  let currentPath = window.location.pathname;

  const go = (id: DestId, abbreviated: boolean): void => {
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
    if (initial && initial !== 'home') go(initial, true);
  }

  return {
    navigate(id: DestId): void {
      go(id, false);
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
