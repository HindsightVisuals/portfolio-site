import { describe, expect, it } from 'vitest';
import { DEST_ORDER, destForPath, pathForDest } from './routes';

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
});
