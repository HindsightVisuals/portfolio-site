import { getProject } from '../content/projects';

export interface ScreenProxiesOpts {
  /** Project slugs in tile order (world.ts's SLUGS) — one proxy per tile. */
  slugs: readonly string[];
  onTile(slug: string): void;
  onAbout(): void;
}

export interface ScreenProxiesHandle {
  destroy(): void;
}

/**
 * Keyboard-reachable proxies for the WORK tiles + ABOUT screen (spec:
 * docs/superpowers/specs/2026-07-22-phase3-signature-journey-design.md,
 * Accessibility section). Those hit targets are 3D meshes reachable only via
 * a canvas raycast pick (main.ts's click handler) — there is no keyboard
 * equivalent for "click this tile". These are visually-hidden (sr-only,
 * `.screen-proxy` in base.css) but focusable `<button>`s standing in for the
 * same targets: one per project tile, one for the About screen. Popping
 * visible on `:focus-visible` (CSS) so a sighted keyboard user can see where
 * focus landed.
 *
 * Each button's click handler is supplied by the caller (main.ts) and
 * mirrors the canvas click-routing decision exactly (open the takeover if
 * already framed on that target, else navigate/fly to frame it first) — this
 * module only builds and labels the buttons, it holds no routing logic.
 */
export function initScreenProxies(
  container: HTMLElement,
  opts: ScreenProxiesOpts,
): ScreenProxiesHandle {
  const buttons: HTMLButtonElement[] = [];

  const addButton = (label: string, onClick: () => void): void => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'screen-proxy';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    container.appendChild(btn);
    buttons.push(btn);
  };

  for (const slug of opts.slugs) {
    addButton(`Open ${getProject(slug).title} case study`, () => opts.onTile(slug));
  }
  addButton('Open about page', opts.onAbout);

  return {
    destroy(): void {
      for (const btn of buttons) btn.remove();
      buttons.length = 0;
    },
  };
}
