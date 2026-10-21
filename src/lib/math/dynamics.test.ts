import { describe, it, expect } from 'vitest';
import { rk4Step, integrate } from './ode';
import { inertia, gravityCoeff, singleLinkTorque, singleLinkAccel, singleLinkEnergy, inverseDynamics, simulateSingleLink, energyDrift, twoLinkMatrices, twoLinkAccel, simulateTwoLink, twoLinkEnergy, parseCsv, interpolate, rmsError, DEFAULT_LINK, DEFAULT_TWO_LINK } from './dynamics';
import { cubic } from './trajectory';

describe('RK4', () => {
  it('integrates a harmonic oscillator to 1e-8 accuracy over 10 s', () => {
    const f = (_t: number, y: number[]) => [y[1], -y[0]];
    const out = integrate(f, [1, 0], 0, 10, 0.01);
    const last = out[out.length - 1];
    expect(last.y[0]).toBeCloseTo(Math.cos(10), 8);
    expect(last.y[1]).toBeCloseTo(-Math.sin(10), 8);
    expect(rk4Step((_t, y) => [y[0]], 0, [1], 0.1)[0]).toBeCloseTo(Math.exp(0.1), 6);
  });
});

describe('single link', () => {
  const p = { ...DEFAULT_LINK, b: 0 };

  it('inertia and gravity coefficients follow the formulas', () => {
    expect(inertia(p)).toBeCloseTo((1 * 0.25) / 3 + 0.2 * 0.25, 12);
    expect(gravityCoeff(p)).toBeCloseTo((0.5 / 2 + 0.2 * 0.5) * 9.81, 12);
  });

  it('static torque: G cosθ, zero when the link is vertical', () => {
    expect(singleLinkTorque(p, 0, 0, 0).total).toBeCloseTo(gravityCoeff(p), 12);
    expect(singleLinkTorque(p, Math.PI / 2, 0, 0).total).toBeCloseTo(0, 12);
    expect(singleLinkTorque({ ...p, b: 0.3 }, Math.PI / 2, 2, 0).friction).toBeCloseTo(0.6, 12);
  });

  it('energy is conserved within 0.1 % over 10 s with b = 0 (RK4)', () => {
    for (const [th0, w0] of [
      [0, 0],
      [-0.3, 4],
      [Math.PI / 2 - 0.05, 0],
    ]) {
      const s = simulateSingleLink(p, th0, w0, { kind: 'free' }, 10, 1 / 240);
      expect(s[s.length - 1].t).toBeCloseTo(10, 9);
      expect(energyDrift(s)).toBeLessThan(0.001);
    }
  });

  it('Euler integration drifts far more than RK4 (why RK4 is used)', () => {
    const f = (_t: number, y: number[]) => [y[1], singleLinkAccel(p, y[0], y[1], 0)];
    const e = integrate(f, [0, 0], 0, 10, 1 / 240, 'euler');
    const r = integrate(f, [0, 0], 0, 10, 1 / 240, 'rk4');
    const drift = (o: typeof e) => energyDrift(o.map(({ y }) => singleLinkEnergy(p, y[0], y[1])));
    expect(drift(e)).toBeGreaterThan(10 * drift(r));
  });

  it('inverse dynamics of a simulated motion recovers the applied torque', () => {
    const pp = { ...DEFAULT_LINK, b: 0.1 };
    const s = simulateSingleLink(pp, 0.2, 0, { kind: 'constant', tau: 2 }, 3);
    for (const x of s) expect(singleLinkTorque(pp, x.theta, x.omega, x.alpha).total).toBeCloseTo(2, 9);
  });

  it('inverse dynamics along a cubic: torque = gravity at rest ends, inertial part integrates to zero momentum change', () => {
    const prof = cubic(0, Math.PI / 2, 0, 0, 2);
    const s = inverseDynamics(p, prof, 201);
    expect(s[0].tau).toBeCloseTo(gravityCoeff(p) * Math.cos(0) + inertia(p) * prof.qdd(0), 9);
    expect(s[s.length - 1].gravity).toBeCloseTo(0, 9);
    const impulse = s.reduce((a, x, i) => (i ? a + ((x.inertial + s[i - 1].inertial) / 2) * (x.t - s[i - 1].t) : 0), 0);
    expect(impulse).toBeCloseTo(0, 6); // ∫ I θ̈ dt = I (ω_f − ω_0) = 0
  });

  it('friction removes energy', () => {
    const s = simulateSingleLink({ ...DEFAULT_LINK, b: 0.2 }, 0, 0, { kind: 'free' }, 10);
    expect(s[s.length - 1].total).toBeLessThan(s[0].total - 0.1);
  });
});

describe('two-link arm', () => {
  const p = DEFAULT_TWO_LINK;

  it('mass matrix is symmetric positive definite and gravity vanishes when both links are vertical', () => {
    const { M, G } = twoLinkMatrices(p, [0.4, 1.1], [0, 0]);
    expect(M[0][1]).toBeCloseTo(M[1][0], 12);
    expect(M[0][0]).toBeGreaterThan(0);
    expect(M[0][0] * M[1][1] - M[0][1] * M[1][0]).toBeGreaterThan(0);
    const up = twoLinkMatrices(p, [Math.PI / 2, 0], [0, 0]).G;
    expect(up[0]).toBeCloseTo(0, 9);
    expect(up[1]).toBeCloseTo(0, 9);
    expect(G[0]).not.toBeCloseTo(0, 3);
  });

  it('a locked second joint reduces to a single pendulum', () => {
    // with θ2 = 0 and the arm stretched, static torque on joint 1 equals the combined gravity moment
    const { G } = twoLinkMatrices(p, [0, 0], [0, 0]);
    expect(G[0]).toBeCloseTo((p.m1 * p.l1) / 2 * p.g + p.m2 * (p.l1 + p.l2 / 2) * p.g, 9);
    const a = twoLinkAccel(p, [Math.PI / 2, 0], [0, 0]);
    expect(Math.abs(a[0])).toBeLessThan(1e-9);
  });

  it('energy is conserved within 0.1 % over 10 s of chaotic swinging', () => {
    const s = simulateTwoLink(p, [0.2, 0.3], [0, 0], 10, 1 / 480);
    expect(energyDrift(s)).toBeLessThan(0.001);
    expect(s[s.length - 1].t).toBeCloseTo(10, 9);
  });

  it('is sensitive to initial conditions (chaos): tiny perturbation diverges', () => {
    const a = simulateTwoLink(p, [0.2, 0.3], [0, 0], 10, 1 / 480);
    const b = simulateTwoLink(p, [0.2 + 1e-4, 0.3], [0, 0], 10, 1 / 480);
    const last = a.length - 1;
    const diff = Math.hypot(a[last].tip[0] - b[last].tip[0], a[last].tip[1] - b[last].tip[1]);
    expect(diff).toBeGreaterThan(0.05);
    expect(twoLinkEnergy(p, [0, 0], [0, 0]).kinetic).toBe(0);
  });
});

describe('CSV and comparison helpers', () => {
  it('parses headers, separators and comments', () => {
    const t = parseCsv('# ADAMS export\nTime,Angle,Torque\n0,1.5,2\n0.1,1.6,2\n');
    expect(t.headers).toEqual(['Time', 'Angle', 'Torque']);
    expect(t.rows).toEqual([
      [0, 1.5, 2],
      [0.1, 1.6, 2],
    ]);
    expect(parseCsv('1\t2\n3\t4').headers).toEqual(['column 1', 'column 2']);
  });

  it('interpolates and computes RMS error', () => {
    expect(interpolate([0, 1, 2], [0, 10, 20], 1.5)).toBe(15);
    expect(interpolate([0, 1], [0, 10], 5)).toBe(10);
    const r = rmsError([{ t: 0, v: 1 }, { t: 1, v: 11 }, { t: 3, v: 0 }], [0, 1, 2], [0, 10, 20]);
    expect(r.n).toBe(2);
    expect(r.rms).toBeCloseTo(1, 12);
  });
});
