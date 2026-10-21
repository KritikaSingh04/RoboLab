/**
 * Minimal 4x4 homogeneous-transform matrix library.
 *
 * Conventions
 * - A matrix is a row-major `number[][]` of size 4x4 (`Mat4`).
 * - Angles are in radians (SI internally; convert to degrees at the UI boundary).
 * - Pure functions only: nothing here imports React or touches the DOM.
 */

export type Mat4 = number[][];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];

/** Numerical tolerance used by the comparison helpers. */
export const EPS = 1e-9;

/** 4x4 identity matrix. */
export function identity(): Mat4 {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

/** Deep-copy a matrix. */
export function clone(m: Mat4): Mat4 {
  return m.map((row) => [...row]);
}

/** Matrix product A·B for 4x4 matrices. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out: Mat4 = [];
  for (let i = 0; i < 4; i++) {
    const row: number[] = [];
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[i][k] * b[k][j];
      row.push(s);
    }
    out.push(row);
  }
  return out;
}

/** Left-to-right product of any number of matrices: multiplyAll(A, B, C) = A·B·C. */
export function multiplyAll(...ms: Mat4[]): Mat4 {
  return ms.reduce((acc, m) => multiply(acc, m), identity());
}

/** Transpose of a 4x4 matrix. */
export function transpose(m: Mat4): Mat4 {
  const out = identity();
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out[i][j] = m[j][i];
  return out;
}

/** Apply a transform to a 3D point (w = 1). Returns the transformed point. */
export function applyToPoint(m: Mat4, p: Vec3): Vec3 {
  const [x, y, z] = p;
  const w = m[3][0] * x + m[3][1] * y + m[3][2] * z + m[3][3];
  return [
    (m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3]) / w,
    (m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3]) / w,
    (m[2][0] * x + m[2][1] * y + m[2][2] * z + m[2][3]) / w,
  ];
}

/** Apply a transform to a 3D direction vector (w = 0, translation ignored). */
export function applyToVector(m: Mat4, v: Vec3): Vec3 {
  const [x, y, z] = v;
  return [
    m[0][0] * x + m[0][1] * y + m[0][2] * z,
    m[1][0] * x + m[1][1] * y + m[1][2] * z,
    m[2][0] * x + m[2][1] * y + m[2][2] * z,
  ];
}

/**
 * Inverse of a homogeneous transform  T = [R p; 0 1]  with R orthonormal.
 *   T⁻¹ = [Rᵀ  -Rᵀp; 0 1]
 * This is exact (no numerical elimination) and is what every kinematics
 * derivation uses, so it is the inverse exposed to the experiments.
 */
export function inverseHomogeneous(t: Mat4): Mat4 {
  const r = rotationPart(t);
  const p = translationPart(t);
  const rt = [
    [r[0][0], r[1][0], r[2][0]],
    [r[0][1], r[1][1], r[2][1]],
    [r[0][2], r[1][2], r[2][2]],
  ];
  const np = [
    -(rt[0][0] * p[0] + rt[0][1] * p[1] + rt[0][2] * p[2]),
    -(rt[1][0] * p[0] + rt[1][1] * p[1] + rt[1][2] * p[2]),
    -(rt[2][0] * p[0] + rt[2][1] * p[1] + rt[2][2] * p[2]),
  ];
  return [
    [rt[0][0], rt[0][1], rt[0][2], np[0]],
    [rt[1][0], rt[1][1], rt[1][2], np[1]],
    [rt[2][0], rt[2][1], rt[2][2], np[2]],
    [0, 0, 0, 1],
  ];
}

/**
 * General 4x4 inverse by Gauss–Jordan elimination with partial pivoting.
 * Use this for matrices that are not rigid transforms (e.g. scaled frames).
 * Throws if the matrix is singular.
 */
export function inverse(m: Mat4): Mat4 {
  const n = 4;
  const a = m.map((row, i) => [...row, ...identity()[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error('Matrix is singular');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const pv = a[col][col];
    for (let j = 0; j < 2 * n; j++) a[col][j] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

/** Determinant of a 4x4 matrix (cofactor expansion). */
export function determinant(m: Mat4): number {
  const det3 = (a: number[][]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  let d = 0;
  for (let c = 0; c < 4; c++) {
    const minor = m.slice(1).map((row) => row.filter((_, j) => j !== c));
    d += (c % 2 === 0 ? 1 : -1) * m[0][c] * det3(minor);
  }
  return d;
}

/** 3x3 rotation sub-matrix of a transform. */
export function rotationPart(t: Mat4): number[][] {
  return [
    [t[0][0], t[0][1], t[0][2]],
    [t[1][0], t[1][1], t[1][2]],
    [t[2][0], t[2][1], t[2][2]],
  ];
}

/** Translation vector of a transform. */
export function translationPart(t: Mat4): Vec3 {
  return [t[0][3], t[1][3], t[2][3]];
}

/** Determinant of the 3x3 rotation part. */
export function rotationDeterminant(t: Mat4): number {
  const r = rotationPart(t);
  return (
    r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1]) -
    r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0]) +
    r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0])
  );
}

/** True if the rotation part is orthonormal (RᵀR = I) with det = +1. */
export function isRigidTransform(t: Mat4, tol = 1e-6): boolean {
  const r = rotationPart(t);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += r[k][i] * r[k][j];
      if (Math.abs(s - (i === j ? 1 : 0)) > tol) return false;
    }
  }
  if (Math.abs(rotationDeterminant(t) - 1) > tol) return false;
  const bottom = t[3];
  return Math.abs(bottom[0]) < tol && Math.abs(bottom[1]) < tol && Math.abs(bottom[2]) < tol && Math.abs(bottom[3] - 1) < tol;
}

/** Rotation about the x-axis by `theta` radians. */
export function rotX(theta: number): Mat4 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [
    [1, 0, 0, 0],
    [0, c, -s, 0],
    [0, s, c, 0],
    [0, 0, 0, 1],
  ];
}

/** Rotation about the y-axis by `theta` radians. */
export function rotY(theta: number): Mat4 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [
    [c, 0, s, 0],
    [0, 1, 0, 0],
    [-s, 0, c, 0],
    [0, 0, 0, 1],
  ];
}

/** Rotation about the z-axis by `theta` radians. */
export function rotZ(theta: number): Mat4 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [
    [c, -s, 0, 0],
    [s, c, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

/** Pure translation by (x, y, z). */
export function trans(x: number, y: number, z: number): Mat4 {
  return [
    [1, 0, 0, x],
    [0, 1, 0, y],
    [0, 0, 1, z],
    [0, 0, 0, 1],
  ];
}

/** Build a transform from a 3x3 rotation and a translation vector. */
export function fromRotationTranslation(r: number[][], p: Vec3): Mat4 {
  return [
    [r[0][0], r[0][1], r[0][2], p[0]],
    [r[1][0], r[1][1], r[1][2], p[1]],
    [r[2][0], r[2][1], r[2][2], p[2]],
    [0, 0, 0, 1],
  ];
}

/** Element-wise comparison with tolerance. */
export function approxEqual(a: Mat4, b: Mat4, tol = 1e-9): boolean {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (Math.abs(a[i][j] - b[i][j]) > tol) return false;
  return true;
}

/** Round every element for display (default 3 decimals, CLAUDE.md rule 5). */
export function rounded(m: Mat4, decimals = 3): Mat4 {
  const f = 10 ** decimals;
  return m.map((row) => row.map((v) => Math.round(v * f) / f + 0));
}

export const deg2rad = (deg: number): number => (deg * Math.PI) / 180;
export const rad2deg = (rad: number): number => (rad * 180) / Math.PI;
