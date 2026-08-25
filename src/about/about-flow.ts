// src/about/about-flow.ts
import * as THREE from 'three';
import { DESTINATIONS } from '../three/world';
import { mountAboutDocument, type AboutDocument } from './about-document';
import { buildAboutPath, type AboutPath, type CameraPose } from './about-path';
import { paletteAt } from './about-palette';
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
      doc = mountAboutDocument(parent, path, window.innerHeight);
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize);

      if (deps.reducedMotion) {
        // No camera, no WebGL beats — the document is the whole experience.
        // Deliberately does NOT suspend the director or hide the world: under
        // reduced motion the canvas is not animating anyway, and leaving the
        // world alone keeps exit trivially correct.
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
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      doc?.destroy();
      doc = null;
      lastBeat = null;
      t = 0;
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
