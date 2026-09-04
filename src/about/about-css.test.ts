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
const footer = read('footer.css');
const caseStudy = read('case-study.css');

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
  // first frame of enter(). --gate-show (about-gate-control.ts) gates it on whether
  // the gate has genuinely been fed, per this pass's QA change 1.
  it('gates the panel on --gate-show rather than painting from frame one', () => {
    const rule = ruleBody(about, '.about-gate');
    expect(rule).toMatch(/opacity:\s*var\(\s*--gate-show\s*,\s*0\s*\)/);
    // display, not opacity, is what the reduced-motion rule above uses — this
    // one must not reach for it, or the panel could never fade.
    expect(rule).not.toMatch(/(^|;|\s)display:\s*none/);
  });

  // CHANGED for this task (gate placement correction). This used to assert
  // the OPPOSITE — that .about-gate carried no transition at all — because
  // the return flight (about-return.ts's applyReturn) wrote --gate-show every
  // tick of its own eased 1.6s interpolation, and a CSS transition would have
  // retargeted against each of those writes. That conflict has evaporated:
  // the panel now mounts inside the footer, itself inside .about-doc, whose
  // opacity applyReturn already fades wholesale on return — so applyReturn no
  // longer touches --gate-show at all (verified directly in about-return.ts;
  // see applyReturn's own comment). With nothing left to retarget against, a
  // plain opacity transition is safe, and the designer asked for exactly
  // this: the panel should fade in on first feed rather than pop.
  it('fades --gate-show in on a plain opacity transition, now that nothing retargets it', () => {
    const rule = ruleBody(about, '.about-gate');
    const transition = /transition\s*:\s*opacity\s+(\d+)ms\s+([\w-]+)/.exec(rule);
    expect(transition, 'no opacity transition on .about-gate').not.toBeNull();
    const [, ms] = transition!;
    // Same reasoning as the fill's own transition below: quick enough to
    // read as a fade rather than a lag, and well inside the 1.6s return
    // flight so it never overlaps the panel's own fade-out under it.
    expect(Number(ms)).toBeGreaterThan(0);
    expect(Number(ms)).toBeLessThan(600);
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

  // QA change 3: "the animation of the green status indicator [should be]
  // smoothed with scroll so it's not jumpy but smoothly expands as the user
  // scrolls." --gate used to be written per wheel event with no transition,
  // so the fill stepped. The same rule also carries the idle-retreat
  // (change 2) back to 0% for free — one width transition covers both.
  it('eases the fill width instead of stepping it per wheel event', () => {
    const rule = ruleBody(about, '.about-gate-fill');
    expect(rule).toMatch(/width:\s*calc\(\s*var\(\s*--gate\s*,\s*0\s*\)\s*\*\s*100%\s*\)/);
    const transition = /transition\s*:\s*width\s+(\d+)ms\s+([\w-]+)/.exec(rule);
    expect(transition, 'no width transition on .about-gate-fill').not.toBeNull();
    const [, ms] = transition!;
    // Short enough to stay well inside the return flight (about-return.ts's
    // RETURN_S = 1.6s) so a just-armed fill visibly finishes catching up
    // long before the panel has faded — not merely "a transition exists".
    expect(Number(ms)).toBeGreaterThan(0);
    expect(Number(ms)).toBeLessThan(600);
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

  // M5, revised post-QA. The chrome used to travel to a 32px centre — dead
  // centre of the 2D nav's 64px band — but Adam's QA on the built corridor
  // found that lands the nav ON TOP of the top furniture instead of below
  // it: .corner-mark.tl/.tr sit at top: 48px (a 16px mark, so a 48-64px
  // band) and .margin-note--tl sits at top: 50px (13px text, so a ~50-63px
  // band), and a 32px centre overlaps both. This pins the fix instead: the
  // landing centre must clear both floors, with comfortable room rather than
  // barely squeaking past them.
  it('lands the chrome below the top corner marks and the margin note, not on top of them', () => {
    const rule = ruleBody(base, '.wordmark,\n.site-nav');
    const landing = /top:\s*calc\(50% - \(50% - (\d+)px\) \* var\(--footer-rise, 0\)\)/.exec(rule)?.[1];
    expect(landing, 'the chrome no longer travels off --footer-rise at all').toBeTruthy();

    // Derived, not asserted as magic numbers: the top furniture's own bottom
    // edges are the floors this value has to clear.
    const markTop = Number(/\n\.corner-mark\.tl\s*\{\s*top:\s*(\d+)px/.exec(base)?.[1]);
    const markSize = Number(/\n\.corner-mark\s*\{[^}]*height:\s*(\d+)px/.exec(base)?.[1]);
    const noteTop = Number(/\n\.margin-note--tl\s*\{\s*top:\s*(\d+)px/.exec(base)?.[1]);
    const noteFontSize = Number(/\n\.margin-note\s*\{[^}]*font-size:\s*(\d+)px/.exec(base)?.[1]);
    const markBottomEdge = markTop + markSize; // 48 + 16 = 64
    const noteBottomEdge = noteTop + noteFontSize; // 50 + 13 = 63

    expect(Number(landing)).toBeGreaterThan(markBottomEdge);
    expect(Number(landing)).toBeGreaterThan(noteBottomEdge);
    // Comfortable room, not a bare clear — the whole QA complaint was a value
    // that only just avoided (in fact didn't avoid) this furniture.
    expect(Number(landing) - Math.max(markBottomEdge, noteBottomEdge)).toBeGreaterThanOrEqual(20);
  });

  // Adam's QA: "the pluses from the commms is a 3D... should be up with the
  // text as well." The bottom corner marks have to rise with the same term
  // the bottom margin notes already use, or they stay pinned to the viewport
  // edge while the text beside them lifts away.
  it('rises the bottom corner marks with the same term as the margin notes beside them', () => {
    const notesTerm = /bottom:\s*calc\(50px \+ \(([^)]*)\) \* var\(--footer-rise, 0\)\)/.exec(
      ruleBody(base, '.margin-note--bl,\n.margin-note--br'),
    )?.[1];
    expect(notesTerm, 'the margin notes no longer rise off --footer-rise at all').toBeTruthy();

    const marksRule = ruleBody(base, '.corner-mark.bl,\n.corner-mark.br');
    const marks = /bottom:\s*calc\(48px \+ \(([^)]*)\) \* var\(--footer-rise, 0\)\)/.exec(marksRule);
    expect(marks, 'the corner marks no longer rise off --footer-rise at all').not.toBeNull();

    // Same rise term, so the marks and the notes travel at the same rate —
    // only the resting offset (48 here vs 50 there) is allowed to differ,
    // preserving the 2px the marks sit lower than the notes at rest.
    expect(marks![1]).toBe(notesTerm);

    // Resting state (--footer-rise: 0) must compute to exactly today's value.
    expect(marksRule).toMatch(/bottom:\s*calc\(48px \+ \([^)]*\) \* var\(--footer-rise, 0\)\)/);
  });

  // Left/right must still be set per side — only `bottom` was meant to move
  // to the shared rise rule.
  it('keeps the corner marks pinned to their own horizontal edge', () => {
    expect(base).toMatch(/\n\.corner-mark\.bl\s*\{\s*left:\s*48px;?\s*\}/);
    expect(base).toMatch(/\n\.corner-mark\.br\s*\{\s*right:\s*48px;?\s*\}/);
  });
});

describe('the footer full-bleed in the About corridor (footer.css / about.css)', () => {
  // Adam's QA: "the actual footer should be 100vw effectively looking like a
  // 2D page." .about-beat's `align-items: center` shrink-wraps a child with
  // no explicit width instead of filling the row, which is what left the
  // world showing down both sides of the footer.
  it('stretches the footer past .about-beat centring instead of shrink-wrapping it', () => {
    const rule = ruleBody(about, '.about-beat > .cs-footer');
    expect(rule).toMatch(/align-self:\s*stretch/);
  });

  // Adam's QA: "I want to make it so the footer is aligned to the bottom of
  // the screen." .about-beat-footer (set on the last section only, by
  // about-document.ts) overrides the shared .about-beat's centred
  // justify-content so the footer sits flush to the bottom instead — scoped
  // to a modifier class rather than `[data-beat="ai"]`, so this stylesheet
  // never has to know which marker id is last.
  it('bottom-aligns only the last beat, via a modifier rather than a hardcoded marker id', () => {
    const rule = ruleBody(about, '.about-beat-footer');
    expect(rule).toMatch(/justify-content:\s*flex-end/);
  });

  // "The container for the content should be full width too, with the margin
  // we use on the case study page" — .cs-fband is that container, and
  // --cs-gutter is that margin. Scoped to `.about-beat .cs-fband` so the
  // shared, unscoped `.cs-fband` rule in footer.css — which the case study's
  // own mount also uses — is never touched.
  it('gives the footer bands the case study gutter, only inside the corridor', () => {
    const rule = ruleBody(about, '.about-beat .cs-fband');
    expect(rule).toMatch(/padding-left:\s*var\(--cs-gutter\)/);
    expect(rule).toMatch(/padding-right:\s*var\(--cs-gutter\)/);

    // The shared rule in footer.css must be untouched — that's what keeps
    // the case study's own footer unaffected.
    const sharedRule = ruleBody(footer, '.cs-fband');
    expect(sharedRule).not.toMatch(/var\(--cs-gutter\)/);
  });

  // footer.css can't rely on `.case-study` ancestry (the corridor's mount is
  // never inside one), so it has to self-declare --cs-gutter — the same
  // pattern --cs-ink/--cs-line already use there. Pinned equal to
  // case-study.css's own value so the two mounts agree on what "the case
  // study page's own gutter" actually is.
  it('self-declares --cs-gutter on .cs-footer, matching case-study.css exactly', () => {
    const footerValue = /--cs-gutter:\s*([^;]+);/.exec(ruleBody(footer, '.cs-footer'))?.[1].trim();
    const caseStudyValue = /--cs-gutter:\s*([^;]+);/.exec(ruleBody(caseStudy, '.case-study'))?.[1].trim();
    expect(footerValue).toBeTruthy();
    expect(footerValue).toBe(caseStudyValue);
  });
});
