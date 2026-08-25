// src/about/about-routes.test.ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DESTINATIONS } from '../three/world';
import { buildAboutPath } from './about-path';
import { corridorTForRoute } from './about-scrub';

const path = buildAboutPath(
  new THREE.Vector3(0, 0, DESTINATIONS.find((d) => d.id === 'work')!.cameraZ),
);

describe('corridorTForRoute', () => {
  it('puts /about at the top of the corridor', () => {
    expect(corridorTForRoute(path, 'about')).toBe(0);
  });

  it('puts /contact at the start of the contact beat', () => {
    expect(corridorTForRoute(path, 'contact')).toBeCloseTo(path.tForBeat('contact'), 10);
    expect(corridorTForRoute(path, 'contact')).toBeCloseTo(0.8608, 3);
  });

  it('puts contact after about — the two routes are not the same place', () => {
    expect(corridorTForRoute(path, 'contact')).toBeGreaterThan(corridorTForRoute(path, 'about'));
  });
});
