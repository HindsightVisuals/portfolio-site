// src/about/about-flow.ts
import * as THREE from 'three';
import { DESTINATIONS } from '../three/world';
import { buildAboutPath, type AboutPath } from './about-path';
import { GATE_IDLE_MS } from './about-gate-control';
import { createReturnFlight } from './about-return';
import { createPresentation } from './about-presentation';
import { createSession } from './about-session';

/**
 * The About corridor's controller — the only stateful module in src/about/.
 *
 * It owns three things and delegates everything else: the scroll binding, the
 * per-frame write onto the world camera, and the enter/exit handover. All the
 * maths lives in the pure modules beside it.
 *
 * Handover, not replacement. camera-director keeps its state and is merely
 * suspended, so leaving the corridor returns the site's zoom grammar exactly as
 * it was rather than rebuilding it.
 */

// Re-exported so about-flow.test.ts's existing import keeps resolving; the
// definition now lives in about-gate-control.ts, alongside the rest of the
// gate's state.
export { GATE_IDLE_MS };

export interface AboutFlowDeps {
  camera: THREE.PerspectiveCamera;
  /**
   * The camera director, suspended for the corridor's lifetime.
   *
   * `syncTo` is as load-bearing as `setSuspended`: the director writes
   * `camera.position` from its own remembered pose on every non-suspended
   * frame, so whatever position the corridor hands back has to be told to it
   * first or the next tick teleports the camera away. See its doc in
   * camera-director.ts.
   */
  director: { setSuspended(v: boolean): void; syncTo(z: number): void };
  world: { setAboutMode(v: boolean): void; setAnchoredFade(a: number): void };
  atmosphere: { setInk(v: number): void };
  scrollNav: { setMode(m: 'world' | 'takeover' | 'about'): void } | null;
  ferro: {
    placeAt(rect: { x: number; y: number; w: number; h: number }, opts?: { instant?: boolean }): Promise<void>;
    show(): void;
    hide(): void;
  } | null;
  ferroEl: HTMLElement | null;
  cursor: { setOnDark(v: boolean): void } | null;
  /**
   * The WebGL background layer, for the palette-driven day/night ground.
   * Applies to the unmasked field only (see background.ts's setInvert doc) —
   * exactly the case here, since the home/work/about/contact background is
   * never masked. Null-safe: reduced motion never calls apply() (see
   * about-session.ts's onScroll, and setScrollForTest below), so this is
   * simply never read in that mode — the canvas itself is hidden there
   * instead (see enter/exit).
   */
  background: { setInvertAmount(t: number): void } | null;
  setGround(css: string): void;
  /**
   * Writes `--ink` (body text; also read directly by several `.chrome`
   * children — base.css). A sibling of `setGround` above, same shape, driven
   * by the palette's `textInk` rather than `ground`. Distinct from
   * `atmosphere.setInk` above: that one takes a NUMBER for an unrelated
   * shader uniform — same word, unrelated axis.
   */
  setTextInk(css: string): void;
  reducedMotion: boolean;
}

export interface AboutFlow {
  /**
   * @param startT Where along the path to land, 0..1. Defaults to the top —
   * pass a value for a deep link straight into the corridor.
   */
  enter(parent: HTMLElement, startT?: number): void;
  exit(): void;
  /**
   * Fly the camera from wherever the corridor left it back to Home, then hand
   * over. The footer gate's payoff.
   *
   * Its own move rather than exit()+flyTo: exit() CUTS to the anchor before
   * releasing the director, so reusing it would jump the camera up to the Work
   * rest and only then fly — worse than the snap this replaces. And the
   * director's travel methods write position only; the return has to
   * interpolate orientation too, from a pitched off-spine pose.
   */
  returnHome(): Promise<void>;
  /**
   * Arrow-key navigation from inside the corridor: one beat forward (+1) or
   * back (−1). Backward from the very top leaves the corridor, mirroring the
   * wheel. See the implementation's own comment for the full ruling.
   */
  stepBeat(dir: 1 | -1): void;
  /**
   * Test/debug seam: step the return flight to a given 0..1 progress.
   *
   * Guarded on `open` alone — unlike its two siblings below, which mirror
   * about-session.ts's onScroll and onWheel, this one mirrors doReturnHome
   * (same module), whose only guard is `open` (the return is a legitimate
   * move under reduced motion, and runs whether or not the corridor is
   * paused). Without any guard at all it ran the flight's whole teardown —
   * releaseSharedState, setSuspended(false) — on a corridor that was never
   * open.
   */
  stepReturnForTest(p: number): void;
  /**
   * Test/debug seam: feed the footer gate a raw px delta, bypassing a real
   * wheel event — same reasoning as setScrollForTest below. Mirrors onWheel's
   * own open/paused/reducedMotion guard, since it bypasses the listener that
   * normally enforces it.
   */
  feedGateForTest(deltaPx: number): void;
  /**
   * Hold the corridor while something covers it — the contact modal.
   *
   * NOT exit(): contact is a surface over wherever you are, so closing it must
   * put you back at the beat you opened it from. exit() would reset the camera
   * pose and release the director, and you would find yourself at the Work
   * rest with the corridor unmounted.
   */
  pause(): void;
  /**
   * Give the wheel back to the corridor, and re-assert the current beat's
   * palette/cursor/ferro so whatever paused it (contact's own close-out to
   * 'world') doesn't leave those in the wrong, light-world state. Safe to
   * call when never paused.
   */
  resume(): void;
  isOpen(): boolean;
  /** Test/debug seam: the current path parameter. */
  t(): number;
  /** The corridor's camera path — routing needs it to resolve a beat to a t. */
  path(): AboutPath;
  /**
   * Drive the scrub directly, bypassing the DOM.
   *
   * jsdom gives every element a zero-height box, so a scroll-driven controller
   * cannot be tested through real scroll events — this is the only way to put
   * the corridor at a known `t` in a test.
   *
   * Guarded on `paused` as well as open/reducedMotion. onScroll
   * (about-session.ts) itself does not check `paused` because pause()
   * DETACHES it — this seam bypasses that listener, so it has to carry the
   * term the detach was standing in for, or a test could scrub a corridor the
   * contact takeover is covering. Exactly the discipline feedGateForTest
   * already follows for onWheel.
   */
  setScrollForTest(t: number): void;
  destroy(): void;
}

export function initAboutFlow(deps: AboutFlowDeps): AboutFlow {
  const anchorRest = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ;
  const path: AboutPath = buildAboutPath(new THREE.Vector3(0, 0, anchorRest));

  // The return flight home, and both ends of the camera handover it closes
  // with (about-return.ts). Its own poses and scratch live in there.
  const flight = createReturnFlight(
    {
      camera: deps.camera,
      director: deps.director,
      ferroEl: deps.ferroEl,
      reducedMotion: deps.reducedMotion,
    },
    path,
  );

  // The per-frame presentation write, given a `t` — about-presentation.ts.
  // Does not own `t`: the session is the sole writer of it (see
  // about-session.ts's scrubTo) and passes it in on every call.
  const presentation = createPresentation(
    {
      camera: deps.camera,
      world: deps.world,
      atmosphere: deps.atmosphere,
      scrollNav: deps.scrollNav,
      ferro: deps.ferro,
      ferroEl: deps.ferroEl,
      cursor: deps.cursor,
      background: deps.background,
      setGround: deps.setGround,
      setTextInk: deps.setTextInk,
      reducedMotion: deps.reducedMotion,
    },
    path,
  );

  // The state machine itself — about-session.ts. What it returns IS the
  // AboutFlow above: this function is the front door (the public contract and
  // its docs) and the wiring, nothing else.
  return createSession({ deps, path, presentation, flight });
}
