import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The stage canvas MUST be sized by CSS.
 *
 * A <canvas> is a REPLACED element, so `position: fixed; inset: 0` does not
 * stretch it the way it stretches a <div> — with `width`/`height` left `auto`
 * the used size is the element's INTRINSIC size, i.e. its drawing buffer, and
 * the `right`/`bottom` offsets are simply ignored. `.ferro-stage` shipped with
 * `inset: 0` and no width/height, and that one omission caused both halves of
 * this bug:
 *
 *  - The buffer is `viewport x devicePixelRatio`, so on a 150%-scaled display
 *    the element laid out 1.5x the viewport, anchored top-left. The blob drew
 *    1.5x too large and nowhere near its frame — the symptom Adam reported.
 *  - Measuring `getBoundingClientRect()` to fix that then closed a loop: the
 *    box set the buffer and the buffer WAS the box, so each ResizeObserver
 *    pass re-scaled the canvas until Chrome cut delivery ("ResizeObserver loop
 *    completed with undelivered notifications") and left the cached viewport
 *    at whatever garbage the last surviving pass wrote (measured: 450x225
 *    inside a 2560x1249 window).
 *
 * Sizing the element explicitly breaks the cycle: the box is then the
 * viewport's, `setSize(w, h, false)` never touches layout, and the observer
 * fires only on real viewport changes. `#bg-canvas` in base.css is the working
 * precedent.
 */
describe('ferro.css .ferro-stage', () => {
  // Read as TEXT, not as an import: vitest stubs CSS modules (and '?raw' with
  // them), so the imported value would be an empty string and every assertion
  // below would pass vacuously.
  const css = readFileSync(fileURLToPath(new URL('../styles/ferro.css', import.meta.url)), 'utf8');
  const rule = /\.ferro-stage\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

  it('declares an explicit width and height', () => {
    expect(rule).toMatch(/(^|;|\s)width\s*:/);
    expect(rule).toMatch(/(^|;|\s)height\s*:/);
  });

  it('does not rely on inset alone to size a replaced element', () => {
    const hasInset = /(^|;|\s)(inset|right|bottom)\s*:/.test(rule);
    const hasSize = /(^|;|\s)width\s*:/.test(rule) && /(^|;|\s)height\s*:/.test(rule);
    expect(hasInset && !hasSize).toBe(false);
  });
});
