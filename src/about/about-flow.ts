// src/about/about-flow.ts
import * as THREE from 'three';
import gsap from 'gsap';
import { DESTINATIONS, HOME_REST_Z } from '../three/world';
import { mountAboutDocument, type AboutDocument } from './about-document';
import { buildAboutPath, type AboutPath, type CameraPose } from './about-path';
import { paletteAt, DAY_INK } from './about-palette';
import { beatAt, footerRiseAt, scrollToT } from './about-scrub';
import { type BeatId } from './about-markers';
import { nextBeatId, scrollDocumentTo, scrollToBeat } from './about-nav';
import { shouldLeaveCorridor, workWallFadeAt } from './about-handover';
import { normalizeWheelDelta } from '../home/wheel';
import { createGateControl, GATE_IDLE_MS, type GateControl } from './about-gate-control';
import { buildFooter } from '../page2d/footer';
import { projectToRect } from './about-project';
import { ferroWorldAt, ferroFadeAt, FERRO_RADIUS } from './about-ferro-path';

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

/**
 * Duration of the return flight home (returnHome), in seconds. Long enough to
 * read as travel across the ~53-unit gap between the corridor's end pose and
 * Home, short enough not to trap the user at the footer. A tuning value.
 */
const RETURN_S = 1.6;

/**
 * Fraction of the return flight over which the corridor's document (and the
 * blob riding above it) fades away.
 *
 * The flight exists so the loop closes as TRAVEL rather than as a cut. Tearing
 * the document down only at p >= 1 — which is what this used to do — left the
 * whole corridor, footer and all, painted opaquely over the canvas for the
 * full 1.6s while the camera flew behind it: invisible travel, and a cut
 * again, just a delayed one. Fading rather than destroying at p = 0 keeps the
 * crossfade the spec asked for; 0.45 clears the document early enough that
 * most of the flight is actually watched.
 */
const RETURN_FADE_P = 0.45;

// Re-exported so about-flow.test.ts's existing import keeps resolving; the
// definition now lives in about-gate-control.ts, alongside the rest of the
// gate's state.
export { GATE_IDLE_MS };

export interface AboutFlowDeps {
  camera: THREE.PerspectiveCamera;
  /**
   * The camera director, suspended for the corridor's lifetime.
   *
   * `syncTo` is as load-bearing as `setSuspended`: the director writes
   * `camera.position` from its own remembered pose on every non-suspended
   * frame, so whatever position the corridor hands back has to be told to it
   * first or the next tick teleports the camera away. See its doc in
   * camera-director.ts.
   */
  director: { setSuspended(v: boolean): void; syncTo(z: number): void };
  world: { setAboutMode(v: boolean): void; setAnchoredFade(a: number): void };
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
  /**
   * Arrow-key navigation from inside the corridor: one beat forward (+1) or
   * back (−1). Backward from the very top leaves the corridor, mirroring the
   * wheel. See the implementation's own comment for the full ruling.
   */
  stepBeat(dir: 1 | -1): void;
  /**
   * Test/debug seam: step the return flight to a given 0..1 progress.
   *
   * Guarded on `open` alone — unlike its two siblings below, which mirror
   * onScroll and onWheel, this one mirrors doReturnHome, whose only guard is
   * `open` (the return is a legitimate move under reduced motion, and runs
   * whether or not the corridor is paused). Without any guard at all it ran
   * applyReturn's whole teardown — releaseSharedState, setSuspended(false) —
   * on a corridor that was never open.
   */
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
   * cannot be tested through real scroll events — this is the only way to put
   * the corridor at a known `t` in a test.
   *
   * Guarded on `paused` as well as open/reducedMotion. onScroll itself does
   * not check `paused` because pause() DETACHES it — this seam bypasses that
   * listener, so it has to carry the term the detach was standing in for, or
   * a test could scrub a corridor the contact takeover is covering. Exactly
   * the discipline feedGateForTest already follows for onWheel.
   */
  setScrollForTest(t: number): void;
  destroy(): void;
}

export function initAboutFlow(deps: AboutFlowDeps): AboutFlow {
  const anchorRest = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ;
  const path: AboutPath = buildAboutPath(new THREE.Vector3(0, 0, anchorRest));
  const pose: CameraPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

  // Scratch for the ferro's per-frame world position and its fixed anchor —
  // module-scoped so apply() (called every frame) never allocates.
  const ferroScratch = new THREE.Vector3();
  const anchorPos = new THREE.Vector3(0, 0, anchorRest);

  let doc: AboutDocument | null = null;
  let open = false;
  let paused = false;
  let t = 0;
  let lastBeat: BeatId | null = null;

  // returnHome()'s scratch poses — module-scoped so applyReturn (an onUpdate
  // callback GSAP calls every tick) never allocates.
  const fromPos = new THREE.Vector3();
  const fromQuat = new THREE.Quaternion();
  const homePos = new THREE.Vector3(0, 0, HOME_REST_Z);
  const homeQuat = new THREE.Quaternion();
  let returnResolve: (() => void) | null = null;
  // The chrome's lift at the instant the flight departs, so applyReturn can
  // interpolate it back down rather than dropping it (see there). Captured
  // rather than recomputed from `t` per tick because `t` is frozen for the
  // flight's duration and the flight, not the scrub, owns this now.
  let fromRise = 0;

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

  // Scratch for projectionViewport below — apply() calls it every frame, and
  // this module does not allocate per frame (see the ferro/return scratch
  // above).
  const viewportScratch = { w: 0, h: 0 };

  /**
   * The box the corridor's camera actually renders into.
   *
   * The WORLD CANVAS's box, not the window's. The corridor is the one place on
   * this site with a scrollbar (`html.about-open { overflow: auto }`,
   * about.css) and window.innerWidth INCLUDES that gutter while `#bg-canvas`
   * is `width: 100%`, which excludes it — the same ~15px mismatch base.css's
   * own #bg-canvas comment records for the canvas-vs-stage case. Projecting
   * through the window's width while the image is framed by the canvas's drove
   * the blob off-centre by up to ~8px, and only inside the corridor, which is
   * exactly where it is visible.
   *
   * Falls back to the window when the canvas cannot be measured — it is absent
   * under reduced motion's hidden-canvas class only in the sense of being
   * display: none (zero box), and jsdom reports zero for every element. A zero
   * viewport would make projectToRect return null and simply stop placing the
   * blob, which is a worse failure than a 15px offset.
   */
  const projectionViewport = (): { w: number; h: number } => {
    const c = bgCanvas();
    const w = c?.clientWidth ?? 0;
    const h = c?.clientHeight ?? 0;
    viewportScratch.w = w > 0 ? w : window.innerWidth;
    viewportScratch.h = h > 0 ? h : window.innerHeight;
    return viewportScratch;
  };

  /**
   * The blob's stacking, not its position — z-index only. It flips per beat
   * (does THIS beat's copy need to sit in front of the blob or not), which is
   * a wholly separate axis from where the blob sits on screen (apply()'s job
   * now, every frame). Gated on lastBeat so it toggles a class once per beat
   * change rather than writing it every frame for no reason.
   *
   * Bug fix (first QA pass): on beats where the blob must not cross the
   * corridor's type, this parks it at z-index 0 — below the contact
   * takeover's 20 — so a modal opened from one of those beats doesn't sit
   * under an opaque blob that's since vanished from view. See pause()'s own
   * comment for the report that led to this.
   */
  const applyBeat = (beat: BeatId): void => {
    if (beat === lastBeat) return;
    lastBeat = beat;
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

    // The Work wall leaves as a fade across the corridor's opening stretch,
    // not as setAboutMode(true)'s one-frame blink — see workWallFadeAt. Safe
    // to write every frame: About mode is on for as long as apply() runs, and
    // world.update()'s own materialize pass is switched off in that mode, so
    // this is the only writer rather than a fight with it.
    deps.world.setAnchoredFade(workWallFadeAt(t, path));

    // The blob travels its own measured path now, projected through the
    // corridor camera into the rect placeAt wants. Every frame, not once per
    // beat: it is moving continuously, and `instant` because a tween
    // re-issued each frame would restart and never land (see placeAt's own
    // doc). ferroEl.style.opacity is also written by the return flight
    // (applyReturn) — safe because the scroll/resize/wheel listeners are
    // detached for that flight's duration AND pause()/resume(), the two direct
    // callers that could re-enter apply() from main.ts, refuse to run while it
    // is in the air (see their guards).
    const fade = ferroFadeAt(t);
    if (deps.ferroEl) deps.ferroEl.style.opacity = String(fade);
    if (fade > 0) {
      // The camera's own matrix, THIS frame. `world.project(camera)` consumes
      // camera.matrixWorldInverse, and nothing else here refreshes it:
      // WebGLRenderer.render() does, but not until the next rAF — so without
      // this, the two lines above wrote a new pose and the projection below
      // then ran through LAST frame's matrix. Worse than one frame late, it
      // was internally inconsistent: projectToRect derives the blob's SIZE
      // from camera.position/quaternion (fresh) and its POSITION from the
      // matrix (stale), so size and position sat a frame apart every frame.
      deps.camera.updateMatrixWorld();
      const rect = projectToRect(
        ferroWorldAt(t, anchorPos, ferroScratch),
        FERRO_RADIUS,
        deps.camera,
        projectionViewport(),
      );
      if (rect) void deps.ferro?.placeAt(rect, { instant: true });
    }

    applyBeat(beatAt(t, path));

    const rise = footerRiseAt(t, path);
    // The chrome (.wordmark/.site-nav/margin notes, base.css) reads this to
    // lift itself out of the rising footer's way across the corridor's last
    // beat — see footerRiseAt's own doc for why nothing else compresses.
    document.documentElement.style.setProperty('--footer-rise', String(rise));

    // The footer gate's own reconciliation against the current t — see
    // GateControl.syncAt's own doc. For this task only, apply() stays the
    // single call site; Task 4 lifts this out when apply() moves to the
    // presentation module.
    gateCtl.syncAt(t);
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
    // onScroll() re-runs apply(), which re-places the ferro (instantly) as
    // one of its ordinary per-frame writes now — no separate re-place needed.
    if (!deps.reducedMotion) onScroll();
  };

  /**
   * Restore every piece of shared, site-wide state the corridor's apply()
   * (and the CSS class it flips) can have driven — the --ground/--ink/
   * --footer-rise escape hatches, the WebGL background invert, the atmosphere
   * ink, the cursor's on-dark treatment, and, on the animated path only, the
   * ferro blob, scrollNav's mode and the world's About flag.
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
    // Same reasoning: undefined everywhere outside the corridor (every CSS
    // reference carries a `, 0` fallback for exactly that reason), but a
    // lingering value would still be the first thing the chrome reads,
    // pre-apply(0), the next time the corridor opens.
    document.documentElement.style.removeProperty('--footer-rise');
    // Same again for the gate indicator's reveal (about.css reads it with a
    // `, 0` fallback). On this list, not merely left to go stale, because
    // that is exactly how the three leaks this function exists to prevent got
    // in — one per review round.
    gateCtl.release();
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
    // The return flight's crossfade writes an inline opacity here (see
    // applyReturn). Cleared alongside the behind-class for the same reason
    // --ground/--ink are cleared above: a lingering value would be the first
    // thing painted the next time the blob is shown.
    deps.ferroEl?.style.removeProperty('opacity');
    deps.scrollNav?.setMode('world');
    deps.world.setAboutMode(false);
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
    // Uncover the flight. The corridor's document (z-index 1) and the blob
    // (z-index 25) both paint OVER the canvas; left opaque for the whole
    // 1.6s, they hide the very travel this move exists to show. Faded rather
    // than destroyed at p = 0 so the two images cross rather than cut.
    const fade = 1 - Math.min(1, Math.max(0, p) / RETURN_FADE_P);
    if (doc) doc.root.style.opacity = String(fade);
    if (deps.ferroEl) deps.ferroEl.style.opacity = String(fade);
    // Ride the chrome home with the camera instead of dropping it at the door.
    //
    // The gate only arms at the corridor's END, so the flight always starts
    // with the footer fully risen and the chrome parked at the top of the
    // viewport. --footer-rise used to be REMOVED, and only at p >= 1 — so on
    // the designed exit the wordmark and nav held top: 50px for the entire
    // 1.6s and then jumped half a viewport back to centre in a single frame,
    // over the Home view, with nothing fading to cover it. Interpolating it
    // down here is the whole fix: the chrome descends as the camera flies.
    // Off the EASED e, not raw p, so it tracks the camera's own curve rather
    // than merely finishing at the same time. releaseSharedState() below still
    // removes this property at p >= 1 — by then it reads 0 anyway, so there
    // is nothing left to snap.
    document.documentElement.style.setProperty('--footer-rise', String(fromRise * (1 - e)));
    // --gate-show is deliberately NOT written here any more (it used to ride
    // the same fromRise*(1-e) ramp as --footer-rise above). That write
    // existed only because the gate panel used to be `position: fixed`,
    // painted OVER the fading document rather than inside it, so nothing else
    // would have carried it out of view. Now that the panel is mounted
    // through footer.ts's `gate` slot — a normal descendant of `doc.root` —
    // the `fade` write four lines up already takes it to invisible (well
    // before the flight lands: RETURN_FADE_P clears the whole document at
    // p = 0.45, long before --footer-rise/e reach 0), so a second write here
    // would be redundant at best. It would also fight the opacity transition
    // about.css now puts on .about-gate for the fade-IN: retargeting that
    // transition every tick, exactly the conflict this property used to
    // create for --footer-rise's chrome consumers, just relocated. Leaving
    // gateFed's last value (always '1' here — the flight only starts once the
    // gate has been fed) in place for the rest of the flight is correct: it
    // is already invisible via the document fade, and releaseSharedState()
    // below still clears it outright at p >= 1.
    if (p >= 1) {
      open = false;
      paused = false;
      doc?.destroy();
      doc = null;
      lastBeat = null;
      t = 0;
      releaseSharedState(); // the same restores exit() performs
      // BEFORE setSuspended(false), and the whole reason the loop closes at
      // all. The director's remembered state.z has been frozen at the Work
      // rest since enter() suspended it, and its update() writes
      // camera.position.z = state.z unconditionally on every non-suspended
      // frame — so without this the very next tick teleported the camera from
      // Home (34) straight back to −26, one frame after the flight landed.
      //
      // exit() gets the same thing right by CUTTING the camera to the rest the
      // director already remembers (see its comment); a flight cannot do that,
      // so the director is told where the camera ended up instead. syncTo, not
      // jumpTo: jumpTo fires departCbs, and main.ts subscribes
      // `onDepart(() => aboutFlow.exit())` to those — which would cut the
      // camera to the Work rest itself, undoing the flight.
      deps.director.syncTo(homePos.z);
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
    // Belt-and-braces: feedGateAt already clears this before an armed push
    // calls here, but returnHome() is also a public test seam reachable
    // without ever feeding the gate — a flight departing must not leave a
    // stale timer to later drain an accumulator the next visit hasn't fed.
    gateCtl.clearTimer();
    fromPos.copy(deps.camera.position);
    fromQuat.copy(deps.camera.quaternion);
    // Where the chrome is sitting as the flight departs — applyReturn walks it
    // back to 0 across the flight. Read from the path rather than from the DOM
    // so it is the same number apply() last wrote, not a re-parsed string.
    fromRise = footerRiseAt(t, path);
    window.removeEventListener('scroll', onScroll);
    // Also detached here, not just in applyReturn's p>=1 branch: onResize
    // and onWheel stay attached for the corridor's whole open lifetime
    // (same as exit()), and both already no-op once `open` flips false —
    // but leaving them attached would double them up on the next enter().
    window.removeEventListener('resize', onResize);
    window.removeEventListener('wheel', onWheel);
    // The document fades out under the flight (applyReturn) but stays mounted
    // until p >= 1; a transparent footer must not still be clickable.
    if (doc) doc.root.style.pointerEvents = 'none';
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
    if (!open || paused || deps.reducedMotion) return;
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
    // the one listener pause() doesn't touch. The footer gate below shares
    // this exact guard for the exact same reason — see feedGateAt's comment.
    if (!open || paused || deps.reducedMotion) return;
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
      document.documentElement.classList.add(ABOUT_OPEN_CLASS);
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
        bgCanvas()?.classList.add('about-canvas-hidden');
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
      lastBeat = null;
      // Position before the first paint: the camera must already be on the
      // corridor when the next frame renders, not one frame behind it.
      apply(Math.min(1, Math.max(0, startT)));
      // Put the document where the camera is, or the first real scroll event
      // would snap the camera back to the top.
      if (doc) scrollDocumentTo(t);
    },

    exit,
    returnHome: doReturnHome,
    stepBeat,
    stepReturnForTest(p: number): void {
      if (!open) return;
      applyReturn(Math.min(1, Math.max(0, p)));
    },
    feedGateForTest(deltaPx: number): void {
      if (!open || paused || deps.reducedMotion) return;
      gateCtl.feed(deltaPx, t);
    },
    pause(): void {
      // `returnResolve` is the in-flight flag: non-null for exactly as long as
      // the return flight is running (doReturnHome sets it, applyReturn's
      // p >= 1 branch clears it).
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
      if (!open || paused || returnResolve) return;
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
      if (!open || !paused || returnResolve) return;
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
      lastBeat = null;
      apply(t);
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
      if (!open || paused || deps.reducedMotion) return;
      apply(Math.min(1, Math.max(0, next)));
    },
    destroy(): void {
      if (open) exit();
    },
  };
}
