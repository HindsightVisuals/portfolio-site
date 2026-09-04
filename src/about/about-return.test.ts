// @vitest-environment jsdom
// src/about/about-return.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import gsap from 'gsap';
import { HOME_REST_Z } from '../three/world';
import { buildAboutPath } from './about-path';
import { createReturnFlight } from './about-return';

const path = buildAboutPath(new THREE.Vector3(0, 0, -26));

function setup(reducedMotion = false) {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(3, 4, -20);
  camera.quaternion.setFromEuler(new THREE.Euler(0.4, 0, 0));
  const director = { setSuspended: vi.fn(), syncTo: vi.fn() };
  const ferroEl = document.createElement('div');
  const flight = createReturnFlight({ camera, director, ferroEl, reducedMotion }, path);
  return { camera, director, ferroEl, flight };
}

const rise = (): string =>
  document.documentElement.style.getPropertyValue('--footer-rise');

describe('createReturnFlight', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--footer-rise');
    // The animated path leaves a live 1.6s gsap tween behind whenever a test
    // steps the flight by hand rather than waiting it out; without this it
    // keeps writing the camera into the NEXT test. Same reason
    // about-flow-integration.test.ts clears it.
    gsap.globalTimeline.clear();
    vi.restoreAllMocks();
  });

  it('reports not in flight before it starts', () => {
    expect(setup().flight.inFlight()).toBe(false);
  });

  it('lands the camera at Home', () => {
    const { camera, flight } = setup(true);
    void flight.start({ t: 1, docRoot: null, onDepart: () => {}, onLanded: () => {} });
    expect(camera.position.z).toBeCloseTo(HOME_REST_Z, 5);
  });

  it('calls onDepart exactly once, at departure', () => {
    const onDepart = vi.fn();
    const { flight } = setup(true);
    void flight.start({ t: 1, docRoot: null, onDepart, onLanded: () => {} });
    expect(onDepart).toHaveBeenCalledTimes(1);
  });

  it('hands the director BOTH ends: syncTo before setSuspended(false)', () => {
    const { director, flight } = setup(true);
    void flight.start({ t: 1, docRoot: null, onDepart: () => {}, onLanded: () => {} });
    expect(director.syncTo).toHaveBeenCalledWith(HOME_REST_Z);
    expect(director.setSuspended).toHaveBeenCalledWith(false);
    expect(director.syncTo.mock.invocationCallOrder[0]).toBeLessThan(
      director.setSuspended.mock.invocationCallOrder[0],
    );
  });

  it('tears the session down BEFORE resuming the director', () => {
    const { director, flight } = setup(true);
    const onLanded = vi.fn();
    void flight.start({ t: 1, docRoot: null, onDepart: () => {}, onLanded });
    expect(onLanded.mock.invocationCallOrder[0]).toBeLessThan(
      director.syncTo.mock.invocationCallOrder[0],
    );
  });

  it('fades the blob out over the first RETURN_FADE_P of the flight', () => {
    const { ferroEl, flight } = setup();
    void flight.start({ t: 1, docRoot: null, onDepart: () => {}, onLanded: () => {} });
    flight.step(0);
    expect(Number(ferroEl.style.opacity)).toBeCloseTo(1, 5);
    flight.step(0.45);
    expect(Number(ferroEl.style.opacity)).toBeCloseTo(0, 5);
    flight.step(0.8);
    expect(Number(ferroEl.style.opacity)).toBeCloseTo(0, 5);
  });

  it('walks the chrome down rather than dropping it', () => {
    const { flight } = setup();
    void flight.start({ t: 1, docRoot: null, onDepart: () => {}, onLanded: () => {} });
    flight.step(0);
    const departed = Number(rise());
    expect(departed).toBeGreaterThan(0);
    flight.step(0.5);
    expect(Number(rise())).toBeLessThan(departed);
    expect(Number(rise())).toBeGreaterThan(0);
  });

  it('is in flight until it lands', () => {
    const { flight } = setup();
    void flight.start({ t: 1, docRoot: null, onDepart: () => {}, onLanded: () => {} });
    expect(flight.inFlight()).toBe(true);
    flight.step(1);
    expect(flight.inFlight()).toBe(false);
  });

  it('resolves the promise when it lands', async () => {
    const { flight } = setup();
    const done = flight.start({ t: 1, docRoot: null, onDepart: () => {}, onLanded: () => {} });
    flight.step(1);
    await expect(done).resolves.toBeUndefined();
  });
});
