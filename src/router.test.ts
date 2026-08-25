// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { initCameraDirector, type CameraDirector } from './three/camera-director';
import { DESTINATIONS } from './three/world';
import { initRouter } from './router';

// The REAL DESTINATIONS (home + work only — About and Contact are corridor
// positions, not entries here), not a synthetic fixture: the exact bug this
// suite guards against (F6/Ruling on
// docs/superpowers/sdd/2026-08-24-continuous-flow/progress.md) is specific to
// that shrunk list — flyTo/jumpTo reject or no-op for ids DESTINATIONS
// doesn't contain — and camera-director.test.ts's OWN synthetic 4-entry
// fixture is exactly why the original bug slipped through the suite.
const HOME_Z = DESTINATIONS.find((d) => d.id === 'home')!.cameraZ;

/** camera-director only ever touches `.position`, so a plain vector will do. */
function makeCamera(): { position: { x: number; y: number; z: number } } {
  return { position: { x: 0, y: 0, z: HOME_Z } };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asCamera = (c: ReturnType<typeof makeCamera>): any => c;

function makeDirector(): CameraDirector {
  // reducedMotion: true makes jumpTo/jumpToFocus the operative path — no gsap
  // tween to advance, arrive fires synchronously, which is exactly the
  // behaviour these tests are about (jumpTo('work') firing arrive('work')
  // inline, mid router.navigate()).
  return initCameraDirector(asCamera(makeCamera()), DESTINATIONS, { reducedMotion: true });
}

/** Reset the URL to a known path before each test touches history. */
function setPath(path: string): void {
  window.history.replaceState(null, '', path);
}

describe('initRouter — About/Contact routing', () => {
  afterEach(() => {
    setPath('/');
  });

  it('hands about/contact to onCorridorRoute instead of the director', () => {
    setPath('/');
    const director = makeDirector();
    const seen: Array<'about' | 'contact'> = [];
    const router = initRouter(director, {
      reducedMotion: true,
      onCorridorRoute: (dest) => seen.push(dest),
    });

    router.navigate('about');
    router.navigate('contact');

    expect(seen).toEqual(['about', 'contact']);
    router.destroy();
  });

  it('pushes the route\'s own URL for a corridor route, not a director destination', () => {
    setPath('/');
    const director = makeDirector();
    const router = initRouter(director, { reducedMotion: true, onCorridorRoute: () => {} });

    router.navigate('about');

    expect(window.location.pathname).toBe('/about');
    router.destroy();
  });

  it('does not push again when the URL already matches the route (deep link / popstate case)', () => {
    setPath('/contact');
    const director = makeDirector();
    const lengthBefore = window.history.length;
    const router = initRouter(director, { reducedMotion: true, onCorridorRoute: () => {} });

    router.navigate('contact');

    // No redundant history entry: pushState would grow history.length by 1.
    expect(window.history.length).toBe(lengthBefore);
    expect(window.location.pathname).toBe('/contact');
    router.destroy();
  });

  it('boots on an /about deep link without throwing, and without reaching the director', () => {
    setPath('/about');
    const director = makeDirector();
    let corridorCalls = 0;
    // onCorridorRoute is deliberately never invoked at construction time — see
    // router.ts's boot-nav comment. This just proves construction is safe and
    // that the (broken, pre-fix) flyTo('about') path is never reached.
    expect(() => {
      const router = initRouter(director, {
        reducedMotion: true,
        onCorridorRoute: () => {
          corridorCalls++;
        },
      });
      router.destroy();
    }).not.toThrow();
    expect(corridorCalls).toBe(0);
    // Camera position is untouched by boot — nothing jumped it off the home rest.
    expect(director.getVelocity()).toBe(0);
  });

  it('routes a popstate landing on /contact to onCorridorRoute', () => {
    setPath('/');
    const director = makeDirector();
    const seen: Array<'about' | 'contact'> = [];
    const router = initRouter(director, {
      reducedMotion: true,
      onCorridorRoute: (dest) => seen.push(dest),
    });

    setPath('/contact');
    window.dispatchEvent(new PopStateEvent('popstate', { state: { dest: 'contact' } }));

    expect(seen).toEqual(['contact']);
    router.destroy();
  });

  it('ignoreNextArrival swallows exactly one arrival, then resumes normal URL sync', () => {
    setPath('/about');
    const director = makeDirector();
    const router = initRouter(director, { reducedMotion: true, onCorridorRoute: () => {} });

    router.ignoreNextArrival();
    // jumpTo fires arrive() synchronously under reducedMotion — this is
    // exactly what a corridor's own "park on Work" call does, and it must not
    // clobber the /about the caller (main.ts's enterCorridor) already set.
    director.jumpTo('work');
    expect(window.location.pathname).toBe('/about');

    // The suppression was one-shot: a SECOND, unrelated arrival at work now
    // syncs normally.
    setPath('/'); // simulate having moved away in between
    director.jumpTo('work');
    expect(window.location.pathname).toBe('/work');

    router.destroy();
  });

  it('notePush keeps onPop\'s "did the path actually change" guard honest after an out-of-band pushState', () => {
    setPath('/');
    const director = makeDirector();
    const seen: Array<'about' | 'contact'> = [];
    const router = initRouter(director, {
      reducedMotion: true,
      onCorridorRoute: (dest) => seen.push(dest),
    });

    // Mirrors activateContactWipe (main.ts): a raw history.pushState the
    // router never sees, immediately followed by notePush so the router's
    // own bookkeeping matches reality — exactly the discipline documented on
    // Router.notePush and Router.ignoreNextArrival.
    window.history.pushState({ dest: 'contact' }, '', '/contact');
    router.notePush('/contact');

    // The takeover then pushes its own marker on the SAME URL (no path
    // change — router.ts's onPop already special-cases `state.takeover`,
    // irrelevant to what's being tested here) and Escape's close() unwinds
    // it with one history.back(), landing right back on /contact — the same
    // path notePush just recorded. Nothing actually changed; onPop must
    // recognize that and not re-enter the corridor.
    window.dispatchEvent(new PopStateEvent('popstate', { state: { dest: 'contact' } }));

    expect(seen).toEqual([]);
    router.destroy();
  });
});
