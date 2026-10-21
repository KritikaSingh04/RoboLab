/** Five ultrasonic range sensors on the robot body. */
import { castRay, type Arena, type Obstacle, type Vec2 } from './geometry';
import type { Pose } from './diffDrive';
import type { Rng } from '../ai/random';

export const SENSOR_ANGLES_DEG = [-60, -30, 0, 30, 60];
export const SENSOR_ANGLES = SENSOR_ANGLES_DEG.map((d) => (d * Math.PI) / 180);
export const SENSOR_MAX_RANGE = 2;
export const SENSOR_NOISE = 0.02;

export interface SensorReading {
  /** Mounting angle relative to the heading (rad). */
  angle: number;
  /** Measured range (m), clipped to the max range. */
  range: number;
  /** World-frame hit point or null if nothing within range. */
  hit: Vec2 | null;
  /** Ray origin and direction (world). */
  origin: Vec2;
  dir: Vec2;
}

export function readSensors(pose: Pose, obstacles: Obstacle[], arena: Arena, opts: { radius?: number; maxRange?: number; noise?: number; rng?: Rng } = {}): SensorReading[] {
  const maxRange = opts.maxRange ?? SENSOR_MAX_RANGE;
  const noise = opts.noise ?? SENSOR_NOISE;
  const r = opts.radius ?? 0;
  return SENSOR_ANGLES.map((a) => {
    const ang = pose.theta + a;
    const dir: Vec2 = [Math.cos(ang), Math.sin(ang)];
    // the transducer sits on the body rim
    const origin: Vec2 = [pose.x + r * dir[0], pose.y + r * dir[1]];
    const { range, hit } = castRay(origin, ang, obstacles, arena, maxRange);
    let measured = range;
    if (hit && noise > 0 && opts.rng) measured = Math.min(maxRange, Math.max(0, range + noise * (2 * opts.rng() - 1)));
    return { angle: a, range: measured, hit, origin, dir };
  });
}
