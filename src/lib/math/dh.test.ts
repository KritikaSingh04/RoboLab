import { describe, it, expect } from 'vitest';
import { dhTransform, dhTransformFromPrimitives, dhRowTransform } from './dh';
import { approxEqual, identity, isRigidTransform } from './matrix';

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

describe('dhTransform', () => {
  it('all-zero parameters give the identity', () => {
    expect(approxEqual(dhTransform(0, 0, 0, 0), identity())).toBe(true);
  });

  it('equals Rot(z,θ)·Trans(z,d)·Trans(x,a)·Rot(x,α) for 200 random parameter sets', () => {
    for (let k = 0; k < 200; k++) {
      const th = rand(-Math.PI, Math.PI);
      const d = rand(-1, 1);
      const a = rand(-1, 1);
      const al = rand(-Math.PI, Math.PI);
      expect(approxEqual(dhTransform(th, d, a, al), dhTransformFromPrimitives(th, d, a, al), 1e-12)).toBe(true);
    }
  });

  it('is always a rigid transform', () => {
    for (let k = 0; k < 50; k++) {
      expect(isRigidTransform(dhTransform(rand(-4, 4), rand(-2, 2), rand(-2, 2), rand(-4, 4)))).toBe(true);
    }
  });

  it('places the origin at (a cosθ, a sinθ, d)', () => {
    const t = dhTransform(Math.PI / 3, 0.5, 2, 1.1);
    expect(t[0][3]).toBeCloseTo(2 * Math.cos(Math.PI / 3), 12);
    expect(t[1][3]).toBeCloseTo(2 * Math.sin(Math.PI / 3), 12);
    expect(t[2][3]).toBeCloseTo(0.5, 12);
  });

  it('α = π flips the z axis', () => {
    const t = dhTransform(0, 0, 0, Math.PI);
    expect(t[2][2]).toBeCloseTo(-1, 12);
    expect(t[1][1]).toBeCloseTo(-1, 12);
    expect(t[0][0]).toBeCloseTo(1, 12);
  });

  it('dhRowTransform matches dhTransform', () => {
    const row = { theta: 0.3, d: 0.4, a: 0.5, alpha: 0.6 };
    expect(approxEqual(dhRowTransform(row), dhTransform(0.3, 0.4, 0.5, 0.6))).toBe(true);
  });
});
