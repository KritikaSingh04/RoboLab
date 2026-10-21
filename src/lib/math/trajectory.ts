/**
 * Joint-space trajectory profiles (cubic, quintic, LSPB / trapezoidal) and a
 * Cartesian straight-line sampler for a planar two-link arm.
 * Pure functions; units are whatever the caller uses consistently (rad, s).
 */
import { planarFK, planarIK, type Branch } from './planar';

export type Method = 'cubic' | 'quintic' | 'lspb';
export const METHODS: Method[] = ['cubic', 'quintic', 'lspb'];
export const METHOD_LABEL: Record<Method, string> = { cubic: 'Cubic polynomial', quintic: 'Quintic polynomial', lspb: 'LSPB (trapezoidal velocity)' };

export interface Coefficient {
  name: string;
  value: number;
}

export interface Profile {
  method: Method;
  q0: number;
  qf: number;
  tf: number;
  /** Position, velocity and acceleration. t is clamped to [0, tf] (the joint holds at the ends). */
  q: (t: number) => number;
  qd: (t: number) => number;
  qdd: (t: number) => number;
  coeffs: Coefficient[];
  /** Set when an input had to be adjusted (e.g. an infeasible LSPB cruise velocity). */
  note?: string;
  /** LSPB only: feasible cruise-velocity range (|Δ|/tf, 2|Δ|/tf] and whether V was clamped. */
  lspb?: { vMin: number; vMax: number; clamped?: 'raised' | 'lowered' };
}

const clampT = (t: number, tf: number) => Math.min(tf, Math.max(0, t));

/**
 * Cubic q(t) = a0 + a1 t + a2 t² + a3 t³ matching q, q̇ at both ends.
 *   a0 = q0, a1 = v0,
 *   a2 = (3Δ − (2v0 + vf) tf) / tf²,  a3 = (−2Δ + (v0 + vf) tf) / tf³,   Δ = qf − q0
 */
export function cubic(q0: number, qf: number, v0: number, vf: number, tf: number): Profile {
  const d = qf - q0;
  const a0 = q0;
  const a1 = v0;
  const a2 = (3 * d - (2 * v0 + vf) * tf) / (tf * tf);
  const a3 = (-2 * d + (v0 + vf) * tf) / (tf * tf * tf);
  return {
    method: 'cubic',
    q0,
    qf,
    tf,
    q: (t) => ((t = clampT(t, tf)), a0 + a1 * t + a2 * t * t + a3 * t * t * t),
    qd: (t) => ((t = clampT(t, tf)), a1 + 2 * a2 * t + 3 * a3 * t * t),
    qdd: (t) => ((t = clampT(t, tf)), 2 * a2 + 6 * a3 * t),
    coeffs: [
      { name: 'a0', value: a0 },
      { name: 'a1', value: a1 },
      { name: 'a2', value: a2 },
      { name: 'a3', value: a3 },
    ],
  };
}

/**
 * Quintic q(t) = Σ a_k t^k matching q, q̇ and q̈ at both ends.
 *   a0 = q0, a1 = v0, a2 = α0 / 2,
 *   a3 = (20Δ − (8vf + 12v0) tf − (3α0 − αf) tf²) / (2 tf³)
 *   a4 = (−30Δ + (14vf + 16v0) tf + (3α0 − 2αf) tf²) / (2 tf⁴)
 *   a5 = (12Δ − 6(vf + v0) tf − (α0 − αf) tf²) / (2 tf⁵)
 */
export function quintic(q0: number, qf: number, v0: number, vf: number, acc0: number, accf: number, tf: number): Profile {
  const d = qf - q0;
  const t2 = tf * tf;
  const t3 = t2 * tf;
  const t4 = t3 * tf;
  const t5 = t4 * tf;
  const a0 = q0;
  const a1 = v0;
  const a2 = acc0 / 2;
  const a3 = (20 * d - (8 * vf + 12 * v0) * tf - (3 * acc0 - accf) * t2) / (2 * t3);
  const a4 = (-30 * d + (14 * vf + 16 * v0) * tf + (3 * acc0 - 2 * accf) * t2) / (2 * t4);
  const a5 = (12 * d - 6 * (vf + v0) * tf - (acc0 - accf) * t2) / (2 * t5);
  return {
    method: 'quintic',
    q0,
    qf,
    tf,
    q: (t) => ((t = clampT(t, tf)), a0 + a1 * t + a2 * t ** 2 + a3 * t ** 3 + a4 * t ** 4 + a5 * t ** 5),
    qd: (t) => ((t = clampT(t, tf)), a1 + 2 * a2 * t + 3 * a3 * t ** 2 + 4 * a4 * t ** 3 + 5 * a5 * t ** 4),
    qdd: (t) => ((t = clampT(t, tf)), 2 * a2 + 6 * a3 * t + 12 * a4 * t ** 2 + 20 * a5 * t ** 3),
    coeffs: [
      { name: 'a0', value: a0 },
      { name: 'a1', value: a1 },
      { name: 'a2', value: a2 },
      { name: 'a3', value: a3 },
      { name: 'a4', value: a4 },
      { name: 'a5', value: a5 },
    ],
  };
}

/**
 * Linear Segment with Parabolic Blends (trapezoidal velocity), rest to rest.
 * Cruise velocity V must satisfy |Δ|/tf < V ≤ 2|Δ|/tf; V is clamped into that
 * range (and the note set) if not. Blend time tb = (V tf − Δ)/V, blend
 * acceleration α = V / tb.
 *   0 ≤ t ≤ tb:        q = q0 + ½α t²
 *   tb < t ≤ tf − tb:  q = q0 + ½α tb² + V (t − tb)
 *   tf − tb < t ≤ tf:  q = qf − ½α (tf − t)²
 */
export function lspb(q0: number, qf: number, tf: number, vmax: number): Profile {
  const d = qf - q0;
  const base = { method: 'lspb' as const, q0, qf, tf };
  if (Math.abs(d) < 1e-12) {
    return { ...base, q: () => q0, qd: () => 0, qdd: () => 0, coeffs: [{ name: 'V', value: 0 }, { name: 'tb', value: 0 }, { name: 'α', value: 0 }], note: 'No motion: start equals end.' };
  }
  const vMin = Math.abs(d) / tf;
  const vTri = 2 * vMin;
  let v = Math.abs(vmax);
  let note: string | undefined;
  let clamped: 'raised' | 'lowered' | undefined;
  if (v <= vMin) {
    v = vMin * 1.05;
    clamped = 'raised';
    note = `V must exceed |Δ|/tf = ${vMin.toPrecision(4)}; raised to ${v.toPrecision(4)}.`;
  } else if (v > vTri) {
    v = vTri;
    clamped = 'lowered';
    note = `V cannot exceed 2|Δ|/tf = ${vTri.toPrecision(4)} (triangular profile); lowered to it.`;
  }
  const V = Math.sign(d) * v;
  const tb = (v * tf - Math.abs(d)) / v;
  const alpha = V / tb;
  const q = (t: number) => {
    t = clampT(t, tf);
    if (t <= tb) return q0 + 0.5 * alpha * t * t;
    if (t <= tf - tb) return q0 + 0.5 * alpha * tb * tb + V * (t - tb);
    const tau = tf - t;
    return qf - 0.5 * alpha * tau * tau;
  };
  const qd = (t: number) => {
    t = clampT(t, tf);
    if (t <= tb) return alpha * t;
    if (t <= tf - tb) return V;
    return alpha * (tf - t);
  };
  const qdd = (t: number) => {
    t = clampT(t, tf);
    if (t < tb) return alpha;
    if (t <= tf - tb) return 0;
    return -alpha;
  };
  return {
    ...base,
    q,
    qd,
    qdd,
    coeffs: [
      { name: 'V', value: V },
      { name: 'tb', value: tb },
      { name: 'α', value: alpha },
    ],
    note,
    lspb: { vMin, vMax: vTri, clamped },
  };
}

export interface ProfileParams {
  v0?: number;
  vf?: number;
  acc0?: number;
  accf?: number;
  vmax?: number;
}

/** Build a profile by method name. */
export function makeProfile(method: Method, q0: number, qf: number, tf: number, p: ProfileParams = {}): Profile {
  switch (method) {
    case 'cubic':
      return cubic(q0, qf, p.v0 ?? 0, p.vf ?? 0, tf);
    case 'quintic':
      return quintic(q0, qf, p.v0 ?? 0, p.vf ?? 0, p.acc0 ?? 0, p.accf ?? 0, tf);
    case 'lspb':
      return lspb(q0, qf, tf, p.vmax ?? (1.5 * Math.abs(qf - q0)) / tf);
  }
}

export interface Sample {
  t: number;
  q: number;
  qd: number;
  qdd: number;
}

export function sampleProfile(p: Profile, n = 201): Sample[] {
  const out: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const t = (p.tf * i) / (n - 1);
    out.push({ t, q: p.q(t), qd: p.qd(t), qdd: p.qdd(t) });
  }
  return out;
}

export interface ProfileStats {
  vMax: number;
  aMax: number;
  aRms: number;
  /** Highest derivative that is continuous over [0, tf], including the end points: 'C0' | 'C1' | 'C2'. */
  continuity: string;
}

/** Peak / RMS values and the continuity class of a profile. */
export function profileStats(p: Profile, n = 401): ProfileStats {
  const s = sampleProfile(p, n);
  const vMax = Math.max(...s.map((x) => Math.abs(x.qd)));
  const aMax = Math.max(...s.map((x) => Math.abs(x.qdd)));
  const aRms = Math.sqrt(s.reduce((acc, x) => acc + x.qdd * x.qdd, 0) / s.length);
  let continuity: string;
  if (p.method === 'quintic') continuity = 'C²  (q̈ continuous, also at the ends when α0 = αf = 0)';
  else if (p.method === 'cubic') continuity = 'C¹  (q̈ jumps at t = 0 and t = tf)';
  else continuity = 'C¹  (q̈ jumps at the blend points)';
  return { vMax, aMax, aRms, continuity };
}

// ---------------------------------------------------------------------------
// Two-link arm helpers
// ---------------------------------------------------------------------------

export interface TwoLink {
  l1: number;
  l2: number;
}

export function twoLinkFK(links: TwoLink, q: [number, number]): { elbow: [number, number]; tip: [number, number] } {
  const fk = planarFK({ ...links, l3: 0 }, [q[0], q[1], 0]);
  return { elbow: fk.joints[1], tip: fk.joints[2] };
}

/** Two-link IK: returns [θ1, θ2] for the chosen branch, or null if unreachable. */
export function twoLinkIK(links: TwoLink, x: number, y: number, branch: Branch = 'up'): [number, number] | null {
  const ik = planarIK({ ...links, l3: 0 }, { x, y, phi: 0 });
  const sol = ik.solutions[branch];
  return sol ? [sol.q[0], sol.q[1]] : null;
}

export interface JointSample {
  t: number;
  q: [number, number];
  qd: [number, number];
  qdd: [number, number];
  tip: [number, number];
  reachable: boolean;
}

/** Joint-space trajectory: one profile per joint, tip computed by FK. */
export function sampleJointSpace(links: TwoLink, profiles: [Profile, Profile], n = 201): JointSample[] {
  const tf = profiles[0].tf;
  const out: JointSample[] = [];
  for (let i = 0; i < n; i++) {
    const t = (tf * i) / (n - 1);
    const q: [number, number] = [profiles[0].q(t), profiles[1].q(t)];
    out.push({ t, q, qd: [profiles[0].qd(t), profiles[1].qd(t)], qdd: [profiles[0].qdd(t), profiles[1].qdd(t)], tip: twoLinkFK(links, q).tip, reachable: true });
  }
  return out;
}

/**
 * Cartesian straight line from p0 to pf with the time-scaling s(t) ∈ [0, 1]
 * given by `scaling` (a profile from 0 to 1). IK at every sample; joint
 * velocities and accelerations by central finite differences.
 */
export function sampleCartesianLine(links: TwoLink, p0: [number, number], pf: [number, number], scaling: Profile, branch: Branch = 'up', n = 201): JointSample[] {
  const tf = scaling.tf;
  const pts: { t: number; q: [number, number] | null; tip: [number, number] }[] = [];
  for (let i = 0; i < n; i++) {
    const t = (tf * i) / (n - 1);
    const s = scaling.q(t);
    const tip: [number, number] = [p0[0] + s * (pf[0] - p0[0]), p0[1] + s * (pf[1] - p0[1])];
    pts.push({ t, q: twoLinkIK(links, tip[0], tip[1], branch), tip });
  }
  // Unwrap θ so finite differences do not see ±π jumps.
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1].q;
    const b = pts[i].q;
    if (!a || !b) continue;
    for (let j = 0; j < 2; j++) {
      while (b[j] - a[j] > Math.PI) b[j] -= 2 * Math.PI;
      while (b[j] - a[j] < -Math.PI) b[j] += 2 * Math.PI;
    }
  }
  const h = tf / (n - 1);
  const out: JointSample[] = [];
  for (let i = 0; i < n; i++) {
    const c = pts[i];
    const qd: [number, number] = [NaN, NaN];
    const qdd: [number, number] = [NaN, NaN];
    if (c.q) {
      const prev = pts[Math.max(0, i - 1)].q;
      const next = pts[Math.min(n - 1, i + 1)].q;
      const dt = (Math.min(n - 1, i + 1) - Math.max(0, i - 1)) * h;
      if (prev && next) {
        for (let j = 0; j < 2; j++) {
          qd[j] = (next[j] - prev[j]) / dt;
          qdd[j] = i > 0 && i < n - 1 ? (next[j] - 2 * c.q[j] + prev[j]) / (h * h) : NaN;
        }
      }
    }
    out.push({ t: c.t, q: c.q ?? [NaN, NaN], qd, qdd, tip: c.tip, reachable: c.q !== null });
  }
  // End-point accelerations: copy the neighbour so the plots are not cut off.
  if (n > 2) {
    out[0].qdd = [...out[1].qdd] as [number, number];
    out[n - 1].qdd = [...out[n - 2].qdd] as [number, number];
  }
  return out;
}

/** Interpolate the joint angles of a sample set at time t (linear between samples). */
export function jointsAt(samples: JointSample[], t: number): [number, number] | null {
  if (samples.length === 0) return null;
  const tf = samples[samples.length - 1].t;
  const u = Math.min(tf, Math.max(0, t)) / tf;
  const idx = u * (samples.length - 1);
  const i = Math.min(samples.length - 2, Math.floor(idx));
  const f = idx - i;
  const a = samples[i];
  const b = samples[i + 1];
  if (!a.reachable || !b.reachable) return a.reachable ? a.q : b.reachable ? b.q : null;
  return [a.q[0] + f * (b.q[0] - a.q[0]), a.q[1] + f * (b.q[1] - a.q[1])];
}
