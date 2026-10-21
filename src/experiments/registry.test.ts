import { describe, it, expect } from 'vitest';
import { EXPERIMENTS, MODULES, experimentsByModule, findExperiment } from './registry';

// The table from CLAUDE.md — the registry must match it exactly.
const TABLE: [number, string, string][] = [
  [2, '/screw', 'Screw Transformation'],
  [3, '/scara', 'Direct Kinematics of SCARA'],
  [4, '/ik3dof', 'Inverse Kinematics of 3-DOF Planar Robot'],
  [5, '/trajectory', 'Trajectory Planning'],
  [6, '/dynamics', 'Dynamic Analysis of Single-Arm Robot'],
  [7, '/fuzzy', 'Fuzzy Logic System'],
  [8, '/neural', 'Neural Network Regression & Classification'],
  [9, '/linreg', 'Linear Regression in Python'],
  [10, '/kmeans', 'K-Means Clustering'],
  [11, '/obstacle', 'Obstacle Avoidance Robot'],
  [12, '/linefollower', 'Line Follower Robot'],
];

describe('experiment registry', () => {
  it('contains all 11 experiments from CLAUDE.md with the right numbers, routes and titles (plus the integration pipeline)', () => {
    expect(EXPERIMENTS.length).toBeGreaterThanOrEqual(TABLE.length);
    expect(EXPERIMENTS.find((e) => e.id === 'pipeline')?.route).toBe('/pipeline');
    for (const [number, route, title] of TABLE) {
      const e = EXPERIMENTS.find((x) => x.number === number);
      expect(e, `experiment ${number}`).toBeDefined();
      expect(e!.route).toBe(route);
      expect(e!.title).toBe(title);
      expect(e!.id).toBe(route.slice(1));
    }
  });

  it('has unique ids, routes and numbers', () => {
    const uniq = (xs: unknown[]) => new Set(xs).size === xs.length;
    expect(uniq(EXPERIMENTS.map((e) => e.id))).toBe(true);
    expect(uniq(EXPERIMENTS.map((e) => e.route))).toBe(true);
    expect(uniq(EXPERIMENTS.map((e) => e.number))).toBe(true);
  });

  it('every experiment belongs to a known module and every module is non-empty', () => {
    const ids = new Set(MODULES.map((m) => m.id));
    for (const e of EXPERIMENTS) expect(ids.has(e.module)).toBe(true);
    for (const m of MODULES) expect(experimentsByModule(m.id).length).toBeGreaterThan(0);
    expect(MODULES.flatMap((m) => experimentsByModule(m.id))).toHaveLength(EXPERIMENTS.length);
  });

  it('findExperiment looks up by id', () => {
    expect(findExperiment('kmeans')?.number).toBe(10);
    expect(findExperiment('nope')).toBeUndefined();
  });
});
