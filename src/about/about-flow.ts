// src/about/about-flow.ts
import * as THREE from 'three';
import gsap from 'gsap';
import { DESTINATIONS, HOME_REST_Z } from '../three/world';
import { mountAboutDocument, type AboutDocument } from './about-document';
import { buildAboutPath, type AboutPath, type CameraPose } from './about-path';
import { paletteAt, DAY_INK } from './about-palette';
import { beatAt, scrollToT } from './about-scrub';
import type { BeatId } from './about-markers';
import { shouldLeaveCorridor } from './about-handover';
import { normalizeWheelDelta } from '../home/wheel';
import { createGate, feedGate } from './about-gate';
import { buildFooter } from '../page2d/footer';

/**
 * The About corridor's controller — the only stateful module in src/about/.
 *
 * It owns three things and delegates everything else: the scroll binding, the
 * per-frame write onto the world camera, and the enter/exit handover. All the
 * maths lives in the pure modules beside it.
 *
 * Handover, not replacement. camera-director keeps its state and is merely
 * suspended, so leaving the corridor returns the site's zoom grammar exactly as
 * it was rather than rebuilding it.
 */

/** Beats where the blob passes IN FRONT of the copy. Everything else is behind. */
const IN_FRONT: ReadonlySet<BeatId> = new Set<BeatId>(['anchor', 'transition', 'lander', 'team', 'ai']);

/** Blob size as a fraction of the viewport's smaller dimension. */
const FERRO_FRACTION = 0.42;

/**
 * Duration of the return flight home (returnHome), in seconds. Long enough to
 * read as travel across the ~53-unit gap between the corridor's end pose and
 * Home, short enough not to trap the user at the footer. A tuning value.
 */
const RETURN_S = 1.6;

export interface AboutFlowDeps {
  camera: THREE.PerspectiveCamera;
  director: { setSuspended(v: boolean): void };
  world: { setAboutMode(v: boolean): void };
  atmosphere: { setInk(v: number): void };
  scrollNav: { setMode(m: 'world' | 'takeover' | 'about'): void } | null;
  ferro: {
    placeAt(rect: { x: number; y: number; w: number; h: number }, opts?: { instant?: boolean }): Promise<void>;
    show(): void;
    hide(): void;
  } | null;
  ferroEl: HTMLElement | null;
  cursor: { setOnDark(v: boolean): void } | null;
  /**
   * The WebGL background layer, for the palette-driven day/night ground.
   * Applies to the unmasked field only (see background.ts's setInvert doc) —
   * exactly the case here, since the home/work/about/contact background is
   * never masked. Null-safe: reduced motion never calls apply() (see onScroll
   * and setScrollForTest below), so this is simply never read in that mode —
   * the canvas itself is hidden there instead (see enter/exit).
   */
  background: { setInvertAmount(t: number): void } | null;
  setGround(css: string): void;
  /**
   * Writes `--ink` (body text; also read directly by several `.chrome`
   * children — base.css). A sibling of `setGround` above, same shape, driven
   * by the palette's `textInk` rather than `ground`. Distinct from
   * `atmosphere.setInk` above: that one takes a NUMBER for an unrelated
   * shader uniform — same word, unrelated axis.
   */
  setTextInk(css: string): void;
  reducedMotion: boolean;
}

export interface AboutFlow {
  /**
   * @param startT Where along the path to land, 0..1. Defaults to the top —
   * pass a value for a deep link straight into the corridor.
   */
  enter(parent: HTMLElement, startT?: number): void;
  exit(): void;
  /**
   * Fly the camera from wherever the corridor left it back to Home, then hand
   * over. The footer gate's payoff.
   *
   * Its own move rather than exit()+flyTo: exit() CUTS to the anchor before
   * releasing the director, so reusing it would jump the camera up to the Work
   * rest and only then fly — worse than the snap this replaces. And the
   * director's travel methods write position only; the return has to
   * interpolate orientation too, from a pitched off-spine pose.
   */
  returnHome(): Promise<void>;
  /** Test/debug seam: step the return flight to a given 0..1 progress. */
  stepReturnForTest(p: number): void;
  /**
   * Test/debug seam: feed the footer gate a raw px delta, bypassing a real
   * wheel event — same reasoning as setScrollForTest below. Mirrors onWheel's
   * own open/paused/reducedMotion guard, since it bypasses the listener that
   * normally enforces it.
   */
  feedGateForTest(deltaPx: number): void;
  /**
   * Hold the corridor while something covers it — the contact modal.
   *
   * NOT exit(): contact is a surface over wherever you are, so closing it must
   * put you back at the beat you opened it from. exit() would reset the camera
   * pose and release the director, and you would find yourself at the Work
   * rest with the corridor unmounted.
   */
  pause(): void;
  /**
   * Give the wheel back to the corridor, and re-assert the current beat's
   * palette/cursor/ferro so whatever paused it (contact's own close-out to
   * 'world') doesn't leave those in the wrong, light-world state. Safe to
   * call when never paused.
   */
  resume(): void;
  isOpen(): boolean;
  /** Test/debug seam: the current path parameter. */
  t(): number;
  /** The corridor's camera path — routing needs it to resolve a beat to a t. */
  path(): AboutPath;
  /**
   * Drive the scrub directly, bypassing the DOM.
   *
   * jsdom gives every element a zero-height box, so a scroll-driven controller
   * cannot be tested through real scroll events. This is also what `?debug-about`
   * uses to step the corridor in an occluded automation tab, where no rAF ticks
   * — the same reason the ferro exposes step(dt).
   */
  setScrollForTest(t: number): void;
  destroy(): void;
}

export function initAboutFlow(deps: AboutFlowDeps): AboutFlow {
  const anchorRest = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ;
  const path: AboutPath = buildAboutPath(new THREE.Vector3(0, 0, anchorRest));
  const pose: CameraPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

  let doc: AboutDocument | null = null;
  let open = false;
  let paused = false;
  let t = 0;
  let lastBeat: BeatId | null = null;

  // The footer gate's own state (about-gate.ts) — reset on every enter() so a
  // PREVIOUS visit's fully-armed gate can't fire on the very next forward
  // wheel tick of a later one.
  const gate = createGate();

  // returnHome()'s scratch poses — module-scoped so applyReturn (an onUpdate
  // callback GSAP calls every tick) never allocates.
  const fromPos = new THREE.Vector3();
  const fromQuat = new THREE.Quaternion();
  const homePos = new THREE.Vector3(0, 0, HOME_REST_Z);
  const homeQuat = new THREE.Quaternion();
  let returnResolve: (() => void) | null = null;

  // `html, body { overflow: hidden; height: 100% }` (base.css) otherwise pins
  // window.scrollY at 0 and scrollHeight at innerHeight for the whole site —
  // this class (about.css) lifts that lock for exactly as long as the
  // corridor is open, on both motion paths (reduced motion needs to scroll
  // too; the document IS the whole experience there). It also scopes the
  // `body { background: var(--ground) }` and `.chrome { color: var(--ink) }`
  // rules (about.css) so the site's defaults are untouched everywhere else.
  const ABOUT_OPEN_CLASS = 'about-open';
  // Reduced motion has no camera/WebGL beats — the document is the whole
  // experience (spec: "what remains when the canvas is removed") — so the
  // opaque WebGL canvas is hidden outright rather than left covering --ground.
  const bgCanvas = (): HTMLElement | null => document.querySelector<HTMLElement>('#bg-canvas');

  const centredRect = (): { x: number; y: number; w: number; h: number } => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const side = Math.min(vw, vh) * FERRO_FRACTION;
    return { x: (vw - side) / 2, y: (vh - side) / 2, w: side, h: side };
  };

  const applyBeat = (beat: BeatId): void => {
    if (beat === lastBeat) return;
    lastBeat = beat;
    // Once per beat, never per frame: placeAt tweens, and re-issuing it every
    // frame restarts that tween and fights the blob's own drift.
    void deps.ferro?.placeAt(centredRect());
    deps.ferroEl?.classList.toggle('ferro-stage--behind', !IN_FRONT.has(beat));
  };

  const apply = (next: number): void => {
    t = next;
    path.sample(t, pose);
    deps.camera.position.copy(pose.position);
    deps.camera.quaternion.copy(pose.quaternion);

    const palette = paletteAt(t, path);
    deps.setGround(palette.ground);
    deps.setTextInk(palette.textInk);
    deps.atmosphere.setInk(palette.ink);
    deps.cursor?.setOnDark(palette.onDark);
    // Continuous, not a flip: nightAmount ramps alongside the CSS --ground
    // crossfade instead of snapping at its midpoint (palette.onDark's flip).
    deps.background?.setInvertAmount(palette.nightAmount);

    applyBeat(beatAt(t, path));
  };

  const onScroll = (): void => {
    if (!open || deps.reducedMotion) return;
    apply(
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
    if (!open || paused) return;
    doc?.resize(window.innerHeight);
    if (!deps.reducedMotion) {
      onScroll();
      if (lastBeat) void deps.ferro?.placeAt(centredRect(), { instant: true });
    }
  };

  /**
   * Restore every piece of shared, site-wide state the corridor's apply()
   * (and the CSS class it flips) can have driven — the --ground/--ink
   * escape hatch, the WebGL background invert, the atmosphere ink, the
   * cursor's on-dark treatment, and, on the animated path only, the ferro
   * blob, scrollNav's mode and the world's About flag.
   *
   * Extracted so exit() and returnHome() share one restore list instead of
   * two hand-maintained copies: three separate leaks (setInvertAmount,
   * atmosphere.setInk, cursor.setOnDark) each reached this exact branch
   * independently, in three different review rounds, because the list used
   * to live only in exit(). Deliberately does NOT touch doc/lastBeat/t/open
   * or the camera/director handover — those are per-instance lifecycle and
   * per-caller (exit() cuts the camera; returnHome() has already flown it),
   * not shared state.
   *
   * Preserves exit()'s original split: background/atmosphere/cursor are
   * restored unconditionally because paletteAt returns onDark: true at BOTH
   * t=0 and t=1, even though apply() (their only other caller) never runs
   * under reduced motion — belt-and-braces. ferro/scrollNav/world mode were
   * never engaged in that mode (see enter()'s reduced-motion branch) and
   * must not be touched here either.
   */
  const releaseSharedState = (): void => {
    document.documentElement.classList.remove(ABOUT_OPEN_CLASS);
    // Cleared, not merely left to go stale: the --ground/--ink-scoped rules
    // only apply while about-open is set, so this is belt-and-braces — but
    // a lingering inline value would otherwise be the first thing painted
    // (briefly, pre-apply(0)) the NEXT time the corridor opens.
    document.documentElement.style.removeProperty('--ground');
    document.documentElement.style.removeProperty('--ink');
    bgCanvas()?.classList.remove('about-canvas-hidden');
    // Restored unconditionally, even though apply() (the only caller of
    // setInvertAmount/setInk/setOnDark) never runs under reduced motion —
    // background, atmosphere and the cursor are all SHARED, site-wide state
    // (every page renders through the same background layer/atmosphere,
    // and shares the one cursor), and paletteAt returns onDark: true at
    // BOTH t=0 and t=1. Leaving the corridor by any route except
    // mid-capabilities — nav click, arrow key, the contact emblem, or
    // simply scrolling back to the top — would otherwise leave uInvert
    // nonzero, the atmosphere ink pinned at NIGHT_INK, and the cursor stuck
    // in its white-on-dark treatment on the pale world, for every other
    // page until a reload (or, for the cursor, until the next mousemove —
    // it used to self-heal via processHover's own setOnDark call, until the
    // I1 fix made about-flow the sole owner of the cursor while open).
    deps.background?.setInvertAmount(0);
    deps.atmosphere.setInk(DAY_INK);
    deps.cursor?.setOnDark(false);
    if (deps.reducedMotion) return;
    deps.ferro?.hide();
    deps.ferroEl?.classList.remove('ferro-stage--behind');
    deps.scrollNav?.setMode('world');
    deps.world.setAboutMode(false);
  };

  // Named top-level (not an object-literal method) so onWheel below — also
  // top-level, needing no `this` — can call it directly.
  const exit = (): void => {
    if (!open) return;
    open = false;
    paused = false;
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('wheel', onWheel);
    doc?.destroy();
    doc = null;
    lastBeat = null;
    t = 0;
    releaseSharedState();
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
    if (p >= 1) {
      open = false;
      paused = false;
      doc?.destroy();
      doc = null;
      lastBeat = null;
      t = 0;
      releaseSharedState(); // the same restores exit() performs
      deps.director.setSuspended(false);
      const r = returnResolve;
      returnResolve = null;
      r?.();
    }
  };

  /**
   * Fly the camera home and hand over — the shared body behind the public
   * returnHome() below AND the footer gate arming (feedGateAt further down).
   * Top-level, like exit(), so both callers reach the same one flight rather
   * than each keeping their own copy.
   */
  const doReturnHome = (): Promise<void> => {
    if (!open) return Promise.resolve();
    fromPos.copy(deps.camera.position);
    fromQuat.copy(deps.camera.quaternion);
    window.removeEventListener('scroll', onScroll);
    // Also detached here, not just in applyReturn's p>=1 branch: onResize
    // and onWheel stay attached for the corridor's whole open lifetime
    // (same as exit()), and both already no-op once `open` flips false —
    // but leaving them attached would double them up on the next enter().
    window.removeEventListener('resize', onResize);
    window.removeEventListener('wheel', onWheel);
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
  };

  /**
   * Feed the footer gate (about-gate.ts) a wheel delta and, once armed, kick
   * off the return flight home.
   *
   * Only reachable from onWheel below, which has already checked
   * open/paused/reducedMotion — so this never duplicates that guard, only
   * adds the one condition specific to the gate: it arms only at the very
   * end of the corridor (t >= 1). A ruling on this task deliberately folded
   * this into the EXISTING onWheel listener rather than a second 'wheel'
   * listener with its own open/paused check: a paused corridor is still
   * `open`, and the contact takeover's wheel events bubble to window
   * uncaught (it never calls stopPropagation) — precisely the bug already
   * fixed once for the leave-corridor check just above. A second listener
   * would have to re-derive that same guard from scratch and risk missing
   * `paused`, which is exactly how that bug got reintroduced for onResize
   * and onWheel in the first place (see their own comments below/above).
   */
  const feedGateAt = (deltaPx: number): void => {
    if (t < 1) return;
    const { armed, amount } = feedGate(gate, deltaPx);
    doc?.root.style.setProperty('--gate', String(amount));
    if (armed) void doReturnHome();
  };

  /**
   * Scroll the real document to where a beat's t sits, driving the camera
   * there through the ordinary scroll pipeline (onScroll/apply) — the same
   * mechanism a raw scroll gesture uses. Used by the footer's site nav
   * (onFooterNav below) for 'about' and 'contact': both are scroll positions
   * inside THIS document now (D2/the corridor spec), not places to fly to or
   * reopen, so there is nothing to hand off to — just move the scrollbar.
   * Under reduced motion this is also correct and sufficient: the browser's
   * own scroll position is the only "position" that mode has (see enter()'s
   * reduced-motion branch), and mountAboutDocument lays the document out
   * identically regardless of reducedMotion.
   */
  const scrollToBeat = (id: BeatId): void => {
    const range = document.documentElement.scrollHeight - window.innerHeight;
    if (range > 0) window.scrollTo(0, range * path.tForBeat(id));
  };

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
    scrollToBeat(dest === 'about' ? 'anchor' : 'contact');
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
    // the one listener pause() doesn't touch. The footer gate below shares
    // this exact guard for the exact same reason — see feedGateAt's comment.
    if (!open || paused || deps.reducedMotion) return;
    const deltaPx = normalizeWheelDelta(e.deltaY, e.deltaMode);
    if (shouldLeaveCorridor({ open, t, deltaPx })) {
      exit();
      return;
    }
    feedGateAt(deltaPx);
  };

  return {
    enter(parent: HTMLElement, startT = 0): void {
      if (open) return;
      open = true;
      paused = false;
      // Reset per visit: without this, a gate fully armed on a PREVIOUS visit
      // (it survives in this closure across enter()/exit() cycles) would fire
      // on the very first forward wheel tick of a later one, with no fresh
      // push required.
      gate.accumulated = 0;
      // Both motion paths: the document has to be able to scroll past one
      // viewport's worth of content, and the site's default full-bleed lock
      // (base.css) otherwise pins it at zero height (C1).
      document.documentElement.classList.add(ABOUT_OPEN_CLASS);
      doc = mountAboutDocument(parent, path, window.innerHeight, () => buildFooter({ onNav: onFooterNav }));
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
        bgCanvas()?.classList.add('about-canvas-hidden');
        // A deep link into a beat (e.g. /contact) still has to land there:
        // apply() is deliberately not called (there is no camera to move, and
        // `t` must stay 0 here — the leave-listener guard in onWheel keys off
        // reducedMotion precisely so it never reads a nonzero `t`), but the
        // BROWSER's own scroll is the only "position" reduced motion has, so
        // it has to be set directly from startT the same way the non-reduced
        // branch below sets it from the camera's t.
        const range = document.documentElement.scrollHeight - window.innerHeight;
        if (range > 0) window.scrollTo(0, range * Math.min(1, Math.max(0, startT)));
        return;
      }

      deps.director.setSuspended(true);
      deps.world.setAboutMode(true);
      deps.scrollNav?.setMode('about');
      deps.ferro?.show();
      lastBeat = null;
      // Position before the first paint: the camera must already be on the
      // corridor when the next frame renders, not one frame behind it.
      apply(Math.min(1, Math.max(0, startT)));
      // Put the document where the camera is, or the first real scroll event
      // would snap the camera back to the top.
      if (doc) {
        const range = document.documentElement.scrollHeight - window.innerHeight;
        if (range > 0) window.scrollTo(0, range * t);
      }
    },

    exit,
    returnHome: doReturnHome,
    stepReturnForTest(p: number): void {
      applyReturn(Math.min(1, Math.max(0, p)));
    },
    feedGateForTest(deltaPx: number): void {
      if (!open || paused || deps.reducedMotion) return;
      feedGateAt(deltaPx);
    },
    pause(): void {
      if (!open || paused) return;
      paused = true;
      window.removeEventListener('scroll', onScroll);
    },

    resume(): void {
      if (!open || !paused) return;
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
      // don't move. lastBeat is cleared first because applyBeat() otherwise
      // early-returns on "beat === lastBeat" and skips the ferro placeAt/
      // behind-class work entirely when the beat hasn't actually changed.
      deps.ferro?.show();
      lastBeat = null;
      apply(t);
    },
    isOpen: () => open,
    t: () => t,
    path: () => path,
    setScrollForTest(next: number): void {
      if (!open || deps.reducedMotion) return;
      apply(Math.min(1, Math.max(0, next)));
    },
    destroy(): void {
      if (open) exit();
    },
  };
}
