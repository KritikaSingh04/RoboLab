import { describe, it, expect } from 'vitest';
import { membership, fuzzify, ruleStrength, aggregateOutput, defuzzify, infer, controlSurface, sampleMF, withMfParam, obstacleAvoidanceSystem, fanSpeedSystem, DEFUZZ_METHODS, type MF } from './fuzzy';

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

describe('membership functions', () => {
  it('are always within [0, 1] for random parameters and inputs', () => {
    for (let k = 0; k < 500; k++) {
      const p = [rand(-5, 5), rand(-5, 5), rand(-5, 5), rand(-5, 5)].sort((a, b) => a - b);
      const mfs: MF[] = [
        { type: 'tri', a: p[0], b: p[1], c: p[2] },
        { type: 'trap', a: p[0], b: p[1], c: p[2], d: p[3] },
        { type: 'gauss', mean: rand(-5, 5), sigma: rand(0.1, 3) },
      ];
      const x = rand(-8, 8);
      for (const mf of mfs) {
        const mu = membership(mf, x);
        expect(mu).toBeGreaterThanOrEqual(0);
        expect(mu).toBeLessThanOrEqual(1);
        expect(Number.isFinite(mu)).toBe(true);
      }
    }
  });

  it('take the expected values at key points', () => {
    const t: MF = { type: 'tri', a: 0, b: 2, c: 6 };
    expect(membership(t, 2)).toBe(1);
    expect(membership(t, 1)).toBeCloseTo(0.5, 12);
    expect(membership(t, 4)).toBeCloseTo(0.5, 12);
    expect(membership(t, -1)).toBe(0);
    expect(membership(t, 7)).toBe(0);
    const tp: MF = { type: 'trap', a: 0, b: 1, c: 3, d: 5 };
    expect(membership(tp, 2)).toBe(1);
    expect(membership(tp, 0.5)).toBeCloseTo(0.5, 12);
    expect(membership(tp, 4)).toBeCloseTo(0.5, 12);
    const g: MF = { type: 'gauss', mean: 1, sigma: 2 };
    expect(membership(g, 1)).toBe(1);
    expect(membership(g, 3)).toBeCloseTo(Math.exp(-0.5), 12);
  });

  it('shoulder trapezoids (a = b or c = d) are 1 at the edge', () => {
    expect(membership({ type: 'trap', a: 0, b: 0, c: 0.4, d: 0.8 }, 0)).toBe(1);
    expect(membership({ type: 'trap', a: 1.2, b: 1.6, c: 2, d: 2 }, 2)).toBe(1);
    expect(membership({ type: 'tri', a: -45, b: -45, c: -22 }, -45)).toBe(1);
  });

  it('withMfParam keeps the parameters ordered', () => {
    const m = withMfParam({ type: 'tri', a: 0, b: 2, c: 4 }, 'a', 3) as { a: number; b: number };
    expect(m.a).toBeLessThanOrEqual(m.b);
    const s = withMfParam({ type: 'gauss', mean: 0, sigma: 1 }, 'sigma', -2) as { sigma: number };
    expect(s.sigma).toBeGreaterThan(0);
  });
});

describe('defuzzification', () => {
  it('centroid, bisector and mean-of-maximum of a symmetric set equal its centre', () => {
    const sets: { mf: MF; centre: number; range: [number, number] }[] = [
      { mf: { type: 'tri', a: 2, b: 5, c: 8 }, centre: 5, range: [0, 10] },
      { mf: { type: 'trap', a: 1, b: 3, c: 7, d: 9 }, centre: 5, range: [0, 10] },
      { mf: { type: 'gauss', mean: -1, sigma: 0.5 }, centre: -1, range: [-4, 2] },
    ];
    for (const { mf, centre, range } of sets) {
      const curve = sampleMF(mf, range, 2001);
      for (const method of DEFUZZ_METHODS) expect(defuzzify(curve, method)).toBeCloseTo(centre, 3);
    }
  });

  it('a clipped symmetric set keeps its centre; MOM returns the plateau middle', () => {
    const out = { name: 'o', label: '', unit: '', range: [0, 10] as [number, number], terms: [{ name: 'T', mf: { type: 'tri', a: 2, b: 5, c: 8 } as MF }] };
    const curve = aggregateOutput(out, { T: 0.4 }, 2001);
    expect(Math.max(...curve.ys)).toBeCloseTo(0.4, 9);
    expect(defuzzify(curve, 'centroid')).toBeCloseTo(5, 3);
    expect(defuzzify(curve, 'mom')).toBeCloseTo(5, 3);
  });

  it('an asymmetric set: centroid lies toward the heavy side, bisector between', () => {
    const curve = sampleMF({ type: 'tri', a: 0, b: 1, c: 9 }, [0, 10], 2001);
    const c = defuzzify(curve, 'centroid');
    expect(c).toBeCloseTo((0 + 1 + 9) / 3, 2);
    expect(defuzzify(curve, 'mom')).toBeCloseTo(1, 2);
    expect(defuzzify(curve, 'bisector')).toBeGreaterThan(1);
    expect(defuzzify(curve, 'bisector')).toBeLessThan(c);
  });

  it('empty set defuzzifies to the range midpoint', () => {
    expect(defuzzify({ xs: [0, 1, 2], ys: [0, 0, 0] }, 'centroid')).toBe(1);
  });
});

describe('inference on the robot controller', () => {
  const sys = obstacleAvoidanceSystem();

  it('fuzzification and rule strengths stay within [0, 1] over a grid', () => {
    for (let d = 0; d <= 2; d += 0.1) {
      for (let a = -90; a <= 90; a += 10) {
        const r = infer(sys, { distance: d, angle: a });
        for (const v of Object.values(r.fuzzified)) for (const mu of Object.values(v)) expect(mu >= 0 && mu <= 1).toBe(true);
        for (const s of r.ruleStrengths) expect(s >= 0 && s <= 1).toBe(true);
        expect(r.outputs.steering.crisp).toBeGreaterThanOrEqual(-45);
        expect(r.outputs.steering.crisp).toBeLessThanOrEqual(45);
        expect(r.outputs.speed.crisp).toBeGreaterThanOrEqual(0);
        expect(r.outputs.speed.crisp).toBeLessThanOrEqual(1);
      }
    }
  });

  it('behaves sensibly: near obstacle on the right → hard left and slow; far → straight and fast', () => {
    const near = infer(sys, { distance: 0.2, angle: 60 });
    expect(near.outputs.steering.crisp).toBeLessThan(-25);
    expect(near.outputs.speed.crisp).toBeLessThan(0.25);
    const nearLeft = infer(sys, { distance: 0.2, angle: -60 });
    expect(nearLeft.outputs.steering.crisp).toBeGreaterThan(25);
    const far = infer(sys, { distance: 1.9, angle: 0 });
    expect(Math.abs(far.outputs.steering.crisp)).toBeLessThan(3);
    expect(far.outputs.speed.crisp).toBeGreaterThan(0.45);
    const farSide = infer(sys, { distance: 1.9, angle: 70 });
    expect(farSide.outputs.speed.crisp).toBeGreaterThan(0.8);
  });

  it('AND uses min and OR uses max', () => {
    const f = { distance: { Near: 0.3, Medium: 0.7, Far: 0 }, angle: { Left: 0.9, Center: 0.1, Right: 0 } };
    expect(ruleStrength({ antecedents: [{ variable: 'distance', term: 'Near' }, { variable: 'angle', term: 'Left' }], op: 'and', consequents: [] }, f)).toBeCloseTo(0.3);
    expect(ruleStrength({ antecedents: [{ variable: 'distance', term: 'Near' }, { variable: 'angle', term: 'Left' }], op: 'or', consequents: [] }, f)).toBeCloseTo(0.9);
    expect(ruleStrength({ antecedents: [{ variable: 'distance', term: 'Near' }], op: 'and', consequents: [], enabled: false }, f)).toBe(0);
    expect(ruleStrength({ antecedents: [{ variable: 'distance', term: 'Near' }], op: 'and', consequents: [], weight: 0.5 }, f)).toBeCloseTo(0.15);
  });

  it('disabling the speed rules leaves speed at the range midpoint', () => {
    const s2 = { ...sys, rules: sys.rules.map((r) => (r.consequents[0].variable === 'speed' ? { ...r, enabled: false } : r)) };
    expect(infer(s2, { distance: 0.2, angle: 0 }).outputs.speed.crisp).toBeCloseTo(0.5, 9);
  });

  it('fuzzify gives overlapping memberships between neighbouring terms and 1 at a peak', () => {
    const f = fuzzify(sys.inputs[1], -20); // between Left and Center
    expect(f.Left).toBeGreaterThan(0);
    expect(f.Center).toBeGreaterThan(0);
    expect(f.Right).toBe(0);
    expect(fuzzify(sys.inputs[1], 0).Center).toBe(1);
  });

  it('control surface covers the grid and spans the output range', () => {
    const s = controlSurface(sys, 'distance', 'angle', 'steering', 11);
    expect(s.a).toHaveLength(11);
    expect(s.z).toHaveLength(11);
    expect(s.z[0]).toHaveLength(11);
    expect(s.min).toBeLessThan(-20);
    expect(s.max).toBeGreaterThan(20);
  });
});

describe('fan controller', () => {
  it('hot and humid → maximum fan, cold and dry → off', () => {
    const sys = fanSpeedSystem();
    expect(infer(sys, { temperature: 38, humidity: 90 }).outputs.fan.crisp).toBeGreaterThan(85);
    expect(infer(sys, { temperature: 5, humidity: 20 }).outputs.fan.crisp).toBeLessThan(15);
    const mid = infer(sys, { temperature: 23, humidity: 50 }).outputs.fan.crisp;
    expect(mid).toBeGreaterThan(45);
    expect(mid).toBeLessThan(65);
  });
});
