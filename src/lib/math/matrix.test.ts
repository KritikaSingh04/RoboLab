import { describe, it, expect } from 'vitest';
import {
  identity,
  multiply,
  multiplyAll,
  transpose,
  inverse,
  inverseHomogeneous,
  determinant,
  rotationDeterminant,
  isRigidTransform,
  rotX,
  rotY,
  rotZ,
  trans,
  applyToPoint,
  applyToVector,
  approxEqual,
  rounded,
  deg2rad,
  rad2deg,
  type Mat4,
} from './matrix';

const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;

describe('multiply', () => {
  it('identity is the neutral element', () => {
    const t = multiply(rotZ(0.7), trans(1, 2, 3));
    expect(approxEqual(multiply(identity(), t), t)).toBe(true);
    expect(approxEqual(multiply(t, identity()), t)).toBe(true);
  });

  it('matches a hand-computed product', () => {
    const a: Mat4 = [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12],
      [13, 14, 15, 16],
    ];
    const b: Mat4 = [
      [1, 0, 2, 0],
      [0, 1, 0, 2],
      [3, 0, 1, 0],
      [0, 3, 0, 1],
    ];
    const expected: Mat4 = [
      [10, 14, 5, 8],
      [26, 30, 17, 20],
      [42, 46, 29, 32],
      [58, 62, 41, 44],
    ];
    expect(multiply(a, b)).toEqual(expected);
  });

  it('is associative and multiplyAll chains left to right', () => {
    const a = rotX(0.3);
    const b = trans(1, -2, 0.5);
    const c = rotZ(-1.1);
    expect(approxEqual(multiply(multiply(a, b), c), multiply(a, multiply(b, c)))).toBe(true);
    expect(approxEqual(multiplyAll(a, b, c), multiply(multiply(a, b), c))).toBe(true);
  });

  it('is not commutative in general (rotation then translation ≠ translation then rotation)', () => {
    const r = rotZ(Math.PI / 2);
    const t = trans(1, 0, 0);
    expect(approxEqual(multiply(r, t), multiply(t, r))).toBe(false);
  });
});

describe('rotation matrices', () => {
  const angles = [0, 0.1, Math.PI / 4, Math.PI / 2, 1.9, Math.PI, -2.3];

  it.each(angles)('rotX/rotY/rotZ(%f) are orthonormal with det = +1', (theta) => {
    for (const r of [rotX(theta), rotY(theta), rotZ(theta)]) {
      expect(isRigidTransform(r)).toBe(true);
      expect(close(rotationDeterminant(r), 1)).toBe(true);
      expect(close(determinant(r), 1)).toBe(true);
      // Rᵀ R = I
      expect(approxEqual(multiply(transpose(r), r), identity())).toBe(true);
    }
  });

  it('rotZ(90°) maps x-axis to y-axis', () => {
    const [x, y, z] = applyToVector(rotZ(deg2rad(90)), [1, 0, 0]);
    expect(close(x, 0)).toBe(true);
    expect(close(y, 1)).toBe(true);
    expect(close(z, 0)).toBe(true);
  });

  it('rotX(90°) maps y-axis to z-axis', () => {
    const [x, y, z] = applyToVector(rotX(deg2rad(90)), [0, 1, 0]);
    expect(close(x, 0)).toBe(true);
    expect(close(y, 0)).toBe(true);
    expect(close(z, 1)).toBe(true);
  });

  it('rotY(90°) maps z-axis to x-axis', () => {
    const [x, y, z] = applyToVector(rotY(deg2rad(90)), [0, 0, 1]);
    expect(close(x, 1)).toBe(true);
    expect(close(y, 0)).toBe(true);
    expect(close(z, 0)).toBe(true);
  });

  it('rotations about the same axis compose by adding angles', () => {
    expect(approxEqual(multiply(rotZ(0.4), rotZ(0.9)), rotZ(1.3))).toBe(true);
    expect(approxEqual(multiply(rotX(-0.2), rotX(0.5)), rotX(0.3))).toBe(true);
    expect(approxEqual(multiply(rotY(1.0), rotY(1.0)), rotY(2.0))).toBe(true);
  });

  it('rotation by -θ is the inverse (= transpose) of rotation by θ', () => {
    for (const [f, th] of [
      [rotX, 0.6],
      [rotY, -1.2],
      [rotZ, 2.0],
    ] as const) {
      expect(approxEqual(multiply(f(th), f(-th)), identity())).toBe(true);
      expect(approxEqual(f(-th), transpose(f(th)))).toBe(true);
    }
  });
});

describe('trans', () => {
  it('moves a point by the given offset', () => {
    expect(applyToPoint(trans(1, 2, 3), [0.5, -0.5, 10])).toEqual([1.5, 1.5, 13]);
  });

  it('does not affect direction vectors', () => {
    expect(applyToVector(trans(1, 2, 3), [1, 1, 1])).toEqual([1, 1, 1]);
  });

  it('translations compose by adding offsets', () => {
    expect(approxEqual(multiply(trans(1, 2, 3), trans(-4, 0.5, 1)), trans(-3, 2.5, 4))).toBe(true);
  });
});

describe('inverseHomogeneous', () => {
  const samples: Mat4[] = [
    identity(),
    trans(1, 2, 3),
    rotZ(0.8),
    multiplyAll(trans(0.3, -0.2, 1.5), rotZ(0.4), rotY(-1.1), rotX(2.2), trans(0.1, 0.2, 0.3)),
    multiplyAll(rotX(Math.PI / 2), trans(1, 0, 0), rotZ(Math.PI / 3)),
  ];

  it.each(samples.map((m, i) => [i, m]))('T · T⁻¹ = I and T⁻¹ · T = I (sample %i)', (_, t) => {
    const inv = inverseHomogeneous(t as Mat4);
    expect(approxEqual(multiply(t as Mat4, inv), identity())).toBe(true);
    expect(approxEqual(multiply(inv, t as Mat4), identity())).toBe(true);
    expect(isRigidTransform(inv)).toBe(true);
  });

  it('agrees with the general Gauss–Jordan inverse', () => {
    for (const t of samples) {
      expect(approxEqual(inverseHomogeneous(t), inverse(t), 1e-9)).toBe(true);
    }
  });

  it('inverse of a pure translation is the negative translation', () => {
    expect(approxEqual(inverseHomogeneous(trans(1, -2, 3)), trans(-1, 2, -3))).toBe(true);
  });

  it('inverse of a pure rotation is its transpose', () => {
    const r = rotY(0.77);
    expect(approxEqual(inverseHomogeneous(r), transpose(r))).toBe(true);
  });

  it('(AB)⁻¹ = B⁻¹ A⁻¹', () => {
    const a = multiply(rotZ(0.5), trans(1, 0, 0));
    const b = multiply(rotX(-0.3), trans(0, 2, 1));
    const lhs = inverseHomogeneous(multiply(a, b));
    const rhs = multiply(inverseHomogeneous(b), inverseHomogeneous(a));
    expect(approxEqual(lhs, rhs)).toBe(true);
  });

  it('undoes a point transform', () => {
    const t = multiplyAll(trans(2, 1, -1), rotZ(1.2), rotX(0.3));
    const p: [number, number, number] = [0.4, -0.7, 1.1];
    const q = applyToPoint(t, p);
    const back = applyToPoint(inverseHomogeneous(t), q);
    for (let i = 0; i < 3; i++) expect(close(back[i], p[i])).toBe(true);
  });
});

describe('inverse (general)', () => {
  it('inverts a non-rigid matrix', () => {
    const m: Mat4 = [
      [2, 0, 0, 1],
      [0, 3, 0, 2],
      [0, 0, 4, 3],
      [0, 0, 0, 1],
    ];
    expect(approxEqual(multiply(m, inverse(m)), identity())).toBe(true);
  });

  it('throws on a singular matrix', () => {
    const m: Mat4 = [
      [1, 2, 3, 4],
      [2, 4, 6, 8],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    expect(() => inverse(m)).toThrow();
  });
});

describe('helpers', () => {
  it('determinant of a known matrix', () => {
    const m: Mat4 = [
      [2, 0, 0, 0],
      [0, 3, 0, 0],
      [0, 0, 4, 0],
      [0, 0, 0, 5],
    ];
    expect(determinant(m)).toBe(120);
  });

  it('rounded() rounds to 3 decimals by default and removes negative zero', () => {
    const r = rounded(rotZ(Math.PI / 2));
    expect(r[0][0]).toBe(0);
    expect(Object.is(r[0][0], -0)).toBe(false);
    expect(r[0][1]).toBe(-1);
    expect(r[1][0]).toBe(1);
  });

  it('deg2rad / rad2deg round trip', () => {
    expect(close(rad2deg(deg2rad(123.4)), 123.4)).toBe(true);
    expect(close(deg2rad(180), Math.PI)).toBe(true);
  });

  it('isRigidTransform rejects a scaled matrix', () => {
    const m = identity();
    m[0][0] = 2;
    expect(isRigidTransform(m)).toBe(false);
  });
});
