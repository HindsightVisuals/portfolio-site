import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CAMERA_FOV,
  DESTINATIONS,
  SLUGS,
  TILE_GAP,
  TILE_H,
  TILE_W,
  isEffectivelyVisible,
  nextSlug,
  tileFocusTarget,
  tileIndexForSlug,
} from './world';
import { distanceForFraming, effectiveMarginPx } from './framing';

describe('SLUGS', () => {
  it('is the documented Content Audit order, one per WORK tile', () => {
    expect(SLUGS).toEqual([
      'know-good',
      'addax',
      'spy-hop',
      'juan-valdez',
      'naboso',
      'animal',
      'babaloo',
      'hindsight',
    ]);
  });
});

describe('tileIndexForSlug', () => {
  it.each(SLUGS.map((slug, i) => [slug, i] as const))('%s -> index %i', (slug, i) => {
    expect(tileIndexForSlug(slug)).toBe(i);
  });

  it('returns -1 for an unknown slug', () => {
    expect(tileIndexForSlug('not-a-project')).toBe(-1);
  });
});

describe('nextSlug', () => {
  it.each(SLUGS.map((slug, i) => [slug, SLUGS[(i + 1) % SLUGS.length]] as const))(
    '%s -> %s',
    (slug, expected) => {
      expect(nextSlug(slug)).toBe(expected);
    },
  );

  it('wraps from the 8th tile back to the 1st', () => {
    expect(nextSlug(SLUGS[7])).toBe(SLUGS[0]);
  });

  it('throws for an unknown slug', () => {
    expect(() => nextSlug('not-a-project')).toThrow();
  });
});

describe('tileFocusTarget', () => {
  const vpW = 1920;
  const vpH = 1080;
  const workAnchorZ = DESTINATIONS.find((d) => d.id === 'work')!.anchorZ;

  it('returns the tile-center x/y and a framed z, for every tile', () => {
    for (let i = 0; i < SLUGS.length; i++) {
      const row = Math.floor(i / 4);
      const col = i % 4;
      const expectedX = (col - 1.5) * (TILE_W + TILE_GAP);
      const expectedY = row === 0 ? (TILE_H + TILE_GAP) / 2 : -(TILE_H + TILE_GAP) / 2;
      const margin = effectiveMarginPx(vpW, vpH);
      const expectedDist = distanceForFraming(TILE_W, TILE_H, vpW, vpH, CAMERA_FOV, margin);

      const target = tileFocusTarget(SLUGS[i], vpW, vpH);

      expect(target.x).toBeCloseTo(expectedX, 9);
      expect(target.y).toBeCloseTo(expectedY, 9);
      expect(target.z).toBeCloseTo(workAnchorZ + expectedDist, 9);
    }
  });

  it('varies distance with viewport size (uses framing, not a fixed offset)', () => {
    const small = tileFocusTarget(SLUGS[0], 800, 600);
    const large = tileFocusTarget(SLUGS[0], 2560, 1440);
    expect(small.z).not.toBeCloseTo(large.z, 3);
    // x/y (tile-center) do not depend on viewport size
    expect(small.x).toBeCloseTo(large.x, 9);
    expect(small.y).toBeCloseTo(large.y, 9);
  });

  it('throws for an unknown slug', () => {
    expect(() => tileFocusTarget('not-a-project', vpW, vpH)).toThrow();
  });
});

describe('isEffectivelyVisible', () => {
  it('is true when the object and every ancestor are visible', () => {
    const grandparent = new THREE.Group();
    const parent = new THREE.Group();
    const child = new THREE.Object3D();
    grandparent.add(parent);
    parent.add(child);
    expect(isEffectivelyVisible(child)).toBe(true);
  });

  it('is false when the object itself is invisible', () => {
    const obj = new THREE.Object3D();
    obj.visible = false;
    expect(isEffectivelyVisible(obj)).toBe(false);
  });

  it('is false when a parent is invisible, even if the object itself is visible', () => {
    // mirrors the WORK wall: tiles stay visible=true while the group (materialize
    // state) toggles — pick() must still treat a faded-out wall as unpickable
    const group = new THREE.Group();
    group.visible = false;
    const tile = new THREE.Object3D();
    group.add(tile);
    expect(tile.visible).toBe(true);
    expect(isEffectivelyVisible(tile)).toBe(false);
  });

  it('is false when a distant ancestor (not the immediate parent) is invisible', () => {
    const root = new THREE.Group();
    root.visible = false;
    const mid = new THREE.Group();
    const leaf = new THREE.Object3D();
    root.add(mid);
    mid.add(leaf);
    expect(isEffectivelyVisible(leaf)).toBe(false);
  });

  it('is true for a standalone object with no parent', () => {
    const obj = new THREE.Object3D();
    expect(isEffectivelyVisible(obj)).toBe(true);
  });
});
