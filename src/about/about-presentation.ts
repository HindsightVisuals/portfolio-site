// src/about/about-presentation.ts
import * as THREE from 'three';
import { DESTINATIONS } from '../three/world';
import { type AboutPath, type CameraPose } from './about-path';
import { paletteAt, DAY_INK } from './about-palette';
import { beatAt, footerRiseAt } from './about-scrub';
import { type BeatId } from './about-markers';
import { workWallFadeAt } from './about-handover';
import { projectToRect } from './about-project';
import { ferroWorldAt, ferroFadeAt, FERRO_RADIUS } from './about-ferro-path';

/**
 * Given a `t`, write the world.
 *
 * The corridor's per-frame presentation — the camera pose, the palette fan-out,
 * the Work wall fade, the ferro blob's placement and stacking, and the
 * --footer-rise escape hatch. Pulled out of about-flow.ts's apply() unchanged:
 * this module owns none of the state machine that decides WHEN to call it —
 * the session (about-flow.ts) still owns `t`, and passes it in.
 *
 * Deliberately does not import about-gate-control.ts. The footer gate's own
 * reconciliation (gateCtl.syncAt) used to run as the last line of apply(); it
 * stayed behind in the session's scrubTo instead of travelling here, or this
 * module and the gate would import each other.
 */

/** Beats where the blob passes IN FRONT of the copy. Everything else is behind. */
const IN_FRONT: ReadonlySet<BeatId> = new Set<BeatId>(['anchor', 'transition', 'lander', 'team', 'ai']);

export interface PresentationDeps {
  camera: THREE.PerspectiveCamera;
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

export interface Presentation {
  apply(t: number): void;
  resetBeat(): void;
  /** enter()/exit(): the about-open class and the reduced-motion canvas hide. */
  setOpenClass(on: boolean): void;
  hideCanvas(on: boolean): void;
  releaseSharedState(): void;
}

export function createPresentation(deps: PresentationDeps, path: AboutPath): Presentation {
  const anchorRest = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ;
  const pose: CameraPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

  // Scratch for the ferro's per-frame world position and its fixed anchor —
  // module-scoped so apply() (called every frame) never allocates.
  const ferroScratch = new THREE.Vector3();
  const anchorPos = new THREE.Vector3(0, 0, anchorRest);

  let lastBeat: BeatId | null = null;

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

  const apply = (t: number): void => {
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
    // (about-return.ts) — safe because the scroll/resize/wheel listeners are
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
    // about-return.ts). Cleared alongside the behind-class for the same reason
    // --ground/--ink are cleared above: a lingering value would be the first
    // thing painted the next time the blob is shown.
    deps.ferroEl?.style.removeProperty('opacity');
    deps.scrollNav?.setMode('world');
    deps.world.setAboutMode(false);
  };

  return {
    apply,
    resetBeat(): void {
      lastBeat = null;
    },
    setOpenClass(on: boolean): void {
      document.documentElement.classList.toggle(ABOUT_OPEN_CLASS, on);
    },
    hideCanvas(on: boolean): void {
      bgCanvas()?.classList.toggle('about-canvas-hidden', on);
    },
    releaseSharedState,
  };
}
