// src/about/about-flow.ts
import * as THREE from 'three';
import { DESTINATIONS } from '../three/world';
import { mountAboutDocument, type AboutDocument } from './about-document';
import { buildAboutPath, type AboutPath, type CameraPose } from './about-path';
import { paletteAt, DAY_INK } from './about-palette';
import { beatAt, scrollToT } from './about-scrub';
import type { BeatId } from './about-markers';

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
  background: { setInvert(on: boolean): void } | null;
  setGround(css: string): void;
  reducedMotion: boolean;
}

export interface AboutFlow {
  enter(parent: HTMLElement): void;
  exit(): void;
  isOpen(): boolean;
  /** Test/debug seam: the current path parameter. */
  t(): number;
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
  const aboutRest = DESTINATIONS.find((d) => d.id === 'about')!.cameraZ;
  const path: AboutPath = buildAboutPath(new THREE.Vector3(0, 0, aboutRest));
  const pose: CameraPose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

  let doc: AboutDocument | null = null;
  let open = false;
  let t = 0;
  let lastBeat: BeatId | null = null;

  // `html, body { overflow: hidden; height: 100% }` (base.css) otherwise pins
  // window.scrollY at 0 and scrollHeight at innerHeight for the whole site —
  // this class (about.css) lifts that lock for exactly as long as the
  // corridor is open, on both motion paths (reduced motion needs to scroll
  // too; the document IS the whole experience there). It also scopes the
  // `body { background: var(--ground) }` rule so the site's default ground
  // is untouched everywhere else.
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
    deps.atmosphere.setInk(palette.ink);
    deps.cursor?.setOnDark(palette.onDark);
    // Known limitation, out of scope to fix here: setInvert is binary, so the
    // WebGL ground snaps at the crossfade midpoint (palette.onDark's flip)
    // rather than dimming continuously alongside the CSS --ground crossfade.
    // Continuous dimming needs a new uniform in background.ts.
    deps.background?.setInvert(palette.onDark);

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
    if (!open) return;
    doc?.resize(window.innerHeight);
    if (!deps.reducedMotion) {
      onScroll();
      if (lastBeat) void deps.ferro?.placeAt(centredRect(), { instant: true });
    }
  };

  return {
    enter(parent: HTMLElement): void {
      if (open) return;
      open = true;
      // Both motion paths: the document has to be able to scroll past one
      // viewport's worth of content, and the site's default full-bleed lock
      // (base.css) otherwise pins it at zero height (C1).
      document.documentElement.classList.add(ABOUT_OPEN_CLASS);
      doc = mountAboutDocument(parent, path, window.innerHeight);
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize);

      if (deps.reducedMotion) {
        // No camera, no WebGL beats — the document is the whole experience.
        // Deliberately does NOT suspend the director or hide the world: under
        // reduced motion the canvas is not animating anyway, and leaving the
        // world alone keeps exit trivially correct. The opaque WebGL canvas
        // IS hidden, though (C3) — otherwise it still covers the page and
        // --ground is never actually seen.
        bgCanvas()?.classList.add('about-canvas-hidden');
        return;
      }

      deps.director.setSuspended(true);
      deps.world.setAboutMode(true);
      deps.scrollNav?.setMode('about');
      deps.ferro?.show();
      lastBeat = null;
      // Position before the first paint: the camera must already be on the
      // corridor when the next frame renders, not one frame behind it.
      apply(0);
    },

    exit(): void {
      if (!open) return;
      open = false;
      document.documentElement.classList.remove(ABOUT_OPEN_CLASS);
      // Cleared, not merely left to go stale: the --ground-scoped body rule
      // only applies while about-open is set, so this is belt-and-braces —
      // but a lingering inline value would otherwise be the first thing
      // painted (briefly, pre-apply(0)) the NEXT time the corridor opens.
      document.documentElement.style.removeProperty('--ground');
      bgCanvas()?.classList.remove('about-canvas-hidden');
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      doc?.destroy();
      doc = null;
      lastBeat = null;
      t = 0;
      // Restored unconditionally, even though apply() (the only caller of
      // setInvert/setInk) never runs under reduced motion — background and
      // atmosphere are SHARED, site-wide state (every page renders through
      // the same background layer and atmosphere), and paletteAt returns
      // onDark: true at BOTH t=0 and t=1. Leaving the corridor by any route
      // except mid-capabilities — nav click, arrow key, the contact emblem,
      // or simply scrolling back to the top — would otherwise leave
      // uInvert=1 and the atmosphere ink pinned at NIGHT_INK for every other
      // page until a reload.
      deps.background?.setInvert(false);
      deps.atmosphere.setInk(DAY_INK);
      if (deps.reducedMotion) return;
      deps.ferro?.hide();
      deps.ferroEl?.classList.remove('ferro-stage--behind');
      deps.scrollNav?.setMode('world');
      deps.world.setAboutMode(false);
      // Cut the camera back to the About rest before handing it back.
      // Nothing else in this codebase ever writes camera.quaternion —
      // camera-director.ts only ever writes position — so once the corridor
      // pitches the camera to look upward, nothing else will ever level it
      // again unless this does. The director also resumes from its own
      // remembered state.z (this same aboutRest), while the camera has
      // travelled along the whole path; resetting position here keeps the
      // director's remembered state consistent with where the camera actually
      // is. This is a cut, matching the hard transition a closing 2D takeover
      // already performs.
      deps.camera.position.set(0, 0, aboutRest);
      deps.camera.quaternion.identity();
      // Released LAST: the director resumes writing the camera from here, and
      // it must not do so while the world is still in About mode.
      deps.director.setSuspended(false);
    },

    isOpen: () => open,
    t: () => t,
    setScrollForTest(next: number): void {
      if (!open || deps.reducedMotion) return;
      apply(Math.min(1, Math.max(0, next)));
    },
    destroy(): void {
      if (open) this.exit();
    },
  };
}
