import { describe, it, expect } from 'vitest';
import {
  forwardKinematics,
  poseFromTransform,
  closedFormPlanar,
  scaraDhTable,
  scaraWorkspace,
  clampJoints,
  wrapAngle,
  SCARA_DEFAULT_TABLE,
  SCARA_TEXTBOOK_TABLE,
  SCARA_JOINT_LIMITS,
} from './kinematics';
import { dhRowTransform } from './dh';
import { approxEqual, isRigidTransform, multiplyAll, deg2rad } from './matrix';

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const randomJoints = () => SCARA_JOINT_LIMITS.map(([lo, hi]) => rand(lo, hi));

describe('forwardKinematics', () => {
  it('returns one frame per row and the last equals the full chain product', () => {
    const table = scaraDhTable(SCARA_DEFAULT_TABLE, [0.3, -0.7, 0.1, 1.2]);
    const frames = forwardKinematics(table);
    expect(frames).toHaveLength(4);
    const product = multiplyAll(...table.map(dhRowTransform));
    expect(approxEqual(frames[3], product, 1e-12)).toBe(true);
    for (const f of frames) expect(isRigidTransform(f)).toBe(true);
  });

  it('first frame equals the first row transform', () => {
    const table = scaraDhTable(SCARA_DEFAULT_TABLE, [0.5, 0, 0, 0]);
    expect(approxEqual(forwardKinematics(table)[0], dhRowTransform(table[0]))).toBe(true);
  });
});

describe('SCARA forward kinematics vs closed form (lab table, α1 = π)', () => {
  const { d: d1, a: a1 } = SCARA_DEFAULT_TABLE[0];
  const { a: a2 } = SCARA_DEFAULT_TABLE[1];
  const { d: d4 } = SCARA_DEFAULT_TABLE[3];

  it('matches x = a1 c1 + a2 cos(θ1−θ2), y likewise, z = d1 − d3 − d4 for 300 random joint sets', () => {
    for (let k = 0; k < 300; k++) {
      const [t1, t2, d3, t4] = randomJoints();
      const frames = forwardKinematics(scaraDhTable(SCARA_DEFAULT_TABLE, [t1, t2, d3, t4]));
      const p = poseFromTransform(frames[3]);
      expect(p.x).toBeCloseTo(a1 * Math.cos(t1) + a2 * Math.cos(t1 - t2), 10);
      expect(p.y).toBeCloseTo(a1 * Math.sin(t1) + a2 * Math.sin(t1 - t2), 10);
      expect(p.z).toBeCloseTo(d1 - d3 - d4, 10);
      // Tool roll: θ1 − θ2 − θ4 (z4 points down, so θ4 is clockwise seen from above)
      expect(Math.abs(wrapAngle(p.roll - (t1 - t2 - t4)))).toBeLessThan(1e-10);
    }
  });

  it('closedFormPlanar agrees with the matrix result and reports the sign pattern', () => {
    for (let k = 0; k < 100; k++) {
      const q = randomJoints();
      const table = scaraDhTable(SCARA_DEFAULT_TABLE, q);
      const p = poseFromTransform(forwardKinematics(table)[3]);
      const c = closedFormPlanar(table);
      expect(c.valid).toBe(true);
      expect(c.x).toBeCloseTo(p.x, 10);
      expect(c.y).toBeCloseTo(p.y, 10);
      expect(c.z).toBeCloseTo(p.z, 10);
      expect(Math.abs(wrapAngle(c.roll - p.roll))).toBeLessThan(1e-10);
      expect(c.signs).toEqual([1, -1, -1, -1, -1]);
    }
  });

  it('home position: x = a1 + a2, y = 0, z = d1 − d4', () => {
    const p = poseFromTransform(forwardKinematics(scaraDhTable(SCARA_DEFAULT_TABLE, [0, 0, 0, 0]))[3]);
    expect(p.x).toBeCloseTo(a1 + a2, 12);
    expect(p.y).toBeCloseTo(0, 12);
    expect(p.z).toBeCloseTo(d1 - d4, 12);
  });

  it('fully extended quill lowers z by 0.195 m', () => {
    const up = poseFromTransform(forwardKinematics(scaraDhTable(SCARA_DEFAULT_TABLE, [0.4, 0.4, 0, 0]))[3]);
    const down = poseFromTransform(forwardKinematics(scaraDhTable(SCARA_DEFAULT_TABLE, [0.4, 0.4, 0.195, 0]))[3]);
    expect(up.z - down.z).toBeCloseTo(0.195, 12);
    expect(up.x).toBeCloseTo(down.x, 12);
  });
});

describe('SCARA textbook table (α1 = 0, α2 = π)', () => {
  it('gives x = a1 c1 + a2 c12, z = d1 − d3 − d4, roll = θ1 + θ2 − θ4', () => {
    const { d: d1, a: a1 } = SCARA_TEXTBOOK_TABLE[0];
    const { a: a2 } = SCARA_TEXTBOOK_TABLE[1];
    const { d: d4 } = SCARA_TEXTBOOK_TABLE[3];
    for (let k = 0; k < 200; k++) {
      const [t1, t2, d3, t4] = randomJoints();
      const table = scaraDhTable(SCARA_TEXTBOOK_TABLE, [t1, t2, d3, t4]);
      const p = poseFromTransform(forwardKinematics(table)[3]);
      expect(p.x).toBeCloseTo(a1 * Math.cos(t1) + a2 * Math.cos(t1 + t2), 10);
      expect(p.y).toBeCloseTo(a1 * Math.sin(t1) + a2 * Math.sin(t1 + t2), 10);
      expect(p.z).toBeCloseTo(d1 - d3 - d4, 10);
      expect(Math.abs(wrapAngle(p.roll - (t1 + t2 - t4)))).toBeLessThan(1e-10);
      const c = closedFormPlanar(table);
      expect(c.x).toBeCloseTo(p.x, 10);
      expect(c.signs).toEqual([1, 1, -1, -1, -1]);
    }
  });
});

describe('closedFormPlanar validity', () => {
  it('flags a table with a non-vertical joint axis', () => {
    const table = scaraDhTable(SCARA_DEFAULT_TABLE, [0, 0, 0, 0]);
    table[1].alpha = Math.PI / 2;
    expect(closedFormPlanar(table).valid).toBe(false);
  });
});

describe('scaraWorkspace', () => {
  it('every sample lies within the annulus set by the link lengths and θ2 limits', () => {
    const a1 = SCARA_DEFAULT_TABLE[0].a;
    const a2 = SCARA_DEFAULT_TABLE[1].a;
    const rMax = a1 + a2;
    const rMin = Math.sqrt(a1 * a1 + a2 * a2 + 2 * a1 * a2 * Math.cos(deg2rad(150)));
    const pts = scaraWorkspace(SCARA_DEFAULT_TABLE, SCARA_JOINT_LIMITS, 31);
    expect(pts).toHaveLength(31 * 31);
    for (const p of pts) {
      const r = Math.hypot(p.x, p.y);
      expect(r).toBeLessThanOrEqual(rMax + 1e-9);
      expect(r).toBeGreaterThanOrEqual(rMin - 1e-9);
    }
    // The fully stretched pose is on the outer boundary.
    expect(Math.max(...pts.map((p) => Math.hypot(p.x, p.y)))).toBeCloseTo(rMax, 9);
  });
});

describe('helpers', () => {
  it('clampJoints respects the limits', () => {
    const q = clampJoints([10, -10, 1, 7]);
    expect(q[0]).toBeCloseTo(deg2rad(150));
    expect(q[1]).toBeCloseTo(deg2rad(-150));
    expect(q[2]).toBe(0.195);
    expect(q[3]).toBeCloseTo(Math.PI);
  });

  it('wrapAngle wraps into (−π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5);
    expect(wrapAngle(2 * Math.PI + 0.5)).toBeCloseTo(0.5);
  });
});
