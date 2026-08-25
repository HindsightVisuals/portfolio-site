import '../styles/about.css';
import { ABOUT_MARKERS, type BeatId } from './about-markers';
import type { AboutPath } from './about-path';
import { documentHeightFor } from './about-scrub';

/**
 * The About corridor's scrollbar.
 *
 * The camera is driven by scroll offset, so something has to be scrollable. It
 * is a real document rather than a synthetic scroll accumulator for two
 * reasons the spec is explicit about: the copy has to be selectable and read in
 * order with the canvas gone, and reduced motion is then almost free — it is
 * simply what remains when the canvas is removed.
 *
 * Sections are EMPTY. This module owns the scroll geometry and nothing else;
 * beat content arrives in later plans and mounts into sectionFor(id).
 */

/** Heading per beat. Placeholder copy — Adam is rewriting all of it. */
const HEADINGS: Record<BeatId, string> = {
  anchor: 'About',
  transition: 'About',
  lander: 'We are digital nomads',
  team: 'The team',
  clientWall: 'Selected clients',
  capabilities: 'What we do',
  contact: 'Start a project',
  ai: 'On AI',
};

export interface AboutDocument {
  root: HTMLElement;
  sectionFor(id: BeatId): HTMLElement;
  resize(viewportH: number): void;
  destroy(): void;
}

export function mountAboutDocument(
  parent: HTMLElement,
  path: AboutPath,
  viewportH: number,
  footer?: () => HTMLElement,
): AboutDocument {
  const root = document.createElement('main');
  root.className = 'about-doc';

  const sections = new Map<BeatId, HTMLElement>();
  for (const m of ABOUT_MARKERS) {
    const section = document.createElement('section');
    section.className = 'about-beat';
    section.dataset.beat = m.id;
    const h = document.createElement('h2');
    h.className = 'about-beat-heading';
    h.textContent = HEADINGS[m.id];
    section.appendChild(h);
    sections.set(m.id, section);
    root.appendChild(section);
  }

  // The footer lives in the last beat: it IS the end of the page, and the
  // gate is scroll pushed against it.
  if (footer) sections.get(ABOUT_MARKERS[ABOUT_MARKERS.length - 1].id)!.appendChild(footer());

  /**
   * Height per beat, proportional to that beat's span of the path.
   *
   * This is what keeps scroll and camera in step: a beat covering a long
   * stretch of path needs a correspondingly tall section, or the camera races
   * through it while the reader is still on the first paragraph. The last beat
   * has no successor, so it gets one viewport — enough to come to rest on.
   */
  const layout = (h: number): void => {
    const total = documentHeightFor(path, h);
    const scrubbable = total - h;
    for (let i = 0; i < ABOUT_MARKERS.length; i++) {
      const id = ABOUT_MARKERS[i].id;
      const last = i === ABOUT_MARKERS.length - 1;
      const span = last ? 0 : path.tForBeat(ABOUT_MARKERS[i + 1].id) - path.tForBeat(id);
      const px = last ? h : span * scrubbable;
      sections.get(id)!.style.height = `${px}px`;
    }
  };

  layout(viewportH);
  parent.appendChild(root);

  return {
    root,
    sectionFor(id: BeatId): HTMLElement {
      return sections.get(id)!;
    },
    resize(h: number): void {
      layout(h);
    },
    destroy(): void {
      root.remove();
      sections.clear();
    },
  };
}
