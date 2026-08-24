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

/** Horizontal pitch between two cells in the SAME row, as a fraction of the box. */
const STEP = 1 / 4;
/**
 * Vertical pitch between rows. Exactly half the horizontal pitch, which is also
 * how far each row is offset sideways from the one above — that equality is
 * what makes this a true 45-degree lattice rather than a sheared one.
 *
 * It shipped as `1 / (EMBLEM_ROWS - 1)` — the rows stretched to fill the box's
 * full height while the four columns only spanned three quarters of its width,
 * so the emblem read, in Adam's words, "somewhat tall rectangular". Deriving it
 * from STEP makes the lattice square by construction: six row-steps down is the
 * same distance as three column-steps across.
 */
const ROW_STEP = STEP / 2;

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
    const step = STEP;
    for (let i = 0; i < count; i++) {
      // Wide rows start half a step in; narrow rows start a full step in, which
      // is what puts them between the cells above rather than under them.
      const x = wide ? step * i + step / 2 : step * i + step;
      // Centred the same way the columns are: the first row sits one row-step
      // down and the last one row-step up from the bottom, so the lattice has
      // the same margin on all four sides.
      const y = ROW_STEP * (row + 1);
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
