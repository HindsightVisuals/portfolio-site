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

  // CameraDirector has no cut-only equivalent of flyToFocus (jumpTo only
  // takes a DestId, not an arbitrary focus target) — see camera-director.ts.
  // Reduced motion here falls back to an abbreviated flyToFocus rather than
  // a true instant cut. Flagged in task-11-report.md as a concern rather
  // than adding new director API unreviewed.
  const goToProject = (slug: string, abbreviated: boolean): Promise<void> => {
    const target = tileFocusTarget(slug, window.innerWidth, window.innerHeight);
    return director.flyToFocus(target, { abbreviated: opts.reducedMotion ? true : abbreviated });
  };

  // URL reflects arrivals (settles and flight landings alike). Compared by
  // dest-equivalence (destForPath), not raw pathname equality, so landing on
  // 'work' after a project focus flight doesn't clobber the /work/[slug]
  // path navigateToProject already pushed for this same arrival.
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
