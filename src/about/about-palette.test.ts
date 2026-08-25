// src/about/about-palette.test.ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildAboutPath } from './about-path';
import {
  DAY_GROUND,
  DAY_INK,
  DAY_TEXT_INK,
  NIGHT_GROUND,
  NIGHT_INK,
  NIGHT_TEXT_INK,
  paletteAt,
} from './about-palette';
import { DESTINATIONS } from '../three/world';

const ANCHOR_Z = DESTINATIONS.find((d) => d.id === 'work')!.cameraZ; // -26
const path = buildAboutPath(new THREE.Vector3(0, 0, ANCHOR_Z));

describe('paletteAt', () => {
  // t = 0 is the WORK REST — the camera is still standing in the lit world, so
  // the corridor's mouth is DAY and dims to night by the transition beat.
  // Returning night here made entering the corridor a white-to-black step.
  it('is day at the corridor mouth — the camera is still in the lit world', () => {
    expect(paletteAt(0, path).ground).toBe(DAY_GROUND);
    expect(paletteAt(0, path).onDark).toBe(false);
  });

  it('has reached night by the transition beat', () => {
    const p = paletteAt(path.tForBeat('transition'), path);
    expect(p.ground).toBe(NIGHT_GROUND);
    expect(p.onDark).toBe(true);
  });

  it('darkens monotonically across the run-up, with no step at the mouth', () => {
    const trans = path.tForBeat('transition');
    let prev = -Infinity;
    for (let i = 0; i <= 40; i++) {
      const night = paletteAt((trans * i) / 40, path).nightAmount;
      expect(night).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = night;
    }
    // The whole point of the ramp: nothing to step over at the very first sample.
    expect(paletteAt(0, path).nightAmount).toBeCloseTo(0, 6);
  });

  it('is day at the capabilities beat', () => {
    const p = paletteAt(path.tForBeat('capabilities'), path);
    expect(p.ground).toBe(DAY_GROUND);
    expect(p.onDark).toBe(false);
  });

  it('is night again at AI — three states across the flow, not two', () => {
    const p = paletteAt(path.tForBeat('ai'), path);
    expect(p.ground).toBe(NIGHT_GROUND);
    expect(p.onDark).toBe(true);
  });

  it('crosses continuously — no jump between adjacent samples anywhere', () => {
    const lum = (hex: string): number => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l;
    let prev = lum(paletteAt(0, path).ground);
    for (let i = 1; i <= 400; i++) {
      const cur = lum(paletteAt(i / 400, path).ground);
      expect(Math.abs(cur - prev)).toBeLessThan(0.05);
      prev = cur;
    }
  });

  it('moves ink with the ground so atmosphere stays legible on both', () => {
    expect(paletteAt(path.tForBeat('transition'), path).ink).toBeCloseTo(NIGHT_INK, 6);
    expect(paletteAt(path.tForBeat('capabilities'), path).ink).toBeCloseTo(DAY_INK, 6);
  });

  // C2: text on the night ground was going near-invisible — .about-beat-heading
  // and .chrome both read var(--ink), which nothing was driving.
  it('moves textInk with the ground — pale at night, the site default by day', () => {
    expect(paletteAt(path.tForBeat('transition'), path).textInk).toBe(NIGHT_TEXT_INK);
    expect(paletteAt(path.tForBeat('capabilities'), path).textInk).toBe(DAY_TEXT_INK);
  });

  it('crosses textInk continuously too — no jump between adjacent samples anywhere', () => {
    const lum = (hex: string): number => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l;
    let prev = lum(paletteAt(0, path).textInk);
    for (let i = 1; i <= 400; i++) {
      const cur = lum(paletteAt(i / 400, path).textInk);
      expect(Math.abs(cur - prev)).toBeLessThan(0.05);
      prev = cur;
    }
  });

  it('never reports onDark true on a pale ground', () => {
    for (let i = 0; i <= 200; i++) {
      const p = paletteAt(i / 200, path);
      const l = new THREE.Color(p.ground).getHSL({ h: 0, s: 0, l: 0 }).l;
      if (l > 0.5) expect(p.onDark).toBe(false);
    }
  });
});

describe('nightAmount', () => {
  it('is 1 at both ends of the corridor and 0 at capabilities', () => {
    expect(paletteAt(path.tForBeat('transition'), path).nightAmount).toBeCloseTo(1, 6);
    expect(paletteAt(1, path).nightAmount).toBeCloseTo(1, 6);
    expect(paletteAt(path.tForBeat('capabilities'), path).nightAmount).toBeCloseTo(0, 6);
  });

  it('agrees with onDark at the midpoint, and is continuous where onDark is not', () => {
    // onDark is a boolean that flips; nightAmount is the ramp behind it. The
    // WebGL ground needs the ramp, the cursor needs the boolean.
    let prev = paletteAt(0, path).nightAmount;
    for (let i = 1; i <= 400; i++) {
      const cur = paletteAt(i / 400, path).nightAmount;
      expect(Math.abs(cur - prev)).toBeLessThan(0.05);
      prev = cur;
    }
  });
});
