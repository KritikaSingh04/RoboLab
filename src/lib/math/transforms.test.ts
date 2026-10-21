import { describe, it, expect } from 'vitest';
import { screwAxis, screwGeneral, rodrigues, pitch, composeScrews, transformPoint, screwPath, matrixDistance, normalize, AXES } from './transforms';
import { approxEqual, isRigidTransform, rotationDeterminant, rotX, rotY, rotZ, trans, multiply, identity, type Mat4, type Vec3 } from './matrix';

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const randVec = (): Vec3 => [rand(-1, 1), rand(-1, 1), rand(-1, 1)];
const randAxis = (): Vec3 => {
  let v = randVec();
  while (Math.hypot(...v) < 0.2) v = randVec();
  return v;
};

describe('fundamental screws', () => {
  it('rotation part is orthonormal with det = 1 for every axis and random (λ, φ)', () => {
    for (let k = 0; k < 60; k++) {
      for (const axis of AXES) {
        const t = screwAxis(axis, rand(-2, 2), rand(-7, 7));
        expect(isRigidTransform(t)).toBe(true);
        expect(rotationDeterminant(t)).toBeCloseTo(1, 10);
      }
    }
  });

  it('screw about z with φ = 0 is a pure translation along z', () => {
    const t = screwAxis('z', 0.7, 0);
    expect(approxEqual(t, trans(0, 0, 0.7))).toBe(true);
  });

  it('screw with λ = 0 is a pure rotation', () => {
    expect(approxEqual(screwAxis('x', 0, 0.4), rotX(0.4))).toBe(true);
    expect(approxEqual(screwAxis('y', 0, -1.1), rotY(-1.1))).toBe(true);
    expect(approxEqual(screwAxis('z', 0, 2.2), rotZ(2.2))).toBe(true);
  });

  it('translation along and rotation about the same axis commute', () => {
    for (const axis of AXES) {
      const a = screwAxis(axis, 0.5, 1.3); // Trans · Rot
      const b = multiply(axis === 'x' ? rotX(1.3) : axis === 'y' ? rotY(1.3) : rotZ(1.3), axis === 'x' ? trans(0.5, 0, 0) : axis === 'y' ? trans(0, 0.5, 0) : trans(0, 0, 0.5));
      expect(approxEqual(a, b)).toBe(true);
    }
  });

  it('a point on the axis only translates', () => {
    const q = transformPoint(screwAxis('z', 0.3, 1.0), [0, 0, 2]);
    expect(q[0]).toBeCloseTo(0, 12);
    expect(q[1]).toBeCloseTo(0, 12);
    expect(q[2]).toBeCloseTo(2.3, 12);
  });
});

describe('Rodrigues rotation', () => {
  it('matches the elementary rotation matrices', () => {
    for (const phi of [0, 0.3, -1.7, 3]) {
      const r = (m: Mat4) => m.slice(0, 3).map((row) => row.slice(0, 3));
      expect(rodrigues([1, 0, 0], phi).flat().every((v, i) => Math.abs(v - r(rotX(phi)).flat()[i]) < 1e-12)).toBe(true);
      expect(rodrigues([0, 1, 0], phi).flat().every((v, i) => Math.abs(v - r(rotY(phi)).flat()[i]) < 1e-12)).toBe(true);
      expect(rodrigues([0, 0, 1], phi).flat().every((v, i) => Math.abs(v - r(rotZ(phi)).flat()[i]) < 1e-12)).toBe(true);
    }
  });

  it('is orthonormal with det = 1 for random axes and leaves the axis fixed', () => {
    for (let k = 0; k < 100; k++) {
      const u = randAxis();
      const phi = rand(-7, 7);
      const r = rodrigues(u, phi);
      const t: Mat4 = [[...r[0], 0], [...r[1], 0], [...r[2], 0], [0, 0, 0, 1]];
      expect(isRigidTransform(t)).toBe(true);
      const un = normalize(u);
      const ru = [0, 1, 2].map((i) => r[i][0] * un[0] + r[i][1] * un[1] + r[i][2] * un[2]);
      for (let i = 0; i < 3; i++) expect(ru[i]).toBeCloseTo(un[i], 10);
    }
  });

  it('accepts a non-unit axis and normalises it', () => {
    const a = rodrigues([0, 0, 5], 0.9);
    const b = rodrigues([0, 0, 1], 0.9);
    expect(a.flat().every((v, i) => Math.abs(v - b.flat()[i]) < 1e-12)).toBe(true);
  });
});

describe('general screw', () => {
  it('about the z axis through the origin equals Screw_z', () => {
    for (let k = 0; k < 50; k++) {
      const lambda = rand(-2, 2);
      const phi = rand(-7, 7);
      expect(approxEqual(screwGeneral({ u: [0, 0, 1], p: [0, 0, 0], lambda, phi }), screwAxis('z', lambda, phi), 1e-12)).toBe(true);
      expect(approxEqual(screwGeneral({ u: [1, 0, 0], p: [0, 0, 0], lambda, phi }), screwAxis('x', lambda, phi), 1e-12)).toBe(true);
      expect(approxEqual(screwGeneral({ u: [0, 1, 0], p: [0, 0, 0], lambda, phi }), screwAxis('y', lambda, phi), 1e-12)).toBe(true);
    }
  });

  it('the point p on the axis does not matter if it slides along the axis', () => {
    const a = screwGeneral({ u: [0, 0, 1], p: [0, 0, 0], lambda: 0.4, phi: 1.1 });
    const b = screwGeneral({ u: [0, 0, 1], p: [0, 0, 3.7], lambda: 0.4, phi: 1.1 });
    expect(approxEqual(a, b, 1e-12)).toBe(true);
  });

  it('is a rigid transform for random axes, points, λ and φ', () => {
    for (let k = 0; k < 100; k++) {
      const t = screwGeneral({ u: randAxis(), p: randVec(), lambda: rand(-2, 2), phi: rand(-7, 7) });
      expect(isRigidTransform(t)).toBe(true);
    }
  });

  it('moves points on the axis by exactly λ along u and keeps distances to the axis', () => {
    for (let k = 0; k < 50; k++) {
      const u = normalize(randAxis());
      const p = randVec();
      const lambda = rand(-2, 2);
      const phi = rand(-7, 7);
      const t = screwGeneral({ u, p, lambda, phi });
      const onAxis: Vec3 = [p[0] + 1.3 * u[0], p[1] + 1.3 * u[1], p[2] + 1.3 * u[2]];
      const moved = transformPoint(t, onAxis);
      for (let i = 0; i < 3; i++) expect(moved[i]).toBeCloseTo(onAxis[i] + lambda * u[i], 10);
      // an off-axis point keeps its perpendicular distance to the axis
      const q = randVec();
      const dist = (x: Vec3) => {
        const d: Vec3 = [x[0] - p[0], x[1] - p[1], x[2] - p[2]];
        const along = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
        return Math.hypot(d[0] - along * u[0], d[1] - along * u[1], d[2] - along * u[2]);
      };
      expect(dist(transformPoint(t, q))).toBeCloseTo(dist(q), 10);
    }
  });

  it('screw about an axis offset from the origin equals Trans(p)·Screw·Trans(−p)', () => {
    const p: Vec3 = [0.5, -0.2, 0.3];
    const direct = screwGeneral({ u: [0, 0, 1], p, lambda: 0.25, phi: 0.8 });
    const conj = multiply(multiply(trans(...p), screwAxis('z', 0.25, 0.8)), trans(-p[0], -p[1], -p[2]));
    expect(approxEqual(direct, conj, 1e-12)).toBe(true);
  });
});

describe('pitch, path and composition', () => {
  it('pitch', () => {
    expect(pitch(0.5, Math.PI)).toBeCloseTo(0.5 / Math.PI, 12);
    expect(pitch(0.5, 0)).toBe(Infinity);
    expect(pitch(0, 1)).toBe(0);
    expect(pitch(0, 0)).toBe(0);
  });

  it('helix starts at the point and ends at T·point, and every sample stays at the same radius', () => {
    const params = { u: [0, 0, 1] as Vec3, p: [0, 0, 0] as Vec3, lambda: 1, phi: 4 * Math.PI };
    const q: Vec3 = [0.4, 0, 0];
    const path = screwPath(params, q, 81);
    expect(path[0]).toEqual(q);
    const end = transformPoint(screwGeneral(params), q);
    for (let i = 0; i < 3; i++) expect(path[80][i]).toBeCloseTo(end[i], 10);
    for (const pt of path) expect(Math.hypot(pt[0], pt[1])).toBeCloseTo(0.4, 10);
    expect(path[40][2]).toBeCloseTo(0.5, 10);
  });

  it('composition is associative but not commutative', () => {
    const a = screwAxis('x', 0.3, 1.2);
    const b = screwAxis('z', -0.4, 0.7);
    const c = screwGeneral({ u: [1, 1, 0], p: [0.2, 0, 0], lambda: 0.1, phi: 0.5 });
    expect(approxEqual(composeScrews([a, b, c]), multiply(a, multiply(b, c)), 1e-12)).toBe(true);
    expect(matrixDistance(composeScrews([a, b]), composeScrews([b, a]))).toBeGreaterThan(0.1);
    expect(approxEqual(composeScrews([]), identity())).toBe(true);
    // Screws about the same axis do commute.
    expect(matrixDistance(composeScrews([a, screwAxis('x', 0.1, -0.4)]), composeScrews([screwAxis('x', 0.1, -0.4), a]))).toBeLessThan(1e-12);
  });
});
