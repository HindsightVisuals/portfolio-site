/**
 * The array's engagement state machine.
 *
 * Ambient displacement runs ALONGSIDE the cursor-driven one while you are
 * engaged. When you leave, both stop — and the array holds still for a beat
 * before it starts breathing on its own again.
 *
 * That pause is the point. Without it the idle motion reads as a loop that was
 * always running; with it, the array reads as something that noticed you left.
 */

/** How long the array holds still after you disengage, before the keep-alive. */
export const IDLE_SILENCE_MS = 2000;
/** Ease time for both amplitudes, in either direction. */
export const AMBIENT_EASE_MS = 800;
/**
 * How long a motionless pointer counts as engaged before it is treated as gone.
 *
 * "Disengaged" is far OR motionless: a pointer parked on the dish and a pointer
 * that has left the page get the same silence-then-breathe treatment. The caller
 * decides which of the two it is; this constant is exported so it decides
 * consistently.
 */
export const MOTIONLESS_MS = 2000;

export type IdleState = 'engaged' | 'silent' | 'breathing';

export interface IdleModel {
  state: IdleState;
  /** 0..1 amplitude of the always-on-when-alive noise displacement. */
  ambient: number;
  /** 0..1 amplitude of the cursor-driven explode. */
  cursor: number;
  /** ms since the pointer disengaged; 0 whenever engaged. */
  sinceDisengage: number;
}

export function createIdleModel(): IdleModel {
  return { state: 'engaged', ambient: 0, cursor: 0, sinceDisengage: 0 };
}

/** Move `v` toward `target` at a rate that spans 0..1 in AMBIENT_EASE_MS. */
function ease(v: number, target: number, dtMs: number): number {
  const step = dtMs / AMBIENT_EASE_MS;
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}

export function updateIdle(m: IdleModel, dtMs: number, disengaged: boolean): void {
  if (disengaged) {
    m.sinceDisengage += dtMs;
    m.state = m.sinceDisengage >= IDLE_SILENCE_MS ? 'breathing' : 'silent';
  } else {
    m.sinceDisengage = 0;
    m.state = 'engaged';
  }

  // Ambient is alive when engaged OR breathing — it is dark only during the
  // silence. The cursor term is alive only when actually engaged.
  const ambientTarget = m.state === 'silent' ? 0 : 1;
  const cursorTarget = m.state === 'engaged' ? 1 : 0;

  m.ambient = ease(m.ambient, ambientTarget, dtMs);
  m.cursor = ease(m.cursor, cursorTarget, dtMs);
}
