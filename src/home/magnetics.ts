export interface Vec2 {
  x: number;
  y: number;
}

export interface MagneticState {
  bracket: Vec2;
  icon: Vec2;
  proximity: number;
}

export interface MagneticOpts {
  radius: number;
  bracketMax: number;
  iconMax: number;
}

const ZERO: MagneticState = {
  bracket: { x: 0, y: 0 },
  icon: { x: 0, y: 0 },
  proximity: 0,
};

/**
 * Magnetic pull toward the cursor with smoothstep falloff.
 * Brackets travel farther than the icon so the frame visibly leads.
 */
export function magneticOffset(cursor: Vec2, center: Vec2, opts: MagneticOpts): MagneticState {
  const dx = cursor.x - center.x;
  const dy = cursor.y - center.y;
  const dist = Math.hypot(dx, dy);

  if (dist >= opts.radius || dist === 0) {
    return { bracket: { ...ZERO.bracket }, icon: { ...ZERO.icon }, proximity: dist === 0 ? 1 : 0 };
  }

  const t = 1 - dist / opts.radius;
  const falloff = t * t * (3 - 2 * t); // smoothstep
  const nx = dx / dist;
  const ny = dy / dist;

  return {
    bracket: { x: nx * opts.bracketMax * falloff, y: ny * opts.bracketMax * falloff },
    icon: { x: nx * opts.iconMax * falloff, y: ny * opts.iconMax * falloff },
    proximity: falloff,
  };
}
