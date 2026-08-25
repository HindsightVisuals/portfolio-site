import * as THREE from 'three';
import { blenderToWorld, pitchToQuaternion } from './about-coords';
import { ABOUT_MARKERS, type BeatId } from './about-markers';

export interface CameraPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export interface AboutPath {
  /** Pose at `t` in 0..1, clamped. Writes into `into` when given. */
  sample(t: number, into?: CameraPose): CameraPose;
  /** Where a beat sits on the 0..1 axis. */
  tForBeat(id: BeatId): number;
  /** Total path length in world units — what the scroll document is sized from. */
  length(): number;
}

const FIRST = ABOUT_MARKERS[0];
const LAST = ABOUT_MARKERS[ABOUT_MARKERS.length - 1];
const FRAME_SPAN = LAST.frame - FIRST.frame;

/**
 * A camera path through the measured markers, anchored into the site's world.
 *
 * `t` is normalized FRAME position, not arc length. The Blender timing is the
 * authored pacing — the climb is deliberately slower than the level run — and
 * re-parameterizing by distance would flatten exactly that. Free scrub means
 * the user sets the speed anyway; what this preserves is the relative dwell.
 *
 * Position interpolates on a centripetal Catmull-Rom through the marker points,
 * which keeps the pitch-up-then-climb corner smooth without the overshoot a
 * uniform spline puts on unevenly spaced knots. Orientation slerps between
 * adjacent markers rather than riding the curve, because a camera that rolls
 * toward its path tangent is not what the Blender move does — it pitches and
 * holds.
 */
export function buildAboutPath(anchor: THREE.Vector3): AboutPath {
  // Offsets from the anchor marker, converted once. Blender's absolute
  // positions are discarded here — see D1.
  const points = ABOUT_MARKERS.map((m) =>
    blenderToWorld({
      x: m.blender.x - FIRST.blender.x,
      y: m.blender.y - FIRST.blender.y,
      z: m.blender.z - FIRST.blender.z,
    }).add(anchor),
  );
  const quats = ABOUT_MARKERS.map((m) => pitchToQuaternion(m.pitchDeg));
  const ts = ABOUT_MARKERS.map((m) => (m.frame - FIRST.frame) / FRAME_SPAN);

  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');

  let total = 0;
  for (let i = 1; i < points.length; i++) total += points[i].distanceTo(points[i - 1]);

  const scratch = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

  /** Index of the marker segment containing t, plus the local 0..1 within it. */
  const locate = (t: number): { i: number; local: number } => {
    for (let i = 1; i < ts.length; i++) {
      if (t <= ts[i]) {
        const span = ts[i] - ts[i - 1];
        return { i: i - 1, local: span > 0 ? (t - ts[i - 1]) / span : 0 };
      }
    }
    return { i: ts.length - 2, local: 1 };
  };

  return {
    sample(t: number, into?: CameraPose): CameraPose {
      const out = into ?? scratch;
      const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
      const { i, local } = locate(clamped);
      // CatmullRomCurve3.getPoint parameterizes uniformly by control-point
      // index (0, 1/(n-1), 2/(n-1), ...), not by our frame-weighted `ts`.
      // Feeding it the raw normalized-frame `t` would sample the wrong point
      // along the spline for every marker except the two ends (which is why
      // only interior markers show the error). Re-map through the segment
      // index/local pair so segment i's span always lands on [i/(n-1),
      // (i+1)/(n-1)] — the curve's own knot spacing.
      const curveT = (i + local) / (points.length - 1);
      curve.getPoint(curveT, out.position);
      out.quaternion.copy(quats[i]).slerp(quats[i + 1], local);
      return out;
    },
    tForBeat(id: BeatId): number {
      const i = ABOUT_MARKERS.findIndex((m) => m.id === id);
      return i < 0 ? 0 : ts[i];
    },
    length(): number {
      return total;
    },
  };
}
