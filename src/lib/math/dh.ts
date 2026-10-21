/**
 * Denavit–Hartenberg (classic / distal convention).
 *
 *   {}^{i-1}T_i = Rot(z, θ_i) · Trans(z, d_i) · Trans(x, a_i) · Rot(x, α_i)
 *
 * Angles in radians, lengths in metres. Pure functions, no React.
 */
import { multiplyAll, rotX, rotZ, trans, type Mat4 } from './matrix';

export interface DHRow {
  /** Joint angle θ_i (rad). */
  theta: number;
  /** Link offset d_i (m). */
  d: number;
  /** Link length a_i (m). */
  a: number;
  /** Link twist α_i (rad). */
  alpha: number;
}

export type DHParam = keyof DHRow;

/** Link transform for one D-H row (closed form, identical to the product of the four primitives). */
export function dhTransform(theta: number, d: number, a: number, alpha: number): Mat4 {
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  return [
    [ct, -st * ca, st * sa, a * ct],
    [st, ct * ca, -ct * sa, a * st],
    [0, sa, ca, d],
    [0, 0, 0, 1],
  ];
}

/** Same transform built explicitly as Rot(z,θ)·Trans(z,d)·Trans(x,a)·Rot(x,α). Used by the tests. */
export function dhTransformFromPrimitives(theta: number, d: number, a: number, alpha: number): Mat4 {
  return multiplyAll(rotZ(theta), trans(0, 0, d), trans(a, 0, 0), rotX(alpha));
}

export function dhRowTransform(row: DHRow): Mat4 {
  return dhTransform(row.theta, row.d, row.a, row.alpha);
}
