/**
 * Three obstacle-avoidance controllers for the differential-drive robot.
 * Each is a factory returning a stateful `step` so the headless comparison
 * can create fresh instances. All work from the five sensor readings plus the
 * goal; the potential-field controller also uses the obstacle geometry.
 */
import { clearance, obstacleDistance, wallDistance, wrapAngle, type Arena, type Obstacle, type Vec2 } from './geometry';
import { limitCommand, type Pose, type RobotParams, type WheelSpeeds } from './diffDrive';
import type { SensorReading } from './sensors';
import { infer, obstacleAvoidanceSystem, type FuzzySystem } from '../ai/fuzzy';

export type ControllerId = 'reactive' | 'fuzzy' | 'apf';
export const CONTROLLERS: { id: ControllerId; name: string; color: string }[] = [
  { id: 'reactive', name: 'Rule-based reactive', color: '#38bdf8' },
  { id: 'fuzzy', name: 'Fuzzy (Exp 7 rule base)', color: '#f97316' },
  { id: 'apf', name: 'Artificial potential field', color: '#a855f7' },
];

export interface ControlInput {
  pose: Pose;
  sensors: SensorReading[];
  goal: Vec2;
  robot: RobotParams;
  obstacles: Obstacle[];
  arena: Arena;
  dt: number;
}

export interface Controller {
  id: ControllerId;
  step: (input: ControlInput) => WheelSpeeds;
  /** Human-readable internal state for the UI. */
  status: () => string;
}

const goalInfo = (pose: Pose, goal: Vec2) => {
  const dx = goal[0] - pose.x;
  const dy = goal[1] - pose.y;
  return { dist: Math.hypot(dx, dy), err: wrapAngle(Math.atan2(dy, dx) - pose.theta) };
};

// ---------------------------------------------------------------------------
// 1. Rule-based reactive controller with an "avoid" mode that commits to a turn
// ---------------------------------------------------------------------------
export function createReactive(): Controller {
  let mode: 'goal' | 'avoid' = 'goal';
  let turnDir = 1; // +1: turn left (obstacle kept on the right), −1: turn right
  let timer = 0;
  const D_DES = 0.6; // desired distance to the followed obstacle
  return {
    id: 'reactive',
    status: () => (mode === 'goal' ? 'seeking goal' : `avoiding: obstacle kept on the ${turnDir > 0 ? 'right' : 'left'} (${timer.toFixed(1)} s)`),
    step: ({ pose, sensors, goal, robot, dt }) => {
      const s = sensors.map((r) => r.range);
      // sensor angles are positive to the LEFT (counter-clockwise): s[3], s[4] look left, s[0], s[1] look right
      const front = Math.min(s[1], s[2], s[3]);
      const left = Math.min(s[3], s[4]);
      const right = Math.min(s[0], s[1]);
      const { dist, err } = goalInfo(pose, goal);
      const slow = Math.min(1, dist / 0.8);
      if (mode === 'goal') {
        if (front < 0.8) {
          mode = 'avoid';
          // turn towards the more open side; when both look alike, towards the goal
          turnDir = Math.abs(left - right) > 0.25 ? (left > right ? 1 : -1) : err >= 0 ? 1 : -1;
          timer = 0;
        } else {
          return limitCommand(robot.vMax * Math.max(0.1, Math.cos(err)) * slow, 2.5 * err, robot);
        }
      }
      timer += dt;
      // leave avoid mode when the direction to the goal is clear
      const goalSensorIdx = Math.max(0, Math.min(4, Math.round(err / (Math.PI / 6)) + 2));
      const goalClear = Math.abs(err) < (75 * Math.PI) / 180 && s[goalSensorIdx] > 1.3 && front > 1.0;
      if (timer > 1.0 && goalClear) {
        mode = 'goal';
        return limitCommand(robot.vMax * 0.6 * slow, 2.5 * err, robot);
      }
      if (timer > 40) {
        mode = 'goal';
        turnDir = -turnDir;
      }
      // blocked ahead: rotate in place until the way is clear
      if (front < 0.65) return limitCommand(0, turnDir * robot.wMax * 0.7, robot);
      // wall following: keep the inner side at D_DES
      const inner = turnDir > 0 ? right : left;
      const steer = Math.max(-1.6, Math.min(1.6, 2.0 * (D_DES - Math.min(inner, 1.5)))) * turnDir;
      const v = robot.vMax * (front < 1.0 ? 0.35 : 0.55);
      return limitCommand(v, steer, robot);
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Fuzzy controller using the Mamdani rule base of experiment 7
// ---------------------------------------------------------------------------
export function createFuzzy(system: FuzzySystem = obstacleAvoidanceSystem()): Controller {
  let last = { distance: 2, angle: 0, steering: 0, speed: 0, w: 0 };
  return {
    id: 'fuzzy',
    status: () => `d = ${last.distance.toFixed(2)} m, obstacle at ${((last.angle * 180) / Math.PI).toFixed(0)}° → steer ${last.steering.toFixed(1)}°, speed ${last.speed.toFixed(2)} · obstacle weight ${last.w.toFixed(2)}`,
    step: ({ pose, sensors, goal, robot }) => {
      // nearest obstacle: range-weighted angle of the sensors that see something
      let best = sensors[0];
      for (const r of sensors) if (r.range < best.range) best = r;
      let wsum = 0;
      let asum = 0;
      for (const r of sensors) {
        if (r.range < 1.99) {
          const w = 1 / Math.max(0.05, r.range) ** 2;
          wsum += w;
          asum += w * r.angle;
        }
      }
      const angle = wsum > 0 ? asum / wsum : 0; // robot frame, positive = left
      const distance = best.range;
      // The Exp 7 rule base measures the obstacle angle clockwise (Right = positive) and outputs a clockwise steering angle.
      const out = infer(system, { distance: Math.min(2, distance), angle: (-angle * 180) / Math.PI }, 'centroid', 101).outputs;
      const steering = out.steering.crisp; // degrees, positive = turn right
      const speed = out.speed.crisp; // 0..1
      const { dist, err } = goalInfo(pose, goal);
      // blend obstacle avoidance with goal seeking according to how close the obstacle is
      const w = Math.max(0, Math.min(1, (1.6 - distance) / 1.0));
      const omegaObs = (-steering * Math.PI) / 180 * 2.2; // ω is counter-clockwise
      const omegaGoal = 2.5 * err;
      const vGoal = robot.vMax * Math.max(0.15, Math.cos(err)) * Math.min(1, dist / 0.8);
      const vObs = speed * robot.vMax;
      last = { distance, angle, steering, speed, w };
      return limitCommand(w * vObs + (1 - w) * vGoal, w * omegaObs + (1 - w) * omegaGoal, robot);
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Artificial potential field
// ---------------------------------------------------------------------------
export interface APFParams {
  kAtt: number;
  kRep: number;
  /** Influence distance of obstacles (m). */
  d0: number;
}
export const DEFAULT_APF: APFParams = { kAtt: 1.0, kRep: 0.4, d0: 1.2 };

/** Total force at a point (attractive + repulsive); clearance uses the robot radius. */
export function potentialForce(p: Vec2, goal: Vec2, obstacles: Obstacle[], arena: Arena, radius: number, k: APFParams = DEFAULT_APF): Vec2 {
  const dx = goal[0] - p[0];
  const dy = goal[1] - p[1];
  const dg = Math.hypot(dx, dy);
  // attractive: linear up to 1 m, then constant magnitude (conic)
  const mag = k.kAtt * Math.min(dg, 1);
  const f: Vec2 = dg > 1e-9 ? [(mag * dx) / dg, (mag * dy) / dg] : [0, 0];
  const push = (d: number, nearest: Vec2) => {
    const dd = Math.max(d - radius, 0.02);
    if (dd >= k.d0) return;
    const m = k.kRep * (1 / dd - 1 / k.d0) * (1 / (dd * dd));
    const nx = p[0] - nearest[0];
    const ny = p[1] - nearest[1];
    const n = Math.hypot(nx, ny) || 1;
    f[0] += Math.min(m, 8) * (nx / n);
    f[1] += Math.min(m, 8) * (ny / n);
  };
  for (const ob of obstacles) {
    const c = obstacleDistance(p, ob);
    push(c.d, c.nearest);
  }
  const w = wallDistance(p, arena);
  push(w.d, w.nearest);
  return f;
}

export function createAPF(k: APFParams = DEFAULT_APF): Controller {
  let last: Vec2 = [0, 0];
  return {
    id: 'apf',
    status: () => `|F| = ${Math.hypot(last[0], last[1]).toFixed(2)}, direction ${((Math.atan2(last[1], last[0]) * 180) / Math.PI).toFixed(0)}°`,
    step: ({ pose, goal, robot, obstacles, arena }) => {
      const f = potentialForce([pose.x, pose.y], goal, obstacles, arena, robot.radius, k);
      last = f;
      const mag = Math.hypot(f[0], f[1]);
      if (mag < 1e-6) return { vL: 0, vR: 0 };
      const err = wrapAngle(Math.atan2(f[1], f[0]) - pose.theta);
      const v = robot.vMax * Math.min(1, mag) * Math.max(0, Math.cos(err));
      return limitCommand(v, 3 * err, robot);
    },
  };
}

export function createController(id: ControllerId): Controller {
  return id === 'reactive' ? createReactive() : id === 'fuzzy' ? createFuzzy() : createAPF();
}

export { clearance };
