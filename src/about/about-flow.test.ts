// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DESTINATIONS } from '../three/world';
import { DAY_INK } from './about-palette';
import { GATE_IDLE_MS, initAboutFlow, type AboutFlowDeps } from './about-flow';
import { GATE_THRESHOLD_PX } from './about-gate';

const makeDeps = (over: Partial<AboutFlowDeps> = {}): AboutFlowDeps => ({
  camera: new THREE.PerspectiveCamera(),
  director: { setSuspended: vi.fn(), syncTo: vi.fn() },
  world: { setAboutMode: vi.fn(), setAnchoredFade: vi.fn() },
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
  document.documentElement.style.removeProperty('--footer-rise');
  document.documentElement.style.removeProperty('--gate-show');
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

  // Bug found in review (fix round): a /contact deep link under reduced
  // motion used to mount the document scrolled to the top regardless of
  // startT, because apply() — the only thing that ever reads startT — never
  // runs in this mode (see the reduced-motion branch of enter()). The only
  // "position" reduced motion has is the browser's own scroll, so startT has
  // to drive that directly. jsdom always reports zero-size elements (see the
  // setScrollForTest doc comment above), so scrollHeight/innerHeight are
  // stubbed here to force the `range > 0` branch that a real, scrollable
  // document would take.
  it('scrolls the document to match startT under reduced motion', () => {
    const deps = makeDeps({ reducedMotion: true });
    const flow = initAboutFlow(deps);
    // documentElement.scrollHeight has no OWN property in jsdom by default
    // (falls through to its built-in getter, which reports 0); window.innerHeight
    // DOES — capture and restore that one's original descriptor rather than
    // deleting it, same discipline as the resize test further down this file.
    const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')!;
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 5000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    try {
      flow.enter(parent, 0.5);
      expect(scrollTo).toHaveBeenCalledWith(0, (5000 - 1000) * 0.5);
    } finally {
      flow.destroy();
      scrollTo.mockRestore();
      delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight;
      Object.defineProperty(window, 'innerHeight', originalInnerHeight);
    }
  });

  it('clamps startT before scrolling under reduced motion, same as the camera path', () => {
    const deps = makeDeps({ reducedMotion: true });
    const flow = initAboutFlow(deps);
    const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')!;
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 5000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    try {
      flow.enter(parent, 4); // way past 1 — must clamp, not overshoot the doc
      expect(scrollTo).toHaveBeenCalledWith(0, 5000 - 1000);
    } finally {
      flow.destroy();
      scrollTo.mockRestore();
      delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight;
      Object.defineProperty(window, 'innerHeight', originalInnerHeight);
    }
  });

  it('never advances t under reduced motion, even with a nonzero startT', () => {
    // t must stay 0 in this mode — the leave-listener guard (about-session.ts's
    // onWheel) relies on it never reading a nonzero t while reducedMotion is
    // true; apply() must not run here regardless of startT.
    const deps = makeDeps({ reducedMotion: true });
    const flow = initAboutFlow(deps);
    flow.enter(parent, 0.8608); // the contact beat's t, for concreteness
    expect(flow.t()).toBe(0);
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

  it('keeps the blob out of the corridor until it arrives', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.3); // before FERRO_ARRIVE_T
    expect(deps.ferroEl!.style.opacity).toBe('0');
    // M7: opacity alone is only half the claim. apply() SKIPS the projection
    // entirely below the fade threshold — a transparent blob still being
    // placed every frame would burn a projection and a placeAt per frame for
    // a third of the corridor, and the skip is the thing this test's title
    // actually promises. Never cleared: enter()'s own apply(0) is below the
    // threshold too, so a single call from either point is a failure.
    expect(deps.ferro!.placeAt).not.toHaveBeenCalled();
    flow.destroy();
  });

  it('fades it up and places it once it arrives', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    (deps.ferro!.placeAt as ReturnType<typeof vi.fn>).mockClear();
    flow.setScrollForTest(0.6);
    expect(Number(deps.ferroEl!.style.opacity)).toBeCloseTo(1, 3);
    expect(deps.ferro!.placeAt).toHaveBeenCalled();
    flow.destroy();
  });

  it('moves it every frame now, not once per beat', () => {
    // The blob travels a path; gating on beat changes would freeze it between
    // markers. The tween is off instead (instant), or each frame would restart
    // a tween that never lands.
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    (deps.ferro!.placeAt as ReturnType<typeof vi.fn>).mockClear();
    flow.setScrollForTest(0.60);
    flow.setScrollForTest(0.61);
    flow.setScrollForTest(0.62);
    const calls = (deps.ferro!.placeAt as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls[calls.length - 1][1]).toEqual({ instant: true });
    flow.destroy();
  });

  it('gives a different rect at different points on the path', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.60);
    const a = (deps.ferro!.placeAt as ReturnType<typeof vi.fn>).mock.lastCall![0];
    flow.setScrollForTest(0.95);
    const b = (deps.ferro!.placeAt as ReturnType<typeof vi.fn>).mock.lastCall![0];
    expect(a).not.toEqual(b);
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
    // apply(0): t=0 is the Work rest, still the LIT world — nightAmount 0. The
    // corridor dims to night across the run-up rather than stepping into it.
    flow.enter(parent);
    expect(deps.background!.setInvertAmount).toHaveBeenCalledWith(0);
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

  // Bug found in review: under reduced motion apply() never runs, so the
  // closure `t` about-session.ts tracks internally stays 0 for the whole visit.
  // An unguarded backward-scroll listener would see shouldLeaveCorridor's
  // {open: true, t: 0, ...} on every wheel tick and unmount the document out
  // from under someone simply reading it. There is no corridor to leave under
  // reduced motion — the document IS the experience, and the browser owns its
  // scroll — so the listener must gate on reducedMotion directly.
  it('a reduced-motion corridor survives a backward scroll', () => {
    const deps = makeDeps({ reducedMotion: true });
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: -120 }));
    expect(flow.isOpen()).toBe(true);
    expect(parent.querySelector('main.about-doc')).not.toBeNull();
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

  // The chrome (.wordmark/.site-nav/margin notes, base.css) reads this custom
  // property to lift itself out of the rising footer's way. Written every
  // frame alongside --ground/--ink so the fallback in every CSS reference
  // never has to cover a stale value while the corridor is genuinely open.
  it('writes the footer rise as the corridor reaches its end', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.5);
    expect(document.documentElement.style.getPropertyValue('--footer-rise')).toBe('0');
    flow.setScrollForTest(1);
    expect(Number(document.documentElement.style.getPropertyValue('--footer-rise'))).toBeCloseTo(1, 3);
    flow.destroy();
  });

  it('clears the footer rise on exit, like every other shared property', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(1);
    flow.exit();
    expect(document.documentElement.style.getPropertyValue('--footer-rise')).toBe('');
    flow.destroy();
  });

  // --- CRITICAL 2, part 1: the gate panel painted from the first frame ---
  //
  // Nothing gated the indicator's APPEARANCE on t. It is position: fixed with
  // a solid #121212 panel, a border and a label, it mounts at enter(), and the
  // placeholder's self-hiding property (opacity from --gate) did not survive
  // into the real component — so a dark bar reading "keep scrolling to return
  // home" sat across the bottom of the day-lit anchor and the whole climb,
  // announcing an action unavailable for 99% of the scroll. The fix moved
  // through two shapes: first tying the reveal to footerRiseAt (still visible
  // before you could act on it, only later in the corridor), then — this QA
  // pass's change 1 — to whether the gate has genuinely been FED at all,
  // per Adam's own framing: "it should only pop up once scroll has been done
  // at the bottom of the page." Arriving at t = 1 is no longer enough on its
  // own; a real push is.
  it('keeps the gate indicator invisible until it has actually been fed, even at the very end', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    const root = document.documentElement;
    flow.enter(parent);
    // Written from the very first apply(), not merely absent: an undefined
    // property leans on about.css's `, 0` fallback, which is the belt to this
    // brace, not a substitute for it.
    expect(root.style.getPropertyValue('--gate-show')).toBe('0');
    flow.setScrollForTest(0.5); // mid-climb — nothing to push against yet
    expect(root.style.getPropertyValue('--gate-show')).toBe('0');
    flow.setScrollForTest(1); // at the very end now, but nothing pushed yet
    expect(root.style.getPropertyValue('--gate-show')).toBe('0');
    flow.feedGateForTest(GATE_THRESHOLD_PX / 4); // the first real push
    expect(root.style.getPropertyValue('--gate-show')).toBe('1');
    flow.destroy();
  });

  // The panel stays offered for as long as the reader keeps dwelling at the
  // end, even once the idle-retreat timer (change 2, below) has drained the
  // fill back to nothing — it only withdraws once you actually leave the end.
  it('keeps the gate indicator visible across an idle drain, only hiding it once you leave the end', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    const root = document.documentElement;
    flow.enter(parent);
    flow.setScrollForTest(1);
    flow.feedGateForTest(GATE_THRESHOLD_PX / 4);
    expect(root.style.getPropertyValue('--gate-show')).toBe('1');

    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(GATE_IDLE_MS);
    } finally {
      vi.useRealTimers();
    }
    // The fill drained, but the offer itself did not.
    expect(root.style.getPropertyValue('--gate-show')).toBe('1');

    flow.setScrollForTest(0.5); // back up the corridor — now it withdraws
    expect(root.style.getPropertyValue('--gate-show')).toBe('0');
    flow.destroy();
  });

  it('clears the gate reveal on exit, like every other shared property', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(1);
    flow.feedGateForTest(GATE_THRESHOLD_PX / 4);
    flow.exit();
    expect(document.documentElement.style.getPropertyValue('--gate-show')).toBe('');
    flow.destroy();
  });

  // --- CRITICAL 2, part 2: a stale fill rode back up the corridor ---
  //
  // --gate is only WRITTEN while atCorridorEnd(t), so pushing the indicator to
  // half and then scrolling back up froze the green fill at 50% for the rest
  // of the corridor — and left the accumulator half-armed, so returning to the
  // end needed only half a push to fly you home.
  it('resets the gate when you leave the end, rather than freezing the fill', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    const root = parent.querySelector<HTMLElement>('.about-doc')!;

    flow.setScrollForTest(1);
    flow.feedGateForTest(GATE_THRESHOLD_PX / 2);
    expect(Number(root.style.getPropertyValue('--gate'))).toBeCloseTo(0.5, 6);

    flow.setScrollForTest(0.5); // back up the corridor
    expect(root.style.getPropertyValue('--gate')).toBe('');

    // And the accumulator went with the fill: half a push at the end is still
    // only half, not the second half of an already-armed gate.
    flow.setScrollForTest(1);
    flow.feedGateForTest(GATE_THRESHOLD_PX / 2);
    expect(Number(root.style.getPropertyValue('--gate'))).toBeCloseTo(0.5, 6);
    expect(flow.isOpen()).toBe(true);
    flow.destroy();
  });

  // --- QA change 2: retreat to 0% after inactive scrolling ---
  //
  // "it should auto (with smoothing) retreat back to 0% after inactive
  // scrolling" — an idle timer (GATE_IDLE_MS after the last push) drains the
  // accumulator exactly as leaving the end already does; the smoothing itself
  // is CSS's job (.about-gate-fill's width transition, asserted separately in
  // about-css.test.ts).
  describe('the idle-retreat timer', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('drains the fill back to zero after GATE_IDLE_MS of no further pushing', () => {
      const deps = makeDeps();
      const flow = initAboutFlow(deps);
      vi.useFakeTimers();
      flow.enter(parent);
      const root = parent.querySelector<HTMLElement>('.about-doc')!;
      flow.setScrollForTest(1);
      flow.feedGateForTest(GATE_THRESHOLD_PX / 2);
      expect(Number(root.style.getPropertyValue('--gate'))).toBeCloseTo(0.5, 6);

      vi.advanceTimersByTime(GATE_IDLE_MS);
      expect(root.style.getPropertyValue('--gate')).toBe('');
      // The accumulator drained with it — a later push starts from zero
      // again, not from wherever it left off.
      flow.feedGateForTest(GATE_THRESHOLD_PX / 4);
      expect(Number(root.style.getPropertyValue('--gate'))).toBeCloseTo(0.25, 6);
      flow.destroy();
    });

    it('rearms on every push, so a reader mid-push is never drained out from under them', () => {
      const deps = makeDeps();
      const flow = initAboutFlow(deps);
      vi.useFakeTimers();
      flow.enter(parent);
      const root = parent.querySelector<HTMLElement>('.about-doc')!;
      flow.setScrollForTest(1);
      flow.feedGateForTest(GATE_THRESHOLD_PX / 4);

      // Most of the idle window elapses, then another push arrives —
      // the clock must restart from THIS push, not fire on the original
      // schedule.
      vi.advanceTimersByTime(GATE_IDLE_MS - 100);
      flow.feedGateForTest(GATE_THRESHOLD_PX / 4);
      vi.advanceTimersByTime(GATE_IDLE_MS - 100);
      expect(Number(root.style.getPropertyValue('--gate'))).toBeCloseTo(0.5, 6);

      vi.advanceTimersByTime(100);
      expect(root.style.getPropertyValue('--gate')).toBe('');
      flow.destroy();
    });

    // Mutation testing (QA pass) found this test toothless: removing exit()'s
    // gateCtl.clearTimer() call didn't fail it, because about-gate-control.ts's
    // scheduleIdleDrain callback only ever writes through `doc?.root` — never
    // `--gate-show` —
    // and exit() had already nulled `doc` by the time a dangling timer could
    // fire, so a stale timer touching nothing looked identical to one that
    // had genuinely been cleared. The real risk isn't firing into a void; the
    // callback closes over the shared `doc`/`gate` closure variables, not
    // over the visit that armed it, so a timer that survives exit() fires
    // into whatever LATER visit happens to be mounted by the time it goes
    // off — this only shows up once a second enter() has happened.
    it('does not fire against a corridor that has already been exited', () => {
      const deps = makeDeps();
      const flow = initAboutFlow(deps);
      vi.useFakeTimers();
      flow.enter(parent);
      flow.setScrollForTest(1);
      flow.feedGateForTest(GATE_THRESHOLD_PX / 4); // arms the idle-retreat timer
      flow.exit();

      // Re-enter before that timer's deadline elapses. No time is spent
      // between exit() and this second enter(), so the stale timer (if
      // exit() failed to clear it) still has its full original deadline
      // ahead of it — pointed, via the closure, at whatever `doc` is by then.
      flow.enter(parent);
      const secondRoot = parent.querySelector<HTMLElement>('.about-doc')!;
      const removeProperty = vi.spyOn(secondRoot.style, 'removeProperty');

      expect(() => vi.advanceTimersByTime(GATE_IDLE_MS)).not.toThrow();

      // The exited visit's timer must not reach into the new visit's
      // document — that would be exactly the same call scheduleIdleDrain's
      // callback makes against a *live* corridor to drain a genuine idle
      // fill, only now firing for a visit that never pushed at all.
      expect(removeProperty).not.toHaveBeenCalledWith('--gate');
      flow.destroy();
    });
  });

  // --- IMPORTANT 1: the projection read last frame's camera matrix ---
  //
  // world.project(camera) consumes camera.matrixWorldInverse, which only
  // WebGLRenderer.render() refreshes — on the NEXT rAF, after apply() has
  // written the new pose. Worse than one frame late, it was internally
  // inconsistent: projectToRect derives the blob's SIZE from
  // camera.position/quaternion (fresh) and its POSITION from the matrix
  // (stale), so the two sat a frame apart every frame. Nothing in production
  // ever calls updateMatrixWorld on this camera; apply() has to.
  it('refreshes the camera matrix before projecting the blob', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.6); // past FERRO_ARRIVE_T, so the projection runs
    // Where the camera actually is this frame, inverted — what the projection
    // must have gone through.
    const fresh = new THREE.Matrix4()
      .compose(deps.camera.position, deps.camera.quaternion, deps.camera.scale)
      .invert();
    // Not identity: the corridor has genuinely moved the camera, so a stale
    // (never-updated) matrixWorldInverse would be visibly wrong, not merely
    // imprecise.
    expect(deps.camera.position.length()).toBeGreaterThan(1);
    fresh.elements.forEach((v, i) => {
      expect(deps.camera.matrixWorldInverse.elements[i]).toBeCloseTo(v, 6);
    });
    flow.destroy();
  });

  // --- M6: the projection measured the window, not the canvas ---
  //
  // The camera's image is framed by the canvas box. The corridor is the one
  // place on this site with a scrollbar (html.about-open { overflow: auto }),
  // and window.innerWidth includes that gutter while #bg-canvas is width:
  // 100%, which excludes it — so this is exactly where the two diverge.
  it('projects through the canvas box, not the window', () => {
    const deps = makeDeps();
    const placeAt = deps.ferro!.placeAt as ReturnType<typeof vi.fn>;
    const rectAt = (): { w: number } => placeAt.mock.calls.at(-1)![0] as { w: number };

    // Window first, with no canvas to measure.
    const windowOnly = initAboutFlow(deps);
    windowOnly.enter(parent);
    windowOnly.setScrollForTest(0.6);
    const fromWindow = rectAt().w;
    windowOnly.destroy();

    // Then a canvas with a deliberately different box. The blob's side is
    // 2r / worldPerPx(depth, fov, h), and worldPerPx is inversely
    // proportional to h — so the rect scales by exactly the height ratio,
    // wherever on screen the blob happens to sit at this t.
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-canvas';
    document.body.appendChild(canvas);
    Object.defineProperty(canvas, 'clientWidth', { value: 1009, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 600, configurable: true });
    const withCanvas = initAboutFlow(deps);
    withCanvas.enter(parent);
    withCanvas.setScrollForTest(0.6);
    expect(rectAt().w / fromWindow).toBeCloseTo(600 / window.innerHeight, 6);
    expect(window.innerHeight).not.toBe(600); // or the assertion above is vacuous
    withCanvas.destroy();
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

  it('pause keeps the corridor open and the camera where it is', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.42);
    const z = deps.camera.position.z;
    flow.pause();
    expect(flow.isOpen()).toBe(true);
    expect(flow.t()).toBeCloseTo(0.42, 6);
    expect(deps.camera.position.z).toBeCloseTo(z, 6);
    flow.destroy();
  });

  it('resume puts the wheel back with the corridor and does not reset t', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.42);
    flow.pause();
    flow.resume();
    expect(flow.t()).toBeCloseTo(0.42, 6);
    expect(deps.scrollNav!.setMode).toHaveBeenLastCalledWith('about');
    flow.destroy();
  });

  it('pause on a closed corridor is a no-op', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    expect(() => { flow.pause(); flow.resume(); }).not.toThrow();
    expect(flow.isOpen()).toBe(false);
    flow.destroy();
  });

  // Fix round (post-review): pause() only ever detached the 'scroll' listener.
  // 'wheel' stays attached for the corridor's whole open lifetime, and wheel
  // events bubble to window from inside the contact takeover too (it never
  // calls stopPropagation) — so scrolling backward inside the modal while the
  // corridor sits at t=0 used to call exit() BEHIND the modal, reintroducing
  // the exact bug this task exists to fix (resume() would then no-op on
  // close, since open/paused were already cleared by that stray exit()).
  it('pause blocks a backward wheel scroll from leaving the corridor behind the modal', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent); // t = 0 — exactly the position shouldLeaveCorridor requires
    const z = deps.camera.position.z;
    flow.pause();
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: -120 }));
    expect(flow.isOpen()).toBe(true);
    expect(flow.t()).toBe(0);
    expect(deps.camera.position.z).toBeCloseTo(z, 6);
    expect(deps.director.setSuspended).not.toHaveBeenLastCalledWith(false);
    flow.destroy();
  });

  // Fix round (post-review): 'resize' also stays attached for the whole open
  // lifetime, and onResize() calls onScroll()/apply() as a plain function
  // call — not routed through the removed 'scroll' listener — so a window
  // resize while paused used to recompute t from window.scrollY and move the
  // hidden camera regardless.
  it('pause blocks a window resize from recomputing t and moving the camera', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.42);
    const z = deps.camera.position.z;
    flow.pause();

    const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')!;
    const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY')!;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 550 });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2000 });
    try {
      window.dispatchEvent(new Event('resize'));
      expect(flow.t()).toBeCloseTo(0.42, 6);
      expect(deps.camera.position.z).toBeCloseTo(z, 6);
    } finally {
      Object.defineProperty(window, 'innerHeight', originalInnerHeight);
      Object.defineProperty(window, 'scrollY', originalScrollY);
      delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight;
    }
    flow.destroy();
  });

  // Fix round (post-review): resume() must re-assert the current beat's
  // palette/cursor/ferro, not just hand the wheel back — whatever paused the
  // corridor (the contact takeover) unconditionally resets that shared state
  // on its own way back to 'world' (cursor?.setOnDark(false), ferro?.hide()),
  // since every OTHER close of that takeover really does return to the plain
  // light world. Without this, resuming from a dark beat left the cursor
  // light and the ferro hidden until the next genuine beat change (applyBeat
  // early-returns on beat === lastBeat, so scrolling within the same beat
  // doesn't fix it either).
  it('resume re-asserts the current beat, undoing a light-world reset made while paused', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    // Inside the night range (cursor on dark) AND past FERRO_ARRIVE_T (fade >
    // 0), so the placeAt assertion below reflects a visible, placeable blob —
    // t=0.3 (this test's original value) is night but pre-arrival, where
    // apply() correctly skips placeAt because there's nothing to place yet.
    flow.setScrollForTest(0.5);
    flow.pause();
    // What the takeover's unconditional close-out to 'world' does before
    // resume() is called (main.ts's onModeChange) — exactly the state
    // resume() must override, not merely leave alone.
    deps.cursor!.setOnDark(false);
    deps.ferro!.hide();
    (deps.cursor!.setOnDark as ReturnType<typeof vi.fn>).mockClear();
    (deps.ferro!.show as ReturnType<typeof vi.fn>).mockClear();
    const placeAtCallsBefore = (deps.ferro!.placeAt as ReturnType<typeof vi.fn>).mock.calls.length;

    flow.resume();

    expect(deps.cursor!.setOnDark).toHaveBeenLastCalledWith(true);
    expect(deps.ferro!.show).toHaveBeenCalled();
    expect((deps.ferro!.placeAt as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(placeAtCallsBefore);
    flow.destroy();
  });

  it('flies home from the corridor\'s end pose, not from a cut', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(1);
    const startY = deps.camera.position.y;
    expect(startY).toBeGreaterThan(20); // up on the mezzanine

    const done = flow.returnHome();
    // Mid-flight the camera must be BETWEEN the two poses — never teleported
    // to the anchor first.
    flow.stepReturnForTest(0.5);
    expect(deps.camera.position.y).toBeGreaterThan(0);
    expect(deps.camera.position.y).toBeLessThan(startY);

    flow.stepReturnForTest(1);
    return done.then(() => {
      expect(deps.camera.position.y).toBeCloseTo(0, 4);
      expect(deps.camera.position.z).toBeCloseTo(34, 4);
      expect(deps.camera.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 4);
      expect(flow.isOpen()).toBe(false);
      expect(deps.director.setSuspended).toHaveBeenLastCalledWith(false);
      flow.destroy();
    });
  });

  // The gate must not fire mid-corridor: onGateWheel (folded into onWheel)
  // only feeds the gate once t has actually reached the very end of the
  // path. Without this guard, feeding it a full THRESHOLD worth of delta at
  // any t would arm it and eject the reader outright.
  it('only feeds the gate at the very end of the corridor', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.5);
    flow.feedGateForTest(GATE_THRESHOLD_PX);
    expect(flow.isOpen()).toBe(true); // mid-corridor scroll must not eject you
    flow.destroy();
  });

  it('returns home once the gate arms at the end', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(1);
    flow.feedGateForTest(GATE_THRESHOLD_PX);
    flow.stepReturnForTest(1);
    expect(flow.isOpen()).toBe(false);
    flow.destroy();
  });

  // Ruling on this task: the brief's gate guard was `open && t() >= 1`, but a
  // PAUSED corridor is still `open` — the contact modal pauses rather than
  // exits it, and its wheel events bubble to window uncaught. Without this
  // guard, scrolling inside the modal while paused at the last beat would
  // fill the gate and fly the reader home from behind it.
  it('a paused corridor at the end does not feed the gate', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(1);
    flow.pause();
    flow.feedGateForTest(GATE_THRESHOLD_PX);
    expect(flow.isOpen()).toBe(true);
    flow.destroy();
  });

  it('the footer nav "work" leaves the corridor', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    const btn = [...parent.querySelectorAll('footer.cs-footer button')]
      .find((b) => b.textContent === 'work') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    expect(flow.isOpen()).toBe(false);
    flow.destroy();
  });

  it('the footer nav "about"/"contact" scroll the document to that beat without leaving the corridor', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')!;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 5000 });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    try {
      const btn = [...parent.querySelectorAll('footer.cs-footer button')]
        .find((b) => b.textContent === 'contact') as HTMLButtonElement;
      expect(btn).toBeTruthy();
      btn.click();
      expect(scrollTo).toHaveBeenCalledWith(0, 4000 * flow.path().tForBeat('contact'));
      expect(flow.isOpen()).toBe(true);
    } finally {
      scrollTo.mockRestore();
      Object.defineProperty(window, 'innerHeight', originalInnerHeight);
      delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight;
    }
    flow.destroy();
  });

  // --- IMPORTANT 3: pause() holds `t`, but not the document underneath it ---
  //
  // The contact takeover is position: fixed with its own overflow-y: auto, and
  // the contact page mostly fits one viewport — so its internal scroll is at an
  // end from the first wheel tick and events chain straight through to the
  // document, which `html.about-open` has made scrollable. pause() detaches the
  // 'scroll' listener, so `t` correctly freezes; the document scrolls anyway.
  // resume() then re-attached the listener on a DESYNCED position and the next
  // wheel tick jumped the camera to a different beat.
  it('resume resyncs the document scroll to the t it froze', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')!;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 5000 });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    try {
      flow.enter(parent);
      flow.setScrollForTest(0.42);
      flow.pause();
      // Whatever the takeover's scroll chaining did to the document behind it
      // is exactly what resume() has to undo.
      scrollTo.mockClear();
      flow.resume();
      expect(flow.t()).toBeCloseTo(0.42, 6);
      expect(scrollTo).toHaveBeenCalledWith(0, 4000 * 0.42);
    } finally {
      flow.destroy();
      scrollTo.mockRestore();
      Object.defineProperty(window, 'innerHeight', originalInnerHeight);
      delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight;
    }
  });

  it('resume under reduced motion leaves the browser owning the scroll', () => {
    const deps = makeDeps({ reducedMotion: true });
    const flow = initAboutFlow(deps);
    const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')!;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 5000 });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    try {
      flow.enter(parent, 0.6);
      flow.pause();
      scrollTo.mockClear();
      flow.resume();
      // `t` never leaves 0 in this mode, so resyncing to it would yank a
      // reader back to the top of a document they were simply scrolling.
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      flow.destroy();
      scrollTo.mockRestore();
      Object.defineProperty(window, 'innerHeight', originalInnerHeight);
      delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight;
    }
  });

  // --- IMPORTANT 4: the gate could never arm at fractional display scaling ---
  it('arms the gate a rounding error short of the end, not only at an exact 1', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    // What a fully scrolled document actually reports at 125%/150% scaling:
    // scrollHeight is a rounded integer, the real maximum scrollY is not.
    flow.setScrollForTest(0.9999);
    expect(flow.t()).toBeLessThan(1);
    flow.feedGateForTest(GATE_THRESHOLD_PX);
    // The indicator is the gate's own synchronous output, written by
    // gateCtl.feed itself — a direct read of "the gate was fed", independent
    // of the async flight it then kicks off.
    const root = parent.querySelector<HTMLElement>('.about-doc')!;
    expect(root.style.getPropertyValue('--gate')).toBe('1');
    flow.stepReturnForTest(1);
    expect(flow.isOpen()).toBe(false);
    flow.destroy();
  });

  it('still refuses to feed the gate genuinely short of the end', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.99); // a real gesture short, not a rounding error
    flow.feedGateForTest(GATE_THRESHOLD_PX);
    const root = parent.querySelector<HTMLElement>('.about-doc')!;
    expect(root.style.getPropertyValue('--gate')).toBe('');
    expect(flow.isOpen()).toBe(true);
    flow.destroy();
  });

  // --- IMPORTANT 5: the return flight played behind the still-mounted doc ---
  it('fades the corridor document out under the return flight instead of after it', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(1);
    const root = parent.querySelector<HTMLElement>('.about-doc')!;
    expect(root).toBeTruthy();

    void flow.returnHome();
    // Clickable content must not linger invisibly over the world.
    expect(root.style.pointerEvents).toBe('none');

    flow.stepReturnForTest(0.1);
    const early = Number(root.style.opacity);
    expect(early).toBeLessThan(1);
    expect(early).toBeGreaterThan(0);
    flow.stepReturnForTest(0.3);
    expect(Number(root.style.opacity)).toBeLessThan(early);
    // Clear well before the flight lands, so most of the travel is watched.
    flow.stepReturnForTest(0.5);
    expect(Number(root.style.opacity)).toBe(0);

    flow.stepReturnForTest(1);
    expect(parent.querySelector('.about-doc')).toBeNull();
    flow.destroy();
  });

  it('the blob fades with the document and leaves no inline opacity behind', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(1);
    void flow.returnHome();
    flow.stepReturnForTest(0.2);
    // not.toBe('') first: an unset inline opacity reads as 0 through Number(),
    // which would satisfy a bare "< 1" without anything having faded at all.
    expect(deps.ferroEl!.style.opacity).not.toBe('');
    expect(Number(deps.ferroEl!.style.opacity)).toBeLessThan(1);
    expect(Number(deps.ferroEl!.style.opacity)).toBeGreaterThan(0);
    flow.stepReturnForTest(1);
    expect(deps.ferroEl!.style.opacity).toBe('');
    flow.destroy();
  });

  // --- IMPORTANT 3: --footer-rise snapped to nothing at the end of the flight ---
  //
  // releaseSharedState() REMOVES the property, and only at p >= 1 — the last
  // frame of the 1.6s return. The gate only arms at the corridor's end, so
  // every designed exit starts fully risen: the wordmark and nav held top:
  // 50px for the whole flight and then jumped half a viewport back to centre
  // in a single frame over the Home view, with nothing left fading to cover
  // it. applyReturn already interpolates; the chrome rides down with it.
  it('rides the chrome home with the camera instead of snapping at the door', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    const root = document.documentElement;
    flow.enter(parent);
    flow.setScrollForTest(1);
    expect(Number(root.style.getPropertyValue('--footer-rise'))).toBeCloseTo(1, 3);

    void flow.returnHome();
    flow.stepReturnForTest(0.5);
    const mid = Number(root.style.getPropertyValue('--footer-rise'));
    expect(root.style.getPropertyValue('--footer-rise')).not.toBe('');
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(0);

    flow.stepReturnForTest(0.9);
    const late = Number(root.style.getPropertyValue('--footer-rise'));
    expect(late).toBeLessThan(mid);
    // Effectively home by the time the flight lands, so removing the property
    // at p >= 1 has nothing left to snap.
    expect(late).toBeLessThan(0.1);

    flow.stepReturnForTest(1);
    expect(root.style.getPropertyValue('--footer-rise')).toBe('');
    flow.destroy();
  });

  // CHANGED for this task (gate placement correction). This used to assert
  // "--gate-show rides down on the same ramp as --footer-rise" — true only
  // while the gate panel was `position: fixed`, painted OVER the fading
  // corridor document rather than inside it, so nothing else would have
  // carried it out of view during the return flight. It now mounts through
  // footer.ts's `gate` slot, a normal descendant of doc.root — and
  // applyReturn already fades doc.root's own opacity to 0 well before the
  // flight lands (RETURN_FADE_P clears it at p = 0.45), so the panel is
  // already invisible by then regardless of --gate-show. Continuing to write
  // it every tick would only re-open the exact retarget conflict that used to
  // block giving .about-gate a plain opacity transition for its fade-in — so
  // applyReturn no longer touches it at all; only about-gate-control.ts's
  // syncGateShow (called from gateCtl.feed / gateCtl.syncAt's leave-the-end
  // reset) and releaseSharedState() (the final clear at p >= 1) do.
  it('leaves --gate-show untouched by the return flight, clearing it only when the flight lands', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    const root = document.documentElement;
    flow.enter(parent);
    flow.setScrollForTest(1);
    flow.feedGateForTest(GATE_THRESHOLD_PX / 4); // fed — the flight can only ever start once it is
    expect(root.style.getPropertyValue('--gate-show')).toBe('1');

    void flow.returnHome();
    flow.stepReturnForTest(0.5);
    expect(root.style.getPropertyValue('--gate-show')).toBe('1');
    flow.stepReturnForTest(0.9);
    expect(root.style.getPropertyValue('--gate-show')).toBe('1');

    flow.stepReturnForTest(1);
    expect(root.style.getPropertyValue('--gate-show')).toBe('');
    flow.destroy();
  });

  // --- IMPORTANT 4: pause()/resume() were reachable during the flight ---
  //
  // An earlier ruling held that the two writers of ferroEl.style.opacity could
  // not collide "because the listeners are detached during the flight". True
  // of listeners — but pause() and resume() are DIRECT method calls from
  // main.ts, fired by the contact emblem, which lives in .chrome and stays
  // clickable for the whole flight, and `open` stays true until p >= 1. So
  // resume() re-attached the scroll listener, called apply(t) — writing
  // ferroEl.style.opacity against the running tween — and called
  // scrollDocumentTo(t), firing the listener it had just re-attached.
  it('ignores pause and resume while the return flight is in the air', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(1);
    void flow.returnHome();
    flow.stepReturnForTest(0.2);
    const midFlight = deps.ferroEl!.style.opacity;
    expect(Number(midFlight)).toBeGreaterThan(0);
    expect(Number(midFlight)).toBeLessThan(1);

    // jsdom reports a zero scroll range, so scrollDocumentTo is a no-op there
    // — stub the range to make resume()'s scroll write observable at all.
    const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')!;
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 5000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    try {
      flow.pause();
      flow.resume();
      // The tween's value survives untouched — apply() never ran.
      expect(deps.ferroEl!.style.opacity).toBe(midFlight);
      // And the document was never yanked back under the flight.
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      scrollTo.mockRestore();
      delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight;
      Object.defineProperty(window, 'innerHeight', originalInnerHeight);
    }

    // The flight still lands normally afterwards.
    flow.stepReturnForTest(1);
    expect(flow.isOpen()).toBe(false);
    flow.destroy();
  });

  // --- IMPORTANT 6: arrows ejected you Home from inside the corridor ---
  //
  // main.ts's keydown handler is guarded only on inputMode === 'takeover',
  // which is never 'about'. Inside the corridor refZ is the Work rest, so with
  // DESTINATIONS down to two entries BOTH arrows resolved to 'home' —
  // ArrowDown ("forward") moved you backwards. The corridor is the page order
  // now, so it owns stepping through itself.
  describe('stepBeat', () => {
    const withScrollStub = (fn: (scrollTo: ReturnType<typeof vi.spyOn>) => void): void => {
      const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')!;
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
      Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 5000 });
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
      try {
        fn(scrollTo);
      } finally {
        scrollTo.mockRestore();
        Object.defineProperty(window, 'innerHeight', originalInnerHeight);
        delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight;
      }
    };

    it('steps forward to the next beat rather than resolving against the spine', () => {
      const deps = makeDeps();
      const flow = initAboutFlow(deps);
      withScrollStub((scrollTo) => {
        flow.enter(parent); // beat 'anchor', t = 0
        scrollTo.mockClear();
        flow.stepBeat(1);
        expect(scrollTo).toHaveBeenCalledWith(0, 4000 * flow.path().tForBeat('transition'));
        expect(flow.isOpen()).toBe(true);
      });
      flow.destroy();
    });

    it('steps back to the current beat own start before leaving it', () => {
      const deps = makeDeps();
      const flow = initAboutFlow(deps);
      withScrollStub((scrollTo) => {
        flow.enter(parent);
        const lander = flow.path().tForBeat('lander');
        const team = flow.path().tForBeat('team');
        flow.setScrollForTest((lander + team) / 2); // partway through 'lander'
        scrollTo.mockClear();
        flow.stepBeat(-1);
        expect(scrollTo).toHaveBeenCalledWith(0, 4000 * lander);
      });
      flow.destroy();
    });

    it('steps back to the previous beat once it is at the current one start', () => {
      const deps = makeDeps();
      const flow = initAboutFlow(deps);
      withScrollStub((scrollTo) => {
        flow.enter(parent);
        flow.setScrollForTest(flow.path().tForBeat('lander'));
        scrollTo.mockClear();
        flow.stepBeat(-1);
        expect(scrollTo).toHaveBeenCalledWith(0, 4000 * flow.path().tForBeat('transition'));
      });
      flow.destroy();
    });

    it('hands the camera back on a backward step from the very top, mirroring the wheel', () => {
      const deps = makeDeps();
      const flow = initAboutFlow(deps);
      flow.enter(parent); // t = 0
      flow.stepBeat(-1);
      expect(flow.isOpen()).toBe(false);
      expect(deps.director.setSuspended).toHaveBeenLastCalledWith(false);
      flow.destroy();
    });

    it('clamps forward at the last beat — leaving forward is the gate job', () => {
      const deps = makeDeps();
      const flow = initAboutFlow(deps);
      withScrollStub((scrollTo) => {
        flow.enter(parent);
        flow.setScrollForTest(1);
        scrollTo.mockClear();
        flow.stepBeat(1);
        expect(scrollTo).toHaveBeenCalledWith(0, 4000); // t stays 1
        expect(flow.isOpen()).toBe(true);
      });
      flow.destroy();
    });

    it('does nothing while paused, closed, or under reduced motion', () => {
      const closed = initAboutFlow(makeDeps());
      expect(() => closed.stepBeat(-1)).not.toThrow();
      expect(closed.isOpen()).toBe(false);

      const paused = initAboutFlow(makeDeps());
      paused.enter(parent);
      paused.pause();
      paused.stepBeat(-1); // would otherwise exit() from behind the modal
      expect(paused.isOpen()).toBe(true);
      paused.destroy();

      const reduced = initAboutFlow(makeDeps({ reducedMotion: true }));
      reduced.enter(parent);
      reduced.stepBeat(-1);
      expect(reduced.isOpen()).toBe(true); // the browser owns the arrows here
      reduced.destroy();
    });
  });

  // --- MINOR 7: the debug seams had drifted from the guards they bypass ---
  it('setScrollForTest is inert on a paused corridor, like the listener it bypasses', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.42);
    const z = deps.camera.position.z;
    flow.pause();
    flow.setScrollForTest(0.8);
    expect(flow.t()).toBeCloseTo(0.42, 6);
    expect(deps.camera.position.z).toBeCloseTo(z, 6);
    flow.destroy();
  });

  it('stepReturnForTest does not run the teardown on a closed corridor', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.stepReturnForTest(1);
    expect(deps.director.setSuspended).not.toHaveBeenCalled();
    expect(deps.director.syncTo).not.toHaveBeenCalled();
    expect(deps.world.setAboutMode).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains('about-open')).toBe(false);
    flow.destroy();
  });
});

// Adam, first QA pass: "I was on the start a project beat, and when I hit the
// contact form, the ferro was gone." The contact beat is one of the three where
// applyBeat parks the blob at z-index 0 so it does not cross the corridor's
// type — below the takeover's 20, so the modal covered it completely.
describe('the blob\'s stacking while paused', () => {
  it('gives the behind-class back when a modal covers the corridor', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    // Scroll to the contact beat, which is a "behind" beat.
    const contactT = flow.path().tForBeat('contact');
    flow.setScrollForTest(contactT);
    expect(deps.ferroEl!.classList.contains('ferro-stage--behind')).toBe(true);

    flow.pause();
    expect(deps.ferroEl!.classList.contains('ferro-stage--behind')).toBe(false);
    flow.destroy();
  });

  it('restores it on resume, from whatever beat you were on', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(flow.path().tForBeat('contact'));
    flow.pause();
    flow.resume();
    expect(deps.ferroEl!.classList.contains('ferro-stage--behind')).toBe(true);
    flow.destroy();
  });

  it('leaves an in-front beat alone — nothing to give back', () => {
    const deps = makeDeps();
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(flow.path().tForBeat('lander')); // in front
    expect(deps.ferroEl!.classList.contains('ferro-stage--behind')).toBe(false);
    flow.pause();
    expect(deps.ferroEl!.classList.contains('ferro-stage--behind')).toBe(false);
    flow.destroy();
  });
});
