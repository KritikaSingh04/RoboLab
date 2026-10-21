import { describe, it, expect } from 'vitest';
import { planarFK, planarIK, reachableAnnulus, nearestReachable, resamplePath, samplePath, pathLength, BRANCHES, type PlanarLinks } from './planar';
import { wrapAngle } from './kinematics';

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const DEFAULT: PlanarLinks = { l1: 1.0, l2: 0.8, l3: 0.4 };

describe('planarFK', () => {
  it('stretched arm along x', () => {
    const fk = planarFK(DEFAULT, [0, 0, 0]);
    expect(fk.pose.x).toBeCloseTo(2.2, 12);
    expect(fk.pose.y).toBeCloseTo(0, 12);
    expect(fk.pose.phi).toBeCloseTo(0, 12);
    expect(fk.joints[1]).toEqual([1, 0]);
  });

  it('φ is the sum of the joint angles', () => {
    const fk = planarFK(DEFAULT, [0.3, 0.4, 0.5]);
    expect(fk.pose.phi).toBeCloseTo(1.2, 12);
  });
});

describe('planarIK', () => {
  it('FK(IK(pose)) == pose for 200 random reachable poses, both branches', () => {
    for (let k = 0; k < 200; k++) {
      const links: PlanarLinks = k % 2 === 0 ? DEFAULT : { l1: rand(0.3, 1.5), l2: rand(0.3, 1.5), l3: rand(0.1, 0.8) };
      // Generate a reachable pose by running FK on random joints.
      const qTrue = [rand(-Math.PI, Math.PI), rand(-Math.PI, Math.PI), rand(-Math.PI, Math.PI)];
      const target = planarFK(links, qTrue).pose;
      const ik = planarIK(links, target);
      expect(ik.reachable).toBe(true);
      for (const b of BRANCHES) {
        const sol = ik.solutions[b]!;
        expect(sol).not.toBeNull();
        expect(sol.fk.pose.x).toBeCloseTo(target.x, 9);
        expect(sol.fk.pose.y).toBeCloseTo(target.y, 9);
        expect(Math.abs(wrapAngle(sol.fk.pose.phi - target.phi))).toBeLessThan(1e-9);
        expect(sol.posError).toBeLessThan(1e-9);
        expect(Math.abs(sol.phiError)).toBeLessThan(1e-9);
      }
      // One of the two branches must reproduce the original joint angles.
      const matches = BRANCHES.some((b) => ik.solutions[b]!.q.every((v, i) => Math.abs(wrapAngle(v - qTrue[i])) < 1e-8));
      expect(matches).toBe(true);
    }
  });

  it('elbow-up has θ2 ≤ 0 and elbow-down has θ2 ≥ 0', () => {
    for (let k = 0; k < 50; k++) {
      const target = planarFK(DEFAULT, [rand(-2, 2), rand(0.2, 2.5), rand(-1, 1)]).pose;
      const ik = planarIK(DEFAULT, target);
      expect(ik.solutions.up!.q[1]).toBeLessThanOrEqual(1e-12);
      expect(ik.solutions.down!.q[1]).toBeGreaterThanOrEqual(-1e-12);
    }
  });

  it('elbow-up elbow lies to the left of the base→wrist line', () => {
    const ik = planarIK(DEFAULT, { x: 1.2, y: 0.8, phi: 0.5 });
    const { xw, yw } = ik.working;
    const elbow = ik.solutions.up!.fk.joints[1];
    const cross = xw * elbow[1] - yw * elbow[0];
    expect(cross).toBeGreaterThan(0);
    const elbowDown = ik.solutions.down!.fk.joints[1];
    expect(xw * elbowDown[1] - yw * elbowDown[0]).toBeLessThan(0);
  });

  it('reports the worked values consistently', () => {
    const pose = { x: 1.2, y: 0.8, phi: 0.5 };
    const w = planarIK(DEFAULT, pose).working;
    expect(w.xw).toBeCloseTo(1.2 - 0.4 * Math.cos(0.5), 12);
    expect(w.yw).toBeCloseTo(0.8 - 0.4 * Math.sin(0.5), 12);
    expect(w.c2).toBeCloseTo((w.r2 - 1 - 0.64) / 1.6, 12);
    expect(w.s2.up).toBeCloseTo(-Math.sqrt(1 - w.c2 * w.c2), 12);
    expect(w.s2.down).toBeCloseTo(Math.sqrt(1 - w.c2 * w.c2), 12);
    expect(w.beta).toBeCloseTo(Math.atan2(w.yw, w.xw), 12);
  });

  it('flags unreachable targets outside and inside the annulus', () => {
    expect(planarIK(DEFAULT, { x: 2.5, y: 0, phi: 0 }).reachable).toBe(false);
    expect(planarIK(DEFAULT, { x: 2.5, y: 0, phi: 0 }).solutions.up).toBeNull();
    // Wrist exactly at the base is inside the inner radius |L1−L2| = 0.2.
    expect(planarIK(DEFAULT, { x: 0.4, y: 0, phi: 0 }).reachable).toBe(false);
  });

  it('nearestReachable projects an unreachable target onto the boundary (outer and inner)', () => {
    for (const pose of [
      { x: 3, y: 1, phi: 0.3 },
      { x: 0.5, y: 0, phi: 0 }, // wrist at r = 0.1 < |L1 − L2|
      { x: -2.6, y: 0, phi: 2 },
    ]) {
      expect(planarIK(DEFAULT, pose).reachable).toBe(false);
      const near = nearestReachable(DEFAULT, pose);
      const ik = planarIK(DEFAULT, near);
      expect(ik.reachable).toBe(true);
      expect(near.phi).toBe(pose.phi);
      expect(Math.abs(Math.abs(ik.working.c2) - 1)).toBeLessThan(1e-9);
    }
    const inside = { x: 1.2, y: 0.8, phi: 0.5 };
    expect(nearestReachable(DEFAULT, inside)).toEqual(inside);
  });

  it('is reachable exactly on the outer boundary', () => {
    const ik = planarIK(DEFAULT, { x: 2.2, y: 0, phi: 0 });
    expect(ik.reachable).toBe(true);
    expect(ik.solutions.up!.q[1]).toBeCloseTo(0, 6);
  });

  it('reachableAnnulus is centred at L3·(cosφ, sinφ)', () => {
    const a = reachableAnnulus(DEFAULT, Math.PI / 2);
    expect(a.cx).toBeCloseTo(0, 12);
    expect(a.cy).toBeCloseTo(0.4, 12);
    expect(a.rMin).toBeCloseTo(0.2, 12);
    expect(a.rMax).toBeCloseTo(1.8, 12);
  });
});

describe('paths', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];

  it('pathLength sums the segments', () => {
    expect(pathLength(square)).toBeCloseTo(3, 12);
  });

  it('resamplePath spaces points evenly and keeps the end points', () => {
    const p = resamplePath(square, 0.1);
    expect(p[0]).toMatchObject({ x: 0, y: 0, s: 0 });
    expect(p[p.length - 1].x).toBeCloseTo(0, 9);
    expect(p[p.length - 1].y).toBeCloseTo(1, 9);
    expect(p[p.length - 1].s).toBeCloseTo(3, 9);
    for (let i = 1; i < p.length; i++) expect(p[i].s - p[i - 1].s).toBeCloseTo(0.1, 9);
    // Point at s = 1.5 is halfway up the right-hand side.
    const mid = p.find((q) => Math.abs(q.s - 1.5) < 1e-9)!;
    expect(mid.x).toBeCloseTo(1, 9);
    expect(mid.y).toBeCloseTo(0.5, 9);
    expect(mid.tangent).toBeCloseTo(Math.PI / 2, 9);
  });

  it('samplePath interpolates and returns null past the end', () => {
    const p = resamplePath(square, 0.25);
    expect(samplePath(p, 0.125)!.x).toBeCloseTo(0.125, 9);
    expect(samplePath(p, 2.5)!.y).toBeCloseTo(1, 9);
    expect(samplePath(p, 2.5)!.x).toBeCloseTo(0.5, 9);
    expect(samplePath(p, 3.5)).toBeNull();
    expect(samplePath([], 0)).toBeNull();
  });
});
