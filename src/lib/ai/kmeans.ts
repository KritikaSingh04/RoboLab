/**
 * k-means clustering from scratch (plus k-means++ initialisation, elbow curve,
 * silhouette score and fuzzy c-means). Pure functions, no React.
 */
import { mulberry32, type Rng } from './random';

export type Point = [number, number];
export type Metric = 'euclidean' | 'manhattan' | 'chebyshev';
export const METRICS: Metric[] = ['euclidean', 'manhattan', 'chebyshev'];
export type Init = 'random' | 'kmeans++';

export function distance(a: Point, b: Point, metric: Metric = 'euclidean'): number {
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  switch (metric) {
    case 'euclidean':
      return Math.hypot(dx, dy);
    case 'manhattan':
      return dx + dy;
    case 'chebyshev':
      return Math.max(dx, dy);
  }
}

/** Index of the nearest centroid. */
export function nearest(p: Point, centroids: Point[], metric: Metric): number {
  let best = 0;
  let bestD = Infinity;
  for (let j = 0; j < centroids.length; j++) {
    const d = distance(p, centroids[j], metric);
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  }
  return best;
}

/** Random initialisation: k distinct data points. */
export function initRandom(points: Point[], k: number, rng: Rng): Point[] {
  const idx = points.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, k).map((i) => [...points[i]] as Point);
}

/** k-means++: each next centre is drawn with probability ∝ D(x)², D = distance to the nearest chosen centre. */
export function initKMeansPP(points: Point[], k: number, metric: Metric, rng: Rng): Point[] {
  const centroids: Point[] = [[...points[Math.floor(rng() * points.length)]] as Point];
  while (centroids.length < k) {
    const d2 = points.map((p) => distance(p, centroids[nearest(p, centroids, metric)], metric) ** 2);
    const total = d2.reduce((a, b) => a + b, 0);
    if (total <= 0) {
      // all remaining points coincide with chosen centres: pick any
      centroids.push([...points[Math.floor(rng() * points.length)]] as Point);
      continue;
    }
    let r = rng() * total;
    let i = 0;
    for (; i < points.length - 1; i++) {
      r -= d2[i];
      if (r <= 0) break;
    }
    centroids.push([...points[i]] as Point);
  }
  return centroids;
}

/** Assignment step: label of the nearest centroid for every point. */
export function assign(points: Point[], centroids: Point[], metric: Metric): number[] {
  return points.map((p) => nearest(p, centroids, metric));
}

/** Update step: each centroid becomes the mean of its points (an empty cluster keeps its centroid). */
export function updateCentroids(points: Point[], labels: number[], k: number, previous: Point[]): Point[] {
  const sum: Point[] = Array.from({ length: k }, () => [0, 0]);
  const count = new Array(k).fill(0);
  points.forEach((p, i) => {
    const l = labels[i];
    sum[l][0] += p[0];
    sum[l][1] += p[1];
    count[l]++;
  });
  return sum.map((s, j) => (count[j] > 0 ? [s[0] / count[j], s[1] / count[j]] : [...previous[j]]) as Point);
}

/** Within-cluster sum of squares: Σ d(x, c_label)² with the chosen metric. */
export function wcss(points: Point[], centroids: Point[], labels: number[], metric: Metric): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) s += distance(points[i], centroids[labels[i]], metric) ** 2;
  return s;
}

export interface KMeansState {
  k: number;
  metric: Metric;
  centroids: Point[];
  /** Centroids before the last update step (for drawing movement). */
  previous: Point[];
  labels: number[];
  /** Completed assign+update iterations. */
  iteration: number;
  /** 'init' = centroids placed, 'assigned' = labels computed, 'updated' = centroids moved. */
  phase: 'init' | 'assigned' | 'updated';
  /** Distance each centroid moved in the last update. */
  moved: number[];
  wcss: number;
  converged: boolean;
}

export interface KMeansOptions {
  metric?: Metric;
  init?: Init;
  seed?: number;
  maxIter?: number;
  /** Convergence threshold on the largest centroid displacement. */
  tol?: number;
}

export function initialise(points: Point[], k: number, opts: KMeansOptions = {}): KMeansState {
  const metric = opts.metric ?? 'euclidean';
  const rng = mulberry32(opts.seed ?? 1);
  const kk = Math.min(k, points.length);
  const centroids = (opts.init ?? 'kmeans++') === 'kmeans++' ? initKMeansPP(points, kk, metric, rng) : initRandom(points, kk, rng);
  const labels = assign(points, centroids, metric);
  return { k: kk, metric, centroids, previous: centroids.map((c) => [...c] as Point), labels, iteration: 0, phase: 'init', moved: new Array(kk).fill(0), wcss: wcss(points, centroids, labels, metric), converged: false };
}

/** Assignment step (idempotent if already assigned). */
export function stepAssign(points: Point[], s: KMeansState): KMeansState {
  const labels = assign(points, s.centroids, s.metric);
  return { ...s, labels, phase: 'assigned', wcss: wcss(points, s.centroids, labels, s.metric) };
}

/** Update step; completes one iteration. Must follow an assignment. */
export function stepUpdate(points: Point[], s: KMeansState, tol = 1e-9): KMeansState {
  const centroids = updateCentroids(points, s.labels, s.k, s.centroids);
  const moved = centroids.map((c, j) => distance(c, s.centroids[j], 'euclidean'));
  const converged = Math.max(...moved) <= tol;
  return { ...s, previous: s.centroids, centroids, moved, iteration: s.iteration + 1, phase: 'updated', wcss: wcss(points, centroids, s.labels, s.metric), converged };
}

/** One full iteration (assign, then update). */
export function stepIteration(points: Point[], s: KMeansState, tol?: number): KMeansState {
  return stepUpdate(points, stepAssign(points, s), tol);
}

export interface KMeansResult {
  state: KMeansState;
  /** WCSS after each completed iteration (index 0 = after initialisation). */
  history: number[];
}

/** Run to convergence from a fresh initialisation. */
export function kmeans(points: Point[], k: number, opts: KMeansOptions = {}): KMeansResult {
  const maxIter = opts.maxIter ?? 100;
  const tol = opts.tol ?? 1e-9;
  let s = initialise(points, k, opts);
  const history = [s.wcss];
  while (!s.converged && s.iteration < maxIter) {
    s = stepIteration(points, s, tol);
    history.push(s.wcss);
  }
  // final labels consistent with the final centroids
  s = stepAssign(points, s);
  history[history.length - 1] = s.wcss;
  return { state: s, history };
}

/** Elbow curve: best WCSS over a few restarts for k = 1..kMax. */
export function elbow(points: Point[], kMax = 10, opts: KMeansOptions = {}, restarts = 5): { k: number; wcss: number }[] {
  const out: { k: number; wcss: number }[] = [];
  for (let k = 1; k <= Math.min(kMax, points.length); k++) {
    let best = Infinity;
    for (let r = 0; r < restarts; r++) best = Math.min(best, kmeans(points, k, { ...opts, seed: (opts.seed ?? 1) * 97 + r }).state.wcss);
    out.push({ k, wcss: best });
  }
  return out;
}

/** Mean silhouette coefficient, s(i) = (b − a) / max(a, b). O(n²). */
export function silhouette(points: Point[], labels: number[], metric: Metric = 'euclidean'): number {
  const n = points.length;
  const k = Math.max(...labels) + 1;
  if (n < 2 || k < 2) return 0;
  const counts = new Array(k).fill(0);
  labels.forEach((l) => counts[l]++);
  let total = 0;
  let used = 0;
  for (let i = 0; i < n; i++) {
    const sums = new Array(k).fill(0);
    for (let j = 0; j < n; j++) if (j !== i) sums[labels[j]] += distance(points[i], points[j], metric);
    const own = labels[i];
    if (counts[own] <= 1) continue; // singleton: silhouette defined as 0, skip
    const a = sums[own] / (counts[own] - 1);
    let b = Infinity;
    for (let c = 0; c < k; c++) if (c !== own && counts[c] > 0) b = Math.min(b, sums[c] / counts[c]);
    if (!Number.isFinite(b)) continue;
    total += (b - a) / Math.max(a, b);
    used++;
  }
  return used ? total / used : 0;
}

export interface ClusterSummary {
  cluster: number;
  size: number;
  centroid: Point;
  /** mean distance of members to the centroid */
  meanDist: number;
  wcss: number;
}

export function summarise(points: Point[], s: KMeansState): ClusterSummary[] {
  return s.centroids.map((c, j) => {
    const members = points.filter((_, i) => s.labels[i] === j);
    const dists = members.map((p) => distance(p, c, s.metric));
    return { cluster: j, size: members.length, centroid: c, meanDist: dists.length ? dists.reduce((a, b) => a + b, 0) / dists.length : 0, wcss: dists.reduce((a, d) => a + d * d, 0) };
  });
}

// ---------------------------------------------------------------------------
// Fuzzy c-means (Bezdek)
// ---------------------------------------------------------------------------

export interface FCMResult {
  centroids: Point[];
  /** membership[i][j] ∈ [0, 1], rows sum to 1 */
  membership: number[][];
  objective: number;
  iterations: number;
  history: number[];
}

/**
 *   u_ij = 1 / Σ_l (d_ij / d_il)^(2/(m−1)),   c_j = Σ_i u_ij^m x_i / Σ_i u_ij^m,
 *   J_m = Σ_i Σ_j u_ij^m d_ij²
 */
export function fuzzyCMeans(points: Point[], c: number, m = 2, opts: { metric?: Metric; seed?: number; maxIter?: number; tol?: number } = {}): FCMResult {
  const metric = opts.metric ?? 'euclidean';
  const maxIter = opts.maxIter ?? 100;
  const tol = opts.tol ?? 1e-6;
  const rng = mulberry32(opts.seed ?? 1);
  const n = points.length;
  const cc = Math.min(c, n);
  let centroids = initKMeansPP(points, cc, metric, rng);
  const expo = 2 / (m - 1);
  let membership: number[][] = [];
  const history: number[] = [];
  let objective = 0;
  let it = 0;
  const computeU = () =>
    points.map((p) => {
      const d = centroids.map((cj) => Math.max(distance(p, cj, metric), 1e-12));
      return d.map((dj) => 1 / d.reduce((acc, dl) => acc + (dj / dl) ** expo, 0));
    });
  for (; it < maxIter; it++) {
    membership = computeU();
    const next: Point[] = centroids.map((_, j) => {
      let sx = 0;
      let sy = 0;
      let sw = 0;
      for (let i = 0; i < n; i++) {
        const w = membership[i][j] ** m;
        sx += w * points[i][0];
        sy += w * points[i][1];
        sw += w;
      }
      return sw > 0 ? [sx / sw, sy / sw] : centroids[j];
    });
    const shift = Math.max(...next.map((cj, j) => distance(cj, centroids[j], 'euclidean')));
    centroids = next;
    objective = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < cc; j++) objective += membership[i][j] ** m * distance(points[i], centroids[j], metric) ** 2;
    history.push(objective);
    if (shift <= tol) {
      it++;
      break;
    }
  }
  membership = computeU();
  return { centroids, membership, objective, iterations: it, history };
}
