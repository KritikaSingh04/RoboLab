import { describe, it, expect } from 'vitest';
import { cubic, quintic, lspb, makeProfile, profileStats, sampleJointSpace, sampleCartesianLine, twoLinkFK, twoLinkIK, jointsAt, METHODS } from './trajectory';

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;

describe('cubic', () => {
  it('meets position and velocity boundary conditions for random inputs', () => {
    for (let k = 0; k < 100; k++) {
      const [q0, qf, v0, vf, tf] = [rand(-3, 3), rand(-3, 3), rand(-2, 2), rand(-2, 2), rand(0.2, 10)];
      const p = cubic(q0, qf, v0, vf, tf);
      expect(close(p.q(0), q0)).toBe(true);
      expect(close(p.q(tf), qf, 1e-8)).toBe(true);
      expect(close(p.qd(0), v0)).toBe(true);
      expect(close(p.qd(tf), vf, 1e-8)).toBe(true);
    }
  });

  it('rest-to-rest has the classic coefficients 3Δ/tf², −2Δ/tf³ and peaks at the midpoint', () => {
    const p = cubic(0, 1, 0, 0, 2);
    expect(p.coeffs.map((c) => c.value)).toEqual([0, 0, 3 / 4, -2 / 8]);
    expect(p.q(1)).toBeCloseTo(0.5, 12);
    expect(p.qd(1)).toBeCloseTo(1.5 / 2, 12); // vmax = 1.5Δ/tf
    expect(p.qdd(0)).toBeCloseTo(6 / 4, 12); // 6Δ/tf²
  });

  it('holds the end values outside [0, tf]', () => {
    const p = cubic(1, 2, 0, 0, 1);
    expect(p.q(-1)).toBe(1);
    expect(p.q(5)).toBeCloseTo(2, 12);
    expect(p.qd(5)).toBeCloseTo(0, 12);
  });
});

describe('quintic', () => {
  it('meets position, velocity and acceleration boundary conditions for random inputs', () => {
    for (let k = 0; k < 100; k++) {
      const [q0, qf, v0, vf, a0, af, tf] = [rand(-3, 3), rand(-3, 3), rand(-2, 2), rand(-2, 2), rand(-3, 3), rand(-3, 3), rand(0.2, 10)];
      const p = quintic(q0, qf, v0, vf, a0, af, tf);
      expect(close(p.q(0), q0)).toBe(true);
      expect(close(p.q(tf), qf, 1e-7)).toBe(true);
      expect(close(p.qd(0), v0)).toBe(true);
      expect(close(p.qd(tf), vf, 1e-7)).toBe(true);
      expect(close(p.qdd(0), a0)).toBe(true);
      expect(close(p.qdd(tf), af, 1e-6)).toBe(true);
    }
  });

  it('rest-to-rest over unit interval is 10t³ − 15t⁴ + 6t⁵', () => {
    const p = quintic(0, 1, 0, 0, 0, 0, 1);
    expect(p.coeffs.map((c) => +c.value.toFixed(9))).toEqual([0, 0, 0, 10, -15, 6]);
  });
});

describe('lspb', () => {
  it('meets rest-to-rest boundary conditions and is continuous at the blend points', () => {
    for (let k = 0; k < 100; k++) {
      const q0 = rand(-3, 3);
      const qf = q0 + (Math.random() < 0.5 ? -1 : 1) * rand(0.1, 3);
      const tf = rand(0.5, 8);
      const vmin = Math.abs(qf - q0) / tf;
      const p = lspb(q0, qf, tf, rand(1.1 * vmin, 1.95 * vmin));
      expect(p.note).toBeUndefined();
      expect(close(p.q(0), q0)).toBe(true);
      expect(close(p.q(tf), qf, 1e-9)).toBe(true);
      expect(close(p.qd(0), 0)).toBe(true);
      expect(close(p.qd(tf), 0, 1e-9)).toBe(true);
      const tb = p.coeffs.find((c) => c.name === 'tb')!.value;
      const V = p.coeffs.find((c) => c.name === 'V')!.value;
      expect(tb).toBeGreaterThan(0);
      expect(tb).toBeLessThanOrEqual(tf / 2 + 1e-12);
      for (const tj of [tb, tf - tb]) {
        expect(close(p.q(tj - 1e-9), p.q(tj + 1e-9), 1e-7)).toBe(true);
        expect(close(p.qd(tj - 1e-9), p.qd(tj + 1e-9), 1e-6)).toBe(true);
      }
      expect(close(p.qd((tf / 2) | 0 ? tf / 2 : tf / 2), V)).toBe(true); // cruise velocity in the middle
    }
  });

  it('clamps an infeasible cruise velocity and reports it', () => {
    const slow = lspb(0, 1, 2, 0.1); // below Δ/tf = 0.5
    expect(slow.note).toBeDefined();
    expect(slow.q(2)).toBeCloseTo(1, 9);
    const fast = lspb(0, 1, 2, 10); // above 2Δ/tf = 1 → triangular
    expect(fast.note).toBeDefined();
    expect(fast.coeffs.find((c) => c.name === 'tb')!.value).toBeCloseTo(1, 9);
    expect(fast.q(2)).toBeCloseTo(1, 9);
  });

  it('handles a negative displacement', () => {
    const p = lspb(2, -1, 3, 1.5);
    expect(p.q(3)).toBeCloseTo(-1, 9);
    expect(p.coeffs.find((c) => c.name === 'V')!.value).toBeLessThan(0);
  });

  it('zero displacement is a constant', () => {
    const p = lspb(1, 1, 2, 1);
    expect(p.q(1)).toBe(1);
    expect(p.qd(1)).toBe(0);
  });
});

describe('profileStats and makeProfile', () => {
  it('quintic has lower peak acceleration than cubic for the same move, LSPB has the lowest peak velocity', () => {
    const c = profileStats(makeProfile('cubic', 0, 1, 1));
    const q = profileStats(makeProfile('quintic', 0, 1, 1));
    const l = profileStats(makeProfile('lspb', 0, 1, 1, { vmax: 1.2 }));
    expect(c.vMax).toBeCloseTo(1.5, 6);
    expect(q.vMax).toBeCloseTo(1.875, 6);
    expect(c.aMax).toBeCloseTo(6, 6);
    expect(q.aMax).toBeCloseTo(5.7735, 3);
    expect(l.vMax).toBeCloseTo(1.2, 6);
    expect(l.vMax).toBeLessThan(c.vMax);
  });

  it('every method meets the end points via makeProfile', () => {
    for (const m of METHODS) {
      const p = makeProfile(m, 0.3, -1.2, 2.5, { vmax: 0.9 });
      expect(p.q(0)).toBeCloseTo(0.3, 9);
      expect(p.q(2.5)).toBeCloseTo(-1.2, 9);
    }
  });
});

describe('two-link helpers and samplers', () => {
  const links = { l1: 1, l2: 0.8 };

  it('twoLinkIK inverts twoLinkFK', () => {
    for (let k = 0; k < 50; k++) {
      const q: [number, number] = [rand(-3, 3), rand(-3, -0.05)];
      const { tip } = twoLinkFK(links, q);
      const sol = twoLinkIK(links, tip[0], tip[1], 'up')!;
      const back = twoLinkFK(links, sol).tip;
      expect(back[0]).toBeCloseTo(tip[0], 9);
      expect(back[1]).toBeCloseTo(tip[1], 9);
    }
  });

  it('joint-space samples start and end at the FK of the end angles', () => {
    const profiles: [ReturnType<typeof cubic>, ReturnType<typeof cubic>] = [cubic(0.2, 1.1, 0, 0, 2), cubic(-1.0, -0.4, 0, 0, 2)];
    const s = sampleJointSpace(links, profiles, 51);
    expect(s[0].tip).toEqual(twoLinkFK(links, [0.2, -1.0]).tip);
    expect(s[50].tip[0]).toBeCloseTo(twoLinkFK(links, [1.1, -0.4]).tip[0], 9);
    expect(jointsAt(s, 0)![0]).toBeCloseTo(0.2, 12);
    expect(jointsAt(s, 2)![1]).toBeCloseTo(-0.4, 9);
  });

  it('Cartesian samples lie exactly on the straight line and reach both end points', () => {
    const p0: [number, number] = [1.2, 0.3];
    const pf: [number, number] = [0.4, 1.3];
    const s = sampleCartesianLine(links, p0, pf, cubic(0, 1, 0, 0, 2), 'up', 101);
    expect(s.every((x) => x.reachable)).toBe(true);
    for (const x of s) {
      // cross product with the line direction is zero
      const cross = (x.tip[0] - p0[0]) * (pf[1] - p0[1]) - (x.tip[1] - p0[1]) * (pf[0] - p0[0]);
      expect(Math.abs(cross)).toBeLessThan(1e-12);
      const fk = twoLinkFK(links, x.q).tip;
      expect(fk[0]).toBeCloseTo(x.tip[0], 9);
      expect(fk[1]).toBeCloseTo(x.tip[1], 9);
    }
    expect(s[0].tip).toEqual(p0);
    expect(s[100].tip[0]).toBeCloseTo(pf[0], 12);
    // Finite-difference velocity is near zero at the rest-to-rest ends
    expect(Math.abs(s[1].qd[0])).toBeLessThan(0.05);
  });

  it('flags unreachable points on a line through the inner hole', () => {
    const s = sampleCartesianLine({ l1: 1, l2: 0.5 }, [1.2, 0], [-1.2, 0], cubic(0, 1, 0, 0, 1), 'up', 41);
    expect(s.some((x) => !x.reachable)).toBe(true);
    expect(s[0].reachable).toBe(true);
  });
});
