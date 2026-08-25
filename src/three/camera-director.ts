import gsap from 'gsap';
import type * as THREE from 'three';
import type { DestId } from '../routes';
import { HOME_REST_Z, type Destination } from './world';
import { focusReducer, type FocusState } from './focus';
import { nearestWrapped, resolveSnapTargetLooped, sameSpot, wrapDelta, SPINE_PERIOD } from './loop';
import { shouldSnapNow } from './snap';
import { approachExp, magnetTarget } from './magnet';

/** Nearest wrapped instance; exact half-period ties resolve FORWARD (deeper, -z) —
 * the loop's canonical travel direction (Home -> Work -> About -> Contact -> ...). */
const wrappedTarget = (anchorZ: number, fromZ: number): number => {
  const n = nearestWrapped(anchorZ, fromZ);
  const d = n - fromZ;
  if (Math.abs(Math.abs(d) - SPINE_PERIOD / 2) < 1e-6 && d > 0) return n - SPINE_PERIOD;
  return n;
};

/* Motion constants — lab-tuned values land in Task 7. */
const FLY_S = 2.0;
const FLY_ABBREVIATED_S = 0.8;
const FLY_EASE = 'power3.inOut';
/** Settle duration. Short on purpose: with scroll-end detection driving the
 *  snap (see shouldSnapNow), this runs the instant you stop scrolling, so it
 *  has to read as a snap onto the page rather than a slow drift toward it. */
const SETTLE_S = 0.55;
const SETTLE_EASE = 'power3.out';
const SCROLL_GAIN = 0.06;        // wheel px -> velocity (units/s)
const DAMPING_RATE = 2.2;        // exponential velocity decay per second
const SNAP_BELOW = 2.0;          // |v| floor that begins settling if the wheel never goes quiet
const FOCUS_RELEASE_S = 0.9;     // lateral ease-home duration when focus is broken by scroll
/* Peek lean toward a hovered neighbour — "a little bit of elasticity" per the brief. */
const PEEK_S = 0.9;
const PEEK_EASE = 'elastic.out(1, 0.75)';

type Mode = 'free' | 'settling' | 'flying';

export interface CameraDirector {
  flyTo(id: DestId, opts?: { abbreviated?: boolean }): Promise<void>;
  flyToFocus(target: { x: number; y: number; z: number }, opts?: { abbreviated?: boolean }): Promise<void>;
  /** Lean the camera off its base by (dx, dy) world units — a peek at a neighbour. */
  peekTo(dx: number, dy: number): void;
  /** Return the lean to zero. */
  clearPeek(): void;
  jumpTo(id: DestId): void;
  jumpToFocus(target: { x: number; y: number; z: number }): void;
  feedScroll(pixels: number): void;
  setPointer(nx: number, ny: number): void;
  update(dt: number): void;
  /**
   * Hand the camera to another controller (the About scrub). While suspended,
   * update() writes nothing and scroll is swallowed — banking momentum through
   * a scrub of several thousand pixels would fire the whole lot on exit.
   */
  setSuspended(v: boolean): void;
  onArrive(cb: (id: DestId) => void): () => void;
  onDepart(cb: (dest: DestId) => void): () => void;
  getVelocity(): number;
  isFocused(): boolean;
  destroy(): void;
}

export function initCameraDirector(
  camera: THREE.PerspectiveCamera,
  destinations: Destination[],
  opts?: { now?: () => number; reducedMotion?: boolean },
): CameraDirector {
  const rests = destinations.map((d) => d.cameraZ);
  const now = opts?.now ?? (() => performance.now());
  const reducedMotion = opts?.reducedMotion ?? false;

  const state = { z: destinations[0].cameraZ };
  const lateral = { x: 0, y: 0 }; // off-axis flight-target lateral offset (focus mode)
  // Pointer magnet, held separately from `lateral` and ADDED to it rather than
  // filtered together with it — see magnet.ts for why that separation is what
  // makes zoom and pan land on the same frame.
  const magnet = { x: 0, y: 0 };
  // Peek lean toward a hovered neighbour. A THIRD additive term, deliberately
  // NOT folded into `lateral`: lateral is the focus target, and overwriting it
  // would lose where the camera has to return to when the peek ends.
  const peek = { x: 0, y: 0 };
  let peekTween: gsap.core.Tween | null = null;
  let focusState: FocusState = 'free';
  let velocity = 0;
  let measuredVelocity = 0;
  // Timestamp of the last wheel event. -Infinity means "no scroll yet", which
  // reads as infinitely idle — correct, since there is no gesture in progress
  // to wait on.
  let lastScrollAt = -Infinity;
  let mode: Mode = 'free';
  let suspended = false;
  let settleTween: gsap.core.Tween | null = null;
  let lateralTween: gsap.core.Tween | null = null;
  let pendingFlyResolve: (() => void) | null = null;
  let pointerX = 0;
  let pointerY = 0;
  const arriveCbs = new Set<(id: DestId) => void>();
  const departCbs = new Set<(dest: DestId) => void>();

  const emitArrive = (z: number): void => {
    const dest = destinations.find((d) => sameSpot(d.cameraZ, z));
    if (dest) for (const cb of arriveCbs) cb(dest.id);
  };

  /** Destination whose cameraZ is nearest z by wrapped distance (used for focus flights,
   * whose target.z is an arbitrary off-axis point rather than an exact rest). */
  const nearestDestId = (z: number): DestId => {
    let best = destinations[0];
    let bestD = Math.abs(wrapDelta(best.cameraZ, z));
    for (const d of destinations) {
      const dist = Math.abs(wrapDelta(d.cameraZ, z));
      if (dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best.id;
  };

  const killSettle = (): void => {
    settleTween?.kill();
    settleTween = null;
    const r = pendingFlyResolve;
    pendingFlyResolve = null;
    r?.();
  };

  /**
   * Retire the peek WITHOUT moving the camera.
   *
   * Zeroing it outright snapped the view back to the focused tile before the
   * new flight began, so clicking a peeked neighbour visibly recentred and then
   * flew — Adam, 2026-08-18. Folding the offset into `lateral` leaves the
   * camera exactly where it is and lets the flight tween continue from there,
   * which is what "animate from the peek position" means.
   */
  const foldPeek = (): void => {
    peekTween?.kill();
    peekTween = null;
    lateral.x += peek.x;
    lateral.y += peek.y;
    peek.x = 0;
    peek.y = 0;
  };

  const settleTo = (targetZ: number, duration: number, ease: string): void => {
    mode = 'settling';
    velocity = 0;
    settleTween = gsap.to(state, {
      z: targetZ,
      duration,
      ease,
      onComplete: () => {
        mode = 'free';
        settleTween = null;
        emitArrive(targetZ);
      },
    });
  };

  return {
    flyTo(id: DestId, opts?: { abbreviated?: boolean }): Promise<void> {
      const dest = destinations.find((d) => d.id === id);
      if (!dest) return Promise.reject(new Error(`unknown destination ${id}`));
      killSettle();
      for (const cb of departCbs) cb(id);
      focusState = focusReducer(focusState, 'flyElsewhere');
      mode = 'flying';
      velocity = 0;
      const targetZ = wrappedTarget(dest.cameraZ, state.z);
      const duration = opts?.abbreviated ? FLY_ABBREVIATED_S : FLY_S;
      lateralTween?.kill();
      foldPeek();
      return new Promise((resolve) => {
        pendingFlyResolve = resolve;
        lateralTween = gsap.to(lateral, { x: 0, y: 0, duration, ease: FLY_EASE });
        settleTween = gsap.to(state, {
          z: targetZ,
          duration,
          ease: FLY_EASE,
          onComplete: () => {
            mode = 'free';
            settleTween = null;
            focusState = 'free';
            const r = pendingFlyResolve;
            pendingFlyResolve = null;
            emitArrive(targetZ);
            r?.();
          },
        });
      });
    },

    flyToFocus(target: { x: number; y: number; z: number }, opts?: { abbreviated?: boolean }): Promise<void> {
      killSettle();
      const destId = nearestDestId(target.z);
      for (const cb of departCbs) cb(destId);
      focusState = focusReducer(focusState, 'fly');
      mode = 'flying';
      velocity = 0;
      const targetZ = wrappedTarget(target.z, state.z);
      const duration = opts?.abbreviated ? FLY_ABBREVIATED_S : FLY_S;
      lateralTween?.kill();
      foldPeek();
      return new Promise((resolve) => {
        pendingFlyResolve = resolve;
        lateralTween = gsap.to(lateral, { x: target.x, y: target.y, duration, ease: FLY_EASE });
        settleTween = gsap.to(state, {
          z: targetZ,
          duration,
          ease: FLY_EASE,
          onComplete: () => {
            mode = 'free';
            settleTween = null;
            focusState = focusReducer(focusState, 'arrive');
            const r = pendingFlyResolve;
            pendingFlyResolve = null;
            for (const cb of arriveCbs) cb(destId);
            r?.();
          },
        });
      });
    },

    jumpTo(id: DestId): void {
      const dest = destinations.find((d) => d.id === id);
      if (!dest) return;
      killSettle();
      for (const cb of departCbs) cb(id);
      mode = 'free';
      velocity = 0;
      focusState = 'free';
      lateralTween?.kill();
      foldPeek();
      lateralTween = null;
      lateral.x = 0;
      lateral.y = 0;
      // A cut lands with no residual magnet offset, so the camera is exactly on
      // axis even under reduced motion, where no update() tick may follow.
      magnet.x = 0;
      magnet.y = 0;
      const targetZ = wrappedTarget(dest.cameraZ, state.z);
      state.z = targetZ;
      camera.position.x = lateral.x;
      camera.position.y = lateral.y;
      camera.position.z = state.z;
      emitArrive(targetZ);
    },

    /**
     * Cut-only equivalent of flyToFocus, for reduced motion: sets camera
     * position (x, y and z) directly, with the pointer magnet zeroed, so the
     * frame is correct even with no update() tick following this call.
     * Mirrors flyToFocus's depart/arrive sequencing but instant, and — like
     * flyToFocus's onComplete — calls arriveCbs directly with the
     * already-known destId rather than emitArrive(z): a focus target's z is
     * offset by framing distance from any destination's exact cameraZ, so
     * emitArrive's sameSpot lookup would find nothing to fire.
     */
    jumpToFocus(target: { x: number; y: number; z: number }): void {
      const destId = nearestDestId(target.z);
      killSettle();
      for (const cb of departCbs) cb(destId);
      focusState = focusReducer(focusState, 'fly');
      mode = 'free';
      velocity = 0;
      lateralTween?.kill();
      foldPeek();
      lateralTween = null;
      const targetZ = wrappedTarget(target.z, state.z);
      state.z = targetZ;
      lateral.x = target.x;
      lateral.y = target.y;
      magnet.x = 0;
      magnet.y = 0;
      camera.position.x = target.x;
      camera.position.y = target.y;
      camera.position.z = state.z;
      focusState = focusReducer(focusState, 'arrive');
      for (const cb of arriveCbs) cb(destId);
    },

    feedScroll(pixels: number): void {
      if (suspended) return;
      if (mode === 'flying') return;
      if (focusState === 'focused') {
        focusState = focusReducer(focusState, 'scroll');
        lateralTween?.kill();
      foldPeek();
        lateralTween = gsap.to(lateral, {
          x: 0,
          y: 0,
          duration: FOCUS_RELEASE_S,
          ease: SETTLE_EASE,
          onComplete: () => {
            focusState = focusReducer(focusState, 'released');
            lateralTween = null;
          },
        });
      }
      if (mode === 'settling') {
        killSettle();
        mode = 'free';
      }
      // scroll down (positive deltaY) travels deeper (negative z)
      velocity -= pixels * SCROLL_GAIN;
      if (velocity === 0) velocity = -1e-6; // exact cancellation must not disable settling
      // Stamped last, and only once the scroll has actually been accepted: an
      // event swallowed by the `mode === 'flying'` guard above must not count as
      // the gesture still being live, or the idle timer would never expire.
      lastScrollAt = now();
    },

    peekTo(dx: number, dy: number): void {
      peekTween?.kill();
      if (reducedMotion) {
        peek.x = dx;
        peek.y = dy;
        return;
      }
      peekTween = gsap.to(peek, { x: dx, y: dy, duration: PEEK_S, ease: PEEK_EASE });
    },

    clearPeek(): void {
      peekTween?.kill();
      if (reducedMotion) {
        peek.x = 0;
        peek.y = 0;
        return;
      }
      peekTween = gsap.to(peek, { x: 0, y: 0, duration: PEEK_S, ease: PEEK_EASE });
    },

    setPointer(nx: number, ny: number): void {
      pointerX = nx;
      pointerY = ny;
    },

    update(dt: number): void {
      if (suspended) return;
      const before = state.z;
      if (mode === 'free') {
        state.z = state.z + velocity * dt;
        // Home is the top of the page. The loop closes through the About
        // corridor now, so travelling backwards past Home would run through
        // the empty space where About and Contact used to stand.
        if (state.z > HOME_REST_Z) {
          state.z = HOME_REST_Z;
          velocity = 0;
        }
        velocity *= Math.exp(-DAMPING_RATE * dt);
        // Settle the moment the wheel goes quiet, rather than waiting for
        // momentum to decay past SNAP_BELOW on its own (which took well over a
        // second after a hard scroll). resolveSnapTargetLooped already picks the
        // nearest rest biased toward the direction of travel.
        if (shouldSnapNow(velocity, now() - lastScrollAt, SNAP_BELOW)) {
          const target = resolveSnapTargetLooped(state.z, velocity, rests);
          if (Math.abs(target - state.z) < 0.01) {
            velocity = 0;
          } else {
            settleTo(target, SETTLE_S, SETTLE_EASE);
          }
        }
      }

      // Camera position is BASE + MAGNET, and only the magnet is smoothed.
      //
      // The base (state.z, lateral.x/y) is written straight from its tweens, so
      // a flight's zoom and pan share one duration and one ease and land on the
      // same frame. Routing the base through the magnet's exponential filter —
      // which is what this used to do — gave x/y a ~0.5s lag with a completely
      // different curve from z's, and the move read as two gestures instead of
      // one. See magnet.ts.
      const target = magnetTarget(pointerX, pointerY, {
        suspended: mode === 'flying',
        focused: focusState === 'focused',
      });
      magnet.x = approachExp(magnet.x, target.x, dt);
      magnet.y = approachExp(magnet.y, target.y, dt);

      camera.position.z = state.z;
      camera.position.x = lateral.x + peek.x + magnet.x;
      camera.position.y = lateral.y + peek.y + magnet.y;
      if (dt > 0) measuredVelocity = (state.z - before) / dt;
    },

    onArrive(cb: (id: DestId) => void): () => void {
      arriveCbs.add(cb);
      return () => arriveCbs.delete(cb);
    },

    onDepart(cb: (dest: DestId) => void): () => void {
      departCbs.add(cb);
      return () => departCbs.delete(cb);
    },

    getVelocity(): number {
      return measuredVelocity;
    },

    isFocused(): boolean {
      return focusState === 'focused';
    },

    setSuspended(v: boolean): void {
      if (v === suspended) return;
      suspended = v;
      if (v) {
        // Park cleanly rather than leaving a tween writing the camera behind
        // the scrub's back.
        killSettle();
        lateralTween?.kill();
        lateralTween = null;
        // Zeroed outright, not folded into `lateral` (foldPeek): a later task
        // resets the camera pose outright on About exit, so there is nothing
        // for a folded offset to be consistent with. Left running, or left
        // non-zero, this would reappear as a small camera jump on the first
        // update() after resume — peek only reaches camera.position through
        // the gated update() below, so leaving it running doesn't break the
        // "writes nothing while suspended" guarantee, but it does leave stale
        // state waiting to surface.
        peekTween?.kill();
        peekTween = null;
        peek.x = 0;
        peek.y = 0;
        velocity = 0;
        mode = 'free';
      }
    },

    destroy(): void {
      killSettle();
      lateralTween?.kill();
      peekTween?.kill();
      foldPeek();
      arriveCbs.clear();
      departCbs.clear();
    },
  };
}
