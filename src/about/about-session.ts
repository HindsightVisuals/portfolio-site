// src/about/about-session.ts
import { DESTINATIONS } from '../three/world';
import { mountAboutDocument, type AboutDocument } from './about-document';
import { type AboutPath } from './about-path';
import { scrollToT } from './about-scrub';
import { nextBeatId, scrollDocumentTo, scrollToBeat } from './about-nav';
import { shouldLeaveCorridor } from './about-handover';
import { normalizeWheelDelta } from '../home/wheel';
import { createGateControl, type GateControl } from './about-gate-control';
import { type ReturnFlight } from './about-return';
import { buildFooter } from '../page2d/footer';
import { type Presentation } from './about-presentation';
import type { AboutFlow, AboutFlowDeps } from './about-flow';

/**
 * The corridor's session: the state machine and its listeners.
 *
 * Everything that decides WHEN — the open/paused/`t` state, the scroll,
 * resize and wheel bindings, the enter/exit handover, the footer gate's
 * wiring, and the arrow-key and footer-nav moves. WHAT happens once decided
 * belongs to the pure modules and to the two collaborators this is handed:
 * about-presentation.ts's per-frame write and about-return.ts's flight home.
 *
 * One session per initAboutFlow (about-flow.ts), which builds those two
 * collaborators and passes them in; the object returned here IS the AboutFlow
 * the rest of the site holds, so the public contract's own docs live at that
 * front door rather than here.
 */
export function createSession(o: {
  deps: AboutFlowDeps;
  path: AboutPath;
  presentation: Presentation;
  flight: ReturnFlight;
}): AboutFlow {
  const { deps, path, presentation, flight } = o;
  // The same Work rest about-flow.ts builds the path from, re-derived rather
  // than passed: exit() cuts the camera back to it (see there), and
  // about-presentation.ts reads it the same way for the same reason.
  const anchorRest = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ;

  let doc: AboutDocument | null = null;
  let open = false;
  let paused = false;
  let t = 0;

  /**
   * The scrub guard, shared by onWheel, stepBeat, feedGateForTest and
   * setScrollForTest — and by onResize at its SCRUB line only, not at its
   * early return, which is open/paused by design (see there: the document
   * still has to be re-laid out under reduced motion). Named rather than
   * hand-copied: the copies were worded differently at every site, and one of
   * them was not even the same condition, so the two that deliberately DEPART
   * from it were indistinguishable from typos.
   *
   * The two departures, both kept and both commented at their own site:
   * onScroll omits `paused` because pause() DETACHES it (the seams that bypass
   * the listener carry the term instead), and stepReturnForTest guards on `open`
   * alone because the return is legitimate under reduced motion and whether or
   * not the corridor is paused.
   */
  const canScrub = (): boolean => open && !paused && !deps.reducedMotion;

  /**
   * Scrub the corridor to `next`: sample the presentation, then reconcile the
   * footer gate against the same `t` — the gate write ran last inside apply()
   * before the split, and stays last here so the ordering is unchanged. The
   * one place `t` is written; the four call sites below (onScroll, enter,
   * resume, setScrollForTest) all go through this rather than each keeping
   * their own copy of the two-call sequence.
   */
  const scrubTo = (next: number): void => {
    t = next;
    presentation.apply(t);
    gateCtl.syncAt(t);
  };

  /**
   * Leaving the corridor releases shared state in two places now:
   * presentation.releaseSharedState() (the --ground/--ink/--footer-rise
   * escape hatches, the background/atmosphere/cursor restore, and, on the
   * animated path, the ferro/scrollNav/world restore) and gateCtl.release()
   * (--gate-show). Two separate calls, not one, because presentation.ts
   * deliberately does not import about-gate-control.ts — the two modules
   * would otherwise import each other — so it cannot own the gate's own
   * property.
   *
   * One helper, not two hand-maintained call sites, for the same reason
   * releaseSharedState() itself exists: its own doc comment records that two
   * hand-maintained copies of ITS restore list caused three separate leaks,
   * one per review round, before being consolidated into one function.
   * Leaving these two calls to drift independently at exit() and onLanded()
   * would reintroduce that exact shape one level up, against the same
   * property.
   */
  const releaseAll = (): void => {
    presentation.releaseSharedState();
    gateCtl.release();
  };

  const onScroll = (): void => {
    // DEPARTURE from canScrub above, deliberate and load-bearing: no `paused`
    // term, because pause() DETACHES this listener — that IS the hold. The
    // seams that bypass the listener (setScrollForTest, feedGateForTest) carry
    // the term instead; see setScrollForTest's own doc in about-flow.ts.
    if (!open || deps.reducedMotion) return;
    scrubTo(
      scrollToT(
        window.scrollY,
        document.documentElement.scrollHeight,
        window.innerHeight,
      ),
    );
  };

  const onResize = (): void => {
    // Gated on paused too, same reasoning as onWheel below: this listener
    // stays attached for the corridor's whole open lifetime (pause() only
    // detaches 'scroll'), and it calls onScroll()/apply() directly — a plain
    // function call, not routed through the removed 'scroll' listener — so
    // without this guard a window resize while the contact modal covers a
    // paused corridor would still recompute t from window.scrollY and move
    // the hidden camera, exactly the hold this pair exists to prevent.
    //
    // Open/paused only, not canScrub(): the DOCUMENT still has to be re-laid
    // out under reduced motion, where it is the whole experience. It is the
    // scrub below — and only that — canScrub() gates here.
    if (!open || paused) return;
    doc?.resize(window.innerHeight);
    // onScroll() re-runs apply(), which re-places the ferro (instantly) as
    // one of its ordinary per-frame writes now — no separate re-place needed.
    if (canScrub()) onScroll();
  };

  // Named top-level (not an object-literal method) so onWheel below — also
  // top-level, needing no `this` — can call it directly.
  const exit = (): void => {
    if (!open) return;
    open = false;
    paused = false;
    // A pending idle-retreat timer must not fire against a corridor that has
    // already torn its document down — see scheduleIdleDrain's own doc.
    gateCtl.clearTimer();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('wheel', onWheel);
    doc?.destroy();
    doc = null;
    presentation.resetBeat();
    t = 0;
    releaseAll();
    if (deps.reducedMotion) return;
    // Cut the camera back to the About rest before handing it back.
    // Nothing else in this codebase ever writes camera.quaternion —
    // camera-director.ts only ever writes position — so once the corridor
    // pitches the camera to look upward, nothing else will ever level it
    // again unless this does. The director also resumes from its own
    // remembered state.z (this same anchorRest), while the camera has
    // travelled along the whole path; resetting position here keeps the
    // director's remembered state consistent with where the camera actually
    // is. This is a cut, matching the hard transition a closing 2D takeover
    // already performs.
    deps.camera.position.set(0, 0, anchorRest);
    deps.camera.quaternion.identity();
    // Released LAST: the director resumes writing the camera from here, and
    // it must not do so while the world is still in About mode.
    deps.director.setSuspended(false);
  };

  /**
   * Fly the camera home and hand over — the shared body behind the public
   * returnHome() below AND the footer gate arming (gateCtl's onArmed callback,
   * wired to this function, in about-gate-control.ts).
   * Top-level, like exit(), so both callers reach the same one flight rather
   * than each keeping their own copy.
   *
   * The flight itself lives in about-return.ts. What stays here is the
   * session's half of the handover: the departure work it hands over as
   * onDepart, and the teardown the flight runs — before it says anything to
   * the director — as onLanded.
   */
  const doReturnHome = (): Promise<void> => {
    if (!open) return Promise.resolve();
    return flight.start({
      t,
      docRoot: doc?.root ?? null,
      onDepart: () => {
        // Belt-and-braces: gateCtl.feed already clears this before an armed push
        // calls here, but returnHome() is also a public test seam reachable
        // without ever feeding the gate — a flight departing must not leave a
        // stale timer to later drain an accumulator the next visit hasn't fed.
        gateCtl.clearTimer();
        window.removeEventListener('scroll', onScroll);
        // Also detached here, not just at the flight's p>=1 landing (onLanded
        // below): onResize and onWheel stay attached for the corridor's whole
        // open lifetime (same as exit()), and both already no-op once `open`
        // flips false — but leaving them attached would double them up on the
        // next enter().
        window.removeEventListener('resize', onResize);
        window.removeEventListener('wheel', onWheel);
      },
      onLanded: () => {
        open = false;
        paused = false;
        doc?.destroy();
        doc = null;
        presentation.resetBeat();
        t = 0;
        releaseAll(); // the same restores exit() performs — see its own doc
      },
    });
  };

  // Constructed here, after doReturnHome, so onArmed can reference it
  // directly: the footer gate's own controller (about-gate-control.ts),
  // wired to this instance's document root and to the same return flight
  // returnHome() and the wheel handler share.
  const gateCtl: GateControl = createGateControl({
    docRoot: () => doc?.root ?? null,
    onArmed: () => void doReturnHome(),
  });

  /**
   * The footer's site nav, clicked from inside the corridor.
   *
   * 'work' is the one destination that actually leaves: exit() already cuts
   * the camera to the Work rest and hands back to the director, which IS the
   * Work wall — no separate "fly to work" move is needed. 'about' and
   * 'contact' stay inside this same page and just scroll to that beat's
   * offset. Deliberately doesn't go through main.ts's router: the corridor
   * already owns its own path and document, and router.navigate('about')
   * would only reach onCorridorRoute -> enterCorridor, which no-ops whenever
   * aboutFlow.isOpen() — exactly the case here.
   */
  const onFooterNav = (dest: 'work' | 'about' | 'contact'): void => {
    if (dest === 'work') {
      exit();
      return;
    }
    scrollToBeat(path, dest === 'about' ? 'anchor' : 'contact');
  };

  /**
   * Arrow keys, from inside the corridor: step one beat forward or back.
   *
   * main.ts's keydown handler resolves arrows against DESTINATIONS, which is
   * down to two entries — so inside the corridor the camera's reference is the
   * Work rest and BOTH ArrowDown and ArrowUp used to resolve to 'home',
   * ejecting the reader (ArrowDown, "forward", moving them backwards). The
   * corridor is the page order now, so the arrows have to walk IT.
   *
   * Backward from t = 0 hands the camera back, exactly mirroring the wheel's
   * own shouldLeaveCorridor rule (backward at the top leaves), so a
   * keyboard-only reader is never trapped in here.
   *
   * Moves the SCROLLBAR rather than the camera, so the ordinary
   * onScroll/apply pipeline does the work and `t` cannot desync — the same
   * mechanism the footer's own site nav uses, hard cut and all.
   *
   * Reduced motion is left to the browser: `t` never leaves 0 there (apply()
   * never runs), the document is the whole experience, and the arrows already
   * scroll it natively.
   */
  const stepBeat = (dir: 1 | -1): void => {
    if (!canScrub()) return;
    if (dir < 0 && t <= 0) {
      exit();
      return;
    }
    scrollToBeat(path, nextBeatId(path, t, dir));
  };

  // Backward scroll at the very top of the corridor hands the camera back —
  // needed as its own listener because scrollNav (main.ts) is put into
  // 'about' mode on enter() below and deliberately feeds the director
  // nothing. Gated on reducedMotion directly: under reduced motion `t` never
  // leaves 0 (apply() never runs there — see onScroll above), so without this
  // gate shouldLeaveCorridor would see t: 0 on every visit and any backward
  // scroll would unmount the document out from under someone simply reading
  // it. There is no corridor to leave under reduced motion — the document IS
  // the experience, and the browser owns its scroll.
  const onWheel = (e: WheelEvent): void => {
    // Gated on paused: this listener stays attached for the corridor's whole
    // open lifetime (pause() only detaches 'scroll'), and wheel events bubble
    // to window from inside the contact takeover too (it doesn't stop
    // propagation). Without this guard, scrolling backward inside the modal
    // while the corridor sits at t near 0 would call exit() BEHIND the modal
    // — clearing open/paused and releasing the director — and resume() would
    // then no-op on close, landing the user in 'world' instead of back in
    // the corridor. Exactly the bug this task exists to fix, reintroduced via
    // the one listener pause() doesn't touch. The footer gate (gateCtl.feed,
    // in about-gate-control.ts) shares this exact guard for the exact same
    // reason — see its own doc there.
    if (!canScrub()) return;
    const deltaPx = normalizeWheelDelta(e.deltaY, e.deltaMode);
    if (shouldLeaveCorridor({ open, t, deltaPx })) {
      exit();
      return;
    }
    gateCtl.feed(deltaPx, t);
  };

  return {
    enter(parent: HTMLElement, startT = 0): void {
      if (open) return;
      open = true;
      paused = false;
      // Reset per visit: without this, a gate fully armed on a PREVIOUS visit
      // (it survives in this closure across enter()/exit() cycles) would fire
      // on the very first forward wheel tick of a later one, with no fresh
      // push required. gateFed rides along for the same reason — see its own
      // doc.
      gateCtl.reset();
      // Both motion paths: the document has to be able to scroll past one
      // viewport's worth of content, and the site's default full-bleed lock
      // (base.css) otherwise pins it at zero height (C1).
      presentation.setOpenClass(true);
      // Named gateEl, not gate: this closure's own `gateCtl` above is the
      // footer gate's controller — a same-named callback param would read as
      // shadowing it.
      doc = mountAboutDocument(parent, path, window.innerHeight, (gateEl) =>
        buildFooter({ onNav: onFooterNav, gate: gateEl }),
      );
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize);
      window.addEventListener('wheel', onWheel, { passive: true });

      if (deps.reducedMotion) {
        // No camera, no WebGL beats — the document is the whole experience.
        // Deliberately does NOT suspend the director or hide the world: under
        // reduced motion the canvas is not animating anyway, and leaving the
        // world alone keeps exit trivially correct. The opaque WebGL canvas
        // IS hidden, though (C3) — otherwise it still covers the page and
        // --ground is never actually seen.
        presentation.hideCanvas(true);
        // A deep link into a beat (e.g. /contact) still has to land there:
        // apply() is deliberately not called (there is no camera to move, and
        // `t` must stay 0 here — the leave-listener guard in onWheel keys off
        // reducedMotion precisely so it never reads a nonzero `t`), but the
        // BROWSER's own scroll is the only "position" reduced motion has, so
        // it has to be set directly from startT the same way the non-reduced
        // branch below sets it from the camera's t.
        scrollDocumentTo(startT);
        return;
      }

      deps.director.setSuspended(true);
      deps.world.setAboutMode(true);
      deps.scrollNav?.setMode('about');
      deps.ferro?.show();
      presentation.resetBeat();
      // Position before the first paint: the camera must already be on the
      // corridor when the next frame renders, not one frame behind it.
      scrubTo(Math.min(1, Math.max(0, startT)));
      // Put the document where the camera is, or the first real scroll event
      // would snap the camera back to the top.
      if (doc) scrollDocumentTo(t);
    },

    exit,
    returnHome: doReturnHome,
    stepBeat,
    stepReturnForTest(p: number): void {
      // DEPARTURE from canScrub above, deliberate: `open` ALONE. This mirrors
      // doReturnHome, not onScroll/onWheel — the return is a legitimate move
      // under reduced motion, and runs whether or not the corridor is paused.
      // The full ruling is on this member's doc in about-flow.ts.
      //
      // Known divergence, recorded rather than fixed (found reviewing the
      // return-flight extraction): before any start() has run there is no
      // flight to step, so stepping to p = 1 on an open corridor that never
      // departed reaches about-return.ts's p >= 1 branch — which resumes the
      // director — without this session's onLanded teardown ever having been
      // registered. Exactly the half-handover shape this split exists to
      // eliminate, but unreachable in production: this seam has no non-test
      // caller, and every existing call site is preceded by returnHome() or an
      // armed gate. Closing it properly means changing ReturnFlight's
      // interface (an inFlight() check here would only paper over it), which
      // is out of scope for a pure move.
      if (!open) return;
      flight.step(Math.min(1, Math.max(0, p)));
    },
    feedGateForTest(deltaPx: number): void {
      if (!canScrub()) return;
      gateCtl.feed(deltaPx, t);
    },
    pause(): void {
      // `flight.inFlight()` is the in-flight flag: true for exactly as long as
      // the return flight is running (start() sets it, the flight's p >= 1
      // branch clears it — about-return.ts).
      //
      // Unlike the listeners — which doReturnHome detaches — pause() and
      // resume() are DIRECT method calls from main.ts, fired by the contact
      // emblem, which lives in .chrome and stays clickable for the whole
      // flight; `open` does not go false until p >= 1. So without this guard,
      // clicking the emblem mid-flight ran pause() and then resume() against
      // the running tween: resume() re-attached the scroll listener, called
      // apply(t) — which writes ferroEl.style.opacity, the very property the
      // flight is tweening — and called scrollDocumentTo(t), firing the
      // listener it had just re-attached. The flight owns the corridor while
      // it is in the air; there is nothing here to hold.
      if (!open || paused || flight.inFlight()) return;
      paused = true;
      window.removeEventListener('scroll', onScroll);
      // Give the blob's stacking back. On the beats where it must not cross the
      // corridor's type, applyBeat parks it at z-index 0 — BELOW the takeover's
      // 20 — so a contact modal opened from one of those beats covered it
      // entirely. Adam, on the first QA pass: "I was on the start a project
      // beat, and when I hit the contact form, the ferro was gone." The contact
      // beat is one of the three behind-beats, along with clientWall and
      // capabilities.
      //
      // While something else covers the corridor, the corridor does not own
      // where the blob sits. resume() restores it: it clears lastBeat and
      // re-applies, which re-runs this same toggle from the current beat.
      deps.ferroEl?.classList.remove('ferro-stage--behind');
    },

    resume(): void {
      // Guarded on the flight for the same reason pause() is — see there. This
      // is the half that actually did the damage: apply() and scrollDocumentTo
      // both fight the tween.
      if (!open || !paused || flight.inFlight()) return;
      paused = false;
      window.addEventListener('scroll', onScroll, { passive: true });
      deps.scrollNav?.setMode('about');
      // Reduced motion has no camera/palette/ferro beats to restore (apply()
      // is never called on this path — see enter()'s reduced-motion branch),
      // so there is nothing to re-assert here either.
      if (deps.reducedMotion) return;
      // Whatever paused the corridor (the contact takeover) unconditionally
      // resets shared, site-wide state on its own way back to 'world' —
      // cursor?.setOnDark(false), ferro?.hide() — since every OTHER close of
      // that takeover really does return to the plain light world. A resumed
      // corridor is not that: re-apply the current beat's palette, cursor and
      // ferro placement so a dark beat's cursor/ferro don't sit wrong until
      // the next genuine beat change. Idempotent for the camera — apply(t)
      // re-samples the same `t` pause() never touched, so position/quaternion
      // don't move. apply(t) re-places the ferro unconditionally (every
      // frame now, not gated on the beat), but lastBeat is still cleared
      // first because applyBeat() otherwise early-returns on "beat ===
      // lastBeat" and skips the behind-class toggle when the beat hasn't
      // actually changed.
      deps.ferro?.show();
      presentation.resetBeat();
      scrubTo(t);
      // Re-anchor the DOCUMENT to t, not just the camera.
      //
      // pause() holds `t` by detaching the scroll listener — but the document
      // underneath keeps scrolling regardless. The contact takeover is
      // position: fixed with its own overflow-y: auto and, since the contact
      // page mostly fits one viewport, its internal scroll is at an end
      // immediately, so wheel events chain straight through to the document
      // behind it (`.takeover` now carries overscroll-behavior: contain to
      // stop most of that at source — page2d.css — but touch, keyboard and
      // scrollbar drags can still move it, and this is the fix that does not
      // depend on the browser honouring it). Without this, resume()
      // re-attached the listener on a DESYNCED scroll position and the next
      // wheel tick read it and jumped the camera to a different beat. Same
      // two lines enter() has always had, for the same reason.
      scrollDocumentTo(t);
    },
    isOpen: () => open,
    t: () => t,
    path: () => path,
    setScrollForTest(next: number): void {
      if (!canScrub()) return;
      scrubTo(Math.min(1, Math.max(0, next)));
    },
    destroy(): void {
      if (open) exit();
    },
  };
}
