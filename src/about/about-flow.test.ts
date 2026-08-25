// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DESTINATIONS } from '../three/world';
import { DAY_INK } from './about-palette';
import { initAboutFlow, type AboutFlowDeps } from './about-flow';

const makeDeps = (over: Partial<AboutFlowDeps> = {}): AboutFlowDeps => ({
  camera: new THREE.PerspectiveCamera(),
  director: { setSuspended: vi.fn() },
  world: { setAboutMode: vi.fn() },
  atmosphere: { setInk: vi.fn() },
  scrollNav: { setMode: vi.fn() },
  ferro: { placeAt: vi.fn().mockResolvedValue(undefined), show: vi.fn(), hide: vi.fn() },
  ferroEl: document.createElement('div'),
  cursor: { setOnDark: vi.fn() },
  background: { setInvertAmount: vi.fn() },
  setGround: vi.fn(),
  setTextInk: vi.fn(),
  reducedMotion: false,
  ...over,
});

let parent: HTMLElement;
beforeEach(() => {
  parent = document.createElement('div');
  document.body.appendChild(parent);
});

// document.documentElement and any #bg-canvas are real jsdom globals shared
// across every test in this file — strip what enter()/exit() touch on it so
// a test that doesn't reach its own exit() (there shouldn't be one, but) can't
// bleed state into the next.
afterEach(() => {
  document.documentElement.classList.remove('about-open');
  document.documentElement.style.removeProperty('--ground');
  document.documentElement.style.removeProperty('--ink');
  document.querySelector('#bg-canvas')?.remove();
});

describe('initAboutFlow', () => {
  it('takes the camera off the director and stops the spine dressing on enter', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    expect(deps.director.setSuspended).toHaveBeenCalledWith(true);
    expect(deps.world.setAboutMode).toHaveBeenCalledWith(true);
    expect(deps.scrollNav!.setMode).toHaveBeenCalledWith('about');
    flow.destroy();
  });

  it('gives all three back on exit', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.exit();
    expect(deps.director.setSuspended).toHaveBeenLastCalledWith(false);
    expect(deps.world.setAboutMode).toHaveBeenLastCalledWith(false);
    expect(deps.scrollNav!.setMode).toHaveBeenLastCalledWith('world');
    expect(flow.isOpen()).toBe(false);
    flow.destroy();
  });

  it('lands the camera on the start of the path, level, before the first paint', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    expect(flow.t()).toBe(0);
    expect(deps.camera.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 6);
    flow.destroy();
  });

  it('can enter at a given t, for deep links into the corridor', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent, 0.5);
    expect(flow.t()).toBeCloseTo(0.5, 6);
    flow.destroy();
  });

  it('defaults to the top when no t is given', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    expect(flow.t()).toBe(0);
    flow.destroy();
  });

  it('drives the camera from the document scroll offset', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    const zStart = deps.camera.position.z;
    // jsdom reports zero-size elements; drive the seam directly.
    flow.setScrollForTest(0.5);
    expect(flow.t()).toBeCloseTo(0.5, 6);
    expect(deps.camera.position.z).toBeLessThan(zStart);
    expect(deps.camera.position.y).toBeGreaterThan(0);
    flow.destroy();
  });

  it('applies the palette as it goes — ground, ink and cursor together', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    (deps.setGround as ReturnType<typeof vi.fn>).mockClear();
    flow.setScrollForTest(1);
    expect(deps.setGround).toHaveBeenCalled();
    expect(deps.atmosphere.setInk).toHaveBeenCalled();
    expect(deps.cursor!.setOnDark).toHaveBeenCalledWith(true);
    flow.destroy();
  });

  it('places the ferro once per beat, not once per frame', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    const calls = () => (deps.ferro!.placeAt as ReturnType<typeof vi.fn>).mock.calls.length;
    const afterEnter = calls();
    flow.setScrollForTest(0.201);
    flow.setScrollForTest(0.202);
    flow.setScrollForTest(0.203);
    expect(calls()).toBeLessThanOrEqual(afterEnter + 1);
    flow.destroy();
  });

  it('flips the ferro behind the document on beats where it must not cross the type', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0); // anchor/lander region — in front
    expect(deps.ferroEl!.classList.contains('ferro-stage--behind')).toBe(false);
    flow.setScrollForTest(0.78); // capabilities region — behind
    expect(deps.ferroEl!.classList.contains('ferro-stage--behind')).toBe(true);
    flow.destroy();
  });

  it('under reduced motion mounts the document and touches neither camera nor ferro', () => {
    const deps = makeDeps({ reducedMotion: true });
    const flow = initAboutFlow(deps);
    const before = deps.camera.position.clone();
    flow.enter(parent);
    expect(parent.querySelector('main.about-doc')).not.toBeNull();
    expect(deps.camera.position.equals(before)).toBe(true);
    expect(deps.ferro!.show).not.toHaveBeenCalled();
    flow.destroy();
  });

  it('survives null ferro, null cursor, null scrollNav and null background', () => {
    const deps = makeDeps({ ferro: null, ferroEl: null, cursor: null, scrollNav: null, background: null });
    const flow = initAboutFlow(deps);
    expect(() => {
      flow.enter(parent);
      flow.setScrollForTest(0.5);
      flow.exit();
    }).not.toThrow();
    flow.destroy();
  });

  it('is idempotent — entering twice does not mount two documents', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.enter(parent);
    expect(parent.querySelectorAll('main.about-doc')).toHaveLength(1);
    flow.destroy();
  });

  // Ruling F4: nothing else in this codebase ever writes camera.quaternion —
  // camera-director.ts only ever writes position — so once the corridor
  // pitches the camera 90° to look upward, nothing puts it back unless exit()
  // does it explicitly. Separately, the director resumes from its own
  // remembered state.z (the Work rest), while the camera has travelled well
  // past that along the path, so exit must also reset position to the Work
  // rest before releasing the director.
  it('restores the camera to the Work rest, level, on exit', () => {
    const deps = makeDeps();
    const anchorRest = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ;
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.6);
    flow.exit();
    expect(deps.camera.position.x).toBeCloseTo(0, 6);
    expect(deps.camera.position.y).toBeCloseTo(0, 6);
    expect(deps.camera.position.z).toBeCloseTo(anchorRest, 6);
    expect(deps.camera.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 6);
    flow.destroy();
  });

  // C1: base.css locks html/body to overflow:hidden, height:100% so nothing
  // else on the site scrolls the window — without this class the corridor's
  // scroll-driven scrub is frozen at t=0 forever (window.scrollY pinned at 0,
  // scrollHeight === innerHeight). Both motion paths need it: reduced motion
  // has no camera/WebGL beats, so the document IS the whole experience there.
  it('lifts the site-wide scroll lock on enter and restores it on exit — normal motion', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    expect(document.documentElement.classList.contains('about-open')).toBe(true);
    flow.exit();
    expect(document.documentElement.classList.contains('about-open')).toBe(false);
    flow.destroy();
  });

  it('lifts the site-wide scroll lock on enter and restores it on exit — reduced motion', () => {
    const deps = makeDeps({ reducedMotion: true });
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    expect(document.documentElement.classList.contains('about-open')).toBe(true);
    flow.exit();
    expect(document.documentElement.classList.contains('about-open')).toBe(false);
    flow.destroy();
  });

  // C3: --ground is scoped to `html.about-open body` (about.css) so it never
  // overrides the site's default ground outside the corridor — a lingering
  // inline value would otherwise be the first thing painted, pre-apply(0), the
  // next time the corridor opens.
  it('clears the inline --ground custom property on exit', () => {
    document.documentElement.style.setProperty('--ground', '#123456');
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.exit();
    expect(document.documentElement.style.getPropertyValue('--ground')).toBe('');
    flow.destroy();
  });

  // C3: the WebGL background is opaque (#bg-canvas has no alpha), so --ground
  // is otherwise never seen. setInvertAmount dims the unmasked field's ground
  // continuously, driven by the palette's nightAmount ramp.
  it('drives the WebGL background invert from the palette', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent); // apply(0): t=0 is full night — nightAmount 1
    expect(deps.background!.setInvertAmount).toHaveBeenCalledWith(1);
    (deps.background!.setInvertAmount as ReturnType<typeof vi.fn>).mockClear();
    flow.setScrollForTest(1);
    expect(deps.background!.setInvertAmount).toHaveBeenCalled();
    flow.destroy();
  });

  it('drives the ground continuously, not as a flip', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    const seen = new Set<number>();
    for (let i = 0; i <= 20; i++) {
      flow.setScrollForTest(i / 20);
      seen.add((deps.background!.setInvertAmount as ReturnType<typeof vi.fn>).mock.lastCall![0]);
    }
    // A binary flip would only ever produce 0 and 1.
    expect(seen.size).toBeGreaterThan(3);
    flow.destroy();
  });

  it('restores the ground on exit', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.3);
    flow.exit();
    expect(deps.background!.setInvertAmount).toHaveBeenLastCalledWith(0);
    flow.destroy();
  });

  // C3: reduced motion has no camera/WebGL beats — the document is meant to be
  // the whole experience, but the opaque canvas otherwise still covers it and
  // --ground (the whole point of this mode) is never actually seen.
  it('hides the WebGL canvas on enter under reduced motion, and restores it on exit', () => {
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-canvas';
    document.body.appendChild(canvas);
    const deps = makeDeps({ reducedMotion: true });
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    expect(canvas.classList.contains('about-canvas-hidden')).toBe(true);
    flow.exit();
    expect(canvas.classList.contains('about-canvas-hidden')).toBe(false);
    flow.destroy();
  });

  // Round 2 (post-review): background.setInvert and atmosphere.setInk are
  // SHARED, site-wide state — every page renders through the same background
  // layer and atmosphere — but apply() drives both to their night values and
  // exit() never put them back. paletteAt returns onDark: true at BOTH t=0
  // and t=1, so leaving the corridor by any route except mid-capabilities
  // (nav click, arrow key, the contact emblem, or simply scrolling back to
  // the top) left uInvert=1 and the atmosphere ink pinned at NIGHT_INK for
  // every other page until a reload.
  it('restores the background invert to false on exit, even from a dark beat', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.3); // well inside the night range (before clientWall's ramp)
    expect(deps.background!.setInvertAmount).toHaveBeenLastCalledWith(1);
    flow.exit();
    expect(deps.background!.setInvertAmount).toHaveBeenLastCalledWith(0);
    flow.destroy();
  });

  it('restores the atmosphere ink to DAY_INK on exit, even from a dark beat', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.3); // well inside the night range (before clientWall's ramp)
    expect(deps.atmosphere.setInk).not.toHaveBeenLastCalledWith(DAY_INK);
    flow.exit();
    expect(deps.atmosphere.setInk).toHaveBeenLastCalledWith(DAY_INK);
    flow.destroy();
  });

  // C1 (whole-branch review, round 3): apply() writes FOUR pieces of shared,
  // site-wide state — setGround, setTextInk, setInk, setOnDark, setInvert —
  // and exit() was restoring only three. cursor.setOnDark used to self-heal
  // via processHover's own call on every mousemove, until the I1 fix (round
  // 2) made about-flow the sole owner of the cursor while the corridor is
  // open — after that, a keyboard exit (arrow keys) or the back button left
  // the custom cursor in its white-on-dark treatment over the pale world
  // until the next mouse move.
  it('restores the cursor to its light-ground treatment on exit, even from a dark beat', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.3); // well inside the night range (before clientWall's ramp)
    expect(deps.cursor!.setOnDark).toHaveBeenLastCalledWith(true);
    flow.exit();
    expect(deps.cursor!.setOnDark).toHaveBeenLastCalledWith(false);
    flow.destroy();
  });

  // T1: the invariant, not one more reactive patch. Every restore above was
  // added one bug at a time (setInvert, then setInk, then setOnDark) — this
  // asserts the whole set together in one place, so a FIFTH writer added to
  // apply() without a matching restore in exit() fails here rather than in
  // production. --ground and --ink are pre-seeded with garbage values before
  // enter() specifically so their being empty afterward actually proves
  // exit() cleared them, rather than merely never having been set by the
  // (mocked, non-DOM-touching) setGround/setTextInk in this test.
  it('restores every site-wide default apply() can have driven, on exit from a dark beat', () => {
    document.documentElement.style.setProperty('--ground', '#123456');
    document.documentElement.style.setProperty('--ink', '#abcdef');
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.3); // well inside the night range
    flow.exit();
    expect(deps.background!.setInvertAmount).toHaveBeenLastCalledWith(0);
    expect(deps.atmosphere.setInk).toHaveBeenLastCalledWith(DAY_INK);
    expect(deps.cursor!.setOnDark).toHaveBeenLastCalledWith(false);
    expect(document.documentElement.style.getPropertyValue('--ground')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--ink')).toBe('');
    flow.destroy();
  });

  // T2: the last uncovered ordering path in this module — resize -> doc.resize
  // -> onScroll -> instant placeAt. jsdom was added to this repo specifically
  // so lifecycle paths like this could be tested.
  it('on window resize: re-lays out the document, re-applies scroll, and re-places a mid-beat ferro instantly', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.78); // capabilities — establishes lastBeat, so the instant re-place branch is live
    const placeAtCallsBefore = (deps.ferro!.placeAt as ReturnType<typeof vi.fn>).mock.calls.length;

    const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')!;
    const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')!;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 550 });
    // documentElement.scrollHeight has no OWN property in jsdom by default
    // (falls through to its built-in getter, which reports 0 — the same
    // "jsdom gives every element a zero-height box" limitation setScrollForTest
    // exists to route around); this defines one for the duration of the test.
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2000 });
    try {
      window.dispatchEvent(new Event('resize'));

      // doc.resize(window.innerHeight) ran: the last (one-full-viewport)
      // section reflects the NEW height, not the one it was mounted with.
      const lastSection = parent.querySelector<HTMLElement>('.about-beat[data-beat="ai"]');
      expect(lastSection?.style.height).toBe('900px');

      // onScroll() ran again, reading the resize's OWN window.innerHeight:
      // scrollToT(550, 2000, 900) = 550 / (2000 - 900) = 0.5.
      expect(flow.t()).toBeCloseTo(0.5, 6);

      // lastBeat was already set from the scrub above, so the explicit
      // re-place fires too, instantly — no tween racing the reflow.
      const calls = (deps.ferro!.placeAt as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(placeAtCallsBefore);
      expect(calls[calls.length - 1][1]).toEqual({ instant: true });
    } finally {
      Object.defineProperty(window, 'innerHeight', originalInnerHeight);
      Object.defineProperty(window, 'scrollY', originalScrollY);
      delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight;
    }
    flow.destroy();
  });
});
