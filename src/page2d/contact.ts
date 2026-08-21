/**
 * The contact page (F12) — beat 4.
 *
 * Black ground, a ferro blob on the left, a `send a signal` modal on the
 * right. Built as a takeover page, following buildAbout exactly: <article> +
 * the shared navbar + a `.takeover-body` wrapper — `.takeover` itself paints
 * no background (see src/styles/page2d.css:21-23), so anything placed
 * outside `.takeover-body` would let the live 3D world canvas show through.
 * That matters more here than on any other page: beat 4 is solid black.
 *
 * This task builds the page shell only — the aside's marginalia and the
 * modal's title/intro. The form (Task 6) and the ferro blob's live
 * positioning (Task 7) land in later tasks.
 */

import '../styles/page2d.css';
import '../styles/contact.css';

export interface ContactOpts {
  reducedMotion: boolean;
  navbar: HTMLElement;
  /** Skip the immediate reveal — main.ts mounts the observer after open(). */
  deferReveal?: boolean;
}

/**
 * Selector for the empty blob-frame box in `.contact-aside`. The ferro blob
 * itself is not a child of this page — it renders on a separate
 * viewport-sized WebGL canvas mounted at document.body level. This div
 * exists only so a later task can call `getBoundingClientRect()` on it and
 * position the blob to match.
 */
export const FERRO_FRAME_SELECTOR = '[data-ferro-frame]';

const TOP_NOTE = 'communication is what sets us apart';
const TITLE = 'send a signal';
const INTRO =
  'Let’s start a conversation. Fill out the form and let’s schedule a call. Or simply email - but the best communication happens face to face.';
const NOTE_LEFT = 'commms is a 3D and interactive web team.';
const NOTE_RIGHT = 'my name is Adam, learn more';

/**
 * `.contact-modal`'s four corner registration marks (Figma 85:1666 top pair,
 * 85:1717 bottom pair). Reuses the site's existing `.corner-mark` component
 * (src/styles/base.css, also used by index.html's `.chrome`) rather than a
 * second, drifting definition of the same plus-sign shape — placement, size
 * and colour are overridden per-modifier in contact.css, scoped under
 * `.contact-modal` so nothing leaks into the home page's own corner marks.
 * `aria-hidden` keeps them out of the accessibility tree; they are pure
 * registration-mark decoration, not content.
 */
const MODAL_MARK_POSITIONS = ['tl', 'tr', 'bl', 'br'] as const;

function modalCornerMark(position: (typeof MODAL_MARK_POSITIONS)[number]): HTMLSpanElement {
  const mark = document.createElement('span');
  mark.className = `corner-mark contact-modal-mark contact-modal-mark--${position}`;
  mark.setAttribute('aria-hidden', 'true');
  return mark;
}

export function buildContact(opts: ContactOpts): HTMLElement {
  const article = document.createElement('article');
  article.className = 'contact-page';
  article.tabIndex = -1; // takeover.ts focuses this after the swipe-in

  const body = document.createElement('div');
  body.className = 'takeover-body';

  const layout = document.createElement('div');
  layout.className = 'contact-layout';

  // --- left column: aside ---
  const aside = document.createElement('section');
  aside.className = 'contact-aside';

  const topNote = document.createElement('p');
  topNote.className = 'contact-note--top';
  topNote.textContent = TOP_NOTE;

  const ferroFrame = document.createElement('div');
  ferroFrame.className = 'contact-ferro-frame';
  ferroFrame.setAttribute('data-ferro-frame', '');
  // Deliberately empty — the blob lives on its own canvas. See the module
  // doc comment and FERRO_FRAME_SELECTOR above.

  const noteRow = document.createElement('div');
  noteRow.className = 'contact-note-row';

  const noteLeft = document.createElement('p');
  noteLeft.className = 'contact-note';
  noteLeft.textContent = NOTE_LEFT;

  const noteRight = document.createElement('p');
  noteRight.className = 'contact-note';
  noteRight.textContent = NOTE_RIGHT;

  noteRow.append(noteLeft, noteRight);
  aside.append(topNote, ferroFrame, noteRow);

  // --- right column: modal ---
  const modal = document.createElement('section');
  modal.className = 'contact-modal';

  const title = document.createElement('h1');
  title.className = 'contact-title';
  title.textContent = TITLE;

  const intro = document.createElement('p');
  intro.className = 'contact-intro';
  intro.textContent = INTRO;

  modal.append(title, intro, ...MODAL_MARK_POSITIONS.map(modalCornerMark));

  layout.append(aside, modal);
  body.append(layout);
  article.append(opts.navbar, body);

  return article;
}
