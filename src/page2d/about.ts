import '../styles/page2d.css';
import { revealSections } from './reveal';

export interface AboutOpts {
  reducedMotion: boolean;
  onContact(): void;
  navbar: HTMLElement;
}

/** Tools listed in `.about-stack` — order is display order, not priority. */
const TOOLS = [
  'Blender',
  'Substance Painter',
  'After Effects',
  'Illustrator',
  'Photoshop',
  'Three.js',
  'TypeScript',
];

/** Services shown in the `.about-services` three-up strip. */
const SERVICES = ['3D', 'Motion', 'Interactive Web'];

function bioParagraph(): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = '— placeholder —';
  return p;
}

function serviceItem(label: string): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'about-service';

  const heading = document.createElement('h3');
  heading.className = 'about-service-label';
  heading.textContent = label;

  const blurb = document.createElement('p');
  blurb.className = 'about-service-blurb';
  blurb.textContent = '— placeholder —';

  item.append(heading, blurb);
  return item;
}

/**
 * Builds the `<article class="about-page">` takeover page: `opts.navbar`
 * (Task 7) up top, then every content section inside a `.takeover-body`
 * wrapper per the Task 7 structural contract — `.takeover` itself paints no
 * background, so anything outside `.takeover-body` would let the live canvas
 * bleed through.
 *
 * Section order: hero · services · stack · resume · cta. Every section
 * starts hidden and is revealed once via the shared `revealSections` helper
 * (see reveal.ts), same as buildCaseStudy.
 */
export function buildAbout(opts: AboutOpts): HTMLElement {
  const article = document.createElement('article');
  article.className = 'about-page';
  article.tabIndex = -1; // takeover.ts calls page.focus() on this element after the swipe-in

  const body = document.createElement('div');
  body.className = 'takeover-body';

  // --- .about-hero ---
  const hero = document.createElement('section');
  hero.className = 'about-hero';

  const portrait = document.createElement('div');
  portrait.className = 'about-portrait';
  portrait.setAttribute('aria-hidden', 'true');
  // TODO: replace placeholder square with a real portrait image

  const bio = document.createElement('div');
  bio.className = 'about-bio';
  bio.append(bioParagraph(), bioParagraph());

  hero.append(portrait, bio);

  // --- .about-services ---
  const services = document.createElement('section');
  services.className = 'about-services';
  services.append(...SERVICES.map(serviceItem));

  // --- .about-stack ---
  const stack = document.createElement('section');
  stack.className = 'about-stack';

  const toolsList = document.createElement('ul');
  toolsList.className = 'about-tools-list';
  for (const tool of TOOLS) {
    const li = document.createElement('li');
    li.textContent = tool;
    toolsList.append(li);
  }

  const clients = document.createElement('p');
  clients.className = 'about-clients';
  clients.textContent = 'selected clients — placeholder';

  stack.append(toolsList, clients);

  // --- .about-resume ---
  const resume = document.createElement('section');
  resume.className = 'about-resume';
  const resumeLink = document.createElement('a');
  resumeLink.className = 'about-resume-link';
  resumeLink.href = '#';
  resumeLink.textContent = 'Download Resume';
  /* TODO: resume asset */
  resume.append(resumeLink);

  // --- .about-cta ---
  const cta = document.createElement('section');
  cta.className = 'about-cta';
  const ctaButton = document.createElement('button');
  ctaButton.type = 'button';
  ctaButton.className = 'about-cta-button';
  ctaButton.textContent = 'Get In Touch →';
  ctaButton.addEventListener('click', () => opts.onContact());
  cta.append(ctaButton);

  const sections = [hero, services, stack, resume, cta];
  body.append(...sections);
  article.append(opts.navbar, body);

  revealSections(article, sections, { reducedMotion: opts.reducedMotion });

  return article;
}
