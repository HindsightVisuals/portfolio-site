import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ABOUT_MARKERS } from './about-markers';
import { BLENDER_TO_WORLD, pitchToQuaternion } from './about-coords';
import { buildAboutPath } from './about-path';

const ANCHOR = new THREE.Vector3(0, 0, -86); // the site's About rest

describe('buildAboutPath', () => {
  const path = buildAboutPath(ANCHOR);

  it('starts exactly on the anchor with a level camera', () => {
    const pose = path.sample(0);
    expect(pose.position.distanceTo(ANCHOR)).toBeCloseTo(0, 6);
    expect(pose.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 6);
  });

  it('passes through every measured marker at that marker\'s own t', () => {
    for (const m of ABOUT_MARKERS) {
      const pose = path.sample(path.tForBeat(m.id));
      const expected = new THREE.Vector3(
        0,
        (m.blender.z - ABOUT_MARKERS[0].blender.z) * BLENDER_TO_WORLD + ANCHOR.y,
        -(m.blender.y - ABOUT_MARKERS[0].blender.y) * BLENDER_TO_WORLD + ANCHOR.z,
      );
      expect(pose.position.distanceTo(expected)).toBeCloseTo(0, 4);
      expect(pose.quaternion.angleTo(pitchToQuaternion(m.pitchDeg))).toBeCloseTo(0, 4);
    }
  });

  it('travels forward on -Z without a visible backward wiggle', () => {
    // NOT an exact-monotonic assertion, on purpose. The climb run (lander,
    // team, clientWall) sits at Blender y 7.09 / 7.10 / 7.10 — three knots
    // essentially on top of each other in the forward axis — and the next knot
    // jumps to 9.52. A Catmull-Rom through that will bulge slightly backward
    // between them. Centripetal parameterization is chosen precisely to keep
    // that bulge small; WIGGLE is what "small" means, in world units, and it is
    // well under one frame of scroll travel.
    const WIGGLE = 0.05;
    let prevZ = Infinity;
    for (let i = 0; i <= 200; i++) {
      const z = path.sample(i / 200).position.z;
      expect(z).toBeLessThanOrEqual(prevZ + WIGGLE);
      prevZ = z;
    }
    // And the run as a whole is unambiguously forward. 43.7 world units of it:
    // the markers span 25.72 Blender units on the forward axis. That is well
    // short of the ~70-unit total path length, because the climb contributes
    // 31 units in +Y — do not conflate the two.
    expect(path.sample(1).position.z).toBeLessThan(path.sample(0).position.z - 40);
  });

  it('climbs monotonically in +Y through the lander-to-client-wall run', () => {
    const a = path.tForBeat('transition');
    const b = path.tForBeat('clientWall');
    let prevY = -Infinity;
    for (let i = 0; i <= 50; i++) {
      const y = path.sample(a + ((b - a) * i) / 50).position.y;
      expect(y).toBeGreaterThanOrEqual(prevY - 1e-6);
      prevY = y;
    }
  });

  it('clamps out-of-range t rather than extrapolating off the end of the world', () => {
    // Each sample gets its OWN `into`. Without one, sample() writes into a
    // shared scratch pose and returns it, so comparing two bare sample() calls
    // in one expression compares the object with itself and passes whatever
    // the implementation does.
    const pose = () => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() });
    const [under, start, over, end] = [pose(), pose(), pose(), pose()];
    path.sample(-1, under);
    path.sample(0, start);
    path.sample(2, over);
    path.sample(1, end);
    expect(under.position.distanceTo(start.position)).toBeCloseTo(0, 6);
    expect(over.position.distanceTo(end.position)).toBeCloseTo(0, 6);
  });

  it('writes through the `into` pose instead of allocating', () => {
    const into = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
    const out = path.sample(0.5, into);
    expect(out).toBe(into);
    expect(out.position).toBe(into.position);
  });

  it('stops short of the Contact destination — the corridor is a mezzanine, not a collision', () => {
    // Contact's camera rest is z = -146. If the path overran it the scrub would
    // fly through the Contact screen, which the world still has anchored there.
    expect(path.sample(1).position.z).toBeGreaterThan(-146);
  });

  it('reports its own world length so the scroll document can be sized from it', () => {
    expect(path.length()).toBeGreaterThan(60);
    expect(path.length()).toBeLessThan(120);
  });

  it('gives beats t values in marker order, 0 and 1 at the ends', () => {
    expect(path.tForBeat('anchor')).toBe(0);
    expect(path.tForBeat('ai')).toBe(1);
    const ts = ABOUT_MARKERS.map((m) => path.tForBeat(m.id));
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
  });
});
