/**
 * Planar 3-link RRR arm: forward kinematics, analytic inverse kinematics with
 * both elbow branches, the intermediate "working" values for a worked answer,
 * and helpers for drawn paths. Pure functions, SI units, radians.
 */
import { wrapAngle } from './kinematics';

export interface PlanarLinks {
  l1: number;
  l2: number;
  l3: number;
}

export interface PlanarPose {
  x: number;
  y: number;
  /** End-effector orientation φ = θ1 + θ2 + θ3 (rad). */
  phi: number;
}

export type Branch = 'up' | 'down';
export const BRANCHES: Branch[] = ['up', 'down'];

export interface PlanarFK {
  /** [base, elbow, wrist, tip] in metres. */
  joints: [number, number][];
  pose: PlanarPose;
}

export function planarFK(links: PlanarLinks, q: number[]): PlanarFK {
  const [t1, t2, t3] = q;
  const a1 = t1;
  const a12 = t1 + t2;
  const a123 = t1 + t2 + t3;
  const p1: [number, number] = [links.l1 * Math.cos(a1), links.l1 * Math.sin(a1)];
  const p2: [number, number] = [p1[0] + links.l2 * Math.cos(a12), p1[1] + links.l2 * Math.sin(a12)];
  const p3: [number, number] = [p2[0] + links.l3 * Math.cos(a123), p2[1] + links.l3 * Math.sin(a123)];
  return { joints: [[0, 0], p1, p2, p3], pose: { x: p3[0], y: p3[1], phi: wrapAngle(a123) } };
}

/** Every intermediate quantity of the derivation, for the "worked answer" panel. */
export interface IKWorking {
  xw: number;
  yw: number;
  /** |wrist|² and |wrist| */
  r2: number;
  r: number;
  c2: number;
  reachable: boolean;
  /** s2 per branch: up = −√(1−c2²), down = +√(1−c2²). NaN when unreachable. */
  s2: Record<Branch, number>;
  /** β = atan2(yw, xw) */
  beta: number;
  /** γ = atan2(L2 s2, L1 + L2 c2) per branch */
  gamma: Record<Branch, number>;
}

export interface IKBranchSolution {
  branch: Branch;
  /** [θ1, θ2, θ3] wrapped to (−π, π]. */
  q: [number, number, number];
  fk: PlanarFK;
  /** |FK position − target| in metres. */
  posError: number;
  /** FK orientation − target orientation (rad), wrapped. */
  phiError: number;
}

export interface IKResult {
  reachable: boolean;
  working: IKWorking;
  solutions: Record<Branch, IKBranchSolution | null>;
}

/**
 * Analytic IK:
 *   xw = x − L3 cosφ, yw = y − L3 sinφ
 *   c2 = (xw² + yw² − L1² − L2²) / (2 L1 L2)        reachable iff |c2| ≤ 1
 *   θ2 = atan2(∓√(1−c2²), c2)   (up: −, down: +)
 *   θ1 = atan2(yw, xw) − atan2(L2 sinθ2, L1 + L2 cosθ2)
 *   θ3 = φ − θ1 − θ2
 * "Elbow-up" is the branch whose elbow lies to the left of the base→wrist line (θ2 < 0).
 */
export function planarIK(links: PlanarLinks, pose: PlanarPose): IKResult {
  const { l1, l2, l3 } = links;
  const xw = pose.x - l3 * Math.cos(pose.phi);
  const yw = pose.y - l3 * Math.sin(pose.phi);
  const r2 = xw * xw + yw * yw;
  let c2 = (r2 - l1 * l1 - l2 * l2) / (2 * l1 * l2);
  // Absorb floating-point overshoot at the workspace boundary.
  if (Math.abs(c2) > 1 && Math.abs(c2) - 1 < 1e-9) c2 = Math.sign(c2);
  const reachable = Number.isFinite(c2) && Math.abs(c2) <= 1;
  const root = reachable ? Math.sqrt(Math.max(0, 1 - c2 * c2)) : NaN;
  const beta = Math.atan2(yw, xw);
  const s2: Record<Branch, number> = { up: -root, down: root };
  const gamma: Record<Branch, number> = { up: NaN, down: NaN };
  const solutions: Record<Branch, IKBranchSolution | null> = { up: null, down: null };

  if (reachable) {
    for (const b of BRANCHES) {
      const t2 = Math.atan2(s2[b], c2);
      gamma[b] = Math.atan2(l2 * s2[b], l1 + l2 * c2);
      const t1 = wrapAngle(beta - gamma[b]);
      const t3 = wrapAngle(pose.phi - t1 - t2);
      const q: [number, number, number] = [t1, wrapAngle(t2), t3];
      const fk = planarFK(links, q);
      solutions[b] = {
        branch: b,
        q,
        fk,
        posError: Math.hypot(fk.pose.x - pose.x, fk.pose.y - pose.y),
        phiError: wrapAngle(fk.pose.phi - pose.phi),
      };
    }
  }

  return { reachable, working: { xw, yw, r2, r: Math.sqrt(r2), c2, reachable, s2, beta, gamma }, solutions };
}

/**
 * Exact reachable region of the end-effector for a fixed φ: the wrist annulus
 * [|L1−L2|, L1+L2] translated by L3·(cosφ, sinφ).
 */
export function reachableAnnulus(links: PlanarLinks, phi: number): { cx: number; cy: number; rMin: number; rMax: number } {
  return { cx: links.l3 * Math.cos(phi), cy: links.l3 * Math.sin(phi), rMin: Math.abs(links.l1 - links.l2), rMax: links.l1 + links.l2 };
}

/**
 * For an unreachable target, the closest reachable pose with the same φ:
 * the wrist is projected radially onto the annulus boundary.
 */
export function nearestReachable(links: PlanarLinks, pose: PlanarPose): PlanarPose {
  const { l1, l2, l3 } = links;
  const xw = pose.x - l3 * Math.cos(pose.phi);
  const yw = pose.y - l3 * Math.sin(pose.phi);
  const r = Math.hypot(xw, yw);
  const rMin = Math.abs(l1 - l2);
  const rMax = l1 + l2;
  let k = 1;
  if (r > rMax) k = rMax / r;
  else if (r < rMin) k = r > 1e-12 ? rMin / r : 0;
  const nx = r > 1e-12 ? xw * k : rMin;
  const ny = r > 1e-12 ? yw * k : 0;
  return { x: nx + l3 * Math.cos(pose.phi), y: ny + l3 * Math.sin(pose.phi), phi: pose.phi };
}

/** Largest distance the tip can ever reach (any φ). */
export const maxReach = (links: PlanarLinks): number => links.l1 + links.l2 + links.l3;

// ---------------------------------------------------------------------------
// Drawn paths
// ---------------------------------------------------------------------------

export interface PathPoint {
  x: number;
  y: number;
  /** Arc length from the start (m). */
  s: number;
  /** Tangent direction (rad). */
  tangent: number;
}

export function pathLength(points: { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return s;
}

/** Resample a polyline at (almost) constant arc-length spacing. Always keeps the first and last point. */
export function resamplePath(points: { x: number; y: number }[], spacing: number): PathPoint[] {
  if (points.length === 0) return [];
  const total = pathLength(points);
  if (points.length === 1 || total < 1e-12) return [{ x: points[0].x, y: points[0].y, s: 0, tangent: 0 }];
  const n = Math.max(2, Math.round(total / spacing) + 1);
  const step = total / (n - 1);
  const out: PathPoint[] = [];
  let seg = 0;
  let segStart = 0;
  let segLen = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  for (let k = 0; k < n; k++) {
    const s = Math.min(k * step, total);
    while (seg < points.length - 2 && s > segStart + segLen) {
      segStart += segLen;
      seg++;
      segLen = Math.hypot(points[seg + 1].x - points[seg].x, points[seg + 1].y - points[seg].y);
    }
    const u = segLen > 0 ? Math.min(1, Math.max(0, (s - segStart) / segLen)) : 0;
    const a = points[seg];
    const b = points[seg + 1];
    out.push({ x: a.x + u * (b.x - a.x), y: a.y + u * (b.y - a.y), s, tangent: Math.atan2(b.y - a.y, b.x - a.x) });
  }
  return out;
}

/** Linear interpolation along a resampled path at arc length s. Returns null past the end. */
export function samplePath(path: PathPoint[], s: number): PathPoint | null {
  if (path.length === 0) return null;
  const last = path[path.length - 1];
  if (s >= last.s) return s - last.s < 1e-9 ? last : null;
  if (s <= 0) return path[0];
  let lo = 0;
  let hi = path.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid].s <= s) lo = mid;
    else hi = mid;
  }
  const a = path[lo];
  const b = path[hi];
  const u = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  return { x: a.x + u * (b.x - a.x), y: a.y + u * (b.y - a.y), s, tangent: a.tangent };
}
