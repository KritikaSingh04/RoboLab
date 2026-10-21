/**
 * Screw transformations.
 *
 * A screw motion is a rotation by φ about a unit axis u through a point p,
 * combined with a translation λ along the same axis (Chasles' theorem).
 * Pure functions; angles in radians, lengths in metres.
 */
import { identity, multiply, rotX, rotY, rotZ, trans, type Mat4, type Vec3 } from './matrix';

export type Axis = 'x' | 'y' | 'z';
export const AXES: Axis[] = ['x', 'y', 'z'];
export const AXIS_VECTOR: Record<Axis, Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** Rotation about a coordinate axis. */
export function rotAxis(axis: Axis, phi: number): Mat4 {
  return axis === 'x' ? rotX(phi) : axis === 'y' ? rotY(phi) : rotZ(phi);
}

/** Translation by λ along a coordinate axis. */
export function transAxis(axis: Axis, lambda: number): Mat4 {
  const v = AXIS_VECTOR[axis];
  return trans(v[0] * lambda, v[1] * lambda, v[2] * lambda);
}

/**
 * Fundamental screw about coordinate axis k:  Screw_k(λ, φ) = Trans(λ k) · Rot(k, φ).
 * Translation along and rotation about the same axis commute, so the order is immaterial.
 */
export function screwAxis(axis: Axis, lambda: number, phi: number): Mat4 {
  return multiply(transAxis(axis, lambda), rotAxis(axis, phi));
}

export const norm = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

export function normalize(v: Vec3): Vec3 {
  const n = norm(v);
  if (n < 1e-12) throw new Error('Cannot normalise a zero vector');
  return [v[0] / n, v[1] / n, v[2] / n];
}

/**
 * Rodrigues' rotation formula: 3x3 rotation by φ about unit vector u.
 *   R = I + sinφ [u]× + (1 − cosφ) [u]×²
 *   R_ij = cosφ δ_ij + (1 − cosφ) u_i u_j − sinφ ε_ijk u_k
 */
export function rodrigues(u: Vec3, phi: number): number[][] {
  const [ux, uy, uz] = normalize(u);
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const v = 1 - c;
  return [
    [c + ux * ux * v, ux * uy * v - uz * s, ux * uz * v + uy * s],
    [uy * ux * v + uz * s, c + uy * uy * v, uy * uz * v - ux * s],
    [uz * ux * v - uy * s, uz * uy * v + ux * s, c + uz * uz * v],
  ];
}

export interface ScrewParams {
  /** Axis direction (need not be unit length). */
  u: Vec3;
  /** A point on the axis. */
  p: Vec3;
  /** Translation along the axis (m). */
  lambda: number;
  /** Rotation about the axis (rad). */
  phi: number;
}

/**
 * General screw about the axis {p + t·u}:
 *   T = Trans(p) · [R(u,φ)  λu; 0 1] · Trans(−p) = [R  (I − R)p + λu; 0 1]
 */
export function screwGeneral({ u, p, lambda, phi }: ScrewParams): Mat4 {
  const un = normalize(u);
  const r = rodrigues(un, phi);
  const t: Vec3 = [0, 1, 2].map((i) => p[i] - (r[i][0] * p[0] + r[i][1] * p[1] + r[i][2] * p[2]) + lambda * un[i]) as Vec3;
  return [
    [r[0][0], r[0][1], r[0][2], t[0]],
    [r[1][0], r[1][1], r[1][2], t[1]],
    [r[2][0], r[2][1], r[2][2], t[2]],
    [0, 0, 0, 1],
  ];
}

/** Pitch h = λ/φ (m/rad). Infinity for a pure translation, 0 for a pure rotation. */
export function pitch(lambda: number, phi: number): number {
  if (Math.abs(phi) < 1e-12) return Math.abs(lambda) < 1e-12 ? 0 : Infinity;
  return lambda / phi;
}

/** Product T1 · T2 · … · Tn in the given order (identity for an empty list). */
export function composeScrews(mats: Mat4[]): Mat4 {
  return mats.reduce((acc, m) => multiply(acc, m), identity());
}

/** Apply a transform to a point. */
export function transformPoint(t: Mat4, q: Vec3): Vec3 {
  return [0, 1, 2].map((i) => t[i][0] * q[0] + t[i][1] * q[1] + t[i][2] * q[2] + t[i][3]) as Vec3;
}

/**
 * Helical path of a point under a screw, sampled at n fractions s ∈ [0, 1]:
 * the point after the partial screw (sλ, sφ).
 */
export function screwPath(params: ScrewParams, q: Vec3, n = 121): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    out.push(transformPoint(screwGeneral({ ...params, lambda: s * params.lambda, phi: s * params.phi }), q));
  }
  return out;
}

/** Frobenius norm of A − B, used to quantify non-commutativity. */
export function matrixDistance(a: Mat4, b: Mat4): number {
  let s = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) s += (a[i][j] - b[i][j]) ** 2;
  return Math.sqrt(s);
}
