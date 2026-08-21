/**
 * The contact page (F12).
 *
 * PASS 1 SHELL. This is the destination the contact mark opens — heading,
 * availability line, direct email and socials. The form, the optional
 * project-scoping depth, the transmission readout and the submit payoff are
 * Pass 2; see docs/superpowers/specs/2026-08-19-contact-design.md.
 *
 * Built as a takeover page, following buildAbout exactly: <article> + the
 * shared navbar + a .takeover-body, sections hidden until revealed.
 */

import '../styles/page2d.css';
import '../styles/contact.css';

export interface ContactOpts {
  reducedMotion: boolean;
  navbar: HTMLElement;
  /** Skip the immediate reveal — main.ts mounts the observer after open(). */
  deferReveal?: boolean;
}

/** Adam's real address — the low-friction path, and the one recruiters use. */
const EMAIL = 'adam.tarr.studio@gmail.com';

/** Carried verbatim from the case study footer so the two never drift. */
const AVAILABILITY =
  'Available for select freelance  ·  open to senior in-house roles  ·  reply within 2 business days.';

// Placeholder destinations — the real handles are still outstanding, same as
// the case study footer. Do not ship to production with bare domains.
const SOCIALS: Array<[string, string]> = [
  ['linkedin', 'https://www.linkedin.com/'],
  ['instagram', 'https://www.instagram.com/'],
  ['youtube', 'https://www.youtube.com/'],
];

function tagStrip(left: string, right: string): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'contact-tags';
  for (const text of [left, right]) {
    const tag = document.createElement('span');
    tag.className = 'contact-tag';
    tag.textContent = text;
    strip.append(tag);
  }
  return strip;
}

export function buildContact(opts: ContactOpts): HTMLElement {
  const article = document.createElement('article');
  article.className = 'contact-page';
  article.tabIndex = -1; // takeover.ts focuses this after the swipe-in

  const body = document.createElement('div');
  body.className = 'takeover-body';

  // --- heading ---
  const hero = document.createElement('section');
  hero.className = 'contact-hero';

  const heading = document.createElement('h1');
  heading.className = 'contact-heading';
  // Three m's — the brand signature, matching the case study footer.
  heading.textContent = 'let’s commmunicate';

  const availability = document.createElement('p');
  availability.className = 'contact-availability';
  availability.textContent = AVAILABILITY;

  hero.append(heading, availability);

  // --- direct ---
  const direct = document.createElement('section');
  direct.className = 'contact-direct';

  const email = document.createElement('a');
  email.className = 'contact-email';
  email.href = `mailto:${EMAIL}`;
  email.textContent = EMAIL;

  direct.append(tagStrip('PRIMARY', 'EMAIL'), email);

  // --- social ---
  const social = document.createElement('section');
  social.className = 'contact-social';
  social.append(tagStrip('SECONDARY', 'SOCIAL'));

  const list = document.createElement('ul');
  list.className = 'contact-social-list';
  for (const [label, href] of SOCIALS) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'contact-link';
    link.href = href;
    link.textContent = label;
    link.rel = 'noopener noreferrer';
    link.target = '_blank';
    li.append(link);
    list.append(li);
  }
  social.append(list);

  body.append(hero, direct, social);
  article.append(opts.navbar, body);
  return article;
}
