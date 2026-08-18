/**
 * Pure math for the camera's pointer magnet — the soft lateral offset that
 * follows the mouse while the camera sits at rest.
 *
 * Why this is its own module: the magnet used to be entangled with flight
 * positioning. camera-director.update() ran ONE exponential filter whose target
 * was `lateral + magnet`, so a flight's tween-driven lateral value reached the
 * camera through that filter — arriving late, on an exponential curve, while
 * the z tween landed on time on its own ease. Zoom and pan therefore finished
 * at different moments and the move read as two gestures.
 *
 * The fix is to stop filtering the base at all. camera-director now writes
 * `base + magnetOffset`, where the base (lateral x/y and z) is applied directly
 * from its tweens and only the magnet — which is genuinely a soft follow — is
 * smoothed. This module owns that smoothing so the rule is testable without
 * gsap or a camera.
 */

/** Pointer x range in world units at full strength. */
export const MAGNET_X = 1.2;
/** Pointer y range in world units at full strength. */
export const MAGNET_Y = 0.8;
/** Per-second approach rate of the magnet toward its target. */
export const MAGNET_EASE = 2.0;
/** Magnet strength while a focus flight is settled, as a fraction of full. */
export const FOCUS_MAGNET_SCALE = 0.3;

/**
 * Where the magnet wants to be for a normalised pointer position.
 *
 * `suspended` is true during a flight: the magnet target collapses to 0 so the
 * offset eases out on departure and eases back in after arrival. That is what
 * keeps the handover between "tween owns the camera" and "magnet owns the
 * camera" free of a pop — at the moment a flight ends the offset is already ~0,
 * so it grows from nothing rather than jumping.
 *
 * The y axis is negated because pointer coordinates run downward (+y is the
 * bottom of the viewport) while world y runs upward.
 */
export function magnetTarget(
  pointerX: number,
  pointerY: number,
  opts: { suspended: boolean; focused: boolean },
): { x: number; y: number } {
  if (opts.suspended) return { x: 0, y: 0 };
  const scale = opts.focused ? FOCUS_MAGNET_SCALE : 1;
  return { x: pointerX * MAGNET_X * scale, y: -pointerY * MAGNET_Y * scale };
}

/**
 * One frame of exponential approach from `current` toward `target`.
 *
 * The step is clamped to 1 so a long frame (a background tab waking up, a
 * garbage-collection stall) lands exactly on the target instead of overshooting
 * past it and oscillating.
 */
export function approachExp(current: number, target: number, dt: number, rate = MAGNET_EASE): number {
  const k = Math.min(Math.max(dt * rate, 0), 1);
  return current + (target - current) * k;
}
