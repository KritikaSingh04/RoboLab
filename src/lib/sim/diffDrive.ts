/**
 * Differential-drive kinematics.
 *   v = (vR + vL)/2,  ω = (vR − vL)/L,  ẋ = v cosθ,  ẏ = v sinθ,  θ̇ = ω
 */
import { wrapAngle } from './geometry';

export interface Pose {
  x: number;
  y: number;
  theta: number;
}

export interface RobotParams {
  /** Wheel separation L (m). */
  wheelBase: number;
  /** Body radius for collisions and drawing (m). */
  radius: number;
  vMax: number;
  wMax: number;
}

export const DEFAULT_ROBOT: RobotParams = { wheelBase: 0.3, radius: 0.2, vMax: 0.8, wMax: 2.5 };

export interface WheelSpeeds {
  vL: number;
  vR: number;
}

export function wheelsToBody(w: WheelSpeeds, L: number): { v: number; omega: number } {
  return { v: (w.vR + w.vL) / 2, omega: (w.vR - w.vL) / L };
}

export function bodyToWheels(v: number, omega: number, L: number): WheelSpeeds {
  return { vL: v - (omega * L) / 2, vR: v + (omega * L) / 2 };
}

/** Clamp a body command to the robot limits, preserving the turn direction. */
export function limitCommand(v: number, omega: number, p: RobotParams): WheelSpeeds {
  const vv = Math.max(-p.vMax, Math.min(p.vMax, v));
  const ww = Math.max(-p.wMax, Math.min(p.wMax, omega));
  const w = bodyToWheels(vv, ww, p.wheelBase);
  // wheel speeds must not exceed what vMax allows either
  const m = Math.max(Math.abs(w.vL), Math.abs(w.vR));
  const lim = p.vMax + (p.wMax * p.wheelBase) / 2;
  return m > lim ? { vL: (w.vL * lim) / m, vR: (w.vR * lim) / m } : w;
}

/** Integrate one fixed timestep. Exact arc motion when ω ≠ 0, straight line otherwise. */
export function stepDiffDrive(s: Pose, w: WheelSpeeds, L: number, dt: number): Pose {
  const { v, omega } = wheelsToBody(w, L);
  if (Math.abs(omega) < 1e-9) return { x: s.x + v * Math.cos(s.theta) * dt, y: s.y + v * Math.sin(s.theta) * dt, theta: s.theta };
  const R = v / omega;
  const th = s.theta + omega * dt;
  return { x: s.x + R * (Math.sin(th) - Math.sin(s.theta)), y: s.y - R * (Math.cos(th) - Math.cos(s.theta)), theta: wrapAngle(th) };
}
