// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { initWorld } from './world';

// This jsdom version has no document.fonts (FontFaceSet); world.ts's label
// texture waits on it to redraw once the real font loads. Stub the bit it
// needs so initWorld doesn't throw — the canvas-2d "not implemented" warning
// jsdom logs alongside this is harmless noise (makeLabelTexture already
// no-ops when getContext('2d') returns null).
if (!document.fonts) {
  Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve() } });
}

describe('world about mode', () => {
  it('hides the spine dressing so screens do not float beside the corridor', () => {
    const world = initWorld({ reducedMotion: true });
    world.setAboutMode(true);
    world.camera.position.set(0, 31, -120); // up on the mezzanine, off the spine
    world.update?.(0.016);
    expect(world.anchoredVisibleCount()).toBe(0);
    world.destroy();
  });

  it('restores them on exit', () => {
    const world = initWorld({ reducedMotion: true });
    world.setAboutMode(true);
    world.update?.(0.016);
    world.setAboutMode(false);
    world.camera.position.set(0, 0, -86);
    world.update?.(0.016);
    expect(world.anchoredVisibleCount()).toBeGreaterThan(0);
    world.destroy();
  });

  it('freezes re-anchoring while on, so nothing snaps when the camera climbs', () => {
    const world = initWorld({ reducedMotion: true });
    world.camera.position.set(0, 0, -86);
    world.update?.(0.016);
    const before = world.anchoredPositionsZ();
    world.setAboutMode(true);
    world.camera.position.set(0, 31, -130);
    world.update?.(0.016);
    expect(world.anchoredPositionsZ()).toEqual(before);
    world.destroy();
  });

  it('does not force-hide a visible homeMock, which is treatment-B managed and not spine dressing', () => {
    const world = initWorld({ reducedMotion: true });
    world.setHomeMockVisible(true);
    world.setAboutMode(true);
    // Only homeMock should remain visible: About mode's hide pass must skip
    // it, exactly as the ordinary materialize pass does, or nothing in the
    // normal update path will ever make it visible again.
    expect(world.anchoredVisibleCount()).toBe(1);
    world.destroy();
  });
});
