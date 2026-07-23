import '../styles/page2d.css';
import { getProject } from '../content/projects';
import { nextSlug } from '../three/world';
import { revealSections } from './reveal';

export interface CaseStudyOpts {
  reducedMotion: boolean;
  onNext(slug: string): void;
  navbar: HTMLElement;
  /**
   * When true, skip the internal `revealSections` call — the caller (the
   * Task 12 wiring) will run `mountReveal` AFTER the takeover mounts this
   * article, so the scroll observer binds to the real `.takeover` root
   * instead of the viewport-root fallback. See reveal.ts.
   */
  deferReveal?: boolean;
}

/** Decorative 16/9 placeholder block — future media slots (F14+) render into these. */
function mediaPlaceholder(): HTMLDivElement {
  const ph = document.createElement('div');
  ph.className = 'media-ph';
  ph.setAttribute('aria-hidden', 'true');
  return ph;
}

function metaColumn(label: string, value: string): HTMLDivElement {
  const col = document.createElement('div');
  col.className = 'cs-meta-col';

  const dt = document.createElement('div');
  dt.className = 'cs-meta-label';
  dt.textContent = label;

  const dd = document.createElement('div');
  dd.className = 'cs-meta-value';
  dd.textContent = value; // project data is repo-controlled JSON, but still textContent — never innerHTML

  col.append(dt, dd);
  return col;
}

/**
 * Builds the `<article class="case-study">` for a single project's takeover
 * page: `opts.navbar` (Task 7) up top, then every content section inside a
 * `.takeover-body` wrapper per the Task 7 structural contract — `.takeover`
 * itself paints no background, so anything outside `.takeover-body` would
 * let the live canvas bleed through.
 *
 * Section order is spec D9: hero · meta · brief · process · final · next.
 * Every section starts hidden and is revealed once via a single shared
 * `IntersectionObserver` (see reveal.ts) as it scrolls into view.
 */
export function buildCaseStudy(slug: string, opts: CaseStudyOpts): HTMLElement {
  const project = getProject(slug);

  const article = document.createElement('article');
  article.className = 'case-study';
  article.tabIndex = -1; // takeover.ts calls page.focus() on this element after the swipe-in

  const body = document.createElement('div');
  body.className = 'takeover-body';

  // --- .cs-hero ---
  const hero = document.createElement('section');
  hero.className = 'cs-hero';
  const heroTitle = document.createElement('h1');
  heroTitle.className = 'cs-hero-title';
  heroTitle.textContent = project.title;
  hero.append(heroTitle);
  // TODO(F14): sizzle — replace this static #141414 block with a looping sizzle reel

  // --- .cs-meta ---
  const meta = document.createElement('section');
  meta.className = 'cs-meta';
  meta.append(
    metaColumn('Client', project.client),
    metaColumn('Role', project.role),
    metaColumn('Year', project.year),
    metaColumn('Tools', project.tools.join(', '))
  );

  // --- .cs-brief ---
  const brief = document.createElement('section');
  brief.className = 'cs-brief';
  const briefText = document.createElement('p');
  briefText.textContent = project.brief;
  brief.append(briefText);

  // --- .cs-process ---
  const process = document.createElement('section');
  process.className = 'cs-process';
  const processList = document.createElement('ul');
  processList.className = 'cs-process-list';
  for (const step of project.process) {
    const li = document.createElement('li');
    li.textContent = step;
    processList.append(li);
  }
  const processMedia = document.createElement('div');
  processMedia.className = 'cs-process-media';
  processMedia.append(mediaPlaceholder(), mediaPlaceholder(), mediaPlaceholder());
  process.append(processList, processMedia);

  // --- .cs-final ---
  const final = document.createElement('section');
  final.className = 'cs-final';
  const finalGrid = document.createElement('div');
  finalGrid.className = 'cs-final-grid';
  project.deliverables.forEach(() => finalGrid.append(mediaPlaceholder()));
  final.append(finalGrid);

  // --- .cs-next ---
  const next = document.createElement('section');
  next.className = 'cs-next';
  const followingSlug = nextSlug(slug);
  const followingProject = getProject(followingSlug);
  const nextLink = document.createElement('button');
  nextLink.type = 'button';
  nextLink.className = 'cs-next-link';
  nextLink.textContent = `Next — ${followingProject.title} →`;
  nextLink.addEventListener('click', () => opts.onNext(nextSlug(slug)));
  next.append(nextLink);

  const sections = [hero, meta, brief, process, final, next];
  body.append(...sections);
  article.append(opts.navbar, body);

  if (!opts.deferReveal) {
    revealSections(article, sections, { reducedMotion: opts.reducedMotion });
  }

  return article;
}
