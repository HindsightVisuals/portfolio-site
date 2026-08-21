/**
 * The ferro controller — one long-lived object that moves between homes.
 *
 * This is the single most important structural decision in the contact flow:
 * the ferrofluid is not a component each page instantiates. It is one
 * controller owning one stage and one blob, and every home it can occupy —
 * the corner of a 2D page, the contact page's beat-4 frame — is expressed as a
 * CSS rect. Travelling between them is therefore a transform tween, not a
 * teardown and rebuild, which is what makes the work-page → contact travel
 * possible at all. See the architecture spec, §1 and §3.
 *
 * Shell — the math it leans on is tested in ferro-{field,placement,influence}.
 */

import gsap from 'gsap';
import { approachExp } from '../three/magnet';
import { driftUnitsPerSec, FERRO_DEFAULTS } from './ferro-field';
import { driftSteer } from './ferro-influence';
import { createFerroObject, type FerroObject } from './ferro-object';
import { placementFor, type Rect } from './ferro-placement';
import { FERRO_CAMERA, initFerroStage, type FerroStage } from './ferro-stage';

/**
 * The displaced silhouette is larger than the base sphere. Sizing on the base
 * radius alone would let the lobes overflow whatever rect the blob is fitted
 * into — visible immediately in the corner placement, where the rect is small.
 */
const BOUNDING_RADIUS = FERRO_DEFAULTS.radius * (1 + FERRO_DEFAULTS.strength * 0.5);

/** How far the pointer reaches. Matches behind-panel.ts, the closest analogue. */
const STEER_RADIUS = 520;

/** How hard the pointer pulls the drift off its Z axis, in world units/sec. */
const STEER_GAIN = 0.6;

/** Travel ease — camera-director's flight feel, so the blob moves like the site. */
const TRAVEL_DURATION = 0.9;
const TRAVEL_EASE = 'power3.inOut';

export interface FerroController {
  /** Move the blob to a viewport rect. Resolves when the travel settles. */
  placeAt(rect: Rect, opts?: { instant?: boolean }): Promise<void>;
  hide(): void;
  show(): void;
  setGlow(on: boolean): void;
  setPointer(p: { x: number; y: number } | null): void;
  setStrength(v: number): void;
  destroy(): void;
}

export interface FerroOpts {
  reducedMotion: boolean;
}

export function initFerro(opts: FerroOpts): FerroController | null {
  const stage: FerroStage | null = initFerroStage({ reducedMotion: opts.reducedMotion });
  if (!stage) return null;

  const object: FerroObject = createFerroObject();
  stage.scene.add(object.mesh);

  let currentRect: Rect | null = null;
  let pointer: { x: number; y: number } | null = null;
  let shown = false;

  // The Blender Empty. Drift translates it on Z; the pointer steers x/y.
  const offset = { x: 0, y: 0, z: 10 };
  // Steering is eased rather than applied raw, so crossing into the radius
  // does not snap the drift sideways.
  const steer = { x: 0, y: 0 };

  const apply = (rect: Rect, instant: boolean): void => {
    const p = placementFor(rect, stage.viewport(), {
      distance: FERRO_CAMERA.distance,
      fovYDeg: FERRO_CAMERA.fovYDeg,
      boundingRadius: BOUNDING_RADIUS,
    });
    // Kill first: two tweens fighting over one transform is the failure
    // navbar.ts documents. One target at a time, always.
    gsap.killTweensOf([object.mesh.position, object.mesh.scale]);
    if (instant || opts.reducedMotion) {
      object.mesh.position.set(p.x, p.y, 0);
      object.mesh.scale.setScalar(p.scale);
      stage.requestFrame();
      return;
    }
    gsap.to(object.mesh.position, { x: p.x, y: p.y, duration: TRAVEL_DURATION, ease: TRAVEL_EASE });
    gsap.to(object.mesh.scale, {
      x: p.scale,
      y: p.scale,
      z: p.scale,
      duration: TRAVEL_DURATION,
      ease: TRAVEL_EASE,
    });
  };

  const stepFerro = (dt: number): void => {
    // Drift is seconds-per-turnover, converted once here. The Empty translates
    // on Z exactly as it does in the blend file.
    offset.z -= driftUnitsPerSec(FERRO_DEFAULTS.texScale, FERRO_DEFAULTS.driftSeconds) * dt;

    const target = currentRect ? driftSteer(pointer, currentRect, STEER_RADIUS) : { x: 0, y: 0 };
    steer.x = approachExp(steer.x, target.x, dt, 5);
    steer.y = approachExp(steer.y, target.y, dt, 5);
    // Drift and steer are summed as separate components. Writing both into one
    // value makes the ease fight the drift — the lab proved that the hard way.
    offset.x += steer.x * STEER_GAIN * dt;
    offset.y += steer.y * STEER_GAIN * dt;

    object.setOffset(offset.x, offset.y, offset.z);
  };
  stage.onFrame(stepFerro);

  const onResize = (): void => {
    // Rects are viewport-relative, so a resize re-derives the same home.
    if (currentRect) apply(currentRect, true);
  };
  window.addEventListener('resize', onResize);

  const controller: FerroController = {
    placeAt(rect, placeOpts) {
      currentRect = { ...rect };
      const instant = placeOpts?.instant ?? false;
      apply(currentRect, instant);
      if (instant || opts.reducedMotion) return Promise.resolve();
      return new Promise((resolve) => {
        gsap.delayedCall(TRAVEL_DURATION, resolve);
      });
    },
    show(): void {
      if (shown) return;
      shown = true;
      stage.canvas.classList.remove('ferro-stage--hidden');
      stage.setActive(true);
      if (opts.reducedMotion) stage.requestFrame();
    },
    hide(): void {
      if (!shown) return;
      shown = false;
      stage.canvas.classList.add('ferro-stage--hidden');
      stage.setActive(false); // parks the loop — nothing renders off screen
    },
    setGlow(on) {
      stage.canvas.classList.toggle('ferro-stage--glow', on);
    },
    setPointer(p) {
      pointer = p;
    },
    setStrength(v) {
      object.setStrength(v);
      if (opts.reducedMotion) stage.requestFrame();
    },
    destroy(): void {
      window.removeEventListener('resize', onResize);
      gsap.killTweensOf([object.mesh.position, object.mesh.scale]);
      stage.scene.remove(object.mesh);
      object.dispose();
      stage.destroy();
    },
  };

  // Motion feel cannot be inspected in an occluded automation tab (no rAF), so
  // ?debug-ferro exposes the parts a headless check can drive directly —
  // forcing a compile, reading program diagnostics, stepping without a frame.
  // Same shape as the ?debug-rd / ?debug-world flags.
  if (new URLSearchParams(location.search).has('debug-ferro')) {
    (window as unknown as { __ferro: unknown }).__ferro = {
      stage,
      object,
      controller,
      offset,
      steer,
      step: stepFerro, // an occluded tab never ticks rAF; drive it by hand
      rect: (): Rect | null => currentRect,
    };
  }

  return controller;
}
