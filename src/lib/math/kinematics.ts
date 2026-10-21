/**
 * Forward kinematics of serial chains described by D-H tables, plus the SCARA
 * (Adept One style, RRPR) model used by experiment 3.
 */
import { identity, multiply, rad2deg, deg2rad, type Mat4 } from './matrix';
import { dhRowTransform, type DHParam, type DHRow } from './dh';

/** Returns all intermediate frames [T0_1, T0_2, …, T0_n] for a D-H table. */
export function forwardKinematics(table: DHRow[]): Mat4[] {
  const frames: Mat4[] = [];
  let t = identity();
  for (const row of table) {
    t = multiply(t, dhRowTransform(row));
    frames.push(t);
  }
  return frames;
}

export interface Pose {
  x: number;
  y: number;
  z: number;
  /** Rotation of the tool x-axis about the world z-axis (rad), atan2(r21, r11). */
  roll: number;
}

/** Position and tool roll (about world z) of a transform. */
export function poseFromTransform(t: Mat4): Pose {
  return { x: t[0][3], y: t[1][3], z: t[2][3], roll: Math.atan2(t[1][0], t[0][0]) };
}

/** Wrap an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  let r = ((a + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (r <= -Math.PI) r += 2 * Math.PI;
  return r;
}

// ---------------------------------------------------------------------------
// SCARA model
// ---------------------------------------------------------------------------

/** Which cell of which row is driven by each joint variable (θ1, θ2, d3, θ4). */
export interface JointCell {
  row: number;
  param: DHParam;
  kind: 'revolute' | 'prismatic';
  label: string;
}

export const SCARA_JOINT_CELLS: JointCell[] = [
  { row: 0, param: 'theta', kind: 'revolute', label: 'θ1' },
  { row: 1, param: 'theta', kind: 'revolute', label: 'θ2' },
  { row: 2, param: 'd', kind: 'prismatic', label: 'd3' },
  { row: 3, param: 'theta', kind: 'revolute', label: 'θ4' },
];

/** Default table from the lab sheet. Variable cells hold 0 and are overwritten by the joint values. */
export const SCARA_DEFAULT_TABLE: DHRow[] = [
  { theta: 0, d: 0.877, a: 0.425, alpha: Math.PI },
  { theta: 0, d: 0, a: 0.375, alpha: 0 },
  { theta: 0, d: 0, a: 0, alpha: 0 },
  { theta: 0, d: 0.2, a: 0, alpha: 0 },
];

/** Textbook (Spong) assignment: the z-flip is on link 2 instead of link 1, giving x = a1 c1 + a2 c12. */
export const SCARA_TEXTBOOK_TABLE: DHRow[] = [
  { theta: 0, d: 0.877, a: 0.425, alpha: 0 },
  { theta: 0, d: 0, a: 0.375, alpha: Math.PI },
  { theta: 0, d: 0, a: 0, alpha: 0 },
  { theta: 0, d: 0.2, a: 0, alpha: 0 },
];

/** [min, max] per joint in SI (rad / m). */
export const SCARA_JOINT_LIMITS: [number, number][] = [
  [deg2rad(-150), deg2rad(150)],
  [deg2rad(-150), deg2rad(150)],
  [0, 0.195],
  [-Math.PI, Math.PI],
];

export const SCARA_HOME: number[] = [0, 0, 0, 0];

/** Merge joint values into the constant table. `q` = [θ1, θ2, d3, θ4] in rad/m. */
export function scaraDhTable(base: DHRow[], q: number[]): DHRow[] {
  const rows = base.map((r) => ({ ...r }));
  SCARA_JOINT_CELLS.forEach((cell, i) => {
    rows[cell.row][cell.param] = q[i];
  });
  return rows;
}

export function clampJoints(q: number[], limits: [number, number][] = SCARA_JOINT_LIMITS): number[] {
  return q.map((v, i) => Math.min(limits[i][1], Math.max(limits[i][0], v)));
}

export interface PlanarClosedForm extends Pose {
  /** True when every α is 0 or ±π so all joint axes are vertical and the closed form applies. */
  valid: boolean;
  /** s_i = direction of z_i relative to z_0 (+1 up, −1 down), s_0 = +1, length n+1. */
  signs: number[];
  /** φ_i = angle of x_i in the world xy-plane, length n. */
  phis: number[];
}

/**
 * Closed-form forward kinematics for any D-H table whose twists are all 0 or π
 * (all joint axes vertical) — which covers every SCARA assignment:
 *
 *   φ_i = φ_{i-1} + s_{i-1}·θ_i,   s_i = s_{i-1}·cos α_i
 *   x = Σ a_i cos φ_i,  y = Σ a_i sin φ_i,  z = Σ s_{i-1} d_i,  roll = φ_n
 *
 * For the lab table (α1 = π) this is x = a1 cos θ1 + a2 cos(θ1 − θ2), z = d1 − d3 − d4.
 */
export function closedFormPlanar(table: DHRow[]): PlanarClosedForm {
  let valid = true;
  const signs = [1];
  const phis: number[] = [];
  let x = 0;
  let y = 0;
  let z = 0;
  let phi = 0;
  for (const row of table) {
    const sPrev = signs[signs.length - 1];
    if (Math.abs(Math.sin(row.alpha)) > 1e-9) valid = false;
    phi += sPrev * row.theta;
    phis.push(phi);
    z += sPrev * row.d;
    x += row.a * Math.cos(phi);
    y += row.a * Math.sin(phi);
    signs.push(sPrev * Math.round(Math.cos(row.alpha)));
  }
  return { x, y, z, roll: wrapAngle(phi), valid, signs, phis };
}

/** Sample the reachable top-view workspace over θ1, θ2 (other joints at `rest`). */
export function scaraWorkspace(base: DHRow[], limits: [number, number][] = SCARA_JOINT_LIMITS, n = 61, rest: number[] = SCARA_HOME): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t1 = limits[0][0] + ((limits[0][1] - limits[0][0]) * i) / (n - 1);
    for (let j = 0; j < n; j++) {
      const t2 = limits[1][0] + ((limits[1][1] - limits[1][0]) * j) / (n - 1);
      const frames = forwardKinematics(scaraDhTable(base, [t1, t2, rest[2], rest[3]]));
      const t = frames[frames.length - 1];
      pts.push({ x: t[0][3], y: t[1][3] });
    }
  }
  return pts;
}

/** Joint values for display: angles in degrees, lengths unchanged. */
export function jointsForDisplay(q: number[]): number[] {
  return q.map((v, i) => (SCARA_JOINT_CELLS[i].kind === 'revolute' ? rad2deg(v) : v));
}
