/**
 * The curtain — the wavy top edge of the case study page.
 *
 * It is two things at once. The page fills BELOW the wave, so above it the live
 * 3D world shows through: the wave is a window back onto the WORK wall you came
 * from. And it is the way out — Adam's call was that this replaces the navbar's
 * cloth-V notch as the page's close affordance, so there is one close gesture
 * rather than two.
 *
 * The path is generated per frame from `curtain-math.ts` rather than using the
 * fixed `d` Figma exports, because it has to deform: a slow idle warp, a ripple
 * where the pointer crosses it, and an elastic pull-down when the region above
 * it is hovered. The rest shape is fitted to the Figma curve so it still matches
 * the design when nothing is happening.
 *
 * C1 renders it static and clickable. C4 adds the warp, ripple and elastic pull.
 */

import { CURTAIN_VIEW_H, CURTAIN_VIEW_W, curtainPath } from './curtain-math';

export interface CurtainOpts {
  reducedMotion: boolean;
  onClose(): void;
}

export function buildCurtain(opts: CurtainOpts): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'cs-curtain';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${CURTAIN_VIEW_W} ${CURTAIN_VIEW_H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('cs-curtain-svg');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', curtainPath(0, 0));
  path.classList.add('cs-curtain-path');
  // No fill rect any more: the curtain scrolls away with the page rather than
  // sticking, so there is nothing to shut.
  svg.append(path);
  wrap.append(svg);

  // The clickable region is the area ABOVE the wave — the window onto the 3D
  // world. It is a sibling button rather than a listener on the path so it is
  // keyboard-reachable and carries a real accessible name; the takeover's
  // Escape handler remains the keyboard equivalent either way.
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'cs-curtain-close';
  close.setAttribute('aria-label', 'Close this case study and return to the work wall');
  close.addEventListener('click', () => opts.onClose());
  wrap.append(close);

  return wrap;
}
