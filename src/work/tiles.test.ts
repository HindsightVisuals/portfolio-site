import { describe, expect, it } from 'vitest';
import { SLUGS } from '../three/world';
import { DARK_LUMA, TILE_SOURCES, isDarkTile, tileSource, tileStillUrl } from './tiles';

describe('tile manifest', () => {
  it('has a source for every slug on the wall', () => {
    for (const slug of SLUGS) expect(TILE_SOURCES[slug]).toBeDefined();
  });

  it('has no orphan entries pointing at slugs the wall does not have', () => {
    for (const key of Object.keys(TILE_SOURCES)) {
      expect(SLUGS as readonly string[]).toContain(key);
    }
  });

  it('marks Juan Valdez and Naboso as stills standing in for video', () => {
    expect(tileSource('juan-valdez').stillIsVideoFrame).toBe(true);
    expect(tileSource('naboso').stillIsVideoFrame).toBe(true);
    expect(tileSource('spy-hop').stillIsVideoFrame).toBe(false);
  });

  it('routes urls through the deploy base', () => {
    expect(tileStillUrl('spy-hop')).toContain('/work/spy-hop.webp');
    expect(tileStillUrl('spy-hop').startsWith('/')).toBe(true);
  });

  it('throws on an unknown slug rather than returning a broken url', () => {
    expect(() => tileSource('nope')).toThrow(/unknown/i);
  });

  it('records a plausible luminance for every tile', () => {
    for (const slug of SLUGS) {
      const { luma } = tileSource(slug);
      expect(luma).toBeGreaterThanOrEqual(0);
      expect(luma).toBeLessThanOrEqual(1);
    }
  });
});

describe('isDarkTile', () => {
  // A black cursor vanishes on these three — the bug Adam reported.
  it('flags the tiles a black cursor disappears on', () => {
    expect(isDarkTile('naboso')).toBe(true);
    expect(isDarkTile('spy-hop')).toBe(true);
    expect(isDarkTile('animal')).toBe(true);
  });

  it('leaves the pale tiles alone', () => {
    expect(isDarkTile('hindsight')).toBe(false);
    expect(isDarkTile('babaloo')).toBe(false);
    expect(isDarkTile('addax')).toBe(false);
    expect(isDarkTile('juan-valdez')).toBe(false);
    expect(isDarkTile('know-good')).toBe(false);
  });

  it('agrees with the threshold it is derived from', () => {
    for (const slug of SLUGS) {
      expect(isDarkTile(slug)).toBe(tileSource(slug).luma < DARK_LUMA);
    }
  });

  it('does not throw on an unknown slug — the cursor must never crash a hover', () => {
    expect(isDarkTile('nope')).toBe(false);
  });
});
