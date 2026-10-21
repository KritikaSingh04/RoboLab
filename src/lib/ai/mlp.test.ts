import { describe, it, expect } from 'vitest';
import { createMLP, forward, predict, backward, numericalGradient, trainEpoch, meanLoss, accuracy, oneHot, confusionMatrix, classMetrics, softmax, trainPerceptron, GATES, GATE_INPUTS, perceptronOutput, ACTIVATIONS, type MLPConfig } from './mlp';
import { mulberry32 } from './random';

describe('forward pass', () => {
  it('softmax outputs sum to 1 and sigmoid outputs lie in (0, 1)', () => {
    const net = createMLP({ layers: [3, 5, 4], activation: 'tanh', loss: 'softmax-ce', seed: 3 });
    const out = predict(net, [0.2, -1, 0.7]);
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(softmax([1000, 1000]).every((p) => Math.abs(p - 0.5) < 1e-12)).toBe(true);
    const net2 = createMLP({ layers: [2, 3, 1], activation: 'relu', outputActivation: 'sigmoid', loss: 'mse', seed: 2 });
    const o = predict(net2, [1, -1])[0];
    expect(o).toBeGreaterThan(0);
    expect(o).toBeLessThan(1);
    expect(forward(net2, [1, -1]).a).toHaveLength(3);
  });

  it('initialisation variance follows Xavier / He', () => {
    const big = createMLP({ layers: [400, 400], activation: 'tanh', loss: 'mse', init: 'xavier', seed: 5 });
    const v = big.W[0].flat().reduce((s, w) => s + w * w, 0) / (400 * 400);
    expect(v).toBeCloseTo(2 / 800, 3);
    const he = createMLP({ layers: [400, 400], activation: 'relu', loss: 'mse', seed: 6 });
    const v2 = he.W[0].flat().reduce((s, w) => s + w * w, 0) / (400 * 400);
    expect(v2).toBeCloseTo(2 / 400, 3);
  });
});

describe('back-propagation matches the numerical gradient', () => {
  const configs: MLPConfig[] = [
    { layers: [2, 4, 1], activation: 'sigmoid', outputActivation: 'sigmoid', loss: 'mse', seed: 1 },
    { layers: [3, 5, 2], activation: 'tanh', loss: 'mse', seed: 2 },
    { layers: [2, 6, 3, 3], activation: 'tanh', loss: 'softmax-ce', seed: 3 },
    { layers: [4, 5, 2], activation: 'relu', loss: 'softmax-ce', seed: 4 },
    { layers: [2, 3, 2], activation: 'linear', loss: 'mse', seed: 5 },
  ];
  it.each(configs.map((c) => [c.layers.join('-') + ' ' + c.activation + ' ' + c.loss, c]))('%s', (_, c) => {
    const net = createMLP(c as MLPConfig);
    const rng = mulberry32(42);
    for (let trial = 0; trial < 3; trial++) {
      const x = Array.from({ length: (c as MLPConfig).layers[0] }, () => rng() * 2 - 1);
      const nOut = (c as MLPConfig).layers[(c as MLPConfig).layers.length - 1];
      const y = (c as MLPConfig).loss === 'softmax-ce' ? oneHot(Math.floor(rng() * nOut), nOut) : Array.from({ length: nOut }, () => rng() * 2 - 1);
      const an = backward(net, x, y);
      const num = numericalGradient(net, x, y, 1e-6);
      let maxRel = 0;
      for (let l = 0; l < an.dW.length; l++) {
        for (let j = 0; j < an.dW[l].length; j++) {
          for (let i = 0; i < an.dW[l][j].length; i++) {
            const a = an.dW[l][j][i];
            const n = num.dW[l][j][i];
            maxRel = Math.max(maxRel, Math.abs(a - n) / Math.max(1e-8, Math.abs(a) + Math.abs(n)));
          }
          const a = an.db[l][j];
          const n = num.db[l][j];
          maxRel = Math.max(maxRel, Math.abs(a - n) / Math.max(1e-8, Math.abs(a) + Math.abs(n)));
        }
      }
      expect(maxRel).toBeLessThan(1e-5);
    }
  });
});

describe('learning', () => {
  const X = GATE_INPUTS;

  it('a 2-4-1 MLP learns XOR to > 95 % accuracy', () => {
    const Y = GATES.XOR.map((v) => [v]);
    const net = createMLP({ layers: [2, 4, 1], activation: 'tanh', outputActivation: 'sigmoid', loss: 'mse', seed: 7 });
    const rng = mulberry32(7);
    for (let e = 0; e < 3000; e++) trainEpoch(net, X, Y, { lr: 0.5, batchSize: 4, momentum: 0.9, rng });
    const correct = X.filter((x, i) => (predict(net, x)[0] > 0.5 ? 1 : 0) === GATES.XOR[i]).length;
    expect(correct / 4).toBeGreaterThan(0.95);
    expect(meanLoss(net, X, Y)).toBeLessThan(0.02);
  });

  it('a 2-2-1 MLP (the minimal XOR network) solves XOR for most seeds (it can get stuck in a local minimum)', () => {
    const Y = GATES.XOR.map((v) => [v]);
    let solved = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const net = createMLP({ layers: [2, 2, 1], activation: 'tanh', outputActivation: 'sigmoid', loss: 'mse', seed });
      const rng = mulberry32(seed);
      for (let e = 0; e < 5000; e++) trainEpoch(net, X, Y, { lr: 0.5, batchSize: 4, momentum: 0.9, rng });
      const correct = X.filter((x, i) => (predict(net, x)[0] > 0.5 ? 1 : 0) === GATES.XOR[i]).length;
      if (correct === 4) solved++;
    }
    expect(solved).toBeGreaterThanOrEqual(4);
  });

  it('softmax classifier separates two Gaussian blobs with momentum, loss decreasing on average', () => {
    const rng = mulberry32(3);
    const Xs: number[][] = [];
    const labels: number[] = [];
    for (let i = 0; i < 200; i++) {
      const c = i % 2;
      Xs.push([(c ? 1.5 : -1.5) + (rng() - 0.5), (c ? 1 : -1) + (rng() - 0.5)]);
      labels.push(c);
    }
    const Y = labels.map((l) => oneHot(l, 2));
    const net = createMLP({ layers: [2, 6, 2], activation: 'relu', loss: 'softmax-ce', seed: 3 });
    const losses: number[] = [];
    for (let e = 0; e < 60; e++) losses.push(trainEpoch(net, Xs, Y, { lr: 0.05, batchSize: 16, momentum: 0.9, rng }));
    expect(losses[losses.length - 1]).toBeLessThan(losses[0] / 5);
    expect(accuracy(net, Xs, labels)).toBeGreaterThan(0.98);
    const cm = confusionMatrix(net, Xs, labels, 2);
    expect(cm.flat().reduce((a, b) => a + b, 0)).toBe(200);
    const m = classMetrics(cm);
    expect(m[0].f1).toBeGreaterThan(0.97);
  });

  it('every activation can regress a parabola', () => {
    const rng = mulberry32(9);
    const Xs = Array.from({ length: 60 }, (_, i) => [-1 + (2 * i) / 59]);
    const Y = Xs.map(([x]) => [x * x]);
    for (const act of ACTIVATIONS) {
      if (act === 'linear') continue; // a linear network cannot fit a parabola
      const net = createMLP({ layers: [1, 12, 1], activation: act, loss: 'mse', seed: 9 });
      const first = meanLoss(net, Xs, Y);
      for (let e = 0; e < 400; e++) trainEpoch(net, Xs, Y, { lr: 0.05, batchSize: 10, momentum: 0.9, rng });
      expect(meanLoss(net, Xs, Y)).toBeLessThan(Math.min(first, 0.01));
    }
  });
});

describe('classMetrics', () => {
  it('computes precision, recall and F1 from a confusion matrix', () => {
    const m = classMetrics([
      [8, 2],
      [1, 9],
    ]);
    expect(m[0].precision).toBeCloseTo(8 / 9, 12);
    expect(m[0].recall).toBeCloseTo(0.8, 12);
    expect(m[0].f1).toBeCloseTo((2 * (8 / 9) * 0.8) / (8 / 9 + 0.8), 12);
    expect(m[1].support).toBe(10);
  });
});

describe('single perceptron', () => {
  it('learns AND, OR and NAND but not XOR', () => {
    for (const g of ['AND', 'OR', 'NAND'] as const) {
      const r = trainPerceptron(GATE_INPUTS, GATES[g], 0.1, 100);
      expect(r.converged).toBe(true);
      expect(GATE_INPUTS.every((x, i) => perceptronOutput(r.p, x) === GATES[g][i])).toBe(true);
    }
    const xor = trainPerceptron(GATE_INPUTS, GATES.XOR, 0.1, 200);
    expect(xor.converged).toBe(false);
    expect(xor.errorsPerEpoch[xor.errorsPerEpoch.length - 1]).toBeGreaterThan(0);
  });
});
