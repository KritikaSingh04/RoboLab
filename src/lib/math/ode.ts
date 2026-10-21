/** Fixed-step ODE integrators for first-order systems y' = f(t, y). Pure functions. */
export type Derivative = (t: number, y: number[]) => number[];

export function rk4Step(f: Derivative, t: number, y: number[], h: number): number[] {
  const k1 = f(t, y);
  const k2 = f(t + h / 2, y.map((v, i) => v + (h / 2) * k1[i]));
  const k3 = f(t + h / 2, y.map((v, i) => v + (h / 2) * k2[i]));
  const k4 = f(t + h, y.map((v, i) => v + h * k3[i]));
  return y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

export function eulerStep(f: Derivative, t: number, y: number[], h: number): number[] {
  const k = f(t, y);
  return y.map((v, i) => v + h * k[i]);
}

export interface OdeSample {
  t: number;
  y: number[];
}

/** Integrate from t0 to t1 with step h; `every` controls how often a sample is recorded. */
export function integrate(f: Derivative, y0: number[], t0: number, t1: number, h: number, method: 'rk4' | 'euler' = 'rk4', every = 1): OdeSample[] {
  const step = method === 'rk4' ? rk4Step : eulerStep;
  const out: OdeSample[] = [{ t: t0, y: [...y0] }];
  let t = t0;
  let y = [...y0];
  let k = 0;
  const n = Math.round((t1 - t0) / h);
  for (let i = 0; i < n; i++) {
    y = step(f, t, y, h);
    t = t0 + (i + 1) * h;
    if (++k % every === 0 || i === n - 1) out.push({ t, y: [...y] });
  }
  return out;
}
