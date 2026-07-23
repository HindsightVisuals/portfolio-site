import gsap from 'gsap';

/** Reveal tween duration (s), paired with `power2.out`. */
const REVEAL_DURATION_S = 0.7;
const REVEAL_EASE = 'power2.out';
/** Rest-state offset (px) sections start translated down by, before reveal. */
const REVEAL_Y_PX = 24;
/** IntersectionObserver threshold — 15% of the section must be visible. */
const REVEAL_THRESHOLD = 0.15;

export interface RevealOpts {
  reducedMotion: boolean;
  scrollRoot?: Element | null;
}

/**
 * Scroll-reveal for a set of `sections`: each starts `opacity: 0;
 * translateY(24px)` and tweens once (0.7s power2.out) to its resting state
 * the first time it crosses 15% visibility, driven by a single shared
 * `IntersectionObserver` (not one per section). Reduced motion skips the
 * observer entirely and snaps every section to its visible resting state.
 *
 * `root` is the page element the `sections` live in — used to resolve the
 * observer's `root` option (`.takeover` is the actual scroll container per
 * page2d.css, NOT the window) when `opts.scrollRoot` isn't given explicitly.
 * That lookup only succeeds once `root` is attached to the document; if it
 * isn't yet (callers typically build a page before a takeover controller
 * mounts it), this falls back to the default viewport root, which is
 * geometrically equivalent here since `.takeover` is always
 * `position: fixed; inset: 0`.
 *
 * Returns a cleanup function that disconnects the observer — callers must
 * invoke it on teardown so a since-removed page doesn't leak an observer.
 */
export function revealSections(
  root: HTMLElement,
  sections: HTMLElement[],
  opts: { reducedMotion: boolean; scrollRoot?: Element | null }
): () => void {
  if (opts.reducedMotion) {
    for (const section of sections) {
      gsap.set(section, { opacity: 1, y: 0 });
    }
    return () => {};
  }

  for (const section of sections) {
    gsap.set(section, { opacity: 0, y: REVEAL_Y_PX });
  }

  const scrollRoot = opts.scrollRoot !== undefined ? opts.scrollRoot : root.closest('.takeover');

  // Callers (buildCaseStudy's binding API returns only an HTMLElement, with
  // no disposal channel back to this observer) may never invoke the
  // returned cleanup fn — self-disconnecting once every section has
  // revealed covers the common "user scrolled the whole page" case even
  // then; the returned fn remains the only way to stop early (e.g. the page
  // is discarded mid-scroll).
  let remaining = sections.length;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        observer.unobserve(el); // reveal once
        remaining -= 1;
        gsap.to(el, { opacity: 1, y: 0, duration: REVEAL_DURATION_S, ease: REVEAL_EASE });
      }
      if (remaining <= 0) observer.disconnect();
    },
    { root: scrollRoot, threshold: REVEAL_THRESHOLD }
  );

  for (const section of sections) observer.observe(section);

  return () => observer.disconnect();
}

/**
 * Mount-time wrapper around `revealSections` for takeover pages (Task 12):
 * call this AFTER the page `article` is attached to its `.takeover` scroll
 * container (i.e. after `takeover.open()` has synchronously appended it), so
 * the observer binds to the REAL scroll root rather than silently falling
 * back to the viewport. Queries the article's own `<section>` children — the
 * page builders (case-study.ts, about.ts) skip their internal
 * `revealSections` call when built with `deferReveal: true`, handing that
 * responsibility here.
 *
 * `scrollRoot` defaults to the article's enclosing `.takeover`; pass one
 * explicitly to override. Returns the same cleanup fn `revealSections` does.
 */
export function mountReveal(
  article: HTMLElement,
  opts: { reducedMotion: boolean; scrollRoot?: Element | null }
): () => void {
  const sections = Array.from(article.querySelectorAll<HTMLElement>('section'));
  const scrollRoot =
    opts.scrollRoot !== undefined ? opts.scrollRoot : article.closest('.takeover');
  return revealSections(article, sections, {
    reducedMotion: opts.reducedMotion,
    scrollRoot,
  });
}
