import gsap from 'gsap';
import '../styles/page2d.css';
import { takeoverReducer, type TakeoverState } from './takeover-state';

/** Swipe-up duration/ease for open() — see task-5-brief.md. */
export const SWIPE_IN_S = 0.9;
const EASE_IN = 'expo.out';
/** Swipe-down duration/ease for close(). */
export const SWIPE_OUT_S = 0.6;
const EASE_OUT = 'expo.in';

// Home-DOM elements that must go inert while a takeover is open. `.screen-proxies`
// (home/screen-proxies.ts) holds the keyboard-only proxy buttons for the WORK
// tiles/ABOUT screen — those targets are covered by the takeover itself once
// open, so the proxies must stop being keyboard-reachable too.
const INERT_SELECTORS = ['.chrome', '.reticle-field', '.screen-proxies'];

export interface TakeoverOpts {
  reducedMotion: boolean;
  onModeChange(mode: 'world' | 'takeover'): void;
}

/**
 * A per-open animation hook: `in` plays once the takeover `div` is in the
 * DOM (it clips/reveals that element), `out` plays before it's removed.
 * Passed to `open()`; remembered internally for the matching `close()` so a
 * page that wipes in also wipes out without the caller passing it twice.
 */
export interface TakeoverTransition {
  in(div: HTMLElement): Promise<void>;
  out(div: HTMLElement): Promise<void>;
}

export interface TakeoverHandle {
  open(
    page: HTMLElement,
    opts?: { pushHistory?: boolean; transition?: TakeoverTransition }
  ): Promise<void>;
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
  // Set by destroy(). killing an in-flight tween resolves the awaited
  // promise below via onInterrupt, so runOpen/runClose must check this
  // before touching state/DOM/callbacks that destroy() already tore down.
  let destroyed = false;
  // The reducer no-ops a close event while `opening` (only 'opened' moves it
  // forward), so a popstate that lands mid-open-tween can't close the
  // overlay right away even though the browser has already popped our
  // history entry by that point. Remember it here and finish the close for
  // real once the open transition reaches 'open'.
  let pendingPopClose = false;
  // The element focused immediately before open() ran (typically the reticle
  // or tile that triggered the journey), captured fresh on every open so
  // close() can hand focus back somewhere sensible instead of dropping it to
  // <body> when the focused takeover article is removed from the DOM. Null
  // when nothing meaningful was focused (or it's since left the document).
  let previouslyFocused: HTMLElement | null = null;
  // The transition given at open() is stored for the matching close(), so a
  // page that wipes in also wipes out without the caller having to remember.
  // Cleared by runClose once it's captured the `out` to run.
  let activeTransition: TakeoverTransition | null = null;

  const topIsTakeover = (): boolean =>
    (window.history.state as { takeover?: boolean } | null)?.takeover === true;

  // Saved inert/aria-hidden state per home element, captured when the takeover
  // makes them inert on open and restored on close. Restoring (rather than
  // unconditionally removing) is essential: home-visibility.ts owns the home
  // DOM's fade-inert and has already set `inert` on `.reticle-field` by the
  // time a takeover opens over a framed WORK tile. If close() blindly removed
  // `inert`, the faded reticle field would become interactive again — with no
  // home-visibility rewrite guaranteed to re-assert it (its per-frame update
  // short-circuits when opacity is unchanged, and reduced motion has no frame
  // loop at all). Saving+restoring keeps the two writers non-conflicting.
  const priorInertState = new Map<Element, { inert: boolean; ariaHidden: string | null }>();
  const setInert = (inert: boolean): void => {
    for (const sel of INERT_SELECTORS) {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) continue;
      if (inert) {
        priorInertState.set(el, {
          inert: el.hasAttribute('inert'),
          ariaHidden: el.getAttribute('aria-hidden'),
        });
        el.setAttribute('inert', '');
        el.setAttribute('aria-hidden', 'true');
      } else {
        const prev = priorInertState.get(el);
        priorInertState.delete(el);
        if (prev?.inert) el.setAttribute('inert', '');
        else el.removeAttribute('inert');
        if (prev && prev.ariaHidden !== null) el.setAttribute('aria-hidden', prev.ariaHidden);
        else el.removeAttribute('aria-hidden');
      }
    }
  };

  // Default transition: the existing swipe up/down. Used whenever open()
  // doesn't pass a `transition`.
  const swipeIn = (div: HTMLElement): Promise<void> => {
    if (opts.reducedMotion) {
      gsap.set(div, { y: 0 });
      return Promise.resolve();
    }
    gsap.set(div, { y: '100%' });
    return new Promise<void>((resolve) => {
      tween = gsap.to(div, {
        y: 0,
        duration: SWIPE_IN_S,
        ease: EASE_IN,
        onComplete: resolve,
        onInterrupt: resolve,
      });
    });
  };

  const swipeOut = (div: HTMLElement): Promise<void> => {
    if (opts.reducedMotion) {
      gsap.set(div, { y: '100%' });
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      tween = gsap.to(div, {
        y: '100%',
        duration: SWIPE_OUT_S,
        ease: EASE_OUT,
        onComplete: resolve,
        onInterrupt: resolve,
      });
    });
  };

  async function runOpen(
    page: HTMLElement,
    o: { pushHistory?: boolean; transition?: TakeoverTransition }
  ): Promise<void> {
    const next = takeoverReducer(state, 'open');
    if (next === state) return; // already open/opening — no-op
    state = next;
    activeTransition = o.transition ?? null;

    previouslyFocused =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null;

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
    }

    setInert(true);

    try {
      await (activeTransition?.in ?? swipeIn)(div);
    } catch (err) {
      // A caller-supplied transition rejecting (or throwing synchronously)
      // must not strand the state machine mid-'opening' forever — the page
      // is already appended, so still fall through to advance to 'opened'
      // below; it just won't have animated in.
      console.error('[takeover] open transition failed:', err);
    } finally {
      tween = null;
    }

    if (destroyed || container !== div) return; // torn down mid-animation — bail
    page.focus();
    state = takeoverReducer(state, 'opened');

    if (pendingPopClose) {
      // A back navigation landed while we were still opening (see the flag's
      // doc comment) — finish what it started now that 'close' is a valid
      // transition again.
      pendingPopClose = false;
      void runClose({ fromPopstate: true });
    }
  }

  async function runClose(o: { fromPopstate?: boolean }): Promise<void> {
    const next = takeoverReducer(state, 'close');
    if (next === state) return; // already closed/closing — no-op
    state = next;

    const div = container;
    const runOut = activeTransition?.out ?? swipeOut;
    activeTransition = null;
    if (div) {
      try {
        await runOut(div);
      } catch (err) {
        // A caller-supplied transition rejecting (or throwing synchronously)
        // must not leave a dead full-screen panel on top of the site with
        // no way to dismiss it — div.remove() and the state advance to
        // 'closed' below still have to run unconditionally.
        console.error('[takeover] close transition failed:', err);
      } finally {
        tween = null;
      }
      if (destroyed) return; // torn down mid-animation — destroy() already cleaned up
      if (container === div) {
        div.remove();
        container = null;
      }
    }

    setInert(false);
    opts.onModeChange('world');

    // Hand focus back to whatever triggered this open (a reticle, a framed
    // tile's canvas click leaves nothing focusable so this is a no-op, a
    // navbar button, …) — the article that held focus is already removed
    // from the DOM above, so without this the browser would drop focus to
    // <body>. Guard against a target that's left the document since (e.g. a
    // reticle whose field went inert/faded while the takeover was open).
    const toFocus = previouslyFocused;
    previouslyFocused = null;
    if (toFocus && document.contains(toFocus) && !toFocus.closest('[inert]')) toFocus.focus();

    state = takeoverReducer(state, 'closed');

    // "the takeover state is on top" — read live, not a locally-tracked
    // flag: a popstate that fired earlier (e.g. mid-opening, see
    // pendingPopClose) already popped our pushed entry off the real
    // history stack, and a stale flag would call back() a second time here.
    if (!o.fromPopstate && topIsTakeover()) window.history.back();
  }

  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && state === 'open') void runClose({});
  };

  const onPopstate = (): void => {
    if (state === 'closed') return;
    if (topIsTakeover()) return; // still sitting on our pushed entry — nothing to do
    if (state === 'opening') {
      // Can't close for real yet — the reducer no-ops 'close' while
      // opening. The history entry is already gone though, so finish this
      // once the open transition lands (see runOpen).
      pendingPopClose = true;
      return;
    }
    void runClose({ fromPopstate: true });
  };

  window.addEventListener('keydown', onKeydown);
  window.addEventListener('popstate', onPopstate);

  return {
    open(
      page: HTMLElement,
      o: { pushHistory?: boolean; transition?: TakeoverTransition } = {}
    ): Promise<void> {
      return runOpen(page, o);
    },
    close(o: { fromPopstate?: boolean } = {}): Promise<void> {
      return runClose(o);
    },
    isOpen(): boolean {
      return state !== 'closed';
    },
    destroy(): void {
      // Teardown, not a close() — deliberately does not call
      // opts.onModeChange('world'). The wiring layer (Task 12) is
      // responsible for its own mode state when it tears this controller
      // down; assuming 'world' here would be wrong if destroy() is ever
      // called for reasons other than leaving takeover mode.
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
      pendingPopClose = false;
    },
  };
}
