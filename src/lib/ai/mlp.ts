/**
 * Multilayer perceptron from scratch: forward pass, back-propagation,
 * mini-batch gradient descent with momentum, MSE or softmax + cross-entropy,
 * Xavier / He initialisation. Plus a classic single perceptron and
 * classification metrics. Pure functions; the network object is mutated
 * in place by the training functions for speed.
 */
import { mulberry32, gaussian, type Rng } from './random';

export type Activation = 'sigmoid' | 'tanh' | 'relu' | 'linear';
export const ACTIVATIONS: Activation[] = ['sigmoid', 'tanh', 'relu', 'linear'];
export type Loss = 'mse' | 'softmax-ce';
export type Init = 'xavier' | 'he';

export interface MLPConfig {
  /** Layer sizes including input and output, e.g. [2, 8, 8, 1]. */
  layers: number[];
  activation: Activation;
  /** Output activation for MSE networks (ignored for softmax-ce). */
  outputActivation?: Activation;
  loss: Loss;
  init?: Init;
  seed?: number;
}

export interface MLP {
  config: MLPConfig;
  /** W[l][j][i]: weight from unit i of layer l to unit j of layer l+1. */
  W: number[][][];
  b: number[][];
  /** Momentum buffers. */
  vW: number[][][];
  vb: number[][];
}

export function activate(f: Activation, z: number): number {
  switch (f) {
    case 'sigmoid':
      return 1 / (1 + Math.exp(-z));
    case 'tanh':
      return Math.tanh(z);
    case 'relu':
      return z > 0 ? z : 0;
    case 'linear':
      return z;
  }
}

/** Derivative f'(z) given z and a = f(z). */
export function activateDeriv(f: Activation, z: number, a: number): number {
  switch (f) {
    case 'sigmoid':
      return a * (1 - a);
    case 'tanh':
      return 1 - a * a;
    case 'relu':
      return z > 0 ? 1 : 0;
    case 'linear':
      return 1;
  }
}

export function softmax(z: number[]): number[] {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

export function createMLP(config: MLPConfig): MLP {
  const rng = mulberry32(config.seed ?? 1);
  const init = config.init ?? (config.activation === 'relu' ? 'he' : 'xavier');
  const L = config.layers.length - 1;
  const W: number[][][] = [];
  const b: number[][] = [];
  for (let l = 0; l < L; l++) {
    const nIn = config.layers[l];
    const nOut = config.layers[l + 1];
    // Xavier: Var = 2/(nIn+nOut); He: Var = 2/nIn
    const sd = init === 'he' ? Math.sqrt(2 / nIn) : Math.sqrt(2 / (nIn + nOut));
    W.push(Array.from({ length: nOut }, () => Array.from({ length: nIn }, () => sd * gaussian(rng))));
    b.push(new Array(nOut).fill(0));
  }
  return { config, W, b, vW: W.map((m) => m.map((r) => r.map(() => 0))), vb: b.map((r) => r.map(() => 0)) };
}

export function cloneMLP(net: MLP): MLP {
  return { config: { ...net.config }, W: net.W.map((m) => m.map((r) => [...r])), b: net.b.map((r) => [...r]), vW: net.vW.map((m) => m.map((r) => [...r])), vb: net.vb.map((r) => [...r]) };
}

export interface ForwardPass {
  /** a[0] = input, a[L] = output (after the output activation / softmax). */
  a: number[][];
  /** z[l] = pre-activation of layer l+1. */
  z: number[][];
}

const outputActivation = (c: MLPConfig): Activation => (c.loss === 'softmax-ce' ? 'linear' : (c.outputActivation ?? 'linear'));

export function forward(net: MLP, x: number[]): ForwardPass {
  const L = net.W.length;
  const a: number[][] = [x];
  const z: number[][] = [];
  for (let l = 0; l < L; l++) {
    const W = net.W[l];
    const prev = a[l];
    const zl = W.map((row, j) => {
      let s = net.b[l][j];
      for (let i = 0; i < row.length; i++) s += row[i] * prev[i];
      return s;
    });
    z.push(zl);
    const last = l === L - 1;
    if (last && net.config.loss === 'softmax-ce') a.push(softmax(zl));
    else {
      const f = last ? outputActivation(net.config) : net.config.activation;
      a.push(zl.map((v) => activate(f, v)));
    }
  }
  return { a, z };
}

export function predict(net: MLP, x: number[]): number[] {
  const fp = forward(net, x);
  return fp.a[fp.a.length - 1];
}

/** Loss of a single sample: ½Σ(ŷ−y)² for MSE, −Σ y log p for cross-entropy. */
export function sampleLoss(net: MLP, out: number[], y: number[]): number {
  if (net.config.loss === 'softmax-ce') return -y.reduce((s, yi, k) => s + (yi > 0 ? yi * Math.log(Math.max(out[k], 1e-12)) : 0), 0);
  return 0.5 * out.reduce((s, o, k) => s + (o - y[k]) ** 2, 0);
}

export function meanLoss(net: MLP, X: number[][], Y: number[][]): number {
  let s = 0;
  for (let i = 0; i < X.length; i++) s += sampleLoss(net, predict(net, X[i]), Y[i]);
  return s / X.length;
}

export interface Gradients {
  dW: number[][][];
  db: number[][];
  loss: number;
}

/** Back-propagation for one sample. */
export function backward(net: MLP, x: number[], y: number[]): Gradients {
  const { a, z } = forward(net, x);
  const L = net.W.length;
  const out = a[L];
  // output delta
  let delta: number[];
  if (net.config.loss === 'softmax-ce') delta = out.map((p, k) => p - y[k]);
  else {
    const f = outputActivation(net.config);
    delta = out.map((o, k) => (o - y[k]) * activateDeriv(f, z[L - 1][k], o));
  }
  const dW: number[][][] = new Array(L);
  const db: number[][] = new Array(L);
  for (let l = L - 1; l >= 0; l--) {
    dW[l] = delta.map((d) => a[l].map((ai) => d * ai));
    db[l] = [...delta];
    if (l > 0) {
      const W = net.W[l];
      delta = a[l].map((ai, i) => {
        let s = 0;
        for (let j = 0; j < W.length; j++) s += W[j][i] * delta[j];
        return s * activateDeriv(net.config.activation, z[l - 1][i], ai);
      });
    }
  }
  return { dW, db, loss: sampleLoss(net, out, y) };
}

/** Numerical gradient (central differences) of the sample loss w.r.t. every weight and bias. */
export function numericalGradient(net: MLP, x: number[], y: number[], eps = 1e-5): { dW: number[][][]; db: number[][] } {
  const lossAt = () => sampleLoss(net, predict(net, x), y);
  const dW = net.W.map((m, l) =>
    m.map((row, j) =>
      row.map((_, i) => {
        const orig = net.W[l][j][i];
        net.W[l][j][i] = orig + eps;
        const lp = lossAt();
        net.W[l][j][i] = orig - eps;
        const lm = lossAt();
        net.W[l][j][i] = orig;
        return (lp - lm) / (2 * eps);
      }),
    ),
  );
  const db = net.b.map((row, l) =>
    row.map((_, j) => {
      const orig = net.b[l][j];
      net.b[l][j] = orig + eps;
      const lp = lossAt();
      net.b[l][j] = orig - eps;
      const lm = lossAt();
      net.b[l][j] = orig;
      return (lp - lm) / (2 * eps);
    }),
  );
  return { dW, db };
}

export interface TrainOptions {
  lr: number;
  batchSize: number;
  momentum?: number;
  rng?: Rng;
}

/** One mini-batch update (gradients averaged over the batch). Returns the mean loss of the batch. */
export function trainBatch(net: MLP, X: number[][], Y: number[][], opts: TrainOptions): number {
  const n = X.length;
  const acc = net.W.map((m) => m.map((r) => r.map(() => 0)));
  const accB = net.b.map((r) => r.map(() => 0));
  let loss = 0;
  for (let s = 0; s < n; s++) {
    const g = backward(net, X[s], Y[s]);
    loss += g.loss;
    for (let l = 0; l < acc.length; l++) {
      for (let j = 0; j < acc[l].length; j++) {
        accB[l][j] += g.db[l][j];
        for (let i = 0; i < acc[l][j].length; i++) acc[l][j][i] += g.dW[l][j][i];
      }
    }
  }
  const beta = opts.momentum ?? 0;
  for (let l = 0; l < net.W.length; l++) {
    for (let j = 0; j < net.W[l].length; j++) {
      net.vb[l][j] = beta * net.vb[l][j] - (opts.lr * accB[l][j]) / n;
      net.b[l][j] += net.vb[l][j];
      for (let i = 0; i < net.W[l][j].length; i++) {
        net.vW[l][j][i] = beta * net.vW[l][j][i] - (opts.lr * acc[l][j][i]) / n;
        net.W[l][j][i] += net.vW[l][j][i];
      }
    }
  }
  return loss / n;
}

/** One epoch of shuffled mini-batches. Returns the mean sample loss over the epoch. */
export function trainEpoch(net: MLP, X: number[][], Y: number[][], opts: TrainOptions): number {
  const rng = opts.rng ?? Math.random;
  const idx = X.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const bs = Math.max(1, Math.min(opts.batchSize, X.length));
  let total = 0;
  for (let s = 0; s < idx.length; s += bs) {
    const sel = idx.slice(s, s + bs);
    total += trainBatch(net, sel.map((i) => X[i]), sel.map((i) => Y[i]), opts) * sel.length;
  }
  return total / X.length;
}

// ---------------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------------

export const oneHot = (label: number, k: number): number[] => Array.from({ length: k }, (_, i) => (i === label ? 1 : 0));
export const argmax = (v: number[]): number => v.reduce((best, x, i, arr) => (x > arr[best] ? i : best), 0);

export function accuracy(net: MLP, X: number[][], labels: number[]): number {
  if (X.length === 0) return 0;
  let c = 0;
  for (let i = 0; i < X.length; i++) if (argmax(predict(net, X[i])) === labels[i]) c++;
  return c / X.length;
}

/** confusion[true][pred] */
export function confusionMatrix(net: MLP, X: number[][], labels: number[], k: number): number[][] {
  const m = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < X.length; i++) m[labels[i]][argmax(predict(net, X[i]))]++;
  return m;
}

export interface ClassMetrics {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export function classMetrics(cm: number[][]): ClassMetrics[] {
  const k = cm.length;
  return Array.from({ length: k }, (_, c) => {
    const tp = cm[c][c];
    const fp = cm.reduce((s, row, t) => s + (t === c ? 0 : row[c]), 0);
    const fn = cm[c].reduce((s, v, p) => s + (p === c ? 0 : v), 0);
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    return { precision, recall, f1, support: tp + fn };
  });
}

// ---------------------------------------------------------------------------
// Single perceptron (step activation, perceptron learning rule)
// ---------------------------------------------------------------------------

export interface Perceptron {
  w: number[];
  b: number;
}

export const perceptronOutput = (p: Perceptron, x: number[]): number => (p.w.reduce((s, wi, i) => s + wi * x[i], 0) + p.b >= 0 ? 1 : 0);

/** One epoch of the perceptron rule w ← w + η (y − ŷ) x. Returns the number of misclassified samples before the updates. */
export function perceptronEpoch(p: Perceptron, X: number[][], y: number[], lr: number): number {
  let errors = 0;
  for (let i = 0; i < X.length; i++) {
    const out = perceptronOutput(p, X[i]);
    const e = y[i] - out;
    if (e !== 0) {
      errors++;
      for (let k = 0; k < p.w.length; k++) p.w[k] += lr * e * X[i][k];
      p.b += lr * e;
    }
  }
  return errors;
}

export function trainPerceptron(X: number[][], y: number[], lr = 0.1, maxEpochs = 100, seed = 1): { p: Perceptron; errorsPerEpoch: number[]; converged: boolean } {
  const rng = mulberry32(seed);
  const p: Perceptron = { w: X[0].map(() => 0.2 * (rng() - 0.5)), b: 0.2 * (rng() - 0.5) };
  const errorsPerEpoch: number[] = [];
  let converged = false;
  for (let e = 0; e < maxEpochs; e++) {
    const errs = perceptronEpoch(p, X, y, lr);
    errorsPerEpoch.push(errs);
    if (errs === 0) {
      converged = true;
      break;
    }
  }
  return { p, errorsPerEpoch, converged };
}

export const GATES: Record<'AND' | 'OR' | 'NAND' | 'XOR', number[]> = { AND: [0, 0, 0, 1], OR: [0, 1, 1, 1], NAND: [1, 1, 1, 0], XOR: [0, 1, 1, 0] };
export const GATE_INPUTS: number[][] = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
];
