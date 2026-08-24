import type { Rect } from './ferro-placement';
import { FERRO_DEFAULTS } from './ferro-field';

/**
 * Ferro influence — the external inputs that couple to the blob.
 *
 * Three inputs, one shape: a scalar or vector the controller feeds the field.
 * Building them as one module rather than three ad-hoc handlers is what keeps
 * the pointer, the drift and the typed message from each inventing their own
 * falloff.
 */

/**
 * Pointer position → a unit-ish steering vector for the ambient drift.
 * Smoothstep falloff, matching magneticOffset so every proximity effect on the
 * site shares one feel. World y is flipped relative to screen y.
 */
export function driftSteer(pointer: { x: number; y: number } | null, rect: Rect, radius: number): { x: number; y: number } {
  if (!pointer || radius <= 0) return { x: 0, y: 0 };
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dx = pointer.x - cx;
  const dy = pointer.y - cy;
  const dist = Math.hypot(dx, dy);
  if (dist === 0 || dist >= radius) return { x: 0, y: 0 };
  const t = 1 - dist / radius;
  const falloff = t * t * (3 - 2 * t); // smoothstep
  return { x: (dx / dist) * falloff, y: (-dy / dist) * falloff };
}

/** Completed words only — a word in progress must not tick the field. */
export function countWords(text: string): number {
  if (!text) return 0;
  const trimmedEnd = /\s$/.test(text) ? text : text.replace(/\S+$/, '');
  const words = trimmedEnd.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/**
 * How far past rest a full message can push the displacement.
 *
 * Adam, 2026-08-21: "I think we need to quadruple the word typing effect." The
 * first pass topped out at 1.8 — a 0.75 swing above the 1.05 rest — which read
 * as almost nothing while typing. Quadrupling that swing gives 3.0, so a long
 * brief drives the field to ~4.05.
 *
 * Deliberately NOT matched by a change to BOUNDING_RADIUS in ferro.ts: that is
 * sized from the RESTING strength, so the blob fills its frame at rest and
 * grows past it as the message accumulates. Overflowing into the empty column
 * is the effect, not a bug — the transmission visibly outgrows its box.
 */
const WORD_SWING = 0.75 * 4;

/** Words → displacement strength, saturating so a long message cannot explode it. */
export function wordStrength(
  words: number,
  opts: { base?: number; max?: number; halfLife?: number } = {},
): number {
  // 1.05 duplicated FERRO_DEFAULTS.strength — same tuned value, now one source.
  const base = opts.base ?? FERRO_DEFAULTS.strength;
  const max = opts.max ?? FERRO_DEFAULTS.strength + WORD_SWING;
  const halfLife = opts.halfLife ?? 25;
  const n = Number.isFinite(words) ? Math.max(0, words) : 0;
  return base + (max - base) * (1 - Math.exp(-n / halfLife));
}
