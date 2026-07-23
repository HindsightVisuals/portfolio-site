import gsap from 'gsap';
import '../styles/page2d.css';
import { takeoverReducer, type TakeoverState } from './takeover-state';

/** Swipe-up duration/ease for open() — see task-5-brief.md. */
export const SWIPE_IN_S = 0.9;
const EASE_IN = 'expo.out';
/** Swipe-down duration/ease for close(). */
export const SWIPE_OUT_S = 0.6;
const EASE_OUT = 'expo.in';

// Home-DOM elements that must go inert while a takeover is open.
const INERT_SELECTORS = ['.chrome', '.reticle-field'];

export interface TakeoverOpts {
  reducedMotion: boolean;
  onModeChange(mode: 'world' | 'takeover'): void;
}

export interface TakeoverHandle {
  open(page: HTMLElement, opts?: { pushHistory?: boolean }): Promise<void>;
  close(opts?: { fromPopstate?: boolean }): Promise<void>;
  isOpen(): boolean;
  destroy(): void;
}

/**
 * Owns "2D takeover" mode: a full-viewport `.takeover` container that
 * swipes up over the (still-running) canvas, hosting a caller-supplied DOM
 * page. Home chrome (`.chrome`, `.reticle-field`) is made inert/hidden from
 * assistive tech for the duration. History gets one `{ takeover: true }`
 * entry per open so the browser back button closes the takeover instead of
 * navigating away underneath it.
 */
export function initTakeover(opts: TakeoverOpts): TakeoverHandle {
  let state: TakeoverState = 'closed';
  let container: HTMLDivElement | null = null;
  let tween: gsap.core.Tween | null = null;
  // True only while the currently-open takeover owns the top history entry
  // we pushed — guards close()'s history.back() and is reset on every close.
  let historyPushed = false;
  // Set by destroy(). killing an in-flight tween resolves the awaited
  // promise below via onInterrupt, so runOpen/runClose must check this
  // before touching state/DOM/callbacks that destroy() already tore down.
  let destroyed = false;

  const setInert = (inert: boolean): void => {
    for (const sel of INERT_SELECTORS) {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) continue;
      if (inert) {
        el.setAttribute('inert', '');
        el.setAttribute('aria-hidden', 'true');
      } else {
        el.removeAttribute('inert');
        el.removeAttribute('aria-hidden');
      }
    }
  };

  async function runOpen(page: HTMLElement, o: { pushHistory?: boolean }): Promise<void> {
    const next = takeoverReducer(state, 'open');
    if (next === state) return; // already open/opening — no-op
    state = next;

    // "immediately on open-start", ahead of the mount/animate work below.
    opts.onModeChange('takeover');

    const div = document.createElement('div');
    div.className = 'takeover';
    div.tabIndex = -1;
    div.appendChild(page);
    document.body.appendChild(div);
    container = div;

    if (o.pushHistory !== false) {
      window.history.pushState({ takeover: true }, '', window.location.href);
      historyPushed = true;
    } else {
      historyPushed = false;
    }

    setInert(true);

    if (opts.reducedMotion) {
      gsap.set(div, { y: 0 });
    } else {
      gsap.set(div, { y: '100%' });
      await new Promise<void>((resolve) => {
        tween = gsap.to(div, {
          y: 0,
          duration: SWIPE_IN_S,
          ease: EASE_IN,
          onComplete: resolve,
          onInterrupt: resolve,
        });
      });
    }
    tween = null;

    if (destroyed || container !== div) return; // torn down mid-animation — bail
    page.focus();
    state = takeoverReducer(state, 'opened');
  }

  async function runClose(o: { fromPopstate?: boolean }): Promise<void> {
    const next = takeoverReducer(state, 'close');
    if (next === state) return; // already closed/closing — no-op
    state = next;

    const div = container;
    if (div) {
      if (opts.reducedMotion) {
        gsap.set(div, { y: '100%' });
      } else {
        await new Promise<void>((resolve) => {
          tween = gsap.to(div, {
            y: '100%',
            duration: SWIPE_OUT_S,
            ease: EASE_OUT,
            onComplete: resolve,
            onInterrupt: resolve,
          });
        });
      }
      tween = null;
      if (destroyed) return; // torn down mid-animation — destroy() already cleaned up
      if (container === div) {
        div.remove();
        container = null;
      }
    }

    setInert(false);
    opts.onModeChange('world');
    state = takeoverReducer(state, 'closed');

    const shouldGoBack = !o.fromPopstate && historyPushed;
    historyPushed = false;
    if (shouldGoBack) window.history.back();
  }

  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && state === 'open') void runClose({});
  };

  const onPopstate = (): void => {
    if (state === 'closed') return;
    const s = window.history.state as { takeover?: boolean } | null;
    if (s?.takeover) return; // still sitting on our pushed entry — nothing to do
    void runClose({ fromPopstate: true });
  };

  window.addEventListener('keydown', onKeydown);
  window.addEventListener('popstate', onPopstate);

  return {
    open(page: HTMLElement, o: { pushHistory?: boolean } = {}): Promise<void> {
      return runOpen(page, o);
    },
    close(o: { fromPopstate?: boolean } = {}): Promise<void> {
      return runClose(o);
    },
    isOpen(): boolean {
      return state !== 'closed';
    },
    destroy(): void {
      destroyed = true;
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('popstate', onPopstate);
      tween?.kill();
      tween = null;
      if (container) {
        gsap.killTweensOf(container);
        container.remove();
        container = null;
        setInert(false);
      }
      state = 'closed';
      historyPushed = false;
    },
  };
}
