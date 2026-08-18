import { describe, expect, it } from 'vitest';
import { SLUGS } from '../three/world';
import { TILE_SOURCES, tileSource, tileStillUrl } from './tiles';

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
});
