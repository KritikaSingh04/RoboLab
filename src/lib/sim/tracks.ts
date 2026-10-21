/** Closed line-follower tracks: polylines with a thickness, plus geometry queries. */
import type { Vec2 } from './geometry';

export interface Track {
  id: string;
  name: string;
  /** Closed polyline (last point connects back to the first). */
  points: Vec2[];
  /** Line width (m). */
  width: number;
  /** Cumulative arc length at each point, plus total length at the end. */
  cum: number[];
  length: number;
}

export const FLOOR = { w: 4, h: 3 };
export const LINE_WIDTH = 0.025;

export function buildTrack(id: string, name: string, points: Vec2[], width = LINE_WIDTH): Track {
  const cum = [0];
  for (let i = 1; i <= points.length; i++) {
    const a = points[i - 1];
    const b = points[i % points.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return { id, name, points, width, cum, length: cum[points.length] };
}

const param = (f: (t: number) => Vec2, n: number): Vec2[] => Array.from({ length: n }, (_, i) => f((2 * Math.PI * i) / n));
const C: Vec2 = [FLOOR.w / 2, FLOOR.h / 2];

export function presetTrack(id: string): Track {
  switch (id) {
    case 'scurve':
      return buildTrack('scurve', 'S-curve', param((t) => [C[0] + 1.5 * Math.cos(t), C[1] + 0.85 * Math.sin(t) + 0.35 * Math.sin(3 * t)], 240));
    case 'figure8':
      return buildTrack('figure8', 'Figure-8', param((t) => [C[0] + 1.6 * Math.sin(t), C[1] + 0.9 * Math.sin(t) * Math.cos(t) * 1.3], 260));
    case 'corners': {
      // rectangle with sharp 90° corners, densely sampled so the arc-length parameterisation is smooth
      const w = 2.8;
      const h = 1.8;
      const x0 = C[0] - w / 2;
      const y0 = C[1] - h / 2;
      const pts: Vec2[] = [];
      const edge = (a: Vec2, b: Vec2, n: number) => {
        for (let i = 0; i < n; i++) pts.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
      };
      edge([x0, y0], [x0 + w, y0], 70);
      edge([x0 + w, y0], [x0 + w, y0 + h], 45);
      edge([x0 + w, y0 + h], [x0, y0 + h], 70);
      edge([x0, y0 + h], [x0, y0], 45);
      return buildTrack('corners', 'Sharp corners', pts);
    }
    case 'oval':
    default:
      return buildTrack('oval', 'Oval', param((t) => [C[0] + 1.5 * Math.cos(t), C[1] + 1.0 * Math.sin(t)], 200));
  }
}

export const TRACK_PRESETS = ['oval', 'scurve', 'figure8', 'corners'];

/** Chaikin corner cutting on a closed polyline. */
export function chaikin(points: Vec2[], iterations = 2): Vec2[] {
  let pts = points;
  for (let k = 0; k < iterations; k++) {
    const out: Vec2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    pts = out;
  }
  return pts;
}

/** Resample a closed polyline at a roughly constant spacing. */
export function resampleClosed(points: Vec2[], spacing: number): Vec2[] {
  if (points.length < 3) return points;
  const out: Vec2[] = [];
  let carry = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let s = carry;
    while (s < len) {
      const u = s / len;
      out.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]);
      s += spacing;
    }
    carry = s - len;
  }
  return out;
}

/** Build a smoothed closed track from freehand points (drops points that are too close). */
export function trackFromFreehand(raw: Vec2[], width = LINE_WIDTH): Track | null {
  const pts: Vec2[] = [];
  for (const p of raw) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.04) pts.push(p);
  }
  if (pts.length < 8) return null;
  return buildTrack('custom', 'Custom', resampleClosed(chaikin(pts, 3), 0.02), width);
}

export interface TrackQuery {
  /** Distance from the point to the line centre (m). */
  dist: number;
  /** Arc-length position of the nearest point along the track (m). */
  s: number;
  nearest: Vec2;
  /** Unit tangent at the nearest point. */
  tangent: Vec2;
}

/** Nearest point on the closed polyline. */
export function trackQuery(track: Track, p: Vec2): TrackQuery {
  let best: TrackQuery = { dist: Infinity, s: 0, nearest: track.points[0], tangent: [1, 0] };
  const n = track.points.length;
  for (let i = 0; i < n; i++) {
    const a = track.points[i];
    const b = track.points[(i + 1) % n];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len2 = ex * ex + ey * ey;
    const u = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / len2)) : 0;
    const q: Vec2 = [a[0] + u * ex, a[1] + u * ey];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best.dist) {
      const len = Math.sqrt(len2) || 1;
      best = { dist: d, s: track.cum[i] + u * len, nearest: q, tangent: [ex / len, ey / len] };
    }
  }
  return best;
}

/** Start pose: on the first point, heading along the track. */
export function trackStart(track: Track): { x: number; y: number; theta: number } {
  const a = track.points[0];
  const b = track.points[1 % track.points.length];
  return { x: a[0], y: a[1], theta: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}
