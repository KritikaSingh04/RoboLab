import { describe, it, expect } from 'vitest';
import { presetTrack, trackQuery, trackStart, trackFromFreehand, chaikin, TRACK_PRESETS } from './tracks';
import { readLineSensors, sensorOffsets, control, simulateLineFollower, initLineFollower, stepLineFollower, DEFAULT_SENSORS, DEFAULT_GAINS, LF_ROBOT, type LFConfig } from './lineFollower';

const PID: LFConfig = { controller: 'pid', gains: DEFAULT_GAINS, baseSpeed: 0.25, sensors: DEFAULT_SENSORS };

describe('tracks', () => {
  it('presets are closed loops with sensible lengths inside the floor', () => {
    for (const id of TRACK_PRESETS) {
      const t = presetTrack(id);
      expect(t.points.length).toBeGreaterThan(100);
      expect(t.length).toBeGreaterThan(5);
      for (const p of t.points) {
        expect(p[0]).toBeGreaterThan(0);
        expect(p[0]).toBeLessThan(4);
        expect(p[1]).toBeGreaterThan(0);
        expect(p[1]).toBeLessThan(3);
      }
    }
    const oval = presetTrack('oval');
    expect(oval.length).toBeCloseTo(7.93, 1); // Ramanujan perimeter of a 1.5 × 1.0 ellipse ≈ 7.93
  });

  it('trackQuery returns the perpendicular distance and arc-length position', () => {
    const oval = presetTrack('oval');
    // outside the right end of the ellipse at (2+1.5+0.2, 1.5)
    const q = trackQuery(oval, [3.7, 1.5]);
    expect(q.dist).toBeCloseTo(0.2, 2);
    expect(q.s).toBeLessThan(0.1);
    expect(Math.abs(q.tangent[1])).toBeGreaterThan(0.9); // tangent is vertical there
    const start = trackStart(oval);
    expect(start.x).toBeCloseTo(3.5, 9);
    expect(start.theta).toBeGreaterThan(0.5); // heading counter-clockwise (up)
  });

  it('freehand tracks are smoothed and resampled, too few points give null', () => {
    const raw = Array.from({ length: 40 }, (_, i) => [2 + 1.2 * Math.cos((2 * Math.PI * i) / 40), 1.5 + 0.8 * Math.sin((2 * Math.PI * i) / 40)] as [number, number]);
    const t = trackFromFreehand(raw)!;
    expect(t).not.toBeNull();
    expect(t.points.length).toBeGreaterThan(100);
    expect(trackFromFreehand(raw.slice(0, 5))).toBeNull();
    expect(chaikin([[0, 0], [1, 0], [1, 1], [0, 1]], 1)).toHaveLength(8);
  });
});

describe('IR sensors and error', () => {
  const oval = presetTrack('oval');

  it('centred on the line the middle sensor is on and the error is 0', () => {
    const pose = trackStart(oval);
    const s = readLineSensors(pose, oval, DEFAULT_SENSORS);
    expect(s.readings).toHaveLength(5);
    expect(s.readings[2]).toBe(1);
    expect(Math.abs(s.error)).toBeLessThan(0.35); // the sensor bar is 9 cm ahead on a curve
    expect(s.onLine).toBe(true);
    expect(sensorOffsets({ n: 3, spacing: 0.02, analog: false })).toEqual([-0.02, 0, 0.02]);
  });

  it('shifting the robot right puts the line on the left sensors and gives a positive error', () => {
    const start = trackStart(oval);
    // move the robot to its right (perpendicular to heading)
    const nx = Math.sin(start.theta);
    const ny = -Math.cos(start.theta);
    const pose = { x: start.x + 0.02 * nx, y: start.y + 0.02 * ny, theta: start.theta };
    const s = readLineSensors(pose, oval, DEFAULT_SENSORS);
    expect(s.error).toBeGreaterThan(0.5);
    expect(s.readings[4]).toBe(1);
    const far = readLineSensors({ x: start.x + 0.2 * nx, y: start.y + 0.2 * ny, theta: start.theta }, oval, DEFAULT_SENSORS);
    expect(far.onLine).toBe(false);
    expect(Number.isNaN(far.error)).toBe(true);
  });

  it('analog readings fall off smoothly with distance', () => {
    const start = trackStart(oval);
    const nx = Math.sin(start.theta);
    const ny = -Math.cos(start.theta);
    const cfg = { ...DEFAULT_SENSORS, analog: true };
    const a = readLineSensors(start, oval, cfg).readings[2];
    const b = readLineSensors({ x: start.x + 0.015 * nx, y: start.y + 0.015 * ny, theta: start.theta }, oval, cfg).readings[2];
    expect(a).toBe(1);
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThan(1);
  });
});

describe('controllers', () => {
  it('PID terms are computed as Kp e, Ki ∫e, Kd de/dt and steer towards the line', () => {
    const pid0 = { integral: 0, lastError: 0, deriv: 0, p: 0, i: 0, d: 0, u: 0 };
    const r = control(0.5, false, pid0, PID, 0.01);
    expect(r.pid.p).toBeCloseTo(0.35 * 0.5, 12);
    expect(r.pid.i).toBeCloseTo(0.15 * 0.5 * 0.01, 12);
    // filtered derivative: first step is alpha · raw with alpha = dt/(tau+dt)
    expect(r.pid.d).toBeCloseTo(0.02 * (0.01 / (0.04 + 0.01)) * (0.5 / 0.01), 12);
    expect(r.wheels.vR).toBeGreaterThan(r.wheels.vL); // positive error → turn left
    const bb = control(0.5, false, pid0, { ...PID, controller: 'bangbang' }, 0.01);
    expect(bb.wheels.vR - bb.wheels.vL).toBeCloseTo(2 * 0.25 * 0.8, 12);
    expect(control(0.05, false, pid0, { ...PID, controller: 'bangbang' }, 0.01).wheels.vR).toBeCloseTo(0.25, 12); // dead zone
  });

  it('PID completes a lap on every preset without leaving the line', () => {
    for (const id of TRACK_PRESETS) {
      const r = simulateLineFollower(presetTrack(id), PID, 'PID');
      expect(r.lapTime, id).not.toBeNull();
      expect(r.offTrackCount, id).toBe(0);
      expect(r.meanAbsError, id).toBeLessThan(0.3);
    }
  });

  it('bang-bang completes the oval and the corners, switching the wheels hard', () => {
    for (const id of ['oval', 'corners']) {
      const bb = simulateLineFollower(presetTrack(id), { ...PID, controller: 'bangbang' }, 'bang-bang');
      expect(bb.lapTime, id).not.toBeNull();
      expect(bb.offTrackCount, id).toBe(0);
    }
  });

  it('analog sensors give a smaller mean error than 0/1 sensors with the same PID gains', () => {
    for (const id of ['scurve', 'corners']) {
      const digital = simulateLineFollower(presetTrack(id), PID, 'digital');
      const analog = simulateLineFollower(presetTrack(id), { ...PID, sensors: { ...DEFAULT_SENSORS, analog: true } }, 'analog');
      expect(analog.lapTime, id).not.toBeNull();
      expect(analog.meanAbsError, id).toBeLessThan(digital.meanAbsError);
    }
  });

  it('P only oscillates more than PD on the sharp-corner track', () => {
    const p = simulateLineFollower(presetTrack('corners'), { ...PID, gains: { kp: 0.35, ki: 0, kd: 0 } }, 'P');
    const pd = simulateLineFollower(presetTrack('corners'), { ...PID, gains: { kp: 0.35, ki: 0, kd: 0.02 } }, 'PD');
    expect(pd.lapTime).not.toBeNull();
    expect(pd.meanAbsError).toBeLessThan(p.meanAbsError);
  });

  it('lap detection counts forward progress once per loop', () => {
    const track = presetTrack('oval');
    let s = initLineFollower(track, PID);
    for (let i = 0; i < 120 * 40 && s.lap.laps < 1; i++) s = stepLineFollower(s, track, PID, 1 / 120);
    expect(s.lap.laps).toBe(1);
    expect(s.lap.lapTimes[0]).toBeGreaterThan(track.length / LF_ROBOT.vMax);
    expect(s.lap.lapTimes[0]).toBeLessThan(60);
  });
});
