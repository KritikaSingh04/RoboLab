/**
 * Dynamics of a single rigid link (uniform rod + tip payload) in a vertical
 * plane, and of a two-link planar arm (Lagrangian form). Angles from the
 * horizontal, counter-clockwise positive, gravity along −y. Pure functions.
 */
import { integrate } from './ode';
import type { Profile } from './trajectory';

export interface SingleLinkParams {
  /** rod mass (kg) */
  m: number;
  /** rod length (m) */
  L: number;
  /** tip payload (kg) */
  M: number;
  /** viscous friction (N·m·s/rad) */
  b: number;
  g: number;
}
export const DEFAULT_LINK: SingleLinkParams = { m: 1.0, L: 0.5, M: 0.2, b: 0.05, g: 9.81 };

/** Total moment of inertia about the joint: mL²/3 + ML². */
export const inertia = (p: SingleLinkParams): number => (p.m * p.L * p.L) / 3 + p.M * p.L * p.L;
/** Gravity torque amplitude: (mL/2 + ML) g. */
export const gravityCoeff = (p: SingleLinkParams): number => ((p.m * p.L) / 2 + p.M * p.L) * p.g;

export interface TorqueSplit {
  inertial: number;
  friction: number;
  gravity: number;
  total: number;
}

/** Inverse dynamics: τ = I θ̈ + b θ̇ + G cos θ. */
export function singleLinkTorque(p: SingleLinkParams, theta: number, omega: number, alpha: number): TorqueSplit {
  const inertial = inertia(p) * alpha;
  const friction = p.b * omega;
  const gravity = gravityCoeff(p) * Math.cos(theta);
  return { inertial, friction, gravity, total: inertial + friction + gravity };
}

/** Forward dynamics: θ̈ = (τ − b θ̇ − G cos θ) / I. */
export function singleLinkAccel(p: SingleLinkParams, theta: number, omega: number, tau: number): number {
  return (tau - p.b * omega - gravityCoeff(p) * Math.cos(theta)) / inertia(p);
}

export interface Energy {
  kinetic: number;
  potential: number;
  total: number;
}

/** KE = ½ I θ̇², PE = (mL/2 + ML) g sin θ (zero at the horizontal). */
export function singleLinkEnergy(p: SingleLinkParams, theta: number, omega: number): Energy {
  const kinetic = 0.5 * inertia(p) * omega * omega;
  const potential = gravityCoeff(p) * Math.sin(theta);
  return { kinetic, potential, total: kinetic + potential };
}

export interface LinkSample {
  t: number;
  theta: number;
  omega: number;
  alpha: number;
  tau: number;
  inertial: number;
  friction: number;
  gravity: number;
  kinetic: number;
  potential: number;
  total: number;
}

/** Inverse dynamics along a joint-space profile (e.g. a cubic from trajectory.ts). */
export function inverseDynamics(p: SingleLinkParams, profile: Profile, n = 241): LinkSample[] {
  const out: LinkSample[] = [];
  for (let i = 0; i < n; i++) {
    const t = (profile.tf * i) / (n - 1);
    const theta = profile.q(t);
    const omega = profile.qd(t);
    const alpha = profile.qdd(t);
    const s = singleLinkTorque(p, theta, omega, alpha);
    const e = singleLinkEnergy(p, theta, omega);
    out.push({ t, theta, omega, alpha, tau: s.total, ...s, ...e });
  }
  return out;
}

export type TorqueInput = { kind: 'free' } | { kind: 'constant'; tau: number } | { kind: 'step'; tau: number; at: number };

export const torqueAt = (input: TorqueInput, t: number): number => (input.kind === 'free' ? 0 : input.kind === 'constant' ? input.tau : t >= input.at ? input.tau : 0);

/** Forward dynamics with RK4. */
export function simulateSingleLink(p: SingleLinkParams, theta0: number, omega0: number, input: TorqueInput, tf: number, h = 1 / 240, every = 2): LinkSample[] {
  const f = (t: number, y: number[]) => [y[1], singleLinkAccel(p, y[0], y[1], torqueAt(input, t))];
  return integrate(f, [theta0, omega0], 0, tf, h, 'rk4', every).map(({ t, y }) => {
    const tau = torqueAt(input, t);
    const alpha = singleLinkAccel(p, y[0], y[1], tau);
    const s = singleLinkTorque(p, y[0], y[1], alpha);
    const e = singleLinkEnergy(p, y[0], y[1]);
    return { t, theta: y[0], omega: y[1], alpha, tau, inertial: s.inertial, friction: s.friction, gravity: s.gravity, ...e };
  });
}

/**
 * Largest deviation of the total energy from its initial value, relative to
 * the energy scale of the motion (|E₀| or the peak kinetic energy, whichever
 * is larger, so a start from rest at zero potential is handled).
 */
export function energyDrift(samples: { total: number; kinetic: number }[]): number {
  const e0 = samples[0].total;
  const scale = Math.max(Math.abs(e0), ...samples.map((s) => s.kinetic), 1e-9);
  return Math.max(...samples.map((s) => Math.abs(s.total - e0))) / scale;
}

// ---------------------------------------------------------------------------
// Two-link planar arm (Lagrangian form  M(q) q̈ + C(q, q̇) q̇ + G(q) = τ)
// ---------------------------------------------------------------------------

export interface TwoLinkParams {
  m1: number;
  m2: number;
  l1: number;
  l2: number;
  g: number;
  /** viscous friction at each joint */
  b: number;
}
export const DEFAULT_TWO_LINK: TwoLinkParams = { m1: 1, m2: 1, l1: 0.5, l2: 0.5, g: 9.81, b: 0 };

/** Uniform rods: centre of mass at l/2, inertia about the centre m l²/12. */
export function twoLinkMatrices(p: TwoLinkParams, q: [number, number], qd: [number, number]): { M: number[][]; C: number[][]; G: number[] } {
  const { m1, m2, l1, l2, g } = p;
  const lc1 = l1 / 2;
  const lc2 = l2 / 2;
  const I1 = (m1 * l1 * l1) / 12;
  const I2 = (m2 * l2 * l2) / 12;
  const c1 = Math.cos(q[0]);
  const c2 = Math.cos(q[1]);
  const s2 = Math.sin(q[1]);
  const c12 = Math.cos(q[0] + q[1]);
  const M = [
    [m1 * lc1 * lc1 + m2 * (l1 * l1 + lc2 * lc2 + 2 * l1 * lc2 * c2) + I1 + I2, m2 * (lc2 * lc2 + l1 * lc2 * c2) + I2],
    [m2 * (lc2 * lc2 + l1 * lc2 * c2) + I2, m2 * lc2 * lc2 + I2],
  ];
  const h = -m2 * l1 * lc2 * s2;
  const C = [
    [h * qd[1], h * (qd[0] + qd[1])],
    [-h * qd[0], 0],
  ];
  const G = [(m1 * lc1 + m2 * l1) * g * c1 + m2 * lc2 * g * c12, m2 * lc2 * g * c12];
  return { M, C, G };
}

export function twoLinkAccel(p: TwoLinkParams, q: [number, number], qd: [number, number], tau: [number, number] = [0, 0]): [number, number] {
  const { M, C, G } = twoLinkMatrices(p, q, qd);
  const r = [tau[0] - C[0][0] * qd[0] - C[0][1] * qd[1] - G[0] - p.b * qd[0], tau[1] - C[1][0] * qd[0] - C[1][1] * qd[1] - G[1] - p.b * qd[1]];
  const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
  return [(M[1][1] * r[0] - M[0][1] * r[1]) / det, (-M[1][0] * r[0] + M[0][0] * r[1]) / det];
}

export function twoLinkEnergy(p: TwoLinkParams, q: [number, number], qd: [number, number]): Energy {
  const { M } = twoLinkMatrices(p, q, qd);
  const kinetic = 0.5 * (M[0][0] * qd[0] * qd[0] + 2 * M[0][1] * qd[0] * qd[1] + M[1][1] * qd[1] * qd[1]);
  const potential = ((p.m1 * p.l1) / 2 + p.m2 * p.l1) * p.g * Math.sin(q[0]) + ((p.m2 * p.l2) / 2) * p.g * Math.sin(q[0] + q[1]);
  return { kinetic, potential, total: kinetic + potential };
}

export interface TwoLinkSample {
  t: number;
  q: [number, number];
  qd: [number, number];
  qdd: [number, number];
  kinetic: number;
  potential: number;
  total: number;
  /** tip position */
  tip: [number, number];
}

export function twoLinkFK(p: TwoLinkParams, q: [number, number]): { elbow: [number, number]; tip: [number, number] } {
  const elbow: [number, number] = [p.l1 * Math.cos(q[0]), p.l1 * Math.sin(q[0])];
  return { elbow, tip: [elbow[0] + p.l2 * Math.cos(q[0] + q[1]), elbow[1] + p.l2 * Math.sin(q[0] + q[1])] };
}

export function simulateTwoLink(p: TwoLinkParams, q0: [number, number], qd0: [number, number], tf: number, h = 1 / 480, every = 4): TwoLinkSample[] {
  const f = (_t: number, y: number[]) => {
    const a = twoLinkAccel(p, [y[0], y[1]], [y[2], y[3]]);
    return [y[2], y[3], a[0], a[1]];
  };
  return integrate(f, [q0[0], q0[1], qd0[0], qd0[1]], 0, tf, h, 'rk4', every).map(({ t, y }) => {
    const q: [number, number] = [y[0], y[1]];
    const qd: [number, number] = [y[2], y[3]];
    return { t, q, qd, qdd: twoLinkAccel(p, q, qd), ...twoLinkEnergy(p, q, qd), tip: twoLinkFK(p, q).tip };
  });
}

// ---------------------------------------------------------------------------
// External data (e.g. MSC ADAMS exports)
// ---------------------------------------------------------------------------

export interface CsvTable {
  headers: string[];
  rows: number[][];
}

/** Parse a numeric CSV / TSV with a header row (non-numeric cells become NaN). */
export function parseCsv(text: string): CsvTable {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (lines.length === 0) return { headers: [], rows: [] };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const first = lines[0].split(sep).map((c) => c.trim());
  const hasHeader = first.some((c) => Number.isNaN(parseFloat(c)));
  const headers = hasHeader ? first : first.map((_, i) => `column ${i + 1}`);
  const rows = lines.slice(hasHeader ? 1 : 0).map((l) => l.split(sep).map((c) => parseFloat(c.trim()))).filter((r) => r.length >= headers.length && r.some((v) => Number.isFinite(v)));
  return { headers, rows };
}

/** Linear interpolation of (t, v) data at time t (clamped to the ends). Data must be sorted by t. */
export function interpolate(ts: number[], vs: number[], t: number): number {
  if (ts.length === 0) return NaN;
  if (t <= ts[0]) return vs[0];
  if (t >= ts[ts.length - 1]) return vs[vs.length - 1];
  let lo = 0;
  let hi = ts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid;
    else hi = mid;
  }
  const u = (t - ts[lo]) / (ts[hi] - ts[lo] || 1);
  return vs[lo] + u * (vs[hi] - vs[lo]);
}

/** RMS difference between a computed series and reference data over the overlapping time range. */
export function rmsError(computed: { t: number; v: number }[], refT: number[], refV: number[]): { rms: number; n: number } {
  const t0 = refT[0];
  const t1 = refT[refT.length - 1];
  let s = 0;
  let n = 0;
  for (const c of computed) {
    if (c.t < t0 || c.t > t1) continue;
    const d = c.v - interpolate(refT, refV, c.t);
    s += d * d;
    n++;
  }
  return { rms: n ? Math.sqrt(s / n) : NaN, n };
}
