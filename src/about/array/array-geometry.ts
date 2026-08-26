/**
 * Recover exact per-island centroids from the baked `_ISLAND_C` attribute.
 *
 * WHY THIS EXISTS: `_ISLAND_C` rides inside Draco, which quantises generic
 * attributes to roughly 0.0005 local units. Two vertices of the SAME panel can
 * therefore arrive with slightly different centroids — and since each vertex
 * computes its own scale from its own centroid, the panel would deform slightly
 * instead of scaling rigidly. Snapping every vertex back to its cluster's mean
 * removes that entirely.
 *
 * The attribute is baked in Blender rather than derived here because neither
 * route to deriving it survives contact with the export (measured 2026-08-26):
 * index connectivity fragments once `Smooth by Angle` splits vertices at sharp
 * edges, and position welding merges neighbouring panels because adjacent
 * islands genuinely touch — 505 shared positions on the scaffold disc at an
 * epsilon of 1e-6.
 */

/**
 * Cluster radius. Comfortably above Draco's ~0.0005 quantisation step and far
 * below the gap between neighbouring panel centroids.
 */
export const ISLAND_EPSILON = 1e-3;

export interface IslandData {
  /** Per-vertex island centroid, xyz interleaved — same length as the input. */
  centres: Float32Array;
  /** How many distinct islands were found. Sanity-check against 224 / 256. */
  count: number;
}

export function clusterIslandCentres(
  raw: Float32Array,
  epsilon: number = ISLAND_EPSILON,
): IslandData {
  const n = raw.length / 3;
  const centres = new Float32Array(raw.length);
  if (n === 0) return { centres, count: 0 };

  const inv = 1 / epsilon;
  const bucketOf = new Map<string, number>();
  const owner = new Int32Array(n);
  const sums: number[] = [];
  const counts: number[] = [];

  for (let i = 0; i < n; i++) {
    const x = raw[i * 3];
    const y = raw[i * 3 + 1];
    const z = raw[i * 3 + 2];
    const key = `${Math.round(x * inv)},${Math.round(y * inv)},${Math.round(z * inv)}`;
    let b = bucketOf.get(key);
    if (b === undefined) {
      b = counts.length;
      bucketOf.set(key, b);
      sums.push(0, 0, 0);
      counts.push(0);
    }
    owner[i] = b;
    sums[b * 3] += x;
    sums[b * 3 + 1] += y;
    sums[b * 3 + 2] += z;
    counts[b] += 1;
  }

  for (let i = 0; i < n; i++) {
    const b = owner[i];
    const c = counts[b];
    centres[i * 3] = sums[b * 3] / c;
    centres[i * 3 + 1] = sums[b * 3 + 1] / c;
    centres[i * 3 + 2] = sums[b * 3 + 2] / c;
  }

  return { centres, count: counts.length };
}
