import { useCallback, useEffect, useRef, useState } from 'react';

export interface FixedStepLoop {
  running: boolean;
  /** Simulation time in seconds. */
  time: number;
  dt: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Advance exactly one physics step. */
  step: () => void;
  /** Stop, set t = 0 and call the onReset callback. */
  reset: () => void;
  /** Pause and jump to an arbitrary time (scrubbing). */
  seek: (t: number) => void;
}

/**
 * requestAnimationFrame loop with a fixed physics timestep (CLAUDE.md rule 4).
 * `onStep(dt, t)` is called once per physics step; rendering happens whenever
 * React re-renders, independent of the step rate.
 */
export function useFixedStepLoop(onStep: (dt: number, t: number) => void, options: { dt?: number; onReset?: () => void; duration?: number } = {}): FixedStepLoop {
  const dt = options.dt ?? 1 / 120;
  /** With a finite duration the loop pauses at t = duration and Play restarts from 0 when already at the end. */
  const duration = options.duration ?? Infinity;
  const [running, setRunning] = useState(false);
  const [time, setTime] = useState(0);
  const tRef = useRef(0);
  const stepRef = useRef(onStep);
  const resetRef = useRef(options.onReset);
  stepRef.current = onStep;
  resetRef.current = options.onReset;

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      acc += Math.min((now - last) / 1000, 0.1); // clamp to avoid spiral of death after a tab switch
      last = now;
      while (acc >= dt) {
        stepRef.current(dt, tRef.current);
        tRef.current += dt;
        acc -= dt;
        if (tRef.current >= duration) {
          tRef.current = duration;
          setTime(duration);
          setRunning(false);
          return;
        }
      }
      setTime(tRef.current);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, dt, duration]);

  const restartIfDone = useCallback(() => {
    if (tRef.current >= duration) {
      tRef.current = 0;
      setTime(0);
    }
  }, [duration]);
  const play = useCallback(() => {
    restartIfDone();
    setRunning(true);
  }, [restartIfDone]);
  const pause = useCallback(() => setRunning(false), []);
  const toggle = useCallback(() => {
    setRunning((r) => {
      if (!r) restartIfDone();
      return !r;
    });
  }, [restartIfDone]);
  const step = useCallback(() => {
    setRunning(false);
    restartIfDone();
    stepRef.current(dt, tRef.current);
    tRef.current = Math.min(duration, tRef.current + dt);
    setTime(tRef.current);
  }, [dt, duration, restartIfDone]);
  const reset = useCallback(() => {
    setRunning(false);
    tRef.current = 0;
    setTime(0);
    resetRef.current?.();
  }, []);

  const seek = useCallback(
    (t: number) => {
      setRunning(false);
      tRef.current = Math.min(duration, Math.max(0, t));
      setTime(tRef.current);
    },
    [duration],
  );

  return { running, time, dt, play, pause, toggle, step, reset, seek };
}
