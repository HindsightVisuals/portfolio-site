import { magneticOffset, type Vec2 } from '../home/magnetics';

/** Emblem box in CSS px. Figma 84:462 — 64x64, sitting after Work and About. */
export const EMBLEM_SIZE = 64;
export const EMBLEM_ROWS = 7;

export interface EmblemCell {
  /** Normalised 0..1 within the emblem box. */
  x: number;
  y: number;
  /** 0..1. Scale at rest, before any pointer influence. */
  restScale: number;
}

/**
 * The 25 cells, on a DIAGONAL lattice: seven rows of 4-3-4-3-4-3-4, each offset
 * half a step from the row above. A square grid would read as a checkerboard;
 * the offset is what makes the emblem a diamond.
 *
 * Rest scale falls off radially from the middle. That is the resting state, not
 * a hover state — the Figma render shows it with no pointer present, and beat 2
 * ("every cell snaps to full scale") only reads as a change if the cells are
 * not already full.
 */
function buildCells(): EmblemCell[] {
  const cells: EmblemCell[] = [];
  for (let row = 0; row < EMBLEM_ROWS; row++) {
    const wide = row % 2 === 0;
    const count = wide ? 4 : 3;
    const step = 1 / 4; // four columns of pitch across the box
    for (let i = 0; i < count; i++) {
      // Wide rows start half a step in; narrow rows start a full step in, which
      // is what puts them between the cells above rather than under them.
      const x = wide ? step * i + step / 2 : step * i + step;
      const y = row / (EMBLEM_ROWS - 1);
      const dist = Math.hypot(x - 0.5, y - 0.5) / Math.SQRT1_2; // 0 centre, ~1 corner
      // 0.86 keeps the biggest cell clear of full scale; 0.34 keeps the corners
      // visible. Both bounds are asserted in the tests.
      const restScale = 0.86 - 0.52 * Math.min(1, dist);
      cells.push({ x, y, restScale });
    }
  }
  return cells;
}

export const EMBLEM_CELLS: readonly EmblemCell[] = Object.freeze(buildCells());

/**
 * A cell's scale under the pointer.
 *
 * `pointer` is in emblem-box pixels (0..EMBLEM_SIZE), matching what a
 * getBoundingClientRect-relative mousemove gives. Falloff comes from
 * `magneticOffset`, which already drives the reticles and the behind-panel —
 * reusing it is what keeps every proximity effect on the site feeling like one
 * system.
 */
export function cellScale(
  cell: EmblemCell,
  pointer: Vec2 | null,
  opts: { radius: number; boost: number },
): number {
  if (!pointer || opts.radius <= 0) return cell.restScale;
  const centre = { x: cell.x * EMBLEM_SIZE, y: cell.y * EMBLEM_SIZE };
  const { proximity } = magneticOffset(pointer, centre, {
    radius: opts.radius,
    bracketMax: 0,
    iconMax: 0,
  });
  return Math.min(1, cell.restScale + proximity * opts.boost);
}
