/** Headless simulation of a controller on a map (also the step used by the UI). */
import { clearance, dist, type Vec2 } from './geometry';
import { stepDiffDrive, DEFAULT_ROBOT, type Pose, type RobotParams, type WheelSpeeds } from './diffDrive';
import { readSensors, type SensorReading } from './sensors';
import { createController, type Controller, type ControllerId } from './controllers';
import type { MapDef } from './maps';
import { mulberry32, type Rng } from '../ai/random';

export interface SimState {
  pose: Pose;
  t: number;
  trail: Vec2[];
  pathLength: number;
  collisions: number;
  colliding: boolean;
  minClearance: number;
  reached: boolean;
  stuck: boolean;
  sensors: SensorReading[];
  wheels: WheelSpeeds;
  /** Pose history for stuck detection (last ~8 s). */
  recent: { t: number; p: Vec2 }[];
}

export const GOAL_RADIUS = 0.3;

export function initialSim(map: MapDef, robot: RobotParams = DEFAULT_ROBOT, rng?: Rng): SimState {
  const pose = { ...map.start };
  const sensors = readSensors(pose, map.obstacles, map.arena, { radius: robot.radius, rng });
  const c = clearance([pose.x, pose.y], robot.radius, map.obstacles, map.arena).clearance;
  return { pose, t: 0, trail: [[pose.x, pose.y]], pathLength: 0, collisions: 0, colliding: c < 0, minClearance: c, reached: false, stuck: false, sensors, wheels: { vL: 0, vR: 0 }, recent: [{ t: 0, p: [pose.x, pose.y] }] };
}

/** Advance one step. Collisions stop translation (the robot may still rotate) and are counted on entry. */
export function stepSim(s: SimState, map: MapDef, controller: Controller, dt: number, robot: RobotParams = DEFAULT_ROBOT, rng?: Rng, noise?: number): SimState {
  if (s.reached) return s;
  const wheels = controller.step({ pose: s.pose, sensors: s.sensors, goal: map.goal, robot, obstacles: map.obstacles, arena: map.arena, dt });
  let pose = stepDiffDrive(s.pose, wheels, robot.wheelBase, dt);
  let c = clearance([pose.x, pose.y], robot.radius, map.obstacles, map.arena).clearance;
  let collisions = s.collisions;
  let colliding = s.colliding;
  if (c < 0) {
    // blocked: keep the position, allow the rotation
    pose = { x: s.pose.x, y: s.pose.y, theta: pose.theta };
    c = clearance([pose.x, pose.y], robot.radius, map.obstacles, map.arena).clearance;
    if (!colliding) collisions++;
    colliding = true;
  } else colliding = false;
  const t = s.t + dt;
  const moved = dist([s.pose.x, s.pose.y], [pose.x, pose.y]);
  const lastPt = s.trail[s.trail.length - 1];
  const trail = !lastPt || dist(lastPt, [pose.x, pose.y]) > 0.03 ? [...s.trail, [pose.x, pose.y] as Vec2] : s.trail;
  const recent = [...s.recent.filter((r) => t - r.t <= 8), { t, p: [pose.x, pose.y] as Vec2 }];
  const stuck = t > 8 && recent.length > 10 && Math.max(...recent.map((r) => dist(r.p, [pose.x, pose.y]))) < 0.35;
  const sensors = readSensors(pose, map.obstacles, map.arena, { radius: robot.radius, rng, noise });
  return { pose, t, trail, pathLength: s.pathLength + moved, collisions, colliding, minClearance: Math.min(s.minClearance, c), reached: dist([pose.x, pose.y], map.goal) < GOAL_RADIUS, stuck, sensors, wheels, recent };
}

export interface RunResult {
  controller: ControllerId;
  reached: boolean;
  stuck: boolean;
  time: number;
  pathLength: number;
  collisions: number;
  minClearance: number;
  trail: Vec2[];
}

export function simulate(map: MapDef, controllerId: ControllerId, opts: { dt?: number; maxTime?: number; seed?: number; robot?: RobotParams; noise?: number } = {}): RunResult {
  const dt = opts.dt ?? 1 / 60;
  const maxTime = opts.maxTime ?? 60;
  const robot = opts.robot ?? DEFAULT_ROBOT;
  const rng = mulberry32(opts.seed ?? 1);
  const controller = createController(controllerId);
  let s = initialSim(map, robot, rng);
  while (!s.reached && s.t < maxTime) {
    s = stepSim(s, map, controller, dt, robot, rng, opts.noise);
    if (s.stuck && s.t > 20) break;
  }
  return { controller: controllerId, reached: s.reached, stuck: !s.reached && s.stuck, time: s.t, pathLength: s.pathLength, collisions: s.collisions, minClearance: s.minClearance, trail: s.trail };
}
