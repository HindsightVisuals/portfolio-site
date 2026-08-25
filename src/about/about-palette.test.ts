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

const path = buildAboutPath(new THREE.Vector3(0, 0, -86));

describe('paletteAt', () => {
  it('is night at the start of the corridor', () => {
    expect(paletteAt(0, path).ground).toBe(NIGHT_GROUND);
    expect(paletteAt(0, path).onDark).toBe(true);
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
    expect(paletteAt(0, path).ink).toBeCloseTo(NIGHT_INK, 6);
    expect(paletteAt(path.tForBeat('capabilities'), path).ink).toBeCloseTo(DAY_INK, 6);
  });

  // C2: text on the night ground was going near-invisible — .about-beat-heading
  // and .chrome both read var(--ink), which nothing was driving.
  it('moves textInk with the ground — pale at night, the site default by day', () => {
    expect(paletteAt(0, path).textInk).toBe(NIGHT_TEXT_INK);
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
