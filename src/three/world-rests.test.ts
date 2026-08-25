import { describe, expect, it } from 'vitest';
import { DESTINATIONS, HOME_REST_Z } from './world';
import { DEST_ORDER } from '../routes';

describe('DESTINATIONS', () => {
  it('is the spine rests only — home and work', () => {
    expect(DESTINATIONS.map((d) => d.id)).toEqual(['home', 'work']);
  });

  it('keeps home and work exactly where they were', () => {
    // Nothing about the world's geometry moves; two rests are removed, the
    // remaining two must not shift or the Work wall reframes.
    expect(HOME_REST_Z).toBe(34);
    expect(DESTINATIONS.find((d) => d.id === 'work')!.cameraZ).toBe(-26);
    expect(DESTINATIONS.find((d) => d.id === 'work')!.anchorZ).toBe(-60);
  });

  it('does NOT shrink the route vocabulary — /about and /contact are still routes', () => {
    // DEST_ORDER is what destForPath and pathForDest use. Confusing "a place
    // the camera rests" with "a URL that exists" would break both.
    expect(DEST_ORDER).toEqual(['home', 'work', 'about', 'contact']);
  });
});
