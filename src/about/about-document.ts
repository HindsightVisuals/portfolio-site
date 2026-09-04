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
  footer?: (gate: HTMLElement) => HTMLElement,
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

  // The scroll-gate indicator. --gate (0..1) is written per wheel event by
  // about-gate-control.ts; this only presents it. See about.css for the fill mapping.
  //
  // Built here — about-document.ts still owns the corridor's document shape
  // — but no longer appended to the beat directly. Per the designer's mockup
  // (Figma 110:2) it lives INSIDE the footer's own bottom band, as the
  // remaining-width sibling of the WORK/ABOUT/CONTACT nav column, not
  // floating over the world — so it is handed to `footer` as its `gate` slot
  // instead.
  const gate = document.createElement('div');
  gate.className = 'about-gate';
  const gateLabel = document.createElement('p');
  gateLabel.className = 'about-gate-label';
  gateLabel.textContent = 'keep scrolling to return home';
  const gateTrack = document.createElement('div');
  gateTrack.className = 'about-gate-track';
  const gateFill = document.createElement('div');
  gateFill.className = 'about-gate-fill';
  gateTrack.appendChild(gateFill);
  gate.append(gateLabel, gateTrack);

  // The footer (and, inside it, the gate above) lives in the last beat: it IS
  // the end of the page, and the gate is scroll pushed against it.
  //
  // .about-beat-footer (about.css) is a modifier scoped to this one section,
  // not a `[data-beat="ai"]` selector in the stylesheet: about.css should not
  // have to know which marker id happens to be last, only that this beat is
  // the one carrying the footer. Added unconditionally — it marks the beat's
  // role in the corridor, not whether a footer factory was actually passed in
  // (tests that mount without one still get the beat that WOULD hold it).
  const lastSection = sections.get(ABOUT_MARKERS[ABOUT_MARKERS.length - 1].id)!;
  lastSection.classList.add('about-beat-footer');
  if (footer) lastSection.appendChild(footer(gate));

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
