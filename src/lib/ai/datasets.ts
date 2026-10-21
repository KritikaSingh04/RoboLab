/** 2D toy datasets for the clustering experiments (world units: metres, roughly within ±5 × ±4). */
import { gaussian, mulberry32 } from './random';
import type { Point } from './kmeans';

export interface LabelledData {
  points: Point[];
  /** ground-truth label of each point (where meaningful) */
  truth: number[];
}

export function blobs(nBlobs = 4, spread = 0.5, perBlob = 60, seed = 1): LabelledData {
  const rng = mulberry32(seed);
  const points: Point[] = [];
  const truth: number[] = [];
  const centres: Point[] = [];
  // place centres on a jittered ring so they are well separated
  for (let b = 0; b < nBlobs; b++) {
    const a = (2 * Math.PI * b) / nBlobs + 0.3 * (rng() - 0.5);
    const r = 2.4 + 0.8 * rng();
    centres.push([r * Math.cos(a), 0.8 * r * Math.sin(a)]);
  }
  centres.forEach((c, b) => {
    for (let i = 0; i < perBlob; i++) {
      points.push([c[0] + spread * gaussian(rng), c[1] + spread * gaussian(rng)]);
      truth.push(b);
    }
  });
  return { points, truth };
}

export function moons(n = 200, noise = 0.12, seed = 1): LabelledData {
  const rng = mulberry32(seed);
  const points: Point[] = [];
  const truth: number[] = [];
  const half = Math.floor(n / 2);
  for (let i = 0; i < n; i++) {
    const t = Math.PI * rng();
    const upper = i < half;
    const x = upper ? 2 * Math.cos(t) - 1 : 2 * Math.cos(t) + 1;
    const y = upper ? 2 * Math.sin(t) - 0.4 : -2 * Math.sin(t) + 0.6;
    points.push([x + noise * gaussian(rng), y + noise * gaussian(rng)]);
    truth.push(upper ? 0 : 1);
  }
  return { points, truth };
}

export function uniform(n = 200, seed = 1): LabelledData {
  const rng = mulberry32(seed);
  const points: Point[] = [];
  for (let i = 0; i < n; i++) points.push([-4.5 + 9 * rng(), -3.5 + 7 * rng()]);
  return { points, truth: points.map(() => 0) };
}

export interface Obstacle {
  kind: 'circle' | 'box';
  x: number;
  y: number;
  /** radius or half-size */
  r: number;
}

export interface LidarScan extends LabelledData {
  robot: Point;
  obstacles: Obstacle[];
  room: { w: number; h: number };
}

/**
 * Robotics example: a 2D LiDAR at the robot position casts rays in a 10 × 8 m
 * room with 3–5 obstacles. Rays that hit an obstacle return a noisy range
 * reading; wall returns are discarded so the point cloud is only obstacle hits.
 */
export function lidarScan(nObstacles = 4, seed = 1, rays = 720, noise = 0.04): LidarScan {
  const rng = mulberry32(seed);
  const room = { w: 10, h: 8 };
  const robot: Point = [-3.5 + 2 * rng(), -2.5 + 2 * rng()];
  // Retry the layout until every obstacle is visible from the robot (none fully occluded).
  for (let attempt = 0; attempt < 50; attempt++) {
    const obstacles: Obstacle[] = [];
    let guard = 0;
    while (obstacles.length < nObstacles && guard++ < 200) {
      const o: Obstacle = { kind: rng() < 0.5 ? 'circle' : 'box', x: -4 + 8 * rng(), y: -3 + 6 * rng(), r: 0.35 + 0.45 * rng() };
      const farFromRobot = Math.hypot(o.x - robot[0], o.y - robot[1]) > o.r + 1.2;
      const farFromOthers = obstacles.every((q) => Math.hypot(o.x - q.x, o.y - q.y) > o.r + q.r + 1.3);
      if (farFromRobot && farFromOthers) obstacles.push(o);
    }
    if (obstacles.length < nObstacles) continue;
    const points: Point[] = [];
    const truth: number[] = [];
    for (let i = 0; i < rays; i++) {
      const a = (2 * Math.PI * i) / rays;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let best = Infinity;
      let hit = -1;
      obstacles.forEach((o, idx) => {
        const t = rayHit(robot, dx, dy, o);
        if (t !== null && t < best) {
          best = t;
          hit = idx;
        }
      });
      if (hit < 0) continue;
      if (best > wallHit(robot, dx, dy, room)) continue;
      const r = best + noise * gaussian(rng);
      points.push([robot[0] + r * dx, robot[1] + r * dy]);
      truth.push(hit);
    }
    const seen = new Set(truth);
    const minHits = obstacles.every((_, idx) => truth.filter((t) => t === idx).length >= 8);
    if (seen.size === nObstacles && minHits) return { points, truth, robot, obstacles, room };
  }
  throw new Error('Could not place visible obstacles');
}

function rayHit(o: Point, dx: number, dy: number, ob: Obstacle): number | null {
  if (ob.kind === 'circle') {
    const fx = o[0] - ob.x;
    const fy = o[1] - ob.y;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - ob.r * ob.r;
    const disc = b * b - 4 * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / 2;
    return t > 0 ? t : null;
  }
  // axis-aligned box, slab method
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const [p, d, lo, hi] of [
    [o[0], dx, ob.x - ob.r, ob.x + ob.r],
    [o[1], dy, ob.y - ob.r, ob.y + ob.r],
  ]) {
    if (Math.abs(d) < 1e-12) {
      if (p < lo || p > hi) return null;
      continue;
    }
    let t1 = (lo - p) / d;
    let t2 = (hi - p) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin > 0 ? tmin : null;
}

function wallHit(o: Point, dx: number, dy: number, room: { w: number; h: number }): number {
  const ts = [dx > 0 ? (room.w / 2 - o[0]) / dx : dx < 0 ? (-room.w / 2 - o[0]) / dx : Infinity, dy > 0 ? (room.h / 2 - o[1]) / dy : dy < 0 ? (-room.h / 2 - o[1]) / dy : Infinity];
  return Math.min(...ts);
}

// ---------------------------------------------------------------------------
// Regression datasets (x, y pairs with units)
// ---------------------------------------------------------------------------

export interface XYData {
  x: number[];
  y: number[];
  xLabel: string;
  yLabel: string;
  name: string;
  note: string;
}

/** Sharp-type IR range sensor: output voltage vs distance. The true law is roughly inverse. */
export function irSensor(n = 40, seed = 1): XYData {
  const rng = mulberry32(seed);
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = 10 + (70 * i) / (n - 1) + 2 * (rng() - 0.5); // cm
    const v = 27.86 / (d + 0.42) + 0.04 * gaussian(rng); // V
    x.push(+v.toFixed(3));
    y.push(+d.toFixed(2));
  }
  return { x, y, xLabel: 'Voltage (V)', yLabel: 'Distance (cm)', name: 'IR sensor calibration — distance vs voltage', note: 'A Sharp IR sensor follows an inverse law, so a straight line fits only roughly: watch the curved pattern in the residuals.' };
}

/** DC motor: PWM duty cycle vs measured speed, with a small dead band at low duty. */
export function dcMotor(n = 40, seed = 1): XYData {
  const rng = mulberry32(seed);
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const duty = 10 + (90 * i) / (n - 1) + 2 * (rng() - 0.5); // %
    const rpm = Math.max(0, 32 * (duty - 7) + 70 * gaussian(rng));
    x.push(+duty.toFixed(1));
    y.push(+rpm.toFixed(0));
  }
  return { x, y, xLabel: 'PWM duty (%)', yLabel: 'Speed (RPM)', name: 'DC motor — PWM duty vs speed (RPM)', note: 'Above the dead band the speed is close to proportional to the duty cycle; the noise comes from the tachometer.' };
}

/** HC-SR04 style ultrasonic sensor: measured vs true distance, slight gain and offset error. */
export function ultrasonic(n = 40, seed = 1): XYData {
  const rng = mulberry32(seed);
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const trueD = 20 + (380 * i) / (n - 1) + 4 * (rng() - 0.5); // cm
    const meas = 1.02 * trueD + 1.5 + (1.5 + 0.01 * trueD) * gaussian(rng);
    x.push(+trueD.toFixed(1));
    y.push(+meas.toFixed(1));
  }
  return { x, y, xLabel: 'True distance (cm)', yLabel: 'Measured distance (cm)', name: 'Ultrasonic sensor — measured vs true distance', note: 'An ideal sensor would give m = 1, c = 0; the fitted line gives the gain and offset to correct the readings.' };
}

export const REGRESSION_DATASETS: { id: string; make: (seed: number) => XYData }[] = [
  { id: 'ir', make: (s) => irSensor(40, s) },
  { id: 'motor', make: (s) => dcMotor(40, s) },
  { id: 'ultrasonic', make: (s) => ultrasonic(40, s) },
];

// ---------------------------------------------------------------------------
// Datasets for the neural-network experiment
// ---------------------------------------------------------------------------

export interface ClassData {
  X: number[][];
  labels: number[];
  k: number;
  name: string;
  /** Axis labels and plotting range. */
  xLabel: string;
  yLabel: string;
  range: [number, number];
}

export function circlesData(n = 300, seed = 1): ClassData {
  const rng = mulberry32(seed);
  const X: number[][] = [];
  const labels: number[] = [];
  for (let i = 0; i < n; i++) {
    const inner = i % 2 === 0;
    const r = inner ? 0.45 * Math.sqrt(rng()) : 0.75 + 0.3 * rng();
    const a = 2 * Math.PI * rng();
    X.push([r * Math.cos(a) + 0.04 * gaussian(rng), r * Math.sin(a) + 0.04 * gaussian(rng)]);
    labels.push(inner ? 0 : 1);
  }
  return { X, labels, k: 2, name: 'Circles', xLabel: 'x₁', yLabel: 'x₂', range: [-1.3, 1.3] };
}

export function xorData(n = 300, seed = 1): ClassData {
  const rng = mulberry32(seed);
  const X: number[][] = [];
  const labels: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = (rng() - 0.5) * 2;
    const y = (rng() - 0.5) * 2;
    const px = x + 0.1 * Math.sign(x);
    const py = y + 0.1 * Math.sign(y);
    X.push([px, py]);
    labels.push(x * y > 0 ? 0 : 1);
  }
  return { X, labels, k: 2, name: 'XOR quadrants', xLabel: 'x₁', yLabel: 'x₂', range: [-1.3, 1.3] };
}

export function moonsClassData(n = 300, seed = 1): ClassData {
  const m = moons(n, 0.1, seed);
  return { X: m.points.map((p) => [p[0] / 3, p[1] / 3]), labels: m.truth, k: 2, name: 'Moons', xLabel: 'x₁', yLabel: 'x₂', range: [-1.3, 1.3] };
}

export function spiralsData(n = 300, seed = 1, arms = 2): ClassData {
  const rng = mulberry32(seed);
  const X: number[][] = [];
  const labels: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % arms;
    const t = rng();
    const r = 0.1 + 0.9 * t;
    const a = 2.6 * Math.PI * t + (2 * Math.PI * c) / arms;
    X.push([r * Math.cos(a) + 0.03 * gaussian(rng), r * Math.sin(a) + 0.03 * gaussian(rng)]);
    labels.push(c);
  }
  return { X, labels, k: arms, name: `Spirals (${arms})`, xLabel: 'x₁', yLabel: 'x₂', range: [-1.2, 1.2] };
}

/** Robotics example: is a point in the plane reachable by a 2-link arm (L1 = 1, L2 = 0.6)? */
export function reachableData(n = 400, seed = 1, l1 = 1, l2 = 0.6): ClassData {
  const rng = mulberry32(seed);
  const X: number[][] = [];
  const labels: number[] = [];
  const lim = (l1 + l2) * 1.15;
  for (let i = 0; i < n; i++) {
    const x = (rng() * 2 - 1) * lim;
    const y = (rng() * 2 - 1) * lim;
    const r = Math.hypot(x, y);
    X.push([x / lim, y / lim]);
    labels.push(r >= Math.abs(l1 - l2) && r <= l1 + l2 ? 1 : 0);
  }
  return { X, labels, k: 2, name: 'Reachable workspace of a 2-link arm', xLabel: 'x / 1.84 m', yLabel: 'y / 1.84 m', range: [-1.1, 1.1] };
}

export const CLASS_DATASETS: { id: string; make: (seed: number) => ClassData }[] = [
  { id: 'circles', make: (s) => circlesData(300, s) },
  { id: 'xor', make: (s) => xorData(300, s) },
  { id: 'moons', make: (s) => moonsClassData(300, s) },
  { id: 'spirals', make: (s) => spiralsData(300, s) },
  { id: 'reachable', make: (s) => reachableData(400, s) },
];

/** Noisy sin(x) on [−π, π], inputs scaled to [−1, 1]. */
export function sinData(n = 120, noise = 0.1, seed = 1): { X: number[][]; Y: number[][]; xs: number[] } {
  const rng = mulberry32(seed);
  const xs: number[] = [];
  const X: number[][] = [];
  const Y: number[][] = [];
  for (let i = 0; i < n; i++) {
    const x = -Math.PI + 2 * Math.PI * rng();
    xs.push(x);
    X.push([x / Math.PI]);
    Y.push([Math.sin(x) + noise * gaussian(rng)]);
  }
  return { X, Y, xs };
}

/**
 * Inverse-kinematics samples of a 2-link arm: FK on random joint angles,
 * elbow-down branch only (θ2 ∈ [0.25, π − 0.25]) so the mapping is single valued.
 * Inputs (x, y) scaled by 1/(L1+L2); outputs (θ1, θ2) scaled to [−1, 1].
 */
export interface IKData {
  X: number[][];
  Y: number[][];
  l1: number;
  l2: number;
  scale: number;
  thetaRange: [[number, number], [number, number]];
  toJoints: (y: number[]) => [number, number];
  toInput: (x: number, y: number) => number[];
}

export function ikData(n = 600, seed = 1, l1 = 1, l2 = 0.8): IKData {
  const rng = mulberry32(seed);
  const t1r: [number, number] = [-Math.PI, Math.PI];
  const t2r: [number, number] = [0.25, Math.PI - 0.25];
  const scale = l1 + l2;
  const X: number[][] = [];
  const Y: number[][] = [];
  const norm = (v: number, r: [number, number]) => ((v - r[0]) / (r[1] - r[0])) * 2 - 1;
  for (let i = 0; i < n; i++) {
    const t1 = t1r[0] + (t1r[1] - t1r[0]) * rng();
    const t2 = t2r[0] + (t2r[1] - t2r[0]) * rng();
    const x = l1 * Math.cos(t1) + l2 * Math.cos(t1 + t2);
    const y = l1 * Math.sin(t1) + l2 * Math.sin(t1 + t2);
    X.push([x / scale, y / scale]);
    // sin/cos encoding of θ1 avoids the ±π wrap; θ2 is bounded so it is encoded directly
    Y.push([Math.cos(t1), Math.sin(t1), norm(t2, t2r)]);
  }
  return {
    X,
    Y,
    l1,
    l2,
    scale,
    thetaRange: [t1r, t2r],
    toJoints: (y) => [Math.atan2(y[1], y[0]), t2r[0] + ((y[2] + 1) / 2) * (t2r[1] - t2r[0])],
    toInput: (x, y) => [x / scale, y / scale],
  };
}
