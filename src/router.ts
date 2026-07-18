import type { CameraDirector } from './three/camera-director';
import { destForPath, pathForDest, type DestId } from './routes';

export interface Router {
  navigate(id: DestId): void;
  destroy(): void;
}

export function initRouter(director: CameraDirector, opts: { reducedMotion: boolean }): Router {
  const go = (id: DestId, abbreviated: boolean): void => {
    if (opts.reducedMotion) director.jumpTo(id);
    else void director.flyTo(id, { abbreviated });
  };

  // URL reflects arrivals (settles and flight landings alike)
  const offArrive = director.onArrive((id) => {
    const path = pathForDest(id);
    if (window.location.pathname !== path) {
      window.history.pushState({ dest: id }, '', path);
    }
  });

  const onPop = (): void => {
    const dest = destForPath(window.location.pathname);
    if (dest) go(dest, true);
  };
  window.addEventListener('popstate', onPop);

  // deep link: arrive with an abbreviated fly-in (instant in reduced motion)
  const initial = destForPath(window.location.pathname);
  if (initial && initial !== 'home') go(initial, true);

  return {
    navigate(id: DestId): void {
      go(id, false);
    },
    destroy(): void {
      offArrive();
      window.removeEventListener('popstate', onPop);
    },
  };
}
