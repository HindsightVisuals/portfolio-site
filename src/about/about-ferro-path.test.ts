import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DESTINATIONS } from '../three/world';
import { FERRO_ARRIVE_T, FERRO_RADIUS, ferroFadeAt, ferroWorldAt, frameToT } from './about-ferro-path';

const ANCHOR = new THREE.Vector3(0, 0, DESTINATIONS.find((d) => d.id === 'work')!.cameraZ);

describe('ferroFadeAt', () => {
  it('is invisible before it arrives', () => {
    expect(ferroFadeAt(0)).toBe(0);
    expect(ferroFadeAt(0.4)).toBe(0);
    expect(ferroFadeAt(FERRO_ARRIVE_T - 0.001)).toBeCloseTo(0, 3);
  });

  it('fades up across the descent, not instantly', () => {
    // f157 -> f165. The fade shares that span with the drop, so arriving and
    // appearing are one move.
    const mid = ferroFadeAt((frameToT(157) + frameToT(165)) / 2);
    expect(mid).toBeGreaterThan(0.1);
    expect(mid).toBeLessThan(0.9);
  });

  it('is fully visible once it has settled, and stays so', () => {
    expect(ferroFadeAt(0.55)).toBeCloseTo(1, 6);
    expect(ferroFadeAt(1)).toBeCloseTo(1, 6);
  });

  it('never leaves 0..1', () => {
    for (let i = -5; i <= 105; i++) {
      const f = ferroFadeAt(i / 100);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});

describe('ferroWorldAt', () => {
  it('drops from above onto the mezzanine', () => {
    // Blender z 27.3 (f157) -> 18.2 (f177) becomes Three y, so it descends.
    const early = ferroWorldAt(frameToT(157), ANCHOR);
    const settled = ferroWorldAt(frameToT(177), ANCHOR);
    expect(early.y).toBeGreaterThan(settled.y);
  });

  it('holds still through the capabilities beat', () => {
    // f177 and f209 are the same measured point — the blob waits for you there.
    const a = ferroWorldAt(frameToT(177), ANCHOR, new THREE.Vector3());
    const b = ferroWorldAt(frameToT(209), ANCHOR, new THREE.Vector3());
    expect(a.distanceTo(b)).toBeCloseTo(0, 3);
  });

  it('travels forward on -Z across the mezzanine run', () => {
    const a = ferroWorldAt(0.75, ANCHOR, new THREE.Vector3());
    const b = ferroWorldAt(1, ANCHOR, new THREE.Vector3());
    expect(b.z).toBeLessThan(a.z);
  });

  it('is anchored like the camera path — relative to the Work rest, not absolute Blender', () => {
    // The first keyframe (f157) is Blender y 36.840 against the anchor marker's
    // 29.74, so it sits 7.1 Blender units forward of the rest: 7.1 * 1.7 = 12.07.
    const p = ferroWorldAt(frameToT(157), ANCHOR, new THREE.Vector3());
    expect(p.z).toBeCloseTo(ANCHOR.z - 12.07, 1);
  });

  it('writes through `into` instead of allocating', () => {
    const into = new THREE.Vector3();
    expect(ferroWorldAt(0.6, ANCHOR, into)).toBe(into);
  });

  it('has a radius consistent with the measured blob', () => {
    // Blender dims 0.58 across, so radius 0.29, scaled by BLENDER_TO_WORLD.
    expect(FERRO_RADIUS).toBeCloseTo(0.29 * 1.7, 2);
  });
});
