/**
 * The page transition's geometry: a field of diamond tiles that build on one
 * after another, radiating out from the middle of the right-hand edge as
 * concentric diamonds — so the front reads as travelling right to left.
 *
 * It first grew diagonally out of the emblem's own top-right corner. Adam moved
 * it: "I'd like the pattern to start from the center-right of the screen and
 * expand out in a diamond pattern from there."
 *
 * This replaced a sawtooth-edged panel that swept right-to-left. Adam, on
 * seeing it: "the contact building on is more of a wipe at the moment. Moreso
 * what I'm looking for is a building on of individual tiles scaling up from
 * 0-100% sequentially, essentially building on in a sort of diagonal
 * checkerboard pattern consisting of the small diamond squares that make up
 * the 2D ferro icon."
 *
 * So the tiles sit on the SAME 45-degree lattice as the emblem (emblem-grid.ts)
 * — rows offset half a column-pitch sideways and exactly half a column-pitch
 * down. That lattice has a useful property: its Voronoi cell is a diamond whose
 * half-diagonal is the row pitch, so diamonds of that size tile the plane
 * edge-to-edge with no gaps and no overlap. The field is therefore genuinely
 * opaque the moment the last tile reaches full scale, which is what lets the
 * incoming page hide behind it until then.
 *
 * Each tile carries the emblem cell's inner square, but painted WHITE rather
 * than punched out — Adam: 'the holes should actually just be white smaller
 * squares inside the bigger black ones'. A real hole would leave the field
 * see-through however far the tiles grew, and the page being hidden sits
 * directly behind it. Painted, the motif reads and the field stays opaque.
 */

/** Full width of one diamond on screen, in CSS px. Adam picked the bold end of
 *  the range, then halved the count on seeing it — and halving a COUNT means
 *  multiplying the span by root two, since each tile has to cover twice the
 *  area. 140 -> 200 takes the field from ~460 tiles to ~230. */
export const TILE_SPAN = 200;

/** The lattice pitch — half a span. Rows sit this far apart vertically and
 *  half-offset horizontally; cells in one row sit two of these apart. */
export const TILE_PITCH = TILE_SPAN / 2;

/** Corner radius, in CSS px — the emblem cell's 2px-on-12px at this scale.
 *  Lives here rather than in the stylesheet because it eats into the tile's
 *  reach (see TILE_REACH), so coverage cannot be reasoned about without it. */
export const TILE_RADIUS = 24;

/**
 * Drawn larger than the lattice, and by more than rounding error: a ROUNDED
 * diamond does not reach as far as a sharp one. Cutting each corner with a
 * radius r pulls the tip back along the diagonal by r * (sqrt(2) - 1) — about
 * 10px at r = 24 — and four tiles meet exactly at those tips. At the 1.04 this
 * started on, that left a pinhole of the page behind at every four-way join,
 * which showed up as a grid of white specks across a field that was supposed to
 * be opaque. The maths below is what the coverage test now checks.
 *
 * Tiles only ever overlap at their black edges — the white inner square is
 * inset well clear of them — so the overlap itself is invisible.
 */
export const TILE_OVERLAP = 1.16;

/** Side of the un-rotated square. A square of side S rotated 45 degrees spans
 *  S * sqrt(2), and we want that span to be TILE_SPAN (plus the overlap). */
export const TILE_SIDE = (TILE_SPAN * TILE_OVERLAP) / Math.SQRT2;

/**
 * How far a drawn tile actually reaches from its centre, corner rounding
 * included. This must stay above TILE_PITCH or the field has holes in it.
 */
export const TILE_REACH = (TILE_SPAN * TILE_OVERLAP) / 2 - TILE_RADIUS * (Math.SQRT2 - 1);

/**
 * How much of the timeline a single tile spends growing, as a fraction. The
 * remaining 1 - TILE_GROW is spread across the field as start delays, so the
 * last tile starts exactly as the timeline has TILE_GROW left and everything
 * lands together at t = 1.
 *
 * At 0.3 a tile's own pop is quick relative to the sweep, which is what makes
 * the diagonal front read as a front rather than as a general fade-up.
 */
export const TILE_GROW = 0.3;

export interface WipeTile {
  /** Centre, in CSS px from the viewport's top-left. */
  x: number;
  y: number;
  /** 0..1 — position in the build order. 0 is the first tile to grow. */
  order: number;
}

const clamp01 = (t: number): number => (Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0);

/** Ease applied to one tile's own 0 -> 1 growth. Out-cubic: leaves fast,
 *  settles softly, so a tile arrives rather than snapping. */
const easeOut = (p: number): number => 1 - (1 - p) ** 3;

/**
 * Every tile needed to cover `viewport`, with its place in the build order.
 *
 * The field overshoots the viewport by one pitch on all four sides. Tiles are
 * placed by their CENTRE, so an edge tile has half its body off-screen; without
 * the overshoot the outermost half-tile of the screen would never be covered.
 *
 * The order radiates from ORIGIN by TAXICAB distance (|dx| + |dy|), not by
 * straight-line distance. That is what makes the front a diamond rather than a
 * circle — and because the lattice is itself at 45 degrees, the iso-distance
 * lines fall exactly along lattice lines, so the rings come out as clean
 * concentric diamonds instead of a stair-stepped approximation of one.
 */
export function tileField(viewport: { w: number; h: number }): WipeTile[] {
  const w = Math.max(1, viewport.w);
  const h = Math.max(1, viewport.h);

  const tiles: { x: number; y: number; d: number }[] = [];
  const rows = Math.ceil(h / TILE_PITCH) + 2;
  const cols = Math.ceil(w / (TILE_PITCH * 2)) + 2;

  // The origin is the middle of the right edge, SNAPPED to the nearest lattice
  // site. Snapping is what makes the rings exact: taxicab distance between two
  // lattice sites is always a whole number of pitches, so a ring's tiles share
  // an order to the last bit and land on the same frame. From an arbitrary
  // point they would each be a few pixels out and the ring would shimmer in
  // rather than snap.
  const originRow = Math.round(h / 2 / TILE_PITCH);
  const originInset = originRow % 2 === 0 ? 0 : TILE_PITCH;
  const ox = Math.round((w - originInset) / (TILE_PITCH * 2)) * TILE_PITCH * 2 + originInset;
  const oy = originRow * TILE_PITCH;

  for (let row = -1; row < rows; row++) {
    const y = row * TILE_PITCH;
    // Odd rows step half a column-pitch across — the offset that turns a square
    // grid into the emblem's diagonal lattice.
    const inset = row % 2 === 0 ? 0 : TILE_PITCH;
    for (let col = -1; col < cols; col++) {
      const x = col * TILE_PITCH * 2 + inset;
      tiles.push({ x, y, d: Math.abs(x - ox) + Math.abs(y - oy) });
    }
  }

  // Normalise against the field's own extremes rather than against the
  // viewport's, so the overshoot ring doesn't squash the on-screen tiles into a
  // sub-range or clamp a whole diagonal onto order 0.
  const ds = tiles.map((t) => t.d);
  const min = Math.min(...ds);
  const span = Math.max(...ds) - min || 1;

  return tiles.map((t) => ({ x: t.x, y: t.y, order: (t.d - min) / span }));
}

/**
 * One tile's scale at timeline position `t`.
 *
 * Every tile derives from the SAME `t`, so there is one tween driving the whole
 * field rather than one tween per tile. That is the pattern the sawtooth used
 * before it and the reason it never drifted: N animations that are supposed to
 * agree will not, but N values read from one number always do.
 */
export function tileScale(order: number, t: number): number {
  const start = clamp01(order) * (1 - TILE_GROW);
  return easeOut(clamp01((t - start) / TILE_GROW));
}

/**
 * One tile's scale across the WHOLE transition, `p` running 0 -> 2: the field
 * builds on over the first half and back off over the second.
 *
 * Adam: "can we have the pattern build on, and then build off in a continuous
 * motion... it builds on in the right to left direction, and then builds off in
 * the right to left direction, revealing the contact page beneath."
 *
 * The "continuous motion" is why the second half reuses `tileScale` with the
 * SAME ordering rather than running the first half backwards. Reversed, the
 * last tile to arrive would be the first to leave and the front would bounce
 * back toward the origin. First-on-first-off keeps one front travelling one way
 * for the whole transition.
 *
 * The page swap happens at p = 1, where the field is opaque and nothing can be
 * seen changing behind it — which is what makes the second half a reveal.
 */
export function tileCycleScale(order: number, p: number): number {
  return p <= 1 ? tileScale(order, p) : 1 - tileScale(order, p - 1);
}

/**
 * ---------------------------------------------------------------------------
 * On a true mask, which Adam asked about
 *
 * "What if we could use this build on as a mask, almost like After Effects mask
 * mode, revealing the contact page quite literally as the texture builds on?"
 *
 * It is feasible, and it is a different model from this one rather than a
 * setting on it. Here the tiles are OPAQUE and the page hides behind them; a
 * mask makes each tile a window, so the destination shows INSIDE the diamonds
 * from the very first frame. Two ways to get there:
 *
 *  - `clip-path: url(#id)` on `.takeover`, with an SVG `<clipPath>` holding one
 *    `<rect>` per tile and their transforms rewritten each frame. True to the
 *    After Effects model — it reveals the real page, content and all. The cost
 *    is that Chrome only composites simple basic-shape clips; a `url()` clip
 *    repaints the clipped subtree on the main thread every frame, and that
 *    subtree is a full-viewport page carrying a form and a WebGL canvas.
 *  - Give each tile the destination's GROUND as a `background-attachment:
 *    fixed` texture. Costs nothing and stays compositor-friendly, because the
 *    tiles are still just transforms. It only reveals the page's ground, not
 *    its content — which is all the reference frame actually shows.
 *
 * Either would replace the on/off cycle above with a single build-on, since a
 * mask that finishes has nothing left to build off.
 */
