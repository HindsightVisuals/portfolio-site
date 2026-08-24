/**
 * Beats 2-3: the emblem fills, then a field of diamond tiles builds ON over the
 * page you are leaving and back OFF over the page you are arriving at, in one
 * continuous right-to-left motion. See wipe-geometry.ts for the lattice, the
 * ordering and the on/off cycle.
 *
 * BOTH directions run that same shape. Only the swap at the halfway point
 * differs: going in, the contact page is unveiled behind the field; going out,
 * it is pulled from behind it. The reveal is the second half either way.
 *
 * A single GSAP timeline drives a plain `{ p: 0 }` value from 0 to 2; every
 * update derives EVERY tile's scale from that one number. It is not one tween
 * per tile, and that is deliberate: N animations that are meant to agree will
 * drift, N values read from one number cannot. The sawtooth this replaced
 * worked the same way.
 *
 * Layering. The tile field is fixed at document.body level, z-index 26 — above
 * `.takeover` (20) and above `.ferro-stage` (25), so it covers both. The page
 * being revealed sits BEHIND it and shows through as the tiles retreat, rather
 * than being masked by them; see the note at the end of wipe-geometry.ts on
 * what a true mask would take. `.ferro-stage` is a viewport-sized WebGL canvas
 * shared by every page, so it gets the same clip as the panel — left alone it
 * would hang its blob over whichever page is meant to be hidden.
 */

import gsap from 'gsap';
import '../styles/emblem.css';
import { TILE_RADIUS, TILE_SIDE, tileCycleScale, tileField } from './wipe-geometry';

/** One half of the transition — on, or off. Both halves are the same length. */
const PHASE_S = 0.75;
/**
 * Linear, on purpose. The front's cadence IS the effect — an eased master
 * would make it accelerate and stall, which reads as a wipe again. The pop of
 * each individual tile carries the easing instead (see tileScale).
 */
const WIPE_EASE = 'none';

/** Beat 2: every emblem cell eases to full scale before the build (beat 3)
 *  continues — see contact/emblem.ts's `setFill` doc comment. Fast ease-out,
 *  ~0.25s, no pause before the build picks up. */
const FILL_DURATION_S = 0.25;
const FILL_EASE = 'power2.out';

/** Clips an element to nothing. A degenerate polygon rather than
 *  `visibility`/`opacity` because clip-path is what the caller's element already
 *  uses and what `finish()` knows how to clear. */
const HIDDEN_CLIP = 'polygon(0% 0%, 0% 0%, 0% 0%)';

export interface WipeTargets {
  panel: HTMLElement;
  ferro: HTMLElement | null;
  /** The emblem that was clicked (or is being reformed), if any. Structural
   *  rather than importing `Emblem` from contact/emblem.ts, to avoid a
   *  needless module coupling — any object with `setFill` will do. */
  emblem?: { setFill(t: number): void } | null;
}

// Only one wipe ever runs at a time (a page transition can't be mid-build in
// two directions at once). Killing the previous timeline before starting a
// new one avoids two timelines fighting over the same tiles — a documented
// failure mode in this codebase (see takeover.ts).
let activeTimeline: gsap.core.Timeline | null = null;

interface TileLayer {
  el: HTMLDivElement;
  /** `p` runs 0 -> 2: the field builds on, then back off. */
  write(p: number): void;
}

/**
 * Builds the field once, up front. Positions and sizes never change after
 * this — only each tile's scale — so the per-frame work is one transform write
 * per tile that actually moved.
 */
function buildTileLayer(): TileLayer {
  const el = document.createElement('div');
  el.className = 'wipe-tiles';

  const tiles = tileField({ w: window.innerWidth, h: window.innerHeight });
  const nodes: HTMLSpanElement[] = [];
  const last: number[] = [];

  for (const tile of tiles) {
    const span = document.createElement('span');
    span.className = 'wipe-tile';
    span.style.left = `${tile.x}px`;
    span.style.top = `${tile.y}px`;
    span.style.width = `${TILE_SIDE}px`;
    span.style.height = `${TILE_SIDE}px`;
    span.style.borderRadius = `${TILE_RADIUS}px`;
    el.appendChild(span);
    nodes.push(span);
    last.push(-1);
  }

  return {
    el,
    write(p: number): void {
      for (let i = 0; i < tiles.length; i++) {
        const s = Math.round(tileCycleScale(tiles[i].order, p) * 1000) / 1000;
        // Most tiles are dormant on any given frame — either not started or
        // long since full. Skipping them is the difference between ~400 style
        // writes a frame and the couple of dozen that are actually moving.
        if (s === last[i]) continue;
        last[i] = s;
        nodes[i].style.transform = `translate(-50%, -50%) rotate(45deg) scale(${s})`;
      }
    },
  };
}

/**
 * Runs the transition once. `dir: 'in'` builds the field up over the outgoing
 * page; `dir: 'out'` grows it back over the contact page and then retreats it
 * toward the emblem it came from. The returned promise resolves when the
 * timeline completes (or immediately, under reduced motion).
 */
export function runWipe(
  dir: 'in' | 'out',
  targets: WipeTargets,
  opts: { reducedMotion: boolean }
): Promise<void> {
  activeTimeline?.kill();
  activeTimeline = null;

  if (opts.reducedMotion) {
    // Beats 2-3 are skipped outright — no clip, cut straight to beat 4.
    targets.panel.style.clipPath = '';
    if (targets.ferro) targets.ferro.style.clipPath = '';
    return Promise.resolve();
  }

  const layer = buildTileLayer();
  document.body.appendChild(layer.el);

  const state = { p: 0 };

  // Both directions run the same shape: an empty field grows over whatever the
  // viewer is looking at, the pages swap under it at full coverage, and the
  // field builds back off to reveal the other one.
  //
  // Which page is hidden at the start is the only difference. Going IN, the
  // contact page is the newcomer and must not be seen until the swap. Going
  // OUT it is what the viewer is already looking at, so it stays put until the
  // field covers it.
  layer.write(0);
  if (dir === 'in') {
    targets.panel.style.clipPath = HIDDEN_CLIP;
    if (targets.ferro) targets.ferro.style.clipPath = HIDDEN_CLIP;
  }

  return new Promise<void>((resolve) => {
    // Set on natural completion only — an interrupted run (killed by a later
    // runWipe call, see above) must not clear the clip out from under the new
    // run that's about to drive it.
    let completedNaturally = false;

    const finish = (): void => {
      activeTimeline = null;
      layer.el.remove();
      if (completedNaturally) {
        // A leftover clip-path on `.takeover` creates a containing block that
        // changes how fixed-position descendants resolve, and one on
        // `.ferro-stage` would clip the small corner blob on every later 2D
        // page. Going IN, both are already unclipped by the swap; this is
        // belt-and-braces.
        //
        // Going OUT the panel is asymmetric on purpose — do NOT clear it. It
        // is clipped to nothing and about to be removed by takeover.ts;
        // clearing it would flash the whole outgoing page for the frame in
        // between. The ferro stage is not about to be destroyed, so its clip
        // DOES need clearing, or the corner blob stays invisible site-wide.
        if (dir === 'in') targets.panel.style.clipPath = '';
        if (targets.ferro) targets.ferro.style.clipPath = '';
      }
      resolve();
    };

    const tl = gsap.timeline({
      onComplete: () => {
        completedNaturally = true;
        finish();
      },
      onInterrupt: finish,
    });
    activeTimeline = tl;

    // Beat 2 (fill) and beat 3 (build) are ONE timeline, not two tweens started
    // alongside each other — two separately-eased animations meeting at zero
    // velocity reads as two animations, which the design explicitly calls out
    // to avoid. `dir: 'in'` fills first, then the build continues immediately
    // (GSAP timeline default: back-to-back, no gap). `dir: 'out'` is the
    // reverse in TIME, not just in value: the field runs first and the emblem
    // re-forms over the final FILL_DURATION_S.
    const fillState = { v: dir === 'in' ? 0 : 1 };
    const endFill = dir === 'in' ? 1 : 0;
    const addFillTween = (): void => {
      if (!targets.emblem) return;
      tl.to(fillState, {
        v: endFill,
        duration: FILL_DURATION_S,
        ease: FILL_EASE,
        onUpdate: () => targets.emblem?.setFill(fillState.v),
      });
    };
    const addPhase = (to: number): void => {
      tl.to(state, {
        p: to,
        duration: PHASE_S,
        ease: WIPE_EASE,
        onUpdate: () => layer.write(state.p),
      });
    };

    /**
     * The handover, at full coverage. Nothing behind the field can be seen, so
     * swapping which page sits there is free — and it has to happen HERE, in
     * the one frame where the field hides everything. A frame early and the
     * incoming page shows through a gap; a frame late and the outgoing one does.
     */
    const addSwap = (): void => {
      tl.call(() => {
        const clip = dir === 'in' ? '' : HIDDEN_CLIP;
        targets.panel.style.clipPath = clip;
        if (targets.ferro) targets.ferro.style.clipPath = clip;
      });
    };

    if (dir === 'in') addFillTween();
    addPhase(1);
    addSwap();
    addPhase(2);
    if (dir === 'out') addFillTween();
  });
}
