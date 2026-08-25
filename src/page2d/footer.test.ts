// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildFooter } from './footer';

describe('buildFooter', () => {
  it('builds the site footer', () => {
    const el = buildFooter({ onNav: vi.fn() });
    expect(el.tagName).toBe('FOOTER');
    expect(el.classList.contains('cs-footer')).toBe(true);
  });

  it('wires the site nav links', () => {
    const onNav = vi.fn();
    const el = buildFooter({ onNav });
    // Not `'a, button'`: the contact band's mailto/social `<a>` elements sit
    // earlier in document order than the site-nav band's `<button>` links (the
    // footer's two-band layout is unchanged from case-study.ts — see this
    // task's report), so a generic anchor-or-button query would grab the
    // mailto link instead and never touch onNav. Only the site nav is built
    // from `<button>` elements here, so this selector is unambiguous.
    const link = el.querySelector<HTMLElement>('button');
    expect(link).not.toBeNull();
    link!.click();
    expect(onNav).toHaveBeenCalled();
  });

  it('needs no Project — the corridor has no project to name', () => {
    // The signature is the point of this task: the same component now serves
    // the case study and the end of the About corridor.
    expect(() => buildFooter({ onNav: vi.fn() })).not.toThrow();
  });

  // Fix round (post-review): the prior version of this test only checked
  // "doesn't throw" — nothing pinned the actual rendered text. Assert the
  // meta strip omits the page-number segment entirely rather than rendering
  // the literal string "PG undefined / 08", since the corridor (the only
  // other caller this signature enables) will always mount this footer
  // without a projectOrder.
  it('omits the page-number segment from the meta strip when there is no project to name', () => {
    const el = buildFooter({ onNav: vi.fn() });
    const stripText = Array.from(el.querySelectorAll('.cs-fstrip span')).map((span) => span.textContent);
    expect(stripText).toEqual(['© 2026 · A. TARR', 'END OF FILE', 'click anywhere to mute']);
  });

  it('includes the page-number segment when projectOrder is given, matching the case study exactly', () => {
    const el = buildFooter({ onNav: vi.fn(), projectOrder: 3 });
    const stripText = Array.from(el.querySelectorAll('.cs-fstrip span')).map((span) => span.textContent);
    expect(stripText).toEqual(['© 2026 · A. TARR', 'END OF FILE  ·  PG 03 / 08', 'click anywhere to mute']);
  });

  // New for this task: the About corridor's gate indicator moved from a
  // fixed panel floating over the world into the footer's own bottom band —
  // a sibling of the WORK/ABOUT/CONTACT nav column, per Figma `110:2`.
  it('mounts a supplied gate element as a sibling of the nav column', () => {
    const gate = document.createElement('div');
    gate.className = 'about-gate';
    const el = buildFooter({ onNav: vi.fn(), gate });
    const navCell = el.querySelector('.cs-fband--nav .cs-fcell');
    const slot = el.querySelector('.cs-fgate-slot');
    expect(slot).not.toBeNull();
    expect(slot!.contains(gate)).toBe(true);
    // Siblings in the same row, not nested inside one another — that's what
    // "the nav column keeps its width, the indicator takes the rest" means
    // structurally.
    expect(navCell!.parentElement).toBe(slot!.parentElement);
  });

  // The case study's own mount never supplies a gate — its footer must be
  // byte-for-byte what it always was, with no extra slot in the nav row.
  it('leaves the nav row exactly as before when no gate is supplied (the case study mount)', () => {
    const el = buildFooter({ onNav: vi.fn(), projectOrder: 3 });
    expect(el.querySelector('.cs-fgate-slot')).toBeNull();
    expect(el.querySelector('.about-gate')).toBeNull();
  });
});
