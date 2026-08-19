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
  /**
   * Mean luminance of the thumbnail, 0..1, measured when the assets were
   * generated. The cursor uses it to decide whether to draw itself dark or
   * light — a black cursor is invisible on Naboso and Spy Hop, which is what
   * Adam reported. Stored rather than sampled: reading pixels back out of the
   * WebGL wall every frame would be absurd for a value that never changes.
   */
  luma: number;
}

/** Below this mean luminance a tile counts as dark. */
export const DARK_LUMA = 0.4;

export const TILE_SOURCES: Record<string, TileSource> = {
  'know-good': { still: '/work/know-good.webp', stillIsVideoFrame: false, luma: 0.596 },
  addax: { still: '/work/addax.webp', stillIsVideoFrame: false, luma: 0.81 },
  'spy-hop': { still: '/work/spy-hop.webp', stillIsVideoFrame: false, luma: 0.176 },
  'juan-valdez': { still: '/work/juan-valdez.webp', stillIsVideoFrame: true, luma: 0.778 },
  naboso: { still: '/work/naboso.webp', stillIsVideoFrame: true, luma: 0.092 },
  animal: { still: '/work/animal.webp', stillIsVideoFrame: false, luma: 0.23 },
  babaloo: { still: '/work/babaloo.webp', stillIsVideoFrame: false, luma: 0.848 },
  hindsight: { still: '/work/hindsight.webp', stillIsVideoFrame: false, luma: 0.98 },
};

export function tileSource(slug: string): TileSource {
  const src = TILE_SOURCES[slug];
  if (!src) throw new Error(`tileSource: unknown slug "${slug}"`);
  return src;
}

/** Whether a tile is dark enough that a black cursor would disappear on it. */
export function isDarkTile(slug: string): boolean {
  const src = TILE_SOURCES[slug];
  return src ? src.luma < DARK_LUMA : false;
}

/** Deploy-base-aware URL for a tile's still image. */
export function tileStillUrl(slug: string): string {
  return withBase(tileSource(slug).still);
}
