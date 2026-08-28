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

/**
 * How long the displacement takes to come BACK once you re-engage.
 *
 * Deliberately long, and much longer than the fade-out: the array waking up
 * should feel like something heavy getting going, not a switch. Adam's ask was
 * "really heavy smoothing between the rest position and when it begins again".
 */
export const RISE_MS = 1800;

/** How long it takes to settle to rest. Quicker than the rise — leaving is easy. */
export const FALL_MS = 900;

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
  /**
   * 0..1 amplitude of the always-on-when-alive noise displacement, EASED.
   * This is what the shader reads.
   */
  ambient: number;
  /** 0..1 amplitude of the cursor-driven explode, EASED. */
  cursor: number;
  /** Linear progress behind `ambient`. Internal, but exposed for tests. */
  ambientRaw: number;
  /** Linear progress behind `cursor`. */
  cursorRaw: number;
  /** ms since the pointer disengaged; 0 whenever engaged. */
  sinceDisengage: number;
}

export function createIdleModel(): IdleModel {
  return {
    state: 'engaged',
    ambient: 0,
    cursor: 0,
    ambientRaw: 0,
    cursorRaw: 0,
    sinceDisengage: 0,
  };
}

/**
 * Smootherstep — `6t^5 - 15t^4 + 10t^3`.
 *
 * Zero FIRST AND SECOND derivative at both ends, where plain smoothstep only
 * flattens the first. That second-order flatness is what removes the faint
 * kick at the start and stop of the ramp; with motion this slow, the kick is
 * the thing you notice.
 */
export function smootherstep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Advance a linear 0..1 ramp toward `target`, at a rate set by rise/fall. */
function advance(raw: number, target: number, dtMs: number): number {
  if (raw < target) return Math.min(target, raw + dtMs / RISE_MS);
  if (raw > target) return Math.max(target, raw - dtMs / FALL_MS);
  return raw;
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

  m.ambientRaw = advance(m.ambientRaw, ambientTarget, dtMs);
  m.cursorRaw = advance(m.cursorRaw, cursorTarget, dtMs);

  // The linear ramp is the timing; the curve is the feel. Reading it back
  // through smootherstep is what makes the array ease into motion instead of
  // snapping into a constant-rate slide.
  m.ambient = smootherstep(m.ambientRaw);
  m.cursor = smootherstep(m.cursorRaw);
}
