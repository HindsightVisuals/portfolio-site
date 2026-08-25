import { withBase } from '../routes';
import { tagStrip } from './case-study';

export interface FooterOpts {
  /** Footer site nav. */
  onNav(dest: 'work' | 'about' | 'contact'): void;
  /**
   * The case study's archival page number for the meta strip (`PG 03 / 08`).
   * Optional: the About corridor mounts this same footer with no project to
   * name, and the meta strip simply omits that segment when it's absent.
   */
  projectOrder?: number;
}

/**
 * The page footer, per Figma `62:381`.
 *
 * A ruled grid rather than a stack: every group sits inside a hairline box, so
 * the block reads as a spec sheet. Two bands — the contact block on black, and
 * the site nav on #191919 — with a green meta strip closing the page.
 *
 * The big COMMMS mark above it is a separate element (`.cs-footer-mark`); this
 * frame begins at "let's commmunicate".
 */
export function buildFooter(opts: FooterOpts): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'cs-footer reveal';

  // --- band one: the contact block, on black ------------------------------
  const contactBand = document.createElement('div');
  contactBand.className = 'cs-fband cs-fband--contact';

  const box = document.createElement('div');
  box.className = 'cs-frule';

  const heading = document.createElement('h2');
  heading.className = 'cs-footer-heading';
  heading.textContent = 'let’s commmunicate';
  box.append(heading);

  const row = document.createElement('div');
  row.className = 'cs-frule cs-fcontact-row';

  const cells = document.createElement('div');
  cells.className = 'cs-frule cs-fcells';

  // Primary — email.
  const primary = document.createElement('div');
  primary.className = 'cs-frule cs-fcell cs-fcell--wide';
  primary.append(tagStrip('PRIMARY', 'EMAIL'));
  const email = document.createElement('a');
  email.className = 'cs-flink';
  email.href = 'mailto:adam.tarr.studio@gmail.com';
  email.textContent = 'adam.tarr.studio@gmail.com';
  primary.append(email);

  // Secondary — social.
  const social = document.createElement('div');
  social.className = 'cs-frule cs-fcell';
  social.append(tagStrip('SECONDARY', 'SOCIAL'));
  for (const [label, href] of [
    ['linkedin', 'https://www.linkedin.com/'],
    ['instagram', 'https://www.instagram.com/'],
    ['youtube', 'https://www.youtube.com/'],
  ] as Array<[string, string]>) {
    const a = document.createElement('a');
    a.className = 'cs-flink';
    a.href = href;
    a.rel = 'noopener noreferrer';
    a.target = '_blank';
    a.textContent = label;
    social.append(a);
  }

  cells.append(primary, social);

  // The mark. Figma annotates this "constantly morphing and rotating reaction
  // diffusion or logo mark" — it is static art for now; the confined-RD
  // technique the COMMMS wordmark uses is the obvious way to animate it later.
  const mark = document.createElement('img');
  mark.className = 'cs-fmark';
  mark.src = withBase('/footer-mark.svg');
  mark.alt = '';
  mark.setAttribute('aria-hidden', 'true');
  mark.loading = 'lazy';

  row.append(cells, mark);
  box.append(row);
  contactBand.append(box);

  const availability = document.createElement('p');
  availability.className = 'cs-favailability';
  availability.textContent =
    'Available for select freelance  ·  open to senior in-house roles  ·  reply within 2 business days.';
  contactBand.append(availability);
  footer.append(contactBand);

  // --- band two: site nav + meta strip, on #191919 ------------------------
  const navBand = document.createElement('div');
  navBand.className = 'cs-fband cs-fband--nav';

  const navBox = document.createElement('div');
  navBox.className = 'cs-frule';
  const navRow = document.createElement('div');
  navRow.className = 'cs-frule cs-fcells';
  const navCell = document.createElement('div');
  navCell.className = 'cs-frule cs-fcell';
  navCell.append(tagStrip('SECONDARY', 'SOCIAL'));
  for (const dest of ['work', 'about', 'contact'] as const) {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'cs-flink';
    link.textContent = dest;
    link.addEventListener('click', () => opts.onNav(dest));
    navCell.append(link);
  }
  navRow.append(navCell);
  navBox.append(navRow);
  navBand.append(navBox);

  const strip = document.createElement('div');
  strip.className = 'cs-fstrip';
  for (const text of [
    '© 2026 · A. TARR',
    ...(opts.projectOrder !== undefined
      ? [`END OF FILE  ·  PG ${String(opts.projectOrder).padStart(2, '0')} / 08`]
      : ['END OF FILE']),
    'click anywhere to mute',
  ]) {
    const span = document.createElement('span');
    span.textContent = text;
    strip.append(span);
  }
  navBand.append(strip);
  footer.append(navBand);

  return footer;
}
