import gsap from 'gsap';
import type * as THREE from 'three';
import type { DestId } from '../routes';
import type { Destination } from './world';
import { resolveSnapTarget } from './snap';

/* Motion constants — lab-tuned values land in Task 7. */
const FLY_S = 2.0;
const FLY_ABBREVIATED_S = 0.8;
const FLY_EASE = 'power3.inOut';
const SETTLE_S = 1.1;
const SETTLE_EASE = 'power3.out';
const SCROLL_GAIN = 0.06;        // wheel px -> velocity (units/s)
const DAMPING_RATE = 2.2;        // exponential velocity decay per second
const SNAP_BELOW = 2.0;          // |v| threshold to begin settling
const Z_MARGIN = 10;             // camera clamp beyond the spine ends

type Mode = 'free' | 'settling' | 'flying';

export interface CameraDirector {
  flyTo(id: DestId, opts?: { abbreviated?: boolean }): Promise<void>;
  jumpTo(id: DestId): void;
  feedScroll(pixels: number): void;
  update(dt: number): void;
  onArrive(cb: (id: DestId) => void): () => void;
  getVelocity(): number;
  destroy(): void;
}

export function initCameraDirector(
  camera: THREE.PerspectiveCamera,
  destinations: Destination[],
): CameraDirector {
  const rests = destinations.map((d) => d.cameraZ);
  const zMax = Math.max(...rests) + Z_MARGIN;
  const zMin = Math.min(...rests) - Z_MARGIN;
  const byRest = new Map(destinations.map((d) => [d.cameraZ, d.id]));

  const state = { z: destinations[0].cameraZ };
  let velocity = 0;
  let measuredVelocity = 0;
  let mode: Mode = 'free';
  let settleTween: gsap.core.Tween | null = null;
  const arriveCbs = new Set<(id: DestId) => void>();

  const emitArrive = (z: number): void => {
    const id = byRest.get(z);
    if (id) for (const cb of arriveCbs) cb(id);
  };

  const killSettle = (): void => {
    settleTween?.kill();
    settleTween = null;
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
      mode = 'flying';
      velocity = 0;
      return new Promise((resolve) => {
        settleTween = gsap.to(state, {
          z: dest.cameraZ,
          duration: opts?.abbreviated ? FLY_ABBREVIATED_S : FLY_S,
          ease: FLY_EASE,
          onComplete: () => {
            mode = 'free';
            settleTween = null;
            emitArrive(dest.cameraZ);
            resolve();
          },
        });
      });
    },

    jumpTo(id: DestId): void {
      const dest = destinations.find((d) => d.id === id);
      if (!dest) return;
      killSettle();
      mode = 'free';
      velocity = 0;
      state.z = dest.cameraZ;
      camera.position.z = state.z;
      emitArrive(dest.cameraZ);
    },

    feedScroll(pixels: number): void {
      if (mode === 'flying') return;
      if (mode === 'settling') {
        killSettle();
        mode = 'free';
      }
      // scroll down (positive deltaY) travels deeper (negative z)
      velocity -= pixels * SCROLL_GAIN;
    },

    update(dt: number): void {
      const before = state.z;
      if (mode === 'free') {
        state.z = Math.min(zMax, Math.max(zMin, state.z + velocity * dt));
        velocity *= Math.exp(-DAMPING_RATE * dt);
        if (Math.abs(velocity) < SNAP_BELOW && velocity !== 0) {
          const target = resolveSnapTarget(state.z, velocity, rests);
          if (Math.abs(target - state.z) < 0.01) {
            velocity = 0;
          } else {
            settleTo(target, SETTLE_S, SETTLE_EASE);
          }
        }
      }
      camera.position.z = state.z;
      if (dt > 0) measuredVelocity = (state.z - before) / dt;
    },

    onArrive(cb: (id: DestId) => void): () => void {
      arriveCbs.add(cb);
      return () => arriveCbs.delete(cb);
    },

    getVelocity(): number {
      return measuredVelocity;
    },

    destroy(): void {
      killSettle();
      arriveCbs.clear();
    },
  };
}
