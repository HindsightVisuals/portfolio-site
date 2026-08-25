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
});
