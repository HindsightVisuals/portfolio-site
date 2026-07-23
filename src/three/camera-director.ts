import gsap from 'gsap';
import type * as THREE from 'three';
import type { DestId } from '../routes';
import type { Destination } from './world';
import { focusReducer, type FocusState } from './focus';
import { nearestWrapped, resolveSnapTargetLooped, sameSpot, wrapDelta, SPINE_PERIOD } from './loop';

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
const SETTLE_S = 1.1;
const SETTLE_EASE = 'power3.out';
const SCROLL_GAIN = 0.06;        // wheel px -> velocity (units/s)
const DAMPING_RATE = 2.2;        // exponential velocity decay per second
const SNAP_BELOW = 2.0;          // |v| threshold to begin settling
const MAGNET_X = 1.2;            // pointer x range (normalized −1..1)
const MAGNET_Y = 0.8;            // pointer y range (normalized −1..1)
const MAGNET_EASE = 2.0;         // per-second approach rate
const FOCUS_MAGNET_SCALE = 0.3;  // magnet strength while a focus flight is settled
const FOCUS_RELEASE_S = 0.9;     // lateral ease-home duration when focus is broken by scroll

type Mode = 'free' | 'settling' | 'flying';

export interface CameraDirector {
  flyTo(id: DestId, opts?: { abbreviated?: boolean }): Promise<void>;
  flyToFocus(target: { x: number; y: number; z: number }, opts?: { abbreviated?: boolean }): Promise<void>;
  jumpTo(id: DestId): void;
  jumpToFocus(target: { x: number; y: number; z: number }): void;
  feedScroll(pixels: number): void;
  setPointer(nx: number, ny: number): void;
  update(dt: number): void;
  onArrive(cb: (id: DestId) => void): () => void;
  onDepart(cb: (dest: DestId) => void): () => void;
  getVelocity(): number;
  isFocused(): boolean;
  destroy(): void;
}

export function initCameraDirector(
  camera: THREE.PerspectiveCamera,
  destinations: Destination[],
): CameraDirector {
  const rests = destinations.map((d) => d.cameraZ);

  const state = { z: destinations[0].cameraZ };
  const lateral = { x: 0, y: 0 }; // off-axis flight-target lateral offset (focus mode)
  let focusState: FocusState = 'free';
  let velocity = 0;
  let measuredVelocity = 0;
  let mode: Mode = 'free';
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
      lateralTween = null;
      lateral.x = 0;
      lateral.y = 0;
      const targetZ = wrappedTarget(dest.cameraZ, state.z);
      state.z = targetZ;
      camera.position.z = state.z;
      emitArrive(targetZ);
    },

    /**
     * Cut-only equivalent of flyToFocus, for reduced motion: sets camera
     * position (x, y, AND z — unlike jumpTo, which leaves x/y for update()'s
     * per-frame magnet blend to ease toward 0) directly so the frame is
     * correctly framed even with no update() tick following this call.
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
      lateralTween = null;
      const targetZ = wrappedTarget(target.z, state.z);
      state.z = targetZ;
      lateral.x = target.x;
      lateral.y = target.y;
      camera.position.x = target.x;
      camera.position.y = target.y;
      camera.position.z = state.z;
      focusState = focusReducer(focusState, 'arrive');
      for (const cb of arriveCbs) cb(destId);
    },

    feedScroll(pixels: number): void {
      if (mode === 'flying') return;
      if (focusState === 'focused') {
        focusState = focusReducer(focusState, 'scroll');
        lateralTween?.kill();
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
    },

    setPointer(nx: number, ny: number): void {
      pointerX = nx;
      pointerY = ny;
    },

    update(dt: number): void {
      const before = state.z;
      if (mode === 'free') {
        state.z = state.z + velocity * dt;
        velocity *= Math.exp(-DAMPING_RATE * dt);
        if (Math.abs(velocity) < SNAP_BELOW && velocity !== 0) {
          const target = resolveSnapTargetLooped(state.z, velocity, rests);
          if (Math.abs(target - state.z) < 0.01) {
            velocity = 0;
          } else {
            settleTo(target, SETTLE_S, SETTLE_EASE);
          }
        }
      }
      camera.position.z = state.z;
      const targetX = pointerX * MAGNET_X;
      const targetY = -pointerY * MAGNET_Y;
      const suspend = mode === 'flying' ? 0 : 1;
      const magnetScale = focusState === 'focused' ? FOCUS_MAGNET_SCALE : 1;
      const k = Math.min(dt * MAGNET_EASE, 1);
      camera.position.x += ((lateral.x + targetX * suspend * magnetScale) - camera.position.x) * k;
      camera.position.y += ((lateral.y + targetY * suspend * magnetScale) - camera.position.y) * k;
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

    destroy(): void {
      killSettle();
      lateralTween?.kill();
      arriveCbs.clear();
      departCbs.clear();
    },
  };
}
