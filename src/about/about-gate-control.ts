// src/about/about-gate-control.ts
import { atCorridorEnd, createGate, feedGate, type GateState } from './about-gate';

/**
 * How long a push at the corridor's end can go quiet before the gate drains
 * back to zero on its own (about-flow's idle-retreat, QA change 2).
 *
 * Long enough that a reader who pauses mid-push — to read the label, to
 * breathe — isn't punished for the pause; short enough that the indicator
 * doesn't overstay once they've genuinely stopped. ~1s is the read for "you
 * stopped" without being twitchy; sized a touch under it so the retreat feels
 * prompt rather than sluggish. A tuning value, not derived from anything.
 */
export const GATE_IDLE_MS = 900;

export interface GateControl {
  /** Feed a wheel delta. Only acts at the corridor's end; arms → onArmed(). */
  feed(deltaPx: number, t: number): void;
  /**
   * Reconcile the gate with the current `t`. Called by the session after every
   * presentation.apply(), which is where these two writes used to live.
   */
  syncAt(t: number): void;
  /** enter(): clear the accumulator and the panel for a fresh visit. */
  reset(): void;
  clearTimer(): void;
  /** Teardown: remove --gate-show outright. */
  release(): void;
}

export function createGateControl(o: {
  /**
   * The corridor document's root, read fresh on every call: `doc` is null
   * between visits and is REPLACED on every enter(), so a captured element
   * would go stale after the first exit.
   */
  docRoot(): HTMLElement | null;
  onArmed(): void;
}): GateControl {
  // The footer gate's own state (about-gate.ts) — reset on every enter() so a
  // PREVIOUS visit's fully-armed gate can't fire on the very next forward
  // wheel tick of a later one.
  const gate: GateState = createGate();

  // Whether the gate has genuinely been fed since arriving at the corridor's
  // end (QA change 1) — the panel's own reveal, distinct from
  // gate.accumulated, which the idle-retreat timer below drains back to
  // zero while this stays true. See syncGateShow's own doc for why the two
  // must not be the same read. Reset on enter() alongside gate.accumulated,
  // for the same reason: a previous visit must not leave this closure
  // stuck true for a later one that hasn't pushed at all yet.
  let gateFed = false;

  // The idle-retreat timer (QA change 2): rearmed on every wheel push that
  // reaches feed, so it only ever fires GATE_IDLE_MS after the LAST push,
  // not the first. Module-scoped (not a feed-local var) so a later push can
  // find and clear the previous one instead of leaving two timers racing to
  // drain the same accumulator.
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Write the gate panel's reveal from whether it has genuinely been fed —
   * gateFed below, not a live re-check of gate.accumulated. The two diverge
   * on purpose: the idle-retreat timeout (scheduleIdleDrain) drains
   * accumulated back to zero so the FILL can visibly ease down to nothing,
   * but the panel itself — "keep scrolling to return home" — stays offered
   * for as long as you keep dwelling at the corridor's end, or that easing
   * would happen behind an already-vanished panel and be invisible. Only
   * leaving the end (syncAt's reset below) or leaving the corridor
   * (releaseSharedState) clears gateFed.
   *
   * The ONLY writer of --gate-show, full stop — called from both sites that
   * can flip gateFed: feed's first push, and syncAt's own leave-the-end
   * reset. (applyReturn used to write it too, off fromRise, for as long as
   * the panel was a `position: fixed` overlay outside the fading document;
   * now that it mounts through footer.ts's `gate` slot, a descendant of
   * doc.root, applyReturn's own whole-document fade already carries it out of
   * view — see applyReturn's own comment in about-return.ts.)
   */
  const syncGateShow = (): void => {
    document.documentElement.style.setProperty('--gate-show', gateFed ? '1' : '0');
  };

  /** Stop a pending idle-retreat timer without firing it. Idempotent. */
  const clearIdleTimer = (): void => {
    if (idleTimer === null) return;
    clearTimeout(idleTimer);
    idleTimer = null;
  };

  /**
   * (Re)start the idle-retreat clock (QA change 2): GATE_IDLE_MS after the
   * MOST RECENT push at the corridor's end, drain the accumulator back to
   * zero exactly as leaving the end already does, and let
   * .about-gate-fill's own width transition (about.css) ease the fill down
   * to nothing — no animation loop needed here, only the one write. Does
   * NOT touch gateFed/--gate-show: the panel stays visible so that easing is
   * actually seen, not hidden behind a panel that vanished in the same
   * frame — see syncGateShow's own doc.
   */
  const scheduleIdleDrain = (): void => {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      idleTimer = null;
      gate.accumulated = 0;
      o.docRoot()?.style.removeProperty('--gate');
    }, GATE_IDLE_MS);
  };

  return {
    /**
     * Feed the footer gate (about-gate.ts) a wheel delta and, once armed, kick
     * off the return flight home.
     *
     * Only reachable from onWheel (about-session.ts), which has already checked
     * open/paused/reducedMotion — so this never duplicates that guard, only
     * adds the one condition specific to the gate: it arms only at the very
     * end of the corridor (t >= 1). A ruling on this task deliberately folded
     * this into the EXISTING onWheel listener rather than a second 'wheel'
     * listener with its own open/paused check: a paused corridor is still
     * `open`, and the contact takeover's wheel events bubble to window
     * uncaught (it never calls stopPropagation) — precisely the bug already
     * fixed once for the leave-corridor check in onWheel. A second listener
     * would have to re-derive that same guard from scratch and risk missing
     * `paused`, which is exactly how that bug got reintroduced for onResize
     * and onWheel in the first place (see their own comments in
     * about-session.ts).
     */
    feed(deltaPx: number, t: number): void {
      // atCorridorEnd, not `t >= 1`: t is scrollY/(scrollHeight - innerHeight),
      // and at fractional display scaling (125%/150%, the Windows 11 default)
      // the rounded scrollHeight can put the real maximum scrollY a fraction
      // short — so a fully scrolled document reports t ≈ 0.9999 and an exact
      // comparison meant the gate could never arm at all. See GATE_END_EPS.
      if (!atCorridorEnd(t)) return;
      const { armed, amount } = feedGate(gate, deltaPx);
      o.docRoot()?.style.setProperty('--gate', String(amount));
      // The panel's one entrance: the first push that leaves the accumulator
      // above zero. Sticky rather than re-derived from gate.accumulated on
      // every call — see gateFed's own doc for why the idle-retreat timer must
      // not also erase this.
      if (gate.accumulated > 0) gateFed = true;
      // A push can take gateFed from false to true, which is the one moment
      // the panel needs to appear outside apply()'s own per-scroll write — see
      // syncGateShow's own doc.
      syncGateShow();
      if (armed) {
        // The flight is about to take over; nothing left to drain toward.
        clearIdleTimer();
        o.onArmed();
        return;
      }
      // Rearm the idle clock on every push that doesn't already arm the gate —
      // see scheduleIdleDrain's own doc (QA change 2).
      scheduleIdleDrain();
    },

    syncAt(t: number): void {
      // Reset the gate the moment you leave the end.
      //
      // feed only WRITES --gate while atCorridorEnd(t), so pushing the
      // indicator to 50% and then scrolling back up used to freeze the green
      // fill at 50% for the rest of the corridor — and leave the accumulator
      // half-armed, so a later return to the end needed only half a push. The
      // gate measures intent against the end of the page; leaving the end
      // withdraws it, exactly as feedGate's own backward drain does. Guarded on
      // the accumulator so this is a no-op on all but the one frame that
      // crosses back out, rather than a per-frame style write.
      if (!atCorridorEnd(t) && gate.accumulated !== 0) {
        gate.accumulated = 0;
        o.docRoot()?.style.removeProperty('--gate');
        clearIdleTimer();
        // Leaving the end withdraws the whole offer, not just the fill: the
        // panel is only relevant while you're at the bottom, pushing against
        // it. gateFed's only other reset is enter(), for a later visit — see
        // its own doc.
        gateFed = false;
      }

      // The gate indicator's visibility (about.css) — driven by whether the
      // gate has actually been FED (QA change 1: gateFed), not by
      // footerRiseAt's ramp. The ramp arrives across the whole last beat,
      // before there is anything to push against, so a reveal tied to it used
      // to pop the panel up well before the reader could act on it. Written
      // every apply(), same as before, so the leave-the-end reset just above
      // is immediately reflected without a second call site. Cleared outright
      // in releaseSharedState() with the rest.
      syncGateShow();
    },

    reset(): void {
      // Reset per visit: without this, a gate fully armed on a PREVIOUS visit
      // (it survives in this closure across enter()/exit() cycles) would fire
      // on the very first forward wheel tick of a later one, with no fresh
      // push required. gateFed rides along for the same reason — see its own
      // doc.
      gate.accumulated = 0;
      gateFed = false;
    },

    clearTimer: clearIdleTimer,

    release(): void {
      document.documentElement.style.removeProperty('--gate-show');
    },
  };
}
