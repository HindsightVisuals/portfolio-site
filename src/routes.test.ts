import { describe, expect, it } from 'vitest';
import { DEST_ORDER, destForPath, pathForDest, pathForSlug, slugForPath } from './routes';
import { SLUGS } from './three/world';

describe('routes', () => {
  it('maps paths to destinations', () => {
    expect(destForPath('/')).toBe('home');
    expect(destForPath('/work')).toBe('work');
    expect(destForPath('/about')).toBe('about');
    expect(destForPath('/contact')).toBe('contact');
  });

  it('tolerates trailing slashes', () => {
    expect(destForPath('/work/')).toBe('work');
  });

  it('returns null for unknown paths', () => {
    expect(destForPath('/nope')).toBeNull();
  });

  it('round-trips every destination', () => {
    for (const d of DEST_ORDER) expect(destForPath(pathForDest(d))).toBe(d);
  });

  it('maps a project slug path to the work destination', () => {
    expect(destForPath('/work/naboso')).toBe('work');
  });

  it('parses a valid project slug from its path', () => {
    expect(slugForPath('/work/naboso')).toBe('naboso');
  });

  it('returns null for an unknown slug', () => {
    expect(slugForPath('/work/not-a-real-project')).toBeNull();
  });

  it('tolerates a trailing slash on a slug path', () => {
    expect(slugForPath('/work/naboso/')).toBe('naboso');
  });

  it('returns null when /work has no slug segment', () => {
    expect(slugForPath('/work')).toBeNull();
    expect(slugForPath('/work/')).toBeNull();
  });

  it('returns null for non-work paths', () => {
    expect(slugForPath('/about')).toBeNull();
    expect(slugForPath('/')).toBeNull();
  });

  it('round-trips every project slug', () => {
    for (const slug of SLUGS) expect(slugForPath(pathForSlug(slug))).toBe(slug);
  });

  it('builds a /work/[slug] path', () => {
    expect(pathForSlug('naboso')).toBe('/work/naboso');
  });
});
