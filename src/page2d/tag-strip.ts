/**
 * The archival tag chip — 9px mono, 1.26px tracking, hairline #676767 box.
 * Figma uses it in the title block, the hero and the footer, so it lives here
 * once rather than being rebuilt per section.
 *
 * Its own module rather than living in case-study.ts (where it used to):
 * footer.ts needs it too, and footer.ts importing it FROM case-study.ts (while
 * case-study.ts imports buildFooter back from footer.ts) was a circular
 * import. That cycle was latent and harmless while only case-study.ts (part
 * of the lazy takeover-page chunk) reached footer.ts — but once about-flow.ts
 * (eager) started mounting the same footer in the corridor, the cycle dragged
 * the WHOLE case-study module graph (getProject, the curtain, the strip rail,
 * neighbour cards) into the main bundle too. See this task's report.
 */
function tag(text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = 'cs-tag';
  el.textContent = text;
  return el;
}

export function tagStrip(...labels: string[]): HTMLDivElement {
  const strip = document.createElement('div');
  strip.className = 'cs-tags';
  strip.append(...labels.map(tag));
  return strip;
}
