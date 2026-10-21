import { describe, it, expect } from 'vitest';
import { kmeans, initialise, stepAssign, stepUpdate, stepIteration, wcss, distance, elbow, silhouette, fuzzyCMeans, initKMeansPP, summarise, METRICS, type Point } from './kmeans';
import { blobs, moons, uniform, lidarScan } from './datasets';
import { mulberry32 } from './random';

/** Fraction of points whose predicted cluster is the majority cluster of their true blob. */
function purity(pred: number[], truth: number[]): number {
  const k = Math.max(...truth) + 1;
  let correct = 0;
  for (let b = 0; b < k; b++) {
    const counts = new Map<number, number>();
    pred.forEach((p, i) => truth[i] === b && counts.set(p, (counts.get(p) ?? 0) + 1));
    correct += Math.max(...counts.values());
  }
  return correct / pred.length;
}

describe('distance', () => {
  it('implements the three metrics', () => {
    expect(distance([0, 0], [3, 4], 'euclidean')).toBe(5);
    expect(distance([0, 0], [3, 4], 'manhattan')).toBe(7);
    expect(distance([0, 0], [3, 4], 'chebyshev')).toBe(4);
  });
});

describe('k-means', () => {
  it('WCSS never increases between iterations (Euclidean), random and k-means++ init, 20 random datasets', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const data = seed % 2 ? blobs(3 + (seed % 4), 0.4 + 0.3 * (seed % 3), 40, seed) : uniform(150, seed);
      for (const init of ['random', 'kmeans++'] as const) {
        let s = initialise(data.points, 4, { seed, init });
        let prev = s.wcss;
        for (let i = 0; i < 30 && !s.converged; i++) {
          const a = stepAssign(data.points, s);
          expect(a.wcss).toBeLessThanOrEqual(prev + 1e-9); // reassignment can only lower WCSS
          const u = stepUpdate(data.points, a);
          expect(u.wcss).toBeLessThanOrEqual(a.wcss + 1e-9); // the mean minimises squared Euclidean distance
          prev = u.wcss;
          s = u;
        }
        const run = kmeans(data.points, 4, { seed, init });
        for (let i = 1; i < run.history.length; i++) expect(run.history[i]).toBeLessThanOrEqual(run.history[i - 1] + 1e-9);
      }
    }
  });

  it('recovers well-separated blobs', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const n = 3 + (seed % 3);
      const data = blobs(n, 0.25, 50, seed);
      const { state } = kmeans(data.points, n, { seed, init: 'kmeans++' });
      expect(state.converged).toBe(true);
      expect(purity(state.labels, data.truth)).toBeGreaterThan(0.97);
      // every true blob maps to a distinct cluster
      const map = new Set<number>();
      for (let b = 0; b < n; b++) {
        const members = state.labels.filter((_, i) => data.truth[i] === b);
        const mode = members.sort((x, y) => members.filter((v) => v === y).length - members.filter((v) => v === x).length)[0];
        map.add(mode);
      }
      expect(map.size).toBe(n);
    }
  });

  it('converges: centroids stop moving and labels are stable', () => {
    const data = blobs(4, 0.5, 60, 3);
    const { state } = kmeans(data.points, 4, { seed: 3 });
    expect(state.converged).toBe(true);
    expect(Math.max(...state.moved)).toBeLessThanOrEqual(1e-9);
    const again = stepIteration(data.points, state);
    expect(again.labels).toEqual(state.labels);
    expect(again.wcss).toBeCloseTo(state.wcss, 9);
  });

  it('works with every metric', () => {
    const data = blobs(3, 0.3, 40, 7);
    for (const metric of METRICS) {
      const { state } = kmeans(data.points, 3, { seed: 7, metric });
      expect(state.converged).toBe(true);
      expect(purity(state.labels, data.truth)).toBeGreaterThan(0.95);
      expect(state.wcss).toBeCloseTo(wcss(data.points, state.centroids, state.labels, metric), 9);
    }
  });

  it('k-means++ picks k distinct data points', () => {
    const data = blobs(5, 0.3, 30, 11);
    const c = initKMeansPP(data.points, 5, 'euclidean', mulberry32(5));
    expect(c).toHaveLength(5);
    const uniq = new Set(c.map((p) => p.join(',')));
    expect(uniq.size).toBe(5);
    for (const p of c) expect(data.points.some((q) => q[0] === p[0] && q[1] === p[1])).toBe(true);
  });

  it('elbow curve decreases overall and is lowest beyond the true k', () => {
    const data = blobs(4, 0.3, 50, 2);
    const curve = elbow(data.points, 8, { seed: 2 }, 3);
    expect(curve.map((c) => c.k)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(curve[3].wcss).toBeLessThan(0.2 * curve[0].wcss);
    for (let i = 1; i < curve.length; i++) expect(curve[i].wcss).toBeLessThanOrEqual(curve[i - 1].wcss * 1.05);
  });

  it('silhouette is high for separated blobs, low for uniform noise, and within [−1, 1]', () => {
    const good = blobs(3, 0.25, 40, 4);
    const s1 = silhouette(good.points, kmeans(good.points, 3, { seed: 4 }).state.labels);
    expect(s1).toBeGreaterThan(0.7);
    const noise = uniform(150, 4);
    const s2 = silhouette(noise.points, kmeans(noise.points, 3, { seed: 4 }).state.labels);
    expect(s2).toBeLessThan(s1);
    expect(s2).toBeGreaterThanOrEqual(-1);
    expect(s2).toBeLessThanOrEqual(1);
  });

  it('summarise reports sizes that add up and per-cluster WCSS that sums to the total', () => {
    const data = blobs(3, 0.4, 30, 9);
    const { state } = kmeans(data.points, 3, { seed: 9 });
    const sum = summarise(data.points, state);
    expect(sum.reduce((a, c) => a + c.size, 0)).toBe(data.points.length);
    expect(sum.reduce((a, c) => a + c.wcss, 0)).toBeCloseTo(state.wcss, 9);
  });

  it('handles k larger than the number of points', () => {
    const pts: Point[] = [
      [0, 0],
      [1, 1],
    ];
    const { state } = kmeans(pts, 5);
    expect(state.k).toBe(2);
    expect(state.wcss).toBeCloseTo(0, 12);
  });
});

describe('datasets', () => {
  it('are reproducible for a seed and sized as requested', () => {
    expect(blobs(3, 0.5, 20, 5).points).toEqual(blobs(3, 0.5, 20, 5).points);
    expect(blobs(3, 0.5, 20, 5).points).toHaveLength(60);
    expect(moons(100, 0.1, 1).points).toHaveLength(100);
    expect(uniform(77, 1).points).toHaveLength(77);
  });

  it('LiDAR scan hits every obstacle and k-means separates them', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const scan = lidarScan(3 + (seed % 3), seed);
      expect(scan.obstacles.length).toBe(3 + (seed % 3));
      const hitSet = new Set(scan.truth);
      expect(hitSet.size).toBe(scan.obstacles.length);
      for (const p of scan.points) {
        expect(Math.abs(p[0])).toBeLessThan(scan.room.w / 2 + 0.3);
        expect(Math.abs(p[1])).toBeLessThan(scan.room.h / 2 + 0.3);
      }
      const { state } = kmeans(scan.points, scan.obstacles.length, { seed });
      expect(purity(state.labels, scan.truth)).toBeGreaterThan(0.9);
    }
  });
});

describe('fuzzy c-means', () => {
  it('memberships are in [0, 1] and sum to 1, objective decreases, blobs are recovered', () => {
    const data = blobs(3, 0.3, 40, 8);
    const fcm = fuzzyCMeans(data.points, 3, 2, { seed: 8 });
    for (const row of fcm.membership) {
      expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      for (const u of row) {
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
      }
    }
    for (let i = 1; i < fcm.history.length; i++) expect(fcm.history[i]).toBeLessThanOrEqual(fcm.history[i - 1] + 1e-6);
    const hard = fcm.membership.map((row) => row.indexOf(Math.max(...row)));
    expect(purity(hard, data.truth)).toBeGreaterThan(0.95);
  });

  it('larger m gives fuzzier memberships', () => {
    const data = blobs(3, 0.5, 40, 12);
    const crisp = fuzzyCMeans(data.points, 3, 1.3, { seed: 12 });
    const fuzzy = fuzzyCMeans(data.points, 3, 3, { seed: 12 });
    const meanMax = (r: typeof crisp) => r.membership.reduce((a, row) => a + Math.max(...row), 0) / row(r);
    const row = (r: typeof crisp) => r.membership.length;
    expect(meanMax(crisp)).toBeGreaterThan(meanMax(fuzzy));
  });
});
