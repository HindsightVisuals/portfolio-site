// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DESTINATIONS } from '../three/world';
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
  setGround: vi.fn(),
  reducedMotion: false,
  ...over,
});

let parent: HTMLElement;
beforeEach(() => {
  parent = document.createElement('div');
  document.body.appendChild(parent);
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

  it('survives null ferro, null cursor and null scrollNav', () => {
    const deps = makeDeps({ ferro: null, ferroEl: null, cursor: null, scrollNav: null });
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
  // remembered state.z (the About rest), while the camera has travelled well
  // past that along the path, so exit must also reset position to the About
  // rest before releasing the director.
  it('restores the camera to the About rest, level, on exit', () => {
    const deps = makeDeps();
    const aboutRest = DESTINATIONS.find((d) => d.id === 'about')!.cameraZ;
    const flow = initAboutFlow(deps);
    flow.enter(parent);
    flow.setScrollForTest(0.6);
    flow.exit();
    expect(deps.camera.position.x).toBeCloseTo(0, 6);
    expect(deps.camera.position.y).toBeCloseTo(0, 6);
    expect(deps.camera.position.z).toBeCloseTo(aboutRest, 6);
    expect(deps.camera.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 6);
    flow.destroy();
  });
});
