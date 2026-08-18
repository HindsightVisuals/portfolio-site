/**
 * Drives the pinned horizontal strip from the takeover's scroll position.
 *
 * The section is a tall spacer; the rail inside it is `position: sticky`, so it
 * holds still on screen while the section passes, and this module translates it
 * sideways over exactly that distance. Nothing intercepts the wheel — the page
 * stays flick-scrollable and keyboard-navigable, and the takeover's own scroll
 * handling is untouched.
 *
 * The mapping itself lives in `strip-scroll.ts` and is tested there.
 */

import { stripScrollLength, stripTransform } from './strip-scroll';
import { offsetWithin } from './scroll-offset';

export interface Strip {
  /** Recompute after a resize or a font/content reflow. */
  measure(): void;
  destroy(): void;
}

export function initStrip(article: HTMLElement): Strip | null {
  const section = article.querySelector<HTMLElement>('.cs-strip');
  const rail = article.querySelector<HTMLElement>('.cs-strip-rail');
  const scroller = article.closest<HTMLElement>('.takeover');
  if (!section || !rail || !scroller) return null;

  let stripWidth = 0;
  let sectionTop = 0;
  let raf = 0;

  const measure = (): void => {
    // scrollWidth, not getBoundingClientRect: the rail is already translated,
    // and its laid-out content width is what the travel is derived from.
    stripWidth = rail.scrollWidth;
    // Scroll-space offset, not offsetTop — see scroll-offset.ts.
    sectionTop = offsetWithin(section, scroller);
    // The section must be tall enough to scroll through the whole travel, plus
    // one viewport for the sticky rail itself to occupy.
    const travel = stripScrollLength(stripWidth, scroller.clientWidth);
    section.style.height = `${travel + scroller.clientHeight}px`;
    apply();
  };

  const apply = (): void => {
    const { x } = stripTransform(scroller.scrollTop, sectionTop, stripWidth, scroller.clientWidth);
    rail.style.transform = `translate3d(${x}px, 0, 0)`;
  };

  const onScroll = (): void => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      apply();
    });
  };

  scroller.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', measure);
  measure();
  // Re-measure once the display webfont lands: every offset here is derived
  // from laid-out text, and the first measure happens while the fallback is
  // still in place. Same reason world.ts redraws its tile labels on
  // document.fonts.ready.
  void document.fonts?.ready.then(measure).catch(() => {});

  return {
    measure,
    destroy(): void {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      if (raf) cancelAnimationFrame(raf);
    },
  };
}
