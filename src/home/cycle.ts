/** Milliseconds each glyph holds before the next hard cut. */
export const CYCLE_MS = 500;

/** Per-reticle phase desync (in cycle units), so the 8 reticles don't swap in lockstep. */
export const PHASE_OFFSET = 0.37;

/**
 * Pure scheduler: which glyph index a given reticle shows at time `tMs`.
 * Deterministic function of wall-clock time, reticle index, and glyph count —
 * every reticle derives its own phase from the same clock, no per-reticle timers.
 */
export function iconIndexAt(tMs: number, reticleIndex: number, count: number): number {
  return Math.floor(tMs / CYCLE_MS + reticleIndex * PHASE_OFFSET) % count;
}
