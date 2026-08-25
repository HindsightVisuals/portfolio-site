import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The corridor's CSS, asserted as TEXT.
 *
 * jsdom implements no cascade worth trusting and stubs CSS module imports to
 * an empty string, so the only honest way to pin a rule's ORDER or its
 * arithmetic is to read the stylesheet as a file — the same reasoning (and the
 * same technique) as ferro-stage.test.ts. Two whole-plan review findings live
 * here because both are invisible to every DOM-level test in this directory:
 * one is a specificity/source-order bug, the other is a sign error in a calc().
 */

// Newlines normalised: these files are checked in with CRLF terminators, and
// every selector/order assertion below anchors on '\n'.
const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../styles/${name}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

const about = read('about.css');
const base = read('base.css');
const page2d = read('page2d.css');

/** The body of the first top-level (column-0) rule with this exact selector. */
const ruleBody = (css: string, selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) return '';
  return css.slice(at + selector.length + 3, css.indexOf('\n}', at));
};

describe('about.css — the gate indicator', () => {
  // CRITICAL 1. The reduced-motion hide shipped folded into the EXISTING
  // `@media (prefers-reduced-motion: reduce)` block near the top of the file.
  // A media query adds no specificity, so the later unconditional
  // `.about-gate { … display: flex … }` won on source order and the hide was
  // inert — confirmed in the built bundle. Under reduced motion the panel was
  // therefore pinned to the viewport permanently at 0% fill, over a plain
  // scrolling document, telling the reader to keep scrolling to return home
  // when onWheel returns early there and scrolling does nothing.
  it('hides the gate under reduced motion from BELOW the rule it has to beat', () => {
    const hide = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.about-gate\s*\{\s*display:\s*none;?\s*\}/.exec(
      about,
    );
    expect(hide, 'no reduced-motion .about-gate { display: none } rule at all').not.toBeNull();
    // Both of the rules it has to out-order: the panel itself (display: flex)
    // and the fill, which the brief names as the floor to clear.
    expect(hide!.index).toBeGreaterThan(about.indexOf('\n.about-gate {'));
    expect(hide!.index).toBeGreaterThan(about.indexOf('\n.about-gate-fill {'));
  });

  // CRITICAL 2, part 1. The placeholder this component replaced self-hid: its
  // width AND its opacity were both calc(var(--gate, 0) * …), so at zero there
  // was nothing drawn. This one has no such property — at --gate: 0 the panel,
  // its border and its hatched track are fully painted and only the green fill
  // is zero-width — so a dark bar sat across the bottom of every beat from the
  // first frame of enter(). --gate-show (about-flow.ts, footerRiseAt) ramps it
  // in with the footer instead.
  it('ramps the panel in off --gate-show rather than painting from frame one', () => {
    const rule = ruleBody(about, '.about-gate');
    expect(rule).toMatch(/opacity:\s*var\(\s*--gate-show\s*,\s*0\s*\)/);
    // display, not opacity, is what the reduced-motion rule above uses — this
    // one must not reach for it, or the panel could never fade.
    expect(rule).not.toMatch(/(^|;|\s)display:\s*none/);
  });

  // The gate's two numeric properties need their fallbacks: unlike --ground
  // and --ink — whose only readers are scoped to html.about-open, where the
  // corridor is guaranteed to have written them — these are read by a rule
  // that is live from the moment the element mounts, and both are removed by
  // releaseSharedState(). A bare var() of an undefined property makes the
  // whole declaration invalid.
  it('gives the gate custom properties their fallbacks', () => {
    const seen = [...about.matchAll(/var\(\s*--(gate|gate-show)\s*([,)])/g)];
    expect(seen.length).toBeGreaterThanOrEqual(2);
    for (const m of seen) expect(m[2], `var(--${m[1]}) has no fallback`).toBe(',');
  });
});

describe('base.css — the chrome the corridor lifts', () => {
  // IMPORTANT 2. `- 100px` put the notes 326px from the viewport top at full
  // rise — 50px BELOW the footer's assumed top edge at 276px, i.e. inside the
  // one element they are lifting to get out of.
  //
  // NOTE: the 276px itself comes from a 1920x1080 Figma frame while the real
  // footer is content-sized. That mismatch is recorded for the designer and is
  // deliberately NOT what this test pins — only the direction of the term.
  it('lifts the bottom margin notes clear of the footer edge, not into it', () => {
    const notes = ruleBody(base, '.margin-note--bl,\n.margin-note--br');
    const term = /bottom:\s*calc\(50px \+ \(([^)]*)\) \* var\(--footer-rise, 0\)\)/.exec(notes)?.[1];
    expect(term, 'the notes no longer rise off --footer-rise at all').toBeTruthy();

    const VH = 1080;
    const FOOTER_EDGE_FROM_TOP = 276; // the world band the mockup leaves above it
    // `100vh ± Npx ± Npx`, evaluated at a concrete viewport height.
    const tokens = term!.trim().split(/\s+/);
    const px = (tok: string): number => (tok === '100vh' ? VH : Number(tok.replace('px', '')));
    let rise = px(tokens[0]);
    for (let i = 1; i < tokens.length; i += 2) {
      rise += tokens[i] === '-' ? -px(tokens[i + 1]) : px(tokens[i + 1]);
    }
    // `bottom` is measured up from the viewport bottom; flip it to the top.
    const noteBottomFromTop = VH - (50 + rise);
    expect(noteBottomFromTop).toBeLessThan(FOOTER_EDGE_FROM_TOP);
  });

  // M5. Both selectors carry translateY(-50%), so this value is where their
  // CENTRE lands — and the 2D nav's contents centre in a 64px band, at 32px.
  // 50px put the corridor's chrome ~18px below where the same chrome sits on
  // every other page, which is the entire point of the move.
  it('lands the chrome where the 2D nav actually sits', () => {
    const rule = ruleBody(base, '.wordmark,\n.site-nav');
    const landing = /top:\s*calc\(50% - \(50% - (\d+)px\) \* var\(--footer-rise, 0\)\)/.exec(rule)?.[1];
    expect(landing, 'the chrome no longer travels off --footer-rise at all').toBeTruthy();

    // Derived, not asserted as a magic number: .nav2d is the band, and its
    // children sit at top: 50% of it.
    const bandH = /\n\.nav2d\s*\{[^}]*height:\s*(\d+)px/.exec(page2d)?.[1];
    expect(bandH).toBe('64');
    expect(Number(landing)).toBe(Number(bandH) / 2);
  });
});
