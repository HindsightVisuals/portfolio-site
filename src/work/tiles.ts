/**
 * Which image each WORK tile shows.
 *
 * Kept apart from world.ts so the wall's geometry and the wall's content can
 * change independently — and so a future video swap is a data edit here rather
 * than surgery on the scene graph.
 */

import { withBase } from '../routes';

export interface TileSource {
  /** App-space path, leading slash — withBase() supplies the deploy prefix. */
  still: string;
  /**
   * True when `still` is the first frame of a video rather than a finished
   * still. Juan Valdez and Naboso are videos; we do not have the files yet, so
   * their first frames stand in. Naboso's frame is near-black on purpose.
   */
  stillIsVideoFrame: boolean;
  /** Future video source. Nothing reads this yet — it is the documented seam. */
  video?: string;
  /** Future per-project mark for the hover panel. No marks exist in the repo. */
  mark?: string;
}

export const TILE_SOURCES: Record<string, TileSource> = {
  'know-good': { still: '/work/know-good.webp', stillIsVideoFrame: false },
  addax: { still: '/work/addax.webp', stillIsVideoFrame: false },
  'spy-hop': { still: '/work/spy-hop.webp', stillIsVideoFrame: false },
  'juan-valdez': { still: '/work/juan-valdez.webp', stillIsVideoFrame: true },
  naboso: { still: '/work/naboso.webp', stillIsVideoFrame: true },
  animal: { still: '/work/animal.webp', stillIsVideoFrame: false },
  babaloo: { still: '/work/babaloo.webp', stillIsVideoFrame: false },
  hindsight: { still: '/work/hindsight.webp', stillIsVideoFrame: false },
};

export function tileSource(slug: string): TileSource {
  const src = TILE_SOURCES[slug];
  if (!src) throw new Error(`tileSource: unknown slug "${slug}"`);
  return src;
}

/** Deploy-base-aware URL for a tile's still image. */
export function tileStillUrl(slug: string): string {
  return withBase(tileSource(slug).still);
}
