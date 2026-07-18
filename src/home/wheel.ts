const LINE_PX = 16;
const PAGE_PX = 800;

/** Normalize a WheelEvent delta to CSS pixels across deltaMode variants. */
export function normalizeWheelDelta(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) return deltaY * LINE_PX;
  if (deltaMode === 2) return deltaY * PAGE_PX;
  return deltaY;
}
