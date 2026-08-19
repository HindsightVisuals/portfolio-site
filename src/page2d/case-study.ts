import '../styles/page2d.css';
import '../styles/case-study.css';
import { getProject, type Project } from '../content/projects';
import { nextSlug, prevSlug } from '../three/world';
import { tileStillUrl } from '../work/tiles';
import { revealSections } from './reveal';
import { buildCurtain } from './curtain';

export interface CaseStudyOpts {
  reducedMotion: boolean;
  onNext(slug: string): void;
  /** Close the page — the curtain is the close affordance (brief 7.9). */
  onClose(): void;
  navbar: HTMLElement;
  /**
   * When true, skip the internal `revealSections` call — the caller (the
   * Task 12 wiring) will run `mountReveal` AFTER the takeover mounts this
   * article, so the scroll observer binds to the real `.takeover` root
   * instead of the viewport-root fallback. See reveal.ts.
   */
  deferReveal?: boolean;
}

/**
 * The archival tag chip — 9px mono, 1.26px tracking, hairline #676767 box.
 * Figma uses it in the title block, the hero and the footer, so it lives here
 * once rather than being rebuilt per section.
 */
function tag(text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = 'cs-tag';
  el.textContent = text;
  return el;
}

function tagStrip(...labels: string[]): HTMLDivElement {
  const strip = document.createElement('div');
  strip.className = 'cs-tags';
  strip.append(...labels.map(tag));
  return strip;
}

/** A `label:` / value pair in the hero's meta card. Values may be a list. */
function metaBlock(label: string, value: string | string[]): HTMLDivElement {
  const block = document.createElement('div');
  block.className = 'cs-meta-block';

  const dt = document.createElement('div');
  dt.className = 'cs-meta-label';
  dt.textContent = `${label}:`;
  block.append(dt);

  const dd = document.createElement('div');
  dd.className = 'cs-meta-value';
  if (Array.isArray(value)) {
    // Figma renders these as dash-prefixed lines, not bullets.
    for (const item of value) {
      const line = document.createElement('div');
      line.textContent = `-${item.toLowerCase()}`;
      dd.append(line);
    }
  } else {
    dd.textContent = value; // repo-controlled JSON, but still textContent — never innerHTML
  }
  block.append(dd);
  return block;
}

/** The project's archival id tags, derived so every project gets a consistent set. */
function projectTags(project: Project): HTMLDivElement {
  const num = String(project.order).padStart(3, '0');
  const field = (project.disciplines[0] ?? 'work').toUpperCase();
  const id = `ID/${project.slug.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  return tagStrip(`PROJ. #${num}`, `CREATION : ${field}`, id);
}

/**
 * A link to the previous or next project, carrying that project's own
 * thumbnail. A <button> rather than a card with a click handler so it is
 * keyboard-reachable and announces itself.
 */
function neighbourCard(
  label: string,
  slug: string,
  onJump: (slug: string) => void,
): HTMLButtonElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'cs-neighbour';
  card.setAttribute('aria-label', `${label} project: ${getProject(slug).title}`);

  const img = document.createElement('img');
  img.className = 'cs-neighbour-img';
  img.src = tileStillUrl(slug);
  img.alt = '';
  // Below the fold on every case study, so there is no reason to block on it.
  img.loading = 'lazy';
  img.decoding = 'async';

  const meta = document.createElement('span');
  meta.className = 'cs-neighbour-meta';
  const kicker = document.createElement('span');
  kicker.className = 'cs-neighbour-kicker';
  kicker.textContent = label;
  const title = document.createElement('span');
  title.className = 'cs-neighbour-title';
  title.textContent = getProject(slug).title;
  meta.append(kicker, title);

  card.append(img, meta);
  card.addEventListener('click', () => onJump(slug));
  return card;
}

/** Decorative 16/9 placeholder block — future media slots (F14+) render into these. */
function mediaPlaceholder(): HTMLDivElement {
  const ph = document.createElement('div');
  ph.className = 'media-ph';
  ph.setAttribute('aria-hidden', 'true');
  return ph;
}

/**
 * The pinned horizontal strip (Figma `Frame 32`, 8165px wide).
 *
 * A tall spacer with a `position: sticky` rail inside it: page scroll through
 * the spacer drives the rail sideways. No wheel interception, so the takeover's
 * existing scroll handling, flick-scrolling and keyboard navigation all keep
 * working. `strip-scroll.ts` owns the scroll -> translateX mapping.
 *
 * The first panel is the logo's landing pad — C2 pins the 3D logo to this
 * element's rect, so it travels off-screen with the rail for free.
 */
function buildStrip(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'cs-strip reveal';

  const rail = document.createElement('div');
  rail.className = 'cs-strip-rail';

  const landing = document.createElement('div');
  landing.className = 'cs-strip-panel cs-strip-panel--landing';
  landing.dataset.logoLanding = 'true'; // C2 tracks this rect
  rail.append(landing);

  // Four following panels, at the Figma frame's relative widths.
  for (const w of [1911, 710, 1936, 1962]) {
    const panel = document.createElement('div');
    panel.className = 'cs-strip-panel';
    panel.style.setProperty('--panel-w', `${w}px`);
    panel.append(mediaPlaceholder());
    rail.append(panel);
  }

  section.append(rail);
  return section;
}

/**
 * Builds the `<article class="case-study">` for a single project's takeover
 * page: `opts.navbar` up top, then every content section inside a
 * `.takeover-body` wrapper per the Task 7 structural contract — `.takeover`
 * itself paints no background, so anything outside `.takeover-body` would let
 * the live canvas bleed through.
 *
 * Section order follows the Figma frame `24:1108`: curtain · title · hero ·
 * statement · logo-goes-behind · statement+brief · strip · images · footer.
 * Every section starts hidden and is revealed once via a single shared
 * IntersectionObserver (see reveal.ts) as it scrolls into view.
 *
 * NOTE the page is DARK — it inverts the site's light palette. The tokens live
 * in case-study.css, scoped to `.case-study`, so nothing else is affected.
 */
export function buildCaseStudy(slug: string, opts: CaseStudyOpts): HTMLElement {
  const project = getProject(slug);

  const article = document.createElement('article');
  article.className = 'case-study';
  article.tabIndex = -1; // takeover.ts calls page.focus() on this element after the swipe-in
  article.append(opts.navbar);

  const body = document.createElement('div');
  body.className = 'takeover-body';

  // The curtain is a sibling of the painted content, not inside it: the region
  // ABOVE its wave has to stay transparent so the live canvas shows through.
  // Everything that paints the dark ground goes in .cs-content, which scrolls
  // underneath the sticky curtain.
  body.append(buildCurtain({ reducedMotion: opts.reducedMotion, onClose: opts.onClose }));

  const content = document.createElement('div');
  content.className = 'cs-content';

  // --- title block -------------------------------------------------------
  const header = document.createElement('header');
  header.className = 'cs-title reveal';

  const marks = document.createElement('div');
  marks.className = 'cs-marks';
  marks.setAttribute('aria-hidden', 'true');
  marks.append(document.createElement('span'), document.createElement('span'));
  header.append(marks);

  const titleRow = document.createElement('div');
  titleRow.className = 'cs-title-row';

  const h1 = document.createElement('h1');
  h1.className = 'cs-title-text';
  h1.textContent = project.title;

  const titleMeta = document.createElement('div');
  titleMeta.className = 'cs-title-meta';
  titleMeta.append(projectTags(project));

  titleRow.append(h1, titleMeta);
  header.append(titleRow);
  content.append(header);

  // --- hero: meta card + the 3D logo stage -------------------------------
  const hero = document.createElement('section');
  hero.className = 'cs-hero reveal';

  const metaCol = document.createElement('div');
  metaCol.className = 'cs-meta-col';
  metaCol.append(projectTags(project));

  const card = document.createElement('div');
  card.className = 'cs-meta-card';
  const cardInner = document.createElement('div');
  cardInner.className = 'cs-meta-card-inner';
  cardInner.append(
    metaBlock('client', project.client),
    metaBlock('ask', project.brief),
    metaBlock('tools', project.tools),
    metaBlock('roles', project.disciplines),
  );
  card.append(cardInner);
  metaCol.append(card);

  // The 3D logo renders into its own canvas above the page; this is the panel
  // it is framed against, and C2 tracks this rect.
  const stage = document.createElement('div');
  stage.className = 'cs-stage';
  stage.dataset.logoStage = 'true';

  hero.append(metaCol, stage);
  content.append(hero);

  // --- statement ---------------------------------------------------------
  const statement = document.createElement('section');
  statement.className = 'cs-statement reveal';
  const statementText = document.createElement('h2');
  statementText.className = 'cs-statement-text';
  statementText.textContent = project.statement;
  statement.append(statementText);
  content.append(statement);

  // --- the panel the logo passes behind (brief 7.4, 7.6) -----------------
  const behind = document.createElement('section');
  behind.className = 'cs-behind reveal';
  const behindPanel = document.createElement('div');
  behindPanel.className = 'cs-behind-panel';
  behindPanel.dataset.magnetic = 'true'; // C4: magnetism + the "visit site" cursor
  if (project.url) {
    behindPanel.dataset.href = project.url;
    behindPanel.dataset.cta = project.cta;
  }
  behindPanel.append(mediaPlaceholder());
  behind.append(behindPanel);
  content.append(behind);

  // --- statement repeat + the brief paragraph ----------------------------
  const restate = document.createElement('section');
  restate.className = 'cs-restate reveal';
  const restateText = document.createElement('h2');
  restateText.className = 'cs-statement-text';
  restateText.textContent = project.statement;
  const restateBrief = document.createElement('p');
  restateBrief.className = 'cs-restate-brief';
  restateBrief.textContent = project.brief;
  restate.append(restateText, restateBrief);
  content.append(restate);

  // --- pinned horizontal strip -------------------------------------------
  content.append(buildStrip());

  // --- previous / next project -------------------------------------------
  // These two blocks used to be decorative placeholders. They now carry the
  // neighbouring projects' own thumbnails and jump straight INTO that case
  // study rather than dropping you back out to the work wall (Adam,
  // 2026-08-18).
  const images = document.createElement('section');
  images.className = 'cs-images reveal';
  images.append(
    neighbourCard('previous', prevSlug(project.slug), opts.onNext),
    neighbourCard('next', nextSlug(project.slug), opts.onNext),
  );
  content.append(images);

  // --- footer -------------------------------------------------------------
  content.append(buildFooter(project, opts.onNext));

  body.append(content);
  article.append(body);
  if (!opts.deferReveal) {
    const sections = Array.from(article.querySelectorAll<HTMLElement>('section, .reveal'));
    revealSections(article, sections, { reducedMotion: opts.reducedMotion });
  }
  return article;
}

/**
 * The page footer: the RD-filled COMMMS mark (C3 fills it live; C1 renders the
 * letterforms), the contact block, and the archival meta strip.
 */
function buildFooter(project: Project, onNext: (slug: string) => void): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'cs-footer reveal';

  // The big wordmark. C3 masks a live RD field to these letterforms; until then
  // it renders as plain type, which is the correct fallback either way.
  const mark = document.createElement('div');
  mark.className = 'cs-footer-mark';
  mark.dataset.rdMask = 'true';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = 'commms';
  footer.append(mark);

  const heading = document.createElement('h2');
  heading.className = 'cs-footer-heading';
  heading.textContent = 'let’s commmunicate';
  footer.append(heading);

  const contact = document.createElement('div');
  contact.className = 'cs-footer-contact';

  const primary = document.createElement('div');
  primary.className = 'cs-footer-col';
  primary.append(tagStrip('PRIMARY', 'EMAIL'));
  const email = document.createElement('a');
  email.className = 'cs-footer-link cs-footer-link--lg';
  email.href = 'mailto:adam.tarr.studio@gmail.com';
  email.textContent = 'adam.tarr.studio@gmail.com';
  primary.append(email);

  const social = document.createElement('div');
  social.className = 'cs-footer-col';
  social.append(tagStrip('SECONDARY', 'SOCIAL'));
  for (const [label, href] of [
    ['linkedin', 'https://www.linkedin.com/'],
    ['instagram', 'https://www.instagram.com/'],
    ['youtube', 'https://www.youtube.com/'],
  ] as Array<[string, string]>) {
    const a = document.createElement('a');
    a.className = 'cs-footer-link';
    a.href = href;
    a.rel = 'noopener noreferrer';
    a.target = '_blank';
    a.textContent = label;
    social.append(a);
  }

  contact.append(primary, social);
  footer.append(contact);

  const availability = document.createElement('p');
  availability.className = 'cs-footer-availability';
  availability.textContent =
    'Available for select freelance · open to senior in-house roles · reply within 2 business days.';
  footer.append(availability);

  // Next project — the one navigational control in the footer, and the only
  // thing here that drives the 3D world rather than leaving the site.
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'cs-footer-next';
  const upcoming = nextSlug(project.slug);
  next.textContent = `next — ${getProject(upcoming).title.toLowerCase()}`;
  next.addEventListener('click', () => onNext(upcoming));
  footer.append(next);

  const strip = document.createElement('div');
  strip.className = 'cs-footer-strip';
  for (const text of [
    '© 2026 · A. TARR',
    `END OF FILE · PG ${String(project.order).padStart(2, '0')} / 08`,
    'click anywhere to mute',
  ]) {
    const span = document.createElement('span');
    span.textContent = text;
    strip.append(span);
  }
  footer.append(strip);

  return footer;
}
