// src/about/about-return.ts
import * as THREE from 'three';
import gsap from 'gsap';
import { HOME_REST_Z } from '../three/world';
import { type AboutPath } from './about-path';
import { footerRiseAt } from './about-scrub';

/**
 * The corridor's return flight home, and BOTH ends of the camera handover it
 * closes with.
 *
 * The flight is the only move that hands the camera back while it is somewhere
 * the director has never heard of, so `syncTo` is as load-bearing here as
 * `setSuspended` — which is why this module takes the director's full type
 * rather than the half of it the flight happens to call last. The session that
 * owns the corridor's lifecycle passes its teardown in as `onLanded`; the order
 * that teardown runs in relative to the two director calls is the whole point
 * of the p >= 1 branch below.
 */

/**
 * Duration of the return flight home (returnHome), in seconds. Long enough to
 * read as travel across the ~53-unit gap between the corridor's end pose and
 * Home, short enough not to trap the user at the footer. A tuning value.
 */
const RETURN_S = 1.6;

/**
 * Fraction of the return flight over which the corridor's document (and the
 * blob riding above it) fades away.
 *
 * The flight exists so the loop closes as TRAVEL rather than as a cut. Tearing
 * the document down only at p >= 1 — which is what this used to do — left the
 * whole corridor, footer and all, painted opaquely over the canvas for the
 * full 1.6s while the camera flew behind it: invisible travel, and a cut
 * again, just a delayed one. Fading rather than destroying at p = 0 keeps the
 * crossfade the spec asked for; 0.45 clears the document early enough that
 * most of the flight is actually watched.
 */
const RETURN_FADE_P = 0.45;

export interface ReturnFlightDeps {
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
  ferroEl: HTMLElement | null;
  reducedMotion: boolean;
}

export interface ReturnFlight {
  /**
   * Depart. `onDepart` is the session's own departure work (its idle timer,
   * its listeners); `onLanded` is its teardown, run at p >= 1 BEFORE the
   * director is told anything — see applyReturn's p >= 1 branch.
   *
   * `docRoot` is taken once, here, rather than read through a thunk: the
   * document cannot be replaced mid-flight, since the listeners are detached
   * and enter() cannot run while the corridor is open.
   */
  start(o: {
    t: number;
    docRoot: HTMLElement | null;
    onDepart(): void;
    onLanded(): void;
  }): Promise<void>;
  step(p: number): void;
  inFlight(): boolean;
}

export function createReturnFlight(deps: ReturnFlightDeps, path: AboutPath): ReturnFlight {
  // returnHome()'s scratch poses — module-scoped so applyReturn (an onUpdate
  // callback GSAP calls every tick) never allocates.
  const fromPos = new THREE.Vector3();
  const fromQuat = new THREE.Quaternion();
  const homePos = new THREE.Vector3(0, 0, HOME_REST_Z);
  const homeQuat = new THREE.Quaternion();
  let returnResolve: (() => void) | null = null;
  // The chrome's lift at the instant the flight departs, so applyReturn can
  // interpolate it back down rather than dropping it (see there). Captured
  // rather than recomputed from `t` per tick because `t` is frozen for the
  // flight's duration and the flight, not the scrub, owns this now.
  let fromRise = 0;
  // Captured at departure alongside the poses above, for the same reason: both
  // are read every tick by applyReturn, and neither can change while the
  // flight is in the air.
  let docRoot: HTMLElement | null = null;
  let landed: (() => void) | null = null;

  /**
   * Step the return flight to progress p (0..1), writing the camera pose and,
   * at p>=1, closing the corridor out and handing back to the director.
   *
   * Its own move rather than exit()+a director flyTo: exit() cuts the camera
   * to the anchor before releasing the director, and the director's travel
   * methods write position only — the return has to interpolate orientation
   * too, from the corridor's actual (pitched, off-spine) end pose.
   */
  const applyReturn = (p: number): void => {
    const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2; // easeInOutQuad
    deps.camera.position.lerpVectors(fromPos, homePos, e);
    deps.camera.quaternion.copy(fromQuat).slerp(homeQuat, e);
    // Uncover the flight. The corridor's document (z-index 1) and the blob
    // (z-index 25) both paint OVER the canvas; left opaque for the whole
    // 1.6s, they hide the very travel this move exists to show. Faded rather
    // than destroyed at p = 0 so the two images cross rather than cut.
    const fade = 1 - Math.min(1, Math.max(0, p) / RETURN_FADE_P);
    if (docRoot) docRoot.style.opacity = String(fade);
    if (deps.ferroEl) deps.ferroEl.style.opacity = String(fade);
    // Ride the chrome home with the camera instead of dropping it at the door.
    //
    // The gate only arms at the corridor's END, so the flight always starts
    // with the footer fully risen and the chrome parked at the top of the
    // viewport. --footer-rise used to be REMOVED, and only at p >= 1 — so on
    // the designed exit the wordmark and nav held top: 50px for the entire
    // 1.6s and then jumped half a viewport back to centre in a single frame,
    // over the Home view, with nothing fading to cover it. Interpolating it
    // down here is the whole fix: the chrome descends as the camera flies.
    // Off the EASED e, not raw p, so it tracks the camera's own curve rather
    // than merely finishing at the same time. The session's onLanded()
    // (releaseSharedState) still removes this property at p >= 1 — by then it
    // reads 0 anyway, so there is nothing left to snap.
    document.documentElement.style.setProperty('--footer-rise', String(fromRise * (1 - e)));
    // --gate-show is deliberately NOT written here any more (it used to ride
    // the same fromRise*(1-e) ramp as --footer-rise above). That write
    // existed only because the gate panel used to be `position: fixed`,
    // painted OVER the fading document rather than inside it, so nothing else
    // would have carried it out of view. Now that the panel is mounted
    // through footer.ts's `gate` slot — a normal descendant of `doc.root` —
    // the `fade` write four lines up already takes it to invisible (well
    // before the flight lands: RETURN_FADE_P clears the whole document at
    // p = 0.45, long before --footer-rise/e reach 0), so a second write here
    // would be redundant at best. It would also fight the opacity transition
    // about.css now puts on .about-gate for the fade-IN: retargeting that
    // transition every tick, exactly the conflict this property used to
    // create for --footer-rise's chrome consumers, just relocated. Leaving
    // gateFed's last value (always '1' here — the flight only starts once the
    // gate has been fed) in place for the rest of the flight is correct: it
    // is already invisible via the document fade, and the session's
    // onLanded() (releaseSharedState) still clears it outright at p >= 1.
    if (p >= 1) {
      // The session's own teardown — open/paused/doc/lastBeat/t and
      // releaseSharedState — FIRST, and the two director calls after it. The
      // director resumes writing the camera from there and must not do so
      // while the world is still in About mode.
      landed?.();
      // BEFORE setSuspended(false), and the whole reason the loop closes at
      // all. The director's remembered state.z has been frozen at the Work
      // rest since enter() suspended it, and its update() writes
      // camera.position.z = state.z unconditionally on every non-suspended
      // frame — so without this the very next tick teleported the camera from
      // Home (34) straight back to −26, one frame after the flight landed.
      //
      // exit() gets the same thing right by CUTTING the camera to the rest the
      // director already remembers (see its comment); a flight cannot do that,
      // so the director is told where the camera ended up instead. syncTo, not
      // jumpTo: jumpTo fires departCbs, and main.ts subscribes
      // `onDepart(() => aboutFlow.exit())` to those — which would cut the
      // camera to the Work rest itself, undoing the flight.
      deps.director.syncTo(homePos.z);
      deps.director.setSuspended(false);
      // Dropped here for the same reason the session's onLanded() above sets
      // its own `doc` to null: the document has just been destroyed, and a
      // tween still in the air after a hand-stepped landing must not go on
      // writing opacity onto a detached root.
      docRoot = null;
      const r = returnResolve;
      returnResolve = null;
      r?.();
    }
  };

  return {
    start(o): Promise<void> {
      o.onDepart();
      landed = o.onLanded;
      docRoot = o.docRoot;
      fromPos.copy(deps.camera.position);
      fromQuat.copy(deps.camera.quaternion);
      // Where the chrome is sitting as the flight departs — applyReturn walks it
      // back to 0 across the flight. Read from the path rather than from the DOM
      // so it is the same number apply() last wrote, not a re-parsed string.
      fromRise = footerRiseAt(o.t, path);
      // The document fades out under the flight (applyReturn) but stays mounted
      // until p >= 1; a transparent footer must not still be clickable.
      if (docRoot) docRoot.style.pointerEvents = 'none';
      if (deps.reducedMotion) {
        applyReturn(1);
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        returnResolve = resolve;
        const p = { v: 0 };
        gsap.to(p, {
          v: 1,
          duration: RETURN_S,
          ease: 'none',
          onUpdate: () => applyReturn(p.v),
        });
      });
    },
    step(p: number): void {
      applyReturn(p);
    },
    // `returnResolve` is the in-flight flag: non-null for exactly as long as
    // the animated flight is running (start() sets it, applyReturn's p >= 1
    // branch clears it).
    inFlight: () => returnResolve !== null,
  };
}
