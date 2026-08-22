/**
 * Beats 2-3: the sawtooth wipe. A single GSAP timeline drives a plain
 * `{ t: 0 }` value from 0 to 1 (or 1 to 0 for `dir: 'out'`); every update
 * derives the SAME clip string from `sawtoothClip` and writes it to both the
 * incoming black panel and the ferro canvas.
 *
 * `.ferro-stage` is a viewport-sized WebGL canvas mounted at document.body
 * level, z-index 25 — ABOVE `.takeover` (z-index 20). Left unclipped during
 * the sweep, the blob it renders hangs over the outgoing page rather than
 * riding inside the incoming black panel. It must never get its own tween:
 * two tweens "with matching numbers" drift against each other, and the
 * symptom is the blob bleeding past the panel's edge mid-sweep. One value,
 * one write per frame, both elements.
 */

import gsap from 'gsap';
import '../styles/emblem.css';
import { flyingCells, sawtoothClip } from './wipe-geometry';

const WIPE_DURATION_S = 1.1;
const WIPE_EASE = 'power2.inOut';

/** Beat 2: every emblem cell eases to full scale before the sweep (beat 3)
 *  continues — see contact/emblem.ts's `setFill` doc comment. Fast ease-out,
 *  ~0.25s, no pause before the sweep stage picks up. */
const FILL_DURATION_S = 0.25;
const FILL_EASE = 'power2.out';

export interface WipeTargets {
  panel: HTMLElement;
  ferro: HTMLElement | null;
  /** The emblem that was clicked (or is being reformed), if any. Structural
   *  rather than importing `Emblem` from contact/emblem.ts, to avoid a
   *  needless module coupling — any object with `setFill` will do. */
  emblem?: { setFill(t: number): void } | null;
}

// Only one wipe ever runs at a time (a page transition can't be mid-sweep in
// two directions at once). Killing the previous timeline before starting a
// new one avoids two timelines fighting over the same clip-path value — a
// documented failure mode in this codebase (see takeover.ts).
let activeTimeline: gsap.core.Timeline | null = null;

function buildFlyerLayer(): { el: HTMLDivElement; cells: HTMLSpanElement[] } {
  const el = document.createElement('div');
  el.className = 'wipe-flyers';
  // flyingCells() always returns the same length — build one node per entry,
  // once, and only ever update their transforms afterward.
  const cells = flyingCells(0).map(() => {
    const span = document.createElement('span');
    span.className = 'wipe-flyer';
    el.appendChild(span);
    return span;
  });
  return { el, cells };
}

function writeFlyers(cells: HTMLSpanElement[], t: number): void {
  const positions = flyingCells(t);
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const span = cells[i];
    span.style.left = `${p.x}%`;
    span.style.top = `${p.y}%`;
    span.style.width = `${p.size}px`;
    span.style.height = `${p.size}px`;
    span.style.transform = `translate(-50%, -50%) rotate(${p.rotate}deg)`;
  }
}

/**
 * Runs the wipe once. `dir: 'in'` sweeps the panel from nothing revealed to
 * fully covering; `dir: 'out'` runs the identical timeline in reverse. The
 * returned promise resolves when the timeline completes (or immediately,
 * under reduced motion).
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

  const layer = buildFlyerLayer();
  document.body.appendChild(layer.el);

  const state = { t: dir === 'in' ? 0 : 1 };
  const endT = dir === 'in' ? 1 : 0;

  const applyFrame = (t: number): void => {
    const clip = sawtoothClip(t);
    targets.panel.style.clipPath = clip;
    if (targets.ferro) targets.ferro.style.clipPath = clip;
    writeFlyers(layer.cells, t);
  };
  applyFrame(state.t); // paint the starting frame before the first tick

  return new Promise<void>((resolve) => {
    // Set on natural completion only — an interrupted run (killed by a
    // later runWipe call, see above) must not clear the clip out from under
    // the new run that's about to drive it.
    let completedNaturally = false;

    const finish = (): void => {
      activeTimeline = null;
      layer.el.remove();
      if (completedNaturally) {
        if (dir === 'in') {
          // At progress 1 the clip already covers everything, so clearing is
          // visually identical. A leftover clip-path on .ferro-stage would
          // clip the small corner blob on every later 2D page; a leftover
          // one on .takeover creates a containing block that changes how
          // fixed-position descendants resolve. Clear both.
          targets.panel.style.clipPath = '';
          if (targets.ferro) targets.ferro.style.clipPath = '';
        } else {
          // dir === 'out': asymmetric on purpose — do NOT clear the panel
          // here. At progress 0 the panel is clipped to nothing; clearing it
          // would flash the full outgoing page for the frame between this
          // promise resolving and takeover.ts's div.remove() actually
          // running. That leftover clip is harmless because the panel node
          // is about to be destroyed.
          //
          // The ferro stage is not about to be destroyed — it's a
          // long-lived, viewport-level canvas shared by every page,
          // including the small corner blob rendered on ordinary 2D pages.
          // Its clip DOES need clearing, or that blob stays invisible
          // site-wide until something unrelated happens to reset it.
          if (targets.ferro) targets.ferro.style.clipPath = '';
        }
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

    // Beat 2 (fill) and beat 3 (sweep) are ONE timeline, not two tweens
    // started alongside each other — two separately-eased animations
    // meeting at zero velocity reads as two animations, which the design
    // explicitly calls out to avoid. `dir: 'in'` fills first, then the sweep
    // continues immediately (GSAP timeline default: back-to-back, no gap).
    // `dir: 'out'` is the reverse in TIME, not just in value: the sweep
    // retreats first, and the emblem re-forms (unfills) over the final
    // FILL_DURATION_S as the panel finishes retreating.
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
    const addSweepTween = (): void => {
      tl.to(state, {
        t: endT,
        duration: WIPE_DURATION_S,
        ease: WIPE_EASE,
        onUpdate: () => applyFrame(state.t),
      });
    };

    if (dir === 'in') {
      addFillTween();
      addSweepTween();
    } else {
      addSweepTween();
      addFillTween();
    }
  });
}
