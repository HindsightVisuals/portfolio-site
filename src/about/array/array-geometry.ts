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

/**
 * Which coordinate space a baked island attribute actually arrived in.
 *
 * Blender's glTF exporter converts POSITION and NORMAL from Z-up to Y-up, but
 * it has no way to know that a CUSTOM attribute holds positions — so
 * `_ISLAND_C` arrives in raw Blender coordinates while the positions beside it
 * have been rotated. The shader then compares centroids in one space against a
 * cursor in another, and the displacement lands nowhere near the pointer.
 *
 * Detected rather than hardcoded: an exporter that starts converting custom
 * attributes would silently break a hardcoded assumption, and this costs one
 * cheap pass over a sample at load.
 */
export type IslandSpace = 'gltf' | 'blender';

export interface SpaceDetection {
  space: IslandSpace;
  /** Mean distance from a vertex to its own centroid, treating the data as glTF. */
  meanAsGltf: number;
  /** The same, after converting Blender Z-up to Y-up. */
  meanAsBlender: number;
}

/** Blender Z-up to glTF Y-up, for a single vector: `(x, y, z)` becomes `(x, z, -y)`. */
export function blenderToGltf(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y];
}

/**
 * Decide which space `islands` is in by asking which reading puts each centroid
 * CLOSER TO ITS OWN VERTEX — a centroid belongs to the island its vertex is part
 * of, so the right answer is bounded by island size and the wrong one is not.
 */
export function detectIslandSpace(
  positions: ArrayLike<number>,
  islands: ArrayLike<number>,
  stride = 37,
): SpaceDetection {
  const n = Math.min(positions.length, islands.length) / 3;
  let sumGltf = 0;
  let sumBlender = 0;
  let samples = 0;

  for (let i = 0; i < n; i += stride) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];
    const ix = islands[i * 3];
    const iy = islands[i * 3 + 1];
    const iz = islands[i * 3 + 2];

    sumGltf += Math.hypot(px - ix, py - iy, pz - iz);
    const [cx, cy, cz] = blenderToGltf(ix, iy, iz);
    sumBlender += Math.hypot(px - cx, py - cy, pz - cz);
    samples++;
  }

  const meanAsGltf = samples ? sumGltf / samples : 0;
  const meanAsBlender = samples ? sumBlender / samples : 0;
  return {
    space: meanAsBlender < meanAsGltf ? 'blender' : 'gltf',
    meanAsGltf,
    meanAsBlender,
  };
}

/** A copy of `islands` rotated from Blender Z-up into glTF Y-up. */
export function toGltfSpace(islands: Float32Array): Float32Array {
  const out = new Float32Array(islands.length);
  for (let i = 0; i < islands.length; i += 3) {
    const [x, y, z] = blenderToGltf(islands[i], islands[i + 1], islands[i + 2]);
    out[i] = x;
    out[i + 1] = y;
    out[i + 2] = z;
  }
  return out;
}
