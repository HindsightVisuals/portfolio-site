import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initWorkHover, type WorkHover } from './work-hover';
import { TILE_STROKE_FOCUS_PX, TILE_STROKE_PX, type WorldLayer } from '../three/world';
import type { CameraDirector } from '../three/camera-director';
import type { HoverPanel } from './hover-panel';

/** Records the colour and stroke calls; the rest of WorldLayer is irrelevant. */
function fakeWorld() {
  const calls: Array<[string, boolean]> = [];
  const strokes: Array<[string, number]> = [];
  const world = {
    setTileColor: (slug: string, on: boolean) => {
      calls.push([slug, on]);
    },
    setTileStroke: (slug: string, px: number) => {
      strokes.push([slug, px]);
    },
  } as unknown as WorldLayer;
  return { world, calls, strokes };
}

function fakeDirector() {
  const peekTo = vi.fn();
  const clearPeek = vi.fn();
  return { director: { peekTo, clearPeek } as unknown as CameraDirector, peekTo, clearPeek };
}

function fakePanel() {
  const show = vi.fn();
  const hide = vi.fn();
  const move = vi.fn();
  const destroy = vi.fn();
  return { panel: { show, hide, move, destroy } as unknown as HoverPanel, show, hide, move, destroy };
}

describe('WorkHover', () => {
  let w: ReturnType<typeof fakeWorld>;
  let d: ReturnType<typeof fakeDirector>;
  let pa: ReturnType<typeof fakePanel>;
  let hover: WorkHover;

  beforeEach(() => {
    w = fakeWorld();
    d = fakeDirector();
    pa = fakePanel();
    hover = initWorkHover({
      world: w.world,
      director: d.director,
      panel: pa.panel,
      viewport: () => ({ w: 1920, h: 1080 }),
    });
  });

  describe('colour', () => {
    it('colours the hovered tile and greys it again on exit', () => {
      hover.setHovered('addax');
      expect(w.calls).toContainEqual(['addax', true]);
      hover.setHovered(null);
      expect(w.calls).toContainEqual(['addax', false]);
    });

    it('greys the previous tile when the pointer moves to another', () => {
      hover.setHovered('addax');
      w.calls.length = 0;
      hover.setHovered('animal');
      expect(w.calls).toContainEqual(['addax', false]);
      expect(w.calls).toContainEqual(['animal', true]);
    });

    it('keeps the focused tile coloured while it is being viewed', () => {
      hover.setFocused('spy-hop');
      expect(w.calls).toContainEqual(['spy-hop', true]);
    });

    it('does NOT grey the focused tile when the pointer leaves it', () => {
      hover.setFocused('spy-hop');
      hover.setHovered('spy-hop');
      w.calls.length = 0;
      hover.setHovered(null);
      expect(w.calls).not.toContainEqual(['spy-hop', false]);
    });

    it('greys a tile that loses focus once the pointer is elsewhere', () => {
      hover.setFocused('spy-hop');
      w.calls.length = 0;
      hover.setFocused('animal');
      expect(w.calls).toContainEqual(['spy-hop', false]);
      expect(w.calls).toContainEqual(['animal', true]);
    });

    it('ignores a repeated hover of the same tile', () => {
      hover.setHovered('addax');
      w.calls.length = 0;
      hover.setHovered('addax');
      expect(w.calls).toEqual([]);
    });
  });

  describe('stroke', () => {
    it('thickens the border on the tile that gains focus', () => {
      hover.setFocused('spy-hop');
      expect(w.strokes).toContainEqual(['spy-hop', TILE_STROKE_FOCUS_PX]);
    });

    it('relaxes the border on the tile that loses it', () => {
      hover.setFocused('spy-hop');
      w.strokes.length = 0;
      hover.setFocused('animal');
      expect(w.strokes).toContainEqual(['spy-hop', TILE_STROKE_PX]);
      expect(w.strokes).toContainEqual(['animal', TILE_STROKE_FOCUS_PX]);
    });

    it('leaves borders alone on plain hover — the frame marks commitment, not proximity', () => {
      hover.setHovered('addax');
      expect(w.strokes).toEqual([]);
    });
  });

  describe('peek', () => {
    it('leans toward a neighbour while a case study is framed', () => {
      hover.setFocused('know-good'); // index 0, top-left
      hover.setHovered('addax'); // index 1, directly right
      expect(d.peekTo).toHaveBeenCalled();
      const [dx, dy] = d.peekTo.mock.calls.at(-1)!;
      expect(dx).toBeGreaterThan(0); // leans right
      expect(dy).toBeCloseTo(0, 6);
    });

    it('leans down toward the row below', () => {
      hover.setFocused('know-good'); // row 0
      hover.setHovered('naboso'); // index 4, directly below
      const [dx, dy] = d.peekTo.mock.calls.at(-1)!;
      expect(dx).toBeCloseTo(0, 6);
      expect(dy).toBeLessThan(0); // row 1 sits lower in world y
    });

    it('does not lean at all on the zoomed-out wall, where nothing is framed', () => {
      hover.setHovered('addax');
      expect(d.peekTo).not.toHaveBeenCalled();
      expect(d.clearPeek).toHaveBeenCalled();
    });

    it('clears the lean when the pointer returns to the framed tile', () => {
      hover.setFocused('know-good');
      hover.setHovered('addax');
      d.clearPeek.mockClear();
      hover.setHovered('know-good');
      expect(d.clearPeek).toHaveBeenCalled();
    });

    it('clears the lean when the pointer leaves every tile', () => {
      hover.setFocused('know-good');
      hover.setHovered('addax');
      d.clearPeek.mockClear();
      hover.setHovered(null);
      expect(d.clearPeek).toHaveBeenCalled();
    });
  });

  describe('panel', () => {
    it('stays hidden on the zoomed-out wall — brief 2.1 asks for colour only', () => {
      hover.setHovered('addax');
      expect(pa.show).not.toHaveBeenCalled();
    });

    it('shows for a hovered tile once a case study is framed', () => {
      hover.setFocused('spy-hop');
      hover.setPointer(400, 300);
      hover.setHovered('addax');
      expect(pa.show).toHaveBeenCalledWith('addax', 400, 300);
    });

    it('shows for the framed tile itself when the pointer is on it', () => {
      hover.setFocused('spy-hop');
      hover.setHovered('spy-hop');
      expect(pa.show).toHaveBeenCalledWith('spy-hop', 0, 0);
    });

    it('hides when the pointer leaves every tile', () => {
      hover.setFocused('spy-hop');
      hover.setHovered('addax');
      pa.hide.mockClear();
      hover.setHovered(null);
      expect(pa.hide).toHaveBeenCalled();
    });

    it('tracks the pointer without re-showing', () => {
      hover.setFocused('spy-hop');
      hover.setHovered('addax');
      hover.setPointer(500, 600);
      expect(pa.move).toHaveBeenCalledWith(500, 600);
    });
  });
});
