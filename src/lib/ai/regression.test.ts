import { describe, it, expect } from 'vitest';
import { normalEquation, gradientDescent, metrics, linearRegression, trainTestSplit } from './regression';
import { irSensor, dcMotor, ultrasonic } from './datasets';

describe('normalEquation', () => {
  it('recovers an exact line from noiseless data', () => {
    const x = [0, 1, 2, 3, 4, 5];
    const y = x.map((v) => 2.5 * v - 1.25);
    const { m, c } = normalEquation(x, y);
    expect(m).toBeCloseTo(2.5, 12);
    expect(c).toBeCloseTo(-1.25, 12);
  });

  it('matches a hand-computed textbook example', () => {
    // x = 1..5, y = 2,4,5,4,5 → m = 0.6, c = 2.2
    const { m, c } = normalEquation([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]);
    expect(m).toBeCloseTo(0.6, 12);
    expect(c).toBeCloseTo(2.2, 12);
  });
});

describe('metrics', () => {
  it('perfect fit gives zero errors and R² = 1', () => {
    const x = [1, 2, 3];
    const y = [3, 5, 7];
    const mt = metrics(x, y, 2, 1);
    expect(mt.mse).toBe(0);
    expect(mt.rmse).toBe(0);
    expect(mt.mae).toBe(0);
    expect(mt.r2).toBe(1);
  });

  it('known residuals', () => {
    const mt = metrics([0, 1, 2], [1, 0, 5], 1, 1); // preds 1,2,3 → residuals 0,−2,2
    expect(mt.mse).toBeCloseTo(8 / 3, 12);
    expect(mt.mae).toBeCloseTo(4 / 3, 12);
    expect(mt.rmse).toBeCloseTo(Math.sqrt(8 / 3), 12);
    // ȳ = 2, SStot = 1+4+9 = 14, SSres = 8 → R² = 1 − 8/14
    expect(mt.r2).toBeCloseTo(1 - 8 / 14, 12);
  });
});

describe('gradientDescent', () => {
  it('converges to the normal-equation solution and the loss never increases', () => {
    for (const data of [irSensor(60, 1), dcMotor(60, 2), ultrasonic(60, 3)]) {
      const ne = normalEquation(data.x, data.y);
      const gd = gradientDescent(data.x, data.y, 600, 0.1);
      expect(gd.m).toBeCloseTo(ne.m, 4);
      expect(gd.c).toBeCloseTo(ne.c, 3);
      for (let i = 1; i < gd.loss.length; i++) expect(gd.loss[i]).toBeLessThanOrEqual(gd.loss[i - 1] + 1e-9);
      expect(gd.snapshots).toHaveLength(600);
      expect(gd.loss[gd.loss.length - 1]).toBeCloseTo(metrics(data.x, data.y, ne.m, ne.c).mse, 4);
    }
  });

  it('logs every print_every epochs plus the first and last', () => {
    const lines: string[] = [];
    gradientDescent([0, 1, 2, 3], [1, 3, 5, 7], 50, 0.1, 10, (l) => lines.push(l));
    expect(lines.filter((l) => l.trimStart().startsWith('epoch ')).length).toBe(6); // 1, 10, 20, 30, 40, 50
  });
});

describe('linearRegression pipeline and split', () => {
  it('produces both solutions and metrics on train and test', () => {
    const d = ultrasonic(40, 5);
    const split = trainTestSplit(d.x.length, 0.75, 5);
    expect(split.train.length + split.test.length).toBe(40);
    expect(split.train.length).toBe(30);
    expect(new Set([...split.train, ...split.test]).size).toBe(40);
    const res = linearRegression({ x_train: split.train.map((i) => d.x[i]), y_train: split.train.map((i) => d.y[i]), x_test: split.test.map((i) => d.x[i]), y_test: split.test.map((i) => d.y[i]), x_label: 'x', y_label: 'y', epochs: 300, lr: 0.1, print_every: 100 });
    expect(res.metrics.normal.test).not.toBeNull();
    expect(res.metrics.normal.train.r2).toBeGreaterThan(0.95);
    expect(res.metrics.normal.test!.r2).toBeGreaterThan(0.9);
    expect(res.normal.m).toBeCloseTo(1.02, 1);
  });

  it('split keeps at least two test points and is reproducible', () => {
    expect(trainTestSplit(10, 0.95, 1).test.length).toBe(2);
    expect(trainTestSplit(10, 0.7, 3)).toEqual(trainTestSplit(10, 0.7, 3));
  });
});

describe('regression datasets', () => {
  it('have the requested size, sensible ranges and labels', () => {
    const ir = irSensor(50, 1);
    expect(ir.x).toHaveLength(50);
    expect(Math.min(...ir.x)).toBeGreaterThan(0);
    expect(ir.xLabel).toContain('oltage');
    const dc = dcMotor(50, 1);
    expect(Math.max(...dc.y)).toBeGreaterThan(1000);
    expect(Math.min(...dc.y)).toBeGreaterThanOrEqual(0);
    const us = ultrasonic(50, 1);
    expect(normalEquation(us.x, us.y).m).toBeCloseTo(1.02, 1);
  });
});
