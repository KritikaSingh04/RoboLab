/**
 * Generic Mamdani fuzzy inference engine, from scratch.
 * Variables, terms and rules are plain data so any experiment can define a
 * system (experiment 11 reuses it for obstacle avoidance). Pure functions.
 */

export type MF = { type: 'tri'; a: number; b: number; c: number } | { type: 'trap'; a: number; b: number; c: number; d: number } | { type: 'gauss'; mean: number; sigma: number };

export interface Term {
  name: string;
  mf: MF;
}

export interface Variable {
  name: string;
  label: string;
  unit: string;
  range: [number, number];
  terms: Term[];
}

export interface Clause {
  variable: string;
  term: string;
}

export interface Rule {
  antecedents: Clause[];
  /** How the antecedents combine: AND = min, OR = max. */
  op: 'and' | 'or';
  consequents: Clause[];
  enabled?: boolean;
  weight?: number;
}

export interface FuzzySystem {
  name: string;
  description: string;
  inputs: Variable[];
  outputs: Variable[];
  rules: Rule[];
}

export type Defuzz = 'centroid' | 'bisector' | 'mom';
export const DEFUZZ_METHODS: Defuzz[] = ['centroid', 'bisector', 'mom'];
export const DEFUZZ_LABEL: Record<Defuzz, string> = { centroid: 'Centroid (centre of area)', bisector: 'Bisector of area', mom: 'Mean of maximum' };

// ---------------------------------------------------------------------------
// Membership functions
// ---------------------------------------------------------------------------

export function membership(mf: MF, x: number): number {
  switch (mf.type) {
    case 'tri': {
      const { a, b, c } = mf;
      if (x <= a || x >= c) return x === b ? 1 : 0;
      if (x === b) return 1;
      return x < b ? (x - a) / (b - a) : (c - x) / (c - b);
    }
    case 'trap': {
      const { a, b, c, d } = mf;
      if (x <= a || x >= d) return x >= b && x <= c ? 1 : 0;
      if (x >= b && x <= c) return 1;
      return x < b ? (x - a) / (b - a) : (d - x) / (d - c);
    }
    case 'gauss': {
      const z = (x - mf.mean) / mf.sigma;
      return Math.exp(-0.5 * z * z);
    }
  }
}

/** Human-readable parameter list of a membership function. */
export function mfParams(mf: MF): { key: string; value: number }[] {
  switch (mf.type) {
    case 'tri':
      return [
        { key: 'a', value: mf.a },
        { key: 'b', value: mf.b },
        { key: 'c', value: mf.c },
      ];
    case 'trap':
      return [
        { key: 'a', value: mf.a },
        { key: 'b', value: mf.b },
        { key: 'c', value: mf.c },
        { key: 'd', value: mf.d },
      ];
    case 'gauss':
      return [
        { key: 'mean', value: mf.mean },
        { key: 'sigma', value: mf.sigma },
      ];
  }
}

/** Return a copy of the MF with one parameter changed, keeping a ≤ b ≤ c (≤ d) and σ > 0. */
export function withMfParam(mf: MF, key: string, value: number): MF {
  const m = { ...mf } as MF & Record<string, number>;
  (m as Record<string, number>)[key] = value;
  if (m.type === 'tri') {
    if (key === 'a') m.a = Math.min(value, m.b);
    if (key === 'b') m.b = Math.min(Math.max(value, m.a), m.c);
    if (key === 'c') m.c = Math.max(value, m.b);
  } else if (m.type === 'trap') {
    if (key === 'a') m.a = Math.min(value, m.b);
    if (key === 'b') m.b = Math.min(Math.max(value, m.a), m.c);
    if (key === 'c') m.c = Math.min(Math.max(value, m.b), m.d);
    if (key === 'd') m.d = Math.max(value, m.c);
  } else if (key === 'sigma') {
    m.sigma = Math.max(1e-3, value);
  }
  return m as MF;
}

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

export function fuzzify(variable: Variable, x: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of variable.terms) out[t.name] = membership(t.mf, x);
  return out;
}

export function ruleStrength(rule: Rule, fuzzified: Record<string, Record<string, number>>): number {
  if (rule.enabled === false || rule.antecedents.length === 0) return 0;
  const degrees = rule.antecedents.map((a) => fuzzified[a.variable]?.[a.term] ?? 0);
  const s = rule.op === 'and' ? Math.min(...degrees) : Math.max(...degrees);
  return s * (rule.weight ?? 1);
}

export interface Curve {
  xs: number[];
  ys: number[];
}

export function sampleMF(mf: MF, range: [number, number], n = 201): Curve {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = range[0] + ((range[1] - range[0]) * i) / (n - 1);
    xs.push(x);
    ys.push(membership(mf, x));
  }
  return { xs, ys };
}

/**
 * Implication = min (clip each consequent at its rule strength),
 * aggregation = max over all rules targeting the output.
 */
export function aggregateOutput(output: Variable, termStrengths: Record<string, number>, n = 201): Curve {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = output.range[0] + ((output.range[1] - output.range[0]) * i) / (n - 1);
    let y = 0;
    for (const t of output.terms) {
      const s = termStrengths[t.name] ?? 0;
      if (s > 0) y = Math.max(y, Math.min(s, membership(t.mf, x)));
    }
    xs.push(x);
    ys.push(y);
  }
  return { xs, ys };
}

/** Defuzzify a sampled fuzzy set. Returns the range midpoint when the set is empty. */
export function defuzzify(curve: Curve, method: Defuzz): number {
  const { xs, ys } = curve;
  const n = xs.length;
  const area = ys.reduce((a, b) => a + b, 0);
  if (area <= 0) return (xs[0] + xs[n - 1]) / 2;
  switch (method) {
    case 'centroid': {
      let num = 0;
      for (let i = 0; i < n; i++) num += xs[i] * ys[i];
      return num / area;
    }
    case 'bisector': {
      let acc = 0;
      for (let i = 0; i < n; i++) {
        acc += ys[i];
        if (acc >= area / 2) {
          // interpolate inside the sample that crosses half the area
          const prev = acc - ys[i];
          const f = ys[i] > 0 ? (area / 2 - prev) / ys[i] : 0;
          const dx = n > 1 ? xs[1] - xs[0] : 0;
          return xs[i] - dx / 2 + f * dx;
        }
      }
      return xs[n - 1];
    }
    case 'mom': {
      const max = Math.max(...ys);
      let sum = 0;
      let cnt = 0;
      for (let i = 0; i < n; i++) {
        if (max - ys[i] <= 1e-9) {
          sum += xs[i];
          cnt++;
        }
      }
      return sum / cnt;
    }
  }
}

export interface OutputResult {
  crisp: number;
  aggregated: Curve;
  /** Firing strength per consequent term (after max-aggregation across rules). */
  termStrengths: Record<string, number>;
}

export interface InferenceResult {
  fuzzified: Record<string, Record<string, number>>;
  ruleStrengths: number[];
  outputs: Record<string, OutputResult>;
}

export function infer(system: FuzzySystem, inputs: Record<string, number>, method: Defuzz = 'centroid', n = 201): InferenceResult {
  const fuzzified: Record<string, Record<string, number>> = {};
  for (const v of system.inputs) fuzzified[v.name] = fuzzify(v, inputs[v.name] ?? v.range[0]);
  const ruleStrengths = system.rules.map((r) => ruleStrength(r, fuzzified));
  const outputs: Record<string, OutputResult> = {};
  for (const out of system.outputs) {
    const termStrengths: Record<string, number> = {};
    for (const t of out.terms) termStrengths[t.name] = 0;
    system.rules.forEach((r, i) => {
      for (const c of r.consequents) if (c.variable === out.name) termStrengths[c.term] = Math.max(termStrengths[c.term] ?? 0, ruleStrengths[i]);
    });
    const aggregated = aggregateOutput(out, termStrengths, n);
    outputs[out.name] = { crisp: defuzzify(aggregated, method), aggregated, termStrengths };
  }
  return { fuzzified, ruleStrengths, outputs };
}

export interface Surface {
  a: number[];
  b: number[];
  /** z[i][j] for a[i], b[j] */
  z: number[][];
  min: number;
  max: number;
}

/** Control surface of one output over two inputs (other inputs held at `fixed`). */
export function controlSurface(system: FuzzySystem, inputA: string, inputB: string, output: string, n = 31, method: Defuzz = 'centroid', fixed: Record<string, number> = {}): Surface {
  const va = system.inputs.find((v) => v.name === inputA)!;
  const vb = system.inputs.find((v) => v.name === inputB)!;
  const a = Array.from({ length: n }, (_, i) => va.range[0] + ((va.range[1] - va.range[0]) * i) / (n - 1));
  const b = Array.from({ length: n }, (_, j) => vb.range[0] + ((vb.range[1] - vb.range[0]) * j) / (n - 1));
  let min = Infinity;
  let max = -Infinity;
  const z = a.map((x) =>
    b.map((y) => {
      const v = infer(system, { ...fixed, [inputA]: x, [inputB]: y }, method, 101).outputs[output].crisp;
      min = Math.min(min, v);
      max = Math.max(max, v);
      return v;
    }),
  );
  return { a, b, z, min, max };
}

// ---------------------------------------------------------------------------
// Example systems
// ---------------------------------------------------------------------------

const tri = (a: number, b: number, c: number): MF => ({ type: 'tri', a, b, c });
const trap = (a: number, b: number, c: number, d: number): MF => ({ type: 'trap', a, b, c, d });
const R = (variable: string, term: string): Clause => ({ variable, term });

/** Fuzzy obstacle-avoidance controller for a differential-drive robot. */
export function obstacleAvoidanceSystem(): FuzzySystem {
  return {
    name: 'Fuzzy obstacle-avoidance controller for a mobile robot',
    description: 'Front range reading and bearing of the nearest obstacle → steering correction and forward speed. Obstacle on the right ⇒ steer left and vice versa; straight ahead ⇒ default to a left swerve.',
    inputs: [
      { name: 'distance', label: 'Front distance', unit: 'm', range: [0, 2], terms: [{ name: 'Near', mf: trap(0, 0, 0.4, 0.8) }, { name: 'Medium', mf: tri(0.5, 1.0, 1.5) }, { name: 'Far', mf: trap(1.2, 1.6, 2, 2) }] },
      { name: 'angle', label: 'Obstacle angle', unit: '°', range: [-90, 90], terms: [{ name: 'Left', mf: trap(-90, -90, -40, -10) }, { name: 'Center', mf: tri(-30, 0, 30) }, { name: 'Right', mf: trap(10, 40, 90, 90) }] },
    ],
    outputs: [
      { name: 'steering', label: 'Steering angle', unit: '°', range: [-45, 45], terms: [{ name: 'Hard-left', mf: tri(-45, -45, -22) }, { name: 'Left', mf: tri(-40, -20, 0) }, { name: 'Straight', mf: tri(-12, 0, 12) }, { name: 'Right', mf: tri(0, 20, 40) }, { name: 'Hard-right', mf: tri(22, 45, 45) }] },
      { name: 'speed', label: 'Speed', unit: 'm/s', range: [0, 1], terms: [{ name: 'Slow', mf: trap(0, 0, 0.15, 0.4) }, { name: 'Medium', mf: tri(0.3, 0.5, 0.7) }, { name: 'Fast', mf: trap(0.6, 0.85, 1, 1) }] },
    ],
    rules: [
      // steering
      { antecedents: [R('distance', 'Near'), R('angle', 'Left')], op: 'and', consequents: [R('steering', 'Hard-right')] },
      { antecedents: [R('distance', 'Near'), R('angle', 'Center')], op: 'and', consequents: [R('steering', 'Hard-left')] },
      { antecedents: [R('distance', 'Near'), R('angle', 'Right')], op: 'and', consequents: [R('steering', 'Hard-left')] },
      { antecedents: [R('distance', 'Medium'), R('angle', 'Left')], op: 'and', consequents: [R('steering', 'Right')] },
      { antecedents: [R('distance', 'Medium'), R('angle', 'Center')], op: 'and', consequents: [R('steering', 'Left')] },
      { antecedents: [R('distance', 'Medium'), R('angle', 'Right')], op: 'and', consequents: [R('steering', 'Left')] },
      { antecedents: [R('distance', 'Far')], op: 'and', consequents: [R('steering', 'Straight')] },
      // speed
      { antecedents: [R('distance', 'Near')], op: 'and', consequents: [R('speed', 'Slow')] },
      { antecedents: [R('distance', 'Medium'), R('angle', 'Center')], op: 'and', consequents: [R('speed', 'Slow')] },
      { antecedents: [R('distance', 'Medium'), R('angle', 'Left')], op: 'and', consequents: [R('speed', 'Medium')] },
      { antecedents: [R('distance', 'Medium'), R('angle', 'Right')], op: 'and', consequents: [R('speed', 'Medium')] },
      { antecedents: [R('distance', 'Far'), R('angle', 'Center')], op: 'and', consequents: [R('speed', 'Medium')] },
      { antecedents: [R('distance', 'Far'), R('angle', 'Left')], op: 'or', consequents: [R('speed', 'Fast')] },
      { antecedents: [R('distance', 'Far'), R('angle', 'Right')], op: 'and', consequents: [R('speed', 'Fast')] },
    ],
  };
}

/** Classic textbook example: room temperature and humidity → fan speed. */
export function fanSpeedSystem(): FuzzySystem {
  return {
    name: 'Fuzzy fan-speed / temperature controller',
    description: 'Room temperature and relative humidity → fan speed. Warmer and more humid air calls for a faster fan.',
    inputs: [
      { name: 'temperature', label: 'Temperature', unit: '°C', range: [0, 40], terms: [{ name: 'Cold', mf: trap(0, 0, 10, 18) }, { name: 'Warm', mf: tri(15, 23, 31) }, { name: 'Hot', mf: trap(27, 34, 40, 40) }] },
      { name: 'humidity', label: 'Humidity', unit: '%', range: [0, 100], terms: [{ name: 'Dry', mf: trap(0, 0, 25, 45) }, { name: 'Normal', mf: { type: 'gauss', mean: 50, sigma: 12 } }, { name: 'Humid', mf: trap(55, 75, 100, 100) }] },
    ],
    outputs: [{ name: 'fan', label: 'Fan speed', unit: '%', range: [0, 100], terms: [{ name: 'Off', mf: tri(0, 0, 20) }, { name: 'Low', mf: tri(10, 30, 50) }, { name: 'Medium', mf: tri(40, 55, 70) }, { name: 'High', mf: tri(60, 80, 100) }, { name: 'Max', mf: tri(85, 100, 100) }] }],
    rules: [
      { antecedents: [R('temperature', 'Cold'), R('humidity', 'Dry')], op: 'and', consequents: [R('fan', 'Off')] },
      { antecedents: [R('temperature', 'Cold'), R('humidity', 'Normal')], op: 'and', consequents: [R('fan', 'Off')] },
      { antecedents: [R('temperature', 'Cold'), R('humidity', 'Humid')], op: 'and', consequents: [R('fan', 'Low')] },
      { antecedents: [R('temperature', 'Warm'), R('humidity', 'Dry')], op: 'and', consequents: [R('fan', 'Low')] },
      { antecedents: [R('temperature', 'Warm'), R('humidity', 'Normal')], op: 'and', consequents: [R('fan', 'Medium')] },
      { antecedents: [R('temperature', 'Warm'), R('humidity', 'Humid')], op: 'and', consequents: [R('fan', 'High')] },
      { antecedents: [R('temperature', 'Hot'), R('humidity', 'Dry')], op: 'and', consequents: [R('fan', 'High')] },
      { antecedents: [R('temperature', 'Hot'), R('humidity', 'Normal')], op: 'and', consequents: [R('fan', 'High')] },
      { antecedents: [R('temperature', 'Hot'), R('humidity', 'Humid')], op: 'and', consequents: [R('fan', 'Max')] },
    ],
  };
}

export const EXAMPLE_SYSTEMS: { id: string; make: () => FuzzySystem }[] = [
  { id: 'robot', make: obstacleAvoidanceSystem },
  { id: 'fan', make: fanSpeedSystem },
];
