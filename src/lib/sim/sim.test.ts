import { describe, it, expect } from 'vitest';
import { rayCircle, raySegment, castRay, obstacleDistance, clearance, type Obstacle } from './geometry';
import { stepDiffDrive, wheelsToBody, bodyToWheels, limitCommand, DEFAULT_ROBOT } from './diffDrive';
import { readSensors, SENSOR_ANGLES } from './sensors';
import { simulate } from './run';
import { MAPS, findMap } from './maps';
import { potentialForce } from './controllers';
import { mulberry32 } from '../ai/random';

const ARENA = { w: 10, h: 10 };

describe('geometry', () => {
  it('ray–circle and ray–segment intersections', () => {
    expect(rayCircle([0, 0], [1, 0], [5, 0], 1)).toBeCloseTo(4, 12);
    expect(rayCircle([0, 0], [-1, 0], [5, 0], 1)).toBeNull();
    expect(rayCircle([0, 0], [0, 1], [5, 0], 1)).toBeNull();
    expect(raySegment([0, 0], [1, 0], [3, -1], [3, 1])).toBeCloseTo(3, 12);
    expect(raySegment([0, 0], [1, 0], [3, 1], [3, 2])).toBeNull();
    expect(raySegment([0, 0], [1, 0], [-3, -1], [-3, 1])).toBeNull();
  });

  it('castRay hits the nearest obstacle or wall and clips to the max range', () => {
    const obs: Obstacle[] = [{ kind: 'rect', x: 4, y: 4, w: 1, h: 2 }];
    expect(castRay([2, 5], 0, obs, ARENA, 5).range).toBeCloseTo(2, 12);
    expect(castRay([2, 5], Math.PI, obs, ARENA, 5).range).toBeCloseTo(2, 12); // wall at x = 0
    const far = castRay([2, 5], Math.PI / 2, obs, ARENA, 2);
    expect(far.range).toBe(2);
    expect(far.hit).toBeNull();
  });

  it('obstacle distance and clearance', () => {
    const rect: Obstacle = { kind: 'rect', x: 4, y: 4, w: 2, h: 2 };
    expect(obstacleDistance([3, 5], rect).d).toBeCloseTo(1, 12);
    expect(obstacleDistance([3, 3], rect).d).toBeCloseTo(Math.SQRT2, 12);
    expect(obstacleDistance([5, 5], rect).d).toBeLessThan(0);
    const circ: Obstacle = { kind: 'circle', x: 0, y: 0, r: 1 };
    expect(obstacleDistance([3, 0], circ).d).toBeCloseTo(2, 12);
    expect(clearance([2.5, 5], 0.2, [rect], ARENA).clearance).toBeCloseTo(1.3, 12);
    expect(clearance([0.1, 5], 0.2, [rect], ARENA).clearance).toBeLessThan(0); // through the wall
  });
});

describe('differential drive', () => {
  it('equal wheel speeds drive straight, opposite speeds spin in place', () => {
    const p = stepDiffDrive({ x: 0, y: 0, theta: 0 }, { vL: 1, vR: 1 }, 0.3, 0.5);
    expect(p.x).toBeCloseTo(0.5, 12);
    expect(p.y).toBeCloseTo(0, 12);
    const s = stepDiffDrive({ x: 1, y: 1, theta: 0 }, { vL: -0.3, vR: 0.3 }, 0.3, 1);
    expect(s.x).toBeCloseTo(1, 9);
    expect(s.y).toBeCloseTo(1, 9);
    expect(s.theta).toBeCloseTo(2, 9); // ω = 0.6/0.3 = 2 rad/s
  });

  it('unequal speeds move on a circle of radius v/ω', () => {
    const w = { vL: 0.5, vR: 1.0 };
    const { v, omega } = wheelsToBody(w, 0.3);
    const R = v / omega;
    let p = { x: 0, y: 0, theta: 0 };
    for (let i = 0; i < 200; i++) p = stepDiffDrive(p, w, 0.3, 0.01);
    // centre of the circle is at (0, R)
    expect(Math.hypot(p.x, p.y - R)).toBeCloseTo(R, 9);
    expect(p.theta).toBeCloseTo(Math.atan2(Math.sin(omega * 2), Math.cos(omega * 2)), 9);
  });

  it('wheel/body conversions invert and limitCommand respects limits', () => {
    const w = bodyToWheels(0.5, 1.2, 0.3);
    const b = wheelsToBody(w, 0.3);
    expect(b.v).toBeCloseTo(0.5, 12);
    expect(b.omega).toBeCloseTo(1.2, 12);
    const lim = wheelsToBody(limitCommand(5, 10, DEFAULT_ROBOT), DEFAULT_ROBOT.wheelBase);
    expect(lim.v).toBeLessThanOrEqual(DEFAULT_ROBOT.vMax + 1e-9);
    expect(lim.omega).toBeLessThanOrEqual(DEFAULT_ROBOT.wMax + 1e-9);
  });
});

describe('sensors', () => {
  it('five rays at the mounting angles measure the wall at the right distances', () => {
    const r = readSensors({ x: 8.5, y: 5, theta: 0 }, [], ARENA, { noise: 0 });
    expect(r).toHaveLength(5);
    expect(r.map((x) => x.angle)).toEqual(SENSOR_ANGLES);
    expect(r[2].range).toBeCloseTo(1.5, 12);
    expect(r[1].range).toBeCloseTo(1.5 / Math.cos(Math.PI / 6), 9);
    expect(r[0].range).toBe(2); // 1.5/cos60° = 3 m is beyond the 2 m range
    const near = readSensors({ x: 9, y: 5, theta: 0 }, [], ARENA, { noise: 0 });
    expect(near[2].range).toBeCloseTo(1, 12);
    expect(near[2].hit![0]).toBeCloseTo(10, 12);
  });

  it('noise stays within ±2 cm and is reproducible', () => {
    const rng = mulberry32(3);
    const a = readSensors({ x: 9, y: 5, theta: 0 }, [], ARENA, { rng });
    expect(Math.abs(a[2].range - 1)).toBeLessThanOrEqual(0.02 + 1e-12);
    expect(readSensors({ x: 9, y: 5, theta: 0 }, [], ARENA, { rng: mulberry32(3) })[2].range).toBe(a[2].range);
  });
});

describe('controllers on the preset maps', () => {
  it('all three controllers reach the goal on the Simple map without collisions', () => {
    for (const id of ['reactive', 'fuzzy', 'apf'] as const) {
      const r = simulate(findMap('simple'), id, { maxTime: 60 });
      expect(r.reached, id).toBe(true);
      expect(r.collisions, id).toBe(0);
      expect(r.minClearance, id).toBeGreaterThan(0);
      expect(r.pathLength).toBeGreaterThan(8);
    }
  });

  it('reactive and fuzzy reach the goal on the Corridor and Cluttered maps', () => {
    for (const mapId of ['corridor', 'cluttered']) {
      for (const id of ['reactive', 'fuzzy'] as const) {
        const r = simulate(findMap(mapId), id, { maxTime: 90 });
        expect(r.reached, `${id} on ${mapId}`).toBe(true);
      }
    }
  });

  it('the potential field gets stuck in the U-trap while the reactive controller escapes', () => {
    const apf = simulate(findMap('utrap'), 'apf', { maxTime: 60 });
    expect(apf.reached).toBe(false);
    expect(apf.stuck).toBe(true);
    // the local minimum is inside the U
    const last = apf.trail[apf.trail.length - 1];
    expect(last[0]).toBeGreaterThan(4.3);
    expect(last[0]).toBeLessThan(6.0);
    const re = simulate(findMap('utrap'), 'reactive', { maxTime: 90 });
    expect(re.reached).toBe(true);
  });

  it('potential force points toward the goal in free space and away from a nearby obstacle', () => {
    const f = potentialForce([2, 2], [8, 8], [], ARENA, 0.2);
    expect(Math.atan2(f[1], f[0])).toBeCloseTo(Math.PI / 4, 6);
    const g = potentialForce([3.5, 5], [8, 5], [{ kind: 'rect', x: 3.8, y: 4, w: 1, h: 2 }], ARENA, 0.2);
    expect(g[0]).toBeLessThan(0); // pushed back west
  });

  it('every map has a free start and goal', () => {
    for (const m of MAPS) {
      expect(clearance([m.start.x, m.start.y], 0.2, m.obstacles, m.arena).clearance).toBeGreaterThan(0);
      expect(clearance(m.goal, 0.2, m.obstacles, m.arena).clearance).toBeGreaterThan(0);
    }
  });
});
