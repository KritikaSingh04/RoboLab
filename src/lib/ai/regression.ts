/**
 * Simple linear regression y = m·x + c from scratch: normal equations,
 * batch gradient descent and error metrics. This is the TypeScript twin of
 * the Python program run through Pyodide, used as an offline fallback and
 * for unit tests. Pure functions.
 */
import { mulberry32 } from './random';

export interface Metrics {
  mse: number;
  rmse: number;
  mae: number;
  r2: number;
}

export interface RegressionPayload {
  x_train: number[];
  y_train: number[];
  x_test: number[];
  y_test: number[];
  x_label: string;
  y_label: string;
  epochs: number;
  lr: number;
  print_every: number;
}

export interface RegressionResult {
  normal: { m: number; c: number };
  gd: { m: number; c: number; loss: number[]; snapshots: [number, number][] };
  metrics: {
    normal: { train: Metrics; test: Metrics | null };
    gd: { train: Metrics; test: Metrics | null };
  };
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const std = (a: number[]) => {
  const mu = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - mu) ** 2)));
};

/** Closed-form least squares: m = Σ(x−x̄)(y−ȳ) / Σ(x−x̄)², c = ȳ − m x̄. */
export function normalEquation(x: number[], y: number[]): { m: number; c: number } {
  const xm = mean(x);
  const ym = mean(y);
  let num = 0;
  let den = 0;
  for (let i = 0; i < x.length; i++) {
    num += (x[i] - xm) * (y[i] - ym);
    den += (x[i] - xm) ** 2;
  }
  const m = den > 0 ? num / den : 0;
  return { m, c: ym - m * xm };
}

export function metrics(x: number[], y: number[], m: number, c: number): Metrics {
  const res = y.map((v, i) => v - (m * x[i] + c));
  const mse = mean(res.map((r) => r * r));
  const ssRes = res.reduce((s, r) => s + r * r, 0);
  const ym = mean(y);
  const ssTot = y.reduce((s, v) => s + (v - ym) ** 2, 0);
  return { mse, rmse: Math.sqrt(mse), mae: mean(res.map(Math.abs)), r2: ssTot > 0 ? 1 - ssRes / ssTot : 1 };
}

/**
 * Batch gradient descent on standardised x and y (so a single learning rate
 * works for any units); parameters are mapped back to the original units
 * after every epoch so the loss history and snapshots are in real units.
 */
export function gradientDescent(x: number[], y: number[], epochs: number, lr: number, printEvery = 100, log?: (line: string) => void): { m: number; c: number; loss: number[]; snapshots: [number, number][] } {
  const xMu = mean(x);
  const xSd = std(x) || 1;
  const yMu = mean(y);
  const ySd = std(y) || 1;
  const xs = x.map((v) => (v - xMu) / xSd);
  const ys = y.map((v) => (v - yMu) / ySd);
  const toOriginal = (ms: number, cs: number): [number, number] => {
    const m = (ms * ySd) / xSd;
    return [m, ySd * cs + yMu - m * xMu];
  };
  let ms = 0;
  let cs = 0;
  const loss: number[] = [];
  const snapshots: [number, number][] = [];
  log?.(`Gradient descent (lr = ${lr}, ${epochs} epochs):`);
  for (let epoch = 1; epoch <= epochs; epoch++) {
    let gm = 0;
    let gc = 0;
    for (let i = 0; i < xs.length; i++) {
      const err = ms * xs[i] + cs - ys[i];
      gm += err * xs[i];
      gc += err;
    }
    ms -= (lr * gm) / xs.length;
    cs -= (lr * gc) / xs.length;
    const [m, c] = toOriginal(ms, cs);
    const l = metrics(x, y, m, c).mse;
    loss.push(l);
    snapshots.push([m, c]);
    if (epoch % printEvery === 0 || epoch === 1 || epoch === epochs) log?.(`  epoch ${String(epoch).padStart(5)}   loss = ${l.toFixed(6)}   m = ${m.toFixed(5)}   c = ${c.toFixed(5)}`);
  }
  const [m, c] = toOriginal(ms, cs);
  return { m, c, loss, snapshots };
}

/** Full pipeline with the same output shape and log lines as the Python program. */
export function linearRegression(p: RegressionPayload, log?: (line: string) => void): RegressionResult {
  log?.(`Dataset: ${p.x_label} -> ${p.y_label}`);
  log?.(`${p.x_train.length} training points, ${p.x_test.length} test points`);
  log?.('');
  const normal = normalEquation(p.x_train, p.y_train);
  log?.('Normal equations:');
  log?.(`  m = ${normal.m.toFixed(6)}`);
  log?.(`  c = ${normal.c.toFixed(6)}`);
  log?.('');
  const gd = gradientDescent(p.x_train, p.y_train, p.epochs, p.lr, p.print_every, log);
  log?.('');
  const hasTest = p.x_test.length > 0;
  const out: RegressionResult = {
    normal,
    gd,
    metrics: {
      normal: { train: metrics(p.x_train, p.y_train, normal.m, normal.c), test: hasTest ? metrics(p.x_test, p.y_test, normal.m, normal.c) : null },
      gd: { train: metrics(p.x_train, p.y_train, gd.m, gd.c), test: hasTest ? metrics(p.x_test, p.y_test, gd.m, gd.c) : null },
    },
  };
  for (const [name, key] of [
    ['normal equations', 'normal'],
    ['gradient descent', 'gd'],
  ] as const) {
    for (const split of ['train', 'test'] as const) {
      const mt = out.metrics[key][split];
      if (!mt) continue;
      log?.(`${name.padEnd(17)} ${split.padEnd(5)}: MSE=${mt.mse.toFixed(4)}  RMSE=${mt.rmse.toFixed(4)}  MAE=${mt.mae.toFixed(4)}  R²=${mt.r2.toFixed(4)}`);
    }
  }
  return out;
}

/** Seeded shuffle split; returns index arrays. Keeps at least 2 test points when n ≥ 4. */
export function trainTestSplit(n: number, trainRatio: number, seed = 1): { train: number[]; test: number[] } {
  const rng = mulberry32(seed);
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  let nTrain = Math.round(n * trainRatio);
  if (n >= 4) nTrain = Math.min(nTrain, n - 2);
  nTrain = Math.max(2, nTrain);
  return { train: idx.slice(0, nTrain).sort((a, b) => a - b), test: idx.slice(nTrain).sort((a, b) => a - b) };
}
