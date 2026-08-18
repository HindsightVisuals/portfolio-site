/**
 * Owns the WORK wall's hover interaction.
 *
 * Three outputs move together — tile saturation, the panel, and the camera lean
 * — and keeping them behind one controller is what stops "hovered", "focused"
 * and "peeked" drifting apart across modules. It consumes the raycast main.ts
 * already runs rather than casting a second ray of its own.
 */

import { CAMERA_FOV, TILE_H, TILE_W, tileIndexForSlug, tileLocalPosition } from '../three/world';
import type { WorldLayer } from '../three/world';
import type { CameraDirector } from '../three/camera-director';
import { distanceForFraming, effectiveMarginPx, worldPerPx } from '../three/framing';
import { PEEK_DISTANCE_PX, peekOffset } from './hover-math';
import type { HoverPanel } from './hover-panel';

export interface WorkHover {
  setHovered(slug: string | null): void;
  setPointer(cx: number, cy: number): void;
  setFocused(slug: string | null): void;
  destroy(): void;
}

export interface WorkHoverDeps {
  world: WorldLayer;
  director: CameraDirector;
  panel: HoverPanel;
}

export function initWorkHover({ world, director, panel }: WorkHoverDeps): WorkHover {
  let hovered: string | null = null;
  let focused: string | null = null;
  let px = 0;
  let py = 0;

  /** World units per screen pixel at the distance a focused tile is framed from. */
  const currentWorldPerPx = (): number => {
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const dist = distanceForFraming(
      TILE_W,
      TILE_H,
      vpW,
      vpH,
      CAMERA_FOV,
      effectiveMarginPx(vpW, vpH),
    );
    return worldPerPx(dist, CAMERA_FOV, vpH);
  };

  const applyPeek = (): void => {
    // Only while a case study is framed. Zoomed out on /work there is nothing to
    // lean away FROM, and the brief asks for colour only there.
    if (focused === null || hovered === null || hovered === focused) {
      director.clearPeek();
      return;
    }
    const fi = tileIndexForSlug(focused);
    const hi = tileIndexForSlug(hovered);
    if (fi < 0 || hi < 0) {
      director.clearPeek();
      return;
    }
    const o = peekOffset(
      tileLocalPosition(fi),
      tileLocalPosition(hi),
      PEEK_DISTANCE_PX,
      currentWorldPerPx(),
    );
    director.peekTo(o.x, o.y);
  };

  const applyPanel = (): void => {
    // The panel belongs to the framed experience (brief 2.2 and 2.3). On the
    // zoomed-out wall, hovering only colours the tile.
    if (focused !== null && hovered !== null) panel.show(hovered, px, py);
    else panel.hide();
  };

  return {
    setHovered(slug: string | null): void {
      if (slug === hovered) return;
      // The focused tile keeps its colour whatever the pointer does; every other
      // tile is coloured only while hovered.
      if (hovered !== null && hovered !== focused) world.setTileColor(hovered, false);
      hovered = slug;
      if (hovered !== null) world.setTileColor(hovered, true);
      applyPeek();
      applyPanel();
    },

    setPointer(cx: number, cy: number): void {
      px = cx;
      py = cy;
      panel.move(cx, cy);
    },

    setFocused(slug: string | null): void {
      if (slug === focused) return;
      // Release the outgoing tile unless the pointer is still sitting on it.
      if (focused !== null && focused !== hovered) world.setTileColor(focused, false);
      focused = slug;
      if (focused !== null) world.setTileColor(focused, true);
      applyPeek();
      applyPanel();
    },

    destroy(): void {
      panel.destroy();
    },
  };
}
