/**
 * Line-follower robot: IR sensor array, error computation, bang-bang and PID
 * controllers, and a headless simulation for tuning comparisons.
 */
import { stepDiffDrive, type Pose, type WheelSpeeds } from './diffDrive';
import { trackQuery, trackStart, type Track } from './tracks';
import type { Vec2 } from './geometry';

export const LF_ROBOT = { wheelBase: 0.1, radius: 0.07, vMax: 0.6, sensorOffset: 0.09 };

export interface SensorConfig {
  /** 3 or 5 sensors. */
  n: 3 | 5;
  /** Spacing between neighbouring sensors (m). */
  spacing: number;
  /** Analog readings (fall off with distance to the line centre) instead of 0/1. */
  analog: boolean;
}
export const DEFAULT_SENSORS: SensorConfig = { n: 5, spacing: 0.012, analog: false };

/** Lateral offsets of the sensors in the robot frame (+ = left). */
export function sensorOffsets(cfg: SensorConfig): number[] {
  const half = (cfg.n - 1) / 2;
  return Array.from({ length: cfg.n }, (_, i) => (i - half) * cfg.spacing);
}

export interface SensorState {
  /** Readings in [0, 1], left to right. */
  readings: number[];
  /** World positions of the sensors. */
  positions: Vec2[];
  /** Normalised error in [−1, 1]: + = line is to the left of centre. NaN when the line is lost. */
  error: number;
  onLine: boolean;
}

export function readLineSensors(pose: Pose, track: Track, cfg: SensorConfig): SensorState {
  const offs = sensorOffsets(cfg);
  const c = Math.cos(pose.theta);
  const s = Math.sin(pose.theta);
  const fx = pose.x + LF_ROBOT.sensorOffset * c;
  const fy = pose.y + LF_ROBOT.sensorOffset * s;
  const positions: Vec2[] = offs.map((o) => [fx - o * s, fy + o * c]);
  const half = track.width / 2;
  const readings = positions.map((p) => {
    const d = trackQuery(track, p).dist;
    if (!cfg.analog) return d <= half ? 1 : 0;
    // analog: 1 at the centre, 0 one sensor-spacing outside the line edge
    return Math.max(0, Math.min(1, 1 - Math.max(0, d - half) / cfg.spacing));
  });
  const sum = readings.reduce((a, b) => a + b, 0);
  const span = offs[offs.length - 1] || 1;
  const error = sum > 0 ? readings.reduce((acc, r, i) => acc + r * offs[i], 0) / sum / span : NaN;
  return { readings, positions, error, onLine: sum > 0 };
}

export type ControllerKind = 'bangbang' | 'pid';

export interface Gains {
  kp: number;
  ki: number;
  kd: number;
}

export interface LFConfig {
  controller: ControllerKind;
  gains: Gains;
  baseSpeed: number;
  sensors: SensorConfig;
}
export const DEFAULT_GAINS: Gains = { kp: 0.35, ki: 0.15, kd: 0.02 };
/** Time constant of the derivative low-pass filter (s): 0/1 sensors make the raw derivative spiky. */
export const D_FILTER_TAU = 0.04;

export interface PIDState {
  integral: number;
  lastError: number;
  /** Filtered de/dt. */
  deriv: number;
  p: number;
  i: number;
  d: number;
  u: number;
}

export interface LapInfo {
  /** Arc-length position (m) along the track. */
  s: number;
  /** Total forward progress since the start (m). */
  progress: number;
  laps: number;
  lapTimes: number[];
  lastLapStart: number;
}

export interface LFState {
  pose: Pose;
  t: number;
  sensors: SensorState;
  pid: PIDState;
  wheels: WheelSpeeds;
  /** Signed error used by the controller (last valid one when the line is lost). */
  error: number;
  lost: boolean;
  offTrackCount: number;
  /** Distance of the robot centre to the line (m). */
  centreDist: number;
  trail: Vec2[];
  errors: { t: number; e: number }[];
  absErrorSum: number;
  steps: number;
  lap: LapInfo;
}

export function initLineFollower(track: Track, cfg: LFConfig): LFState {
  const pose = trackStart(track);
  const sensors = readLineSensors(pose, track, cfg.sensors);
  const q = trackQuery(track, [pose.x, pose.y]);
  return {
    pose,
    t: 0,
    sensors,
    pid: { integral: 0, lastError: 0, deriv: 0, p: 0, i: 0, d: 0, u: 0 },
    wheels: { vL: 0, vR: 0 },
    error: Number.isNaN(sensors.error) ? 0 : sensors.error,
    lost: !sensors.onLine,
    offTrackCount: 0,
    centreDist: q.dist,
    trail: [[pose.x, pose.y]],
    errors: [],
    absErrorSum: 0,
    steps: 0,
    lap: { s: q.s, progress: 0, laps: 0, lapTimes: [], lastLapStart: 0 },
  };
}

/** Control law: returns wheel speeds and the updated PID state. */
export function control(error: number, lost: boolean, pid: PIDState, cfg: LFConfig, dt: number): { wheels: WheelSpeeds; pid: PIDState } {
  const base = cfg.baseSpeed;
  let u: number;
  let next = pid;
  if (cfg.controller === 'bangbang') {
    // on/off: steer fully one way or the other (dead zone around zero)
    const dead = 0.1;
    u = error > dead ? base * 0.8 : error < -dead ? -base * 0.8 : 0;
    next = { ...pid, p: u, i: 0, d: 0, u, lastError: error };
  } else {
    const { kp, ki, kd } = cfg.gains;
    const integral = lost ? pid.integral : Math.max(-2, Math.min(2, pid.integral + error * dt)); // anti-windup clamp
    const alpha = dt / (D_FILTER_TAU + dt);
    const deriv = pid.deriv + alpha * ((error - pid.lastError) / dt - pid.deriv); // low-pass filtered derivative
    const p = kp * error;
    const i = ki * integral;
    const d = kd * deriv;
    u = p + i + d;
    next = { integral, lastError: error, deriv, p, i, d, u };
  }
  // positive error = line to the left → turn left → right wheel faster
  const slow = lost ? 0.5 : 1;
  const vL = Math.max(-LF_ROBOT.vMax, Math.min(LF_ROBOT.vMax, (base - u) * slow));
  const vR = Math.max(-LF_ROBOT.vMax, Math.min(LF_ROBOT.vMax, (base + u) * slow));
  return { wheels: { vL, vR }, pid: next };
}

export function stepLineFollower(s: LFState, track: Track, cfg: LFConfig, dt: number): LFState {
  const sensors = readLineSensors(s.pose, track, cfg.sensors);
  const lost = !sensors.onLine;
  // when the line is lost keep steering in the direction it was last seen (saturated)
  const error = lost ? Math.sign(s.error || 1) * 1 : sensors.error;
  const { wheels, pid } = control(error, lost, s.pid, cfg, dt);
  const pose = stepDiffDrive(s.pose, wheels, LF_ROBOT.wheelBase, dt);
  const t = s.t + dt;
  const q = trackQuery(track, [pose.x, pose.y]);
  // progress along the track (wrapped Δs); only count forward motion
  let ds = q.s - s.lap.s;
  if (ds > track.length / 2) ds -= track.length;
  if (ds < -track.length / 2) ds += track.length;
  const progress = s.lap.progress + Math.max(ds, -0.5);
  const lap: LapInfo = { ...s.lap, s: q.s, progress };
  if (progress >= (lap.laps + 1) * track.length) {
    lap.laps += 1;
    lap.lapTimes = [...lap.lapTimes, t - lap.lastLapStart];
    lap.lastLapStart = t;
  }
  const lastPt = s.trail[s.trail.length - 1];
  const trail = Math.hypot(pose.x - lastPt[0], pose.y - lastPt[1]) > 0.01 ? [...s.trail, [pose.x, pose.y] as Vec2] : s.trail;
  const errors = s.steps % 4 === 0 ? [...s.errors, { t, e: lost ? error : sensors.error }] : s.errors;
  return {
    pose,
    t,
    sensors,
    pid,
    wheels,
    error,
    lost,
    offTrackCount: s.offTrackCount + (lost && !s.lost ? 1 : 0),
    centreDist: q.dist,
    trail,
    errors,
    absErrorSum: s.absErrorSum + Math.abs(error),
    steps: s.steps + 1,
    lap,
  };
}

export interface LFRun {
  label: string;
  trail: Vec2[];
  errors: { t: number; e: number }[];
  lapTime: number | null;
  meanAbsError: number;
  offTrackCount: number;
  maxCentreDist: number;
}

/** Run until the first lap is complete (or maxTime). */
export function simulateLineFollower(track: Track, cfg: LFConfig, label: string, opts: { dt?: number; maxTime?: number } = {}): LFRun {
  const dt = opts.dt ?? 1 / 120;
  const maxTime = opts.maxTime ?? 60;
  let s = initLineFollower(track, cfg);
  let maxDist = 0;
  while (s.t < maxTime && s.lap.laps < 1) {
    s = stepLineFollower(s, track, cfg, dt);
    maxDist = Math.max(maxDist, s.centreDist);
    if (s.centreDist > 0.6) break; // hopelessly off the track
  }
  return { label, trail: s.trail, errors: s.errors, lapTime: s.lap.laps >= 1 ? s.lap.lapTimes[0] : null, meanAbsError: s.steps ? s.absErrorSum / s.steps : 0, offTrackCount: s.offTrackCount, maxCentreDist: maxDist };
}
