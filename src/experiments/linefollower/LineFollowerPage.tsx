import { useCallback, useEffect, useRef, useState } from 'react';
import ExperimentPage from '../../components/ExperimentPage';
import Equation from '../../components/Equation';
import Plot from '../../components/Plot';
import Slider from '../../components/Slider';
import Toggle from '../../components/Toggle';
import PlaybackControls from '../../components/PlaybackControls';
import { useFixedStepLoop } from '../../components/useFixedStepLoop';
import { findExperiment } from '../registry';
import { presetTrack, trackFromFreehand, TRACK_PRESETS, type Track } from '../../lib/sim/tracks';
import { initLineFollower, stepLineFollower, simulateLineFollower, DEFAULT_GAINS, DEFAULT_SENSORS, type ControllerKind, type Gains, type LFConfig, type LFRun, type LFState, type SensorConfig } from '../../lib/sim/lineFollower';
import type { Vec2 } from '../../lib/sim/geometry';
import TrackCanvas, { RUN_COLORS } from './TrackCanvas';

const experiment = findExperiment('linefollower')!;
const DT = 1 / 120;
const fmt = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—');

export default function LineFollowerPage() {
  const [trackId, setTrackId] = useState('oval');
  const [track, setTrack] = useState<Track>(() => presetTrack('oval'));
  const [drawing, setDrawing] = useState(false);
  const [controller, setController] = useState<ControllerKind>('pid');
  const [gains, setGains] = useState<Gains>(DEFAULT_GAINS);
  const [baseSpeed, setBaseSpeed] = useState(0.25);
  const [sensors, setSensors] = useState<SensorConfig>(DEFAULT_SENSORS);
  const [compare, setCompare] = useState<LFRun[] | null>(null);
  const cfgRef = useRef<LFConfig>({ controller, gains, baseSpeed, sensors });
  cfgRef.current = { controller, gains, baseSpeed, sensors };
  const simRef = useRef<LFState>(initLineFollower(track, cfgRef.current));
  const [, setTick] = useState(0);

  const resetSim = useCallback(() => {
    simRef.current = initLineFollower(track, cfgRef.current);
    setTick((v) => v + 1);
  }, [track]);

  const loop = useFixedStepLoop(
    () => {
      simRef.current = stepLineFollower(simRef.current, track, cfgRef.current, DT);
    },
    { dt: DT, onReset: resetSim },
  );
  // changing the track or the sensor layout restarts; gains can be tuned live
  useEffect(() => {
    loop.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, sensors.n, sensors.analog]);

  const loadTrack = (id: string) => {
    setTrackId(id);
    setTrack(presetTrack(id));
    setCompare(null);
    setDrawing(false);
  };
  const onDrawn = useCallback((pts: Vec2[]) => {
    const t = trackFromFreehand(pts);
    if (t) {
      setTrackId('custom');
      setTrack(t);
      setCompare(null);
    }
    setDrawing(false);
  }, []);

  const runCompare = () => {
    const base = cfgRef.current;
    const variants: [string, Gains][] = [
      ['P', { kp: gains.kp, ki: 0, kd: 0 }],
      ['PD', { kp: gains.kp, ki: 0, kd: gains.kd }],
      ['PID', gains],
    ];
    setCompare(variants.map(([label, g]) => simulateLineFollower(track, { ...base, controller: 'pid', gains: g }, label, { maxTime: 60 })));
  };

  const sim = simRef.current;
  const errorData = sim.errors.filter((e) => sim.t - e.t <= 10);
  const meanAbs = sim.steps ? sim.absErrorSum / sim.steps : 0;

  const controls = (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Track</div>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-800 p-1">
          {TRACK_PRESETS.map((id) => (
            <button key={id} type="button" onClick={() => loadTrack(id)} className={['rounded-md px-2 py-1.5 text-sm font-medium transition', trackId === id && !drawing ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-700'].join(' ')}>
              {presetTrack(id).name}
            </button>
          ))}
        </div>
        <button type="button" className={['btn w-full', drawing ? 'btn-primary' : ''].join(' ')} onClick={() => { setDrawing((d) => !d); loop.pause(); }}>
          {drawing ? 'Drawing… (drag on the floor)' : '✎ Draw your own track'}
        </button>
        <p className="mono text-xs text-slate-500">{track.name} · length {track.length.toFixed(2)} m · line {(track.width * 100).toFixed(1)} cm</p>
      </div>

      <div className="space-y-2 border-t border-slate-800 pt-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">IR sensor array</div>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-800 p-1">
          {([3, 5] as const).map((n) => (
            <button key={n} type="button" onClick={() => setSensors((s) => ({ ...s, n, spacing: n === 3 ? 0.018 : 0.012 }))} className={['rounded-md px-2 py-1 text-sm font-medium transition', sensors.n === n ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-700'].join(' ')}>
              {n} sensors
            </button>
          ))}
        </div>
        <Toggle label="Analog readings" hint="fall off with distance to the line centre" checked={sensors.analog} onChange={(v) => setSensors((s) => ({ ...s, analog: v }))} />
      </div>

      <div className="space-y-2 border-t border-slate-800 pt-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Controller</div>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-800 p-1">
          {(
            [
              ['bangbang', 'Bang-bang'],
              ['pid', 'PID'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setController(id)} className={['rounded-md px-2 py-1 text-sm font-medium transition', controller === id ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-700'].join(' ')}>
              {label}
            </button>
          ))}
        </div>
        <Slider label="Base speed" value={baseSpeed} min={0.05} max={0.5} step={0.01} unit="m/s" decimals={2} onChange={setBaseSpeed} />
        {controller === 'pid' && (
          <>
            <Slider label="Kp" value={gains.kp} min={0} max={1.2} step={0.01} decimals={2} onChange={(v) => setGains((g) => ({ ...g, kp: v }))} />
            <Slider label="Ki" value={gains.ki} min={0} max={1} step={0.01} decimals={2} onChange={(v) => setGains((g) => ({ ...g, ki: v }))} />
            <Slider label="Kd" value={gains.kd} min={0} max={0.1} step={0.001} decimals={3} onChange={(v) => setGains((g) => ({ ...g, kd: v }))} />
          </>
        )}
      </div>

      <div className="border-t border-slate-800 pt-3">
        <PlaybackControls loop={loop} label="Simulation" />
      </div>
    </div>
  );

  return (
    <ExperimentPage
      experiment={experiment}
      aim={
        <p>
          To simulate a line-following robot with an array of infrared reflectance sensors and a differential drive, derive the line-position error
          from the sensor pattern, and compare a bang-bang controller with a tuned PID controller on several tracks.
        </p>
      }
      theory={
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-white">IR reflectance sensing</h3>
            <p>
              Each sensor is an infrared LED next to a phototransistor. A white floor reflects the IR light back (low output), a black line absorbs it
              (high output), so after thresholding every sensor reads 1 over the line and 0 beside it. With N sensors at lateral positions xᵢ the
              line position relative to the robot centre is the weighted average of the active sensors, normalised by the outermost position:
            </p>
            <Equation tex={String.raw`e = \frac{\sum_i r_i\,x_i}{\sum_i r_i}\cdot\frac{1}{x_{\max}} \in [-1, 1],\qquad r_i \in \{0, 1\}\ \text{(digital)}\quad\text{or}\quad r_i \in [0,1]\ \text{(analog)}`} />
            <p>Positive e means the line is to the left, so the robot must turn left. If no sensor sees the line, the last direction is kept and the event is counted as "off track".</p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-white">Bang-bang control</h3>
            <p>The simplest controller turns hard left or hard right depending only on the sign of e (with a small dead zone). It works, but zig-zags continuously and wastes speed.</p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-white">PID control</h3>
            <Equation tex={String.raw`u(t) = K_p\,e(t) + K_i\int_0^t e(\tau)\,d\tau + K_d\,\frac{de}{dt},\qquad v_L = v_{\text{base}} - u,\quad v_R = v_{\text{base}} + u`} />
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>K_p</strong> sets how strongly the robot steers back: too low and it cuts corners or loses the line, too high and it oscillates.</li>
              <li><strong>K_i</strong> removes a steady offset (e.g. a weaker motor) by accumulating the error, but too much makes the response sluggish and overshoot. The integral is clamped (anti-windup) and frozen while the line is lost.</li>
              <li><strong>K_d</strong> reacts to how fast the error changes and damps oscillations, which is what lets the robot take sharp corners. With 0/1 sensors the derivative is spiky, so it is low-pass filtered; analog sensors make D far more effective.</li>
            </ul>
          </div>
        </div>
      }
      simulation={
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="card self-start">{controls}</div>
          <div className="space-y-3">
            <TrackCanvas track={track} sim={sim} overlays={compare} drawing={drawing} onDrawn={onDrawn} />
            <div className="grid gap-3 md:grid-cols-[260px_minmax(0,1fr)]">
              <div className="card space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sensor array</div>
                <div className="flex items-center justify-center gap-2">
                  {sim.sensors.readings.map((r, i) => (
                    <span key={i} className="flex flex-col items-center gap-1">
                      <span className="h-7 w-7 rounded-full border-2 border-slate-600 transition" style={{ background: r > 0 ? `rgba(239,68,68,${0.35 + 0.65 * r})` : '#1e293b', boxShadow: r > 0 ? '0 0 10px rgba(239,68,68,0.7)' : 'none' }} />
                      <span className="mono text-[10px] text-slate-500">{i - (sim.sensors.readings.length - 1) / 2}</span>
                    </span>
                  ))}
                </div>
                <div className="mono text-sm">
                  <div className="flex justify-between"><span className="text-slate-400">error e</span><span className={sim.lost ? 'text-red-400' : 'text-white'}>{sim.lost ? `lost (${sim.error > 0 ? '+' : '−'})` : fmt(sim.error)}</span></div>
                  <div className="h-2 w-full rounded-full bg-slate-800 relative my-1">
                    <span className="absolute top-0 h-2 w-1 bg-slate-500" style={{ left: 'calc(50% - 2px)' }} />
                    <span className="absolute top-0 h-2 w-2 rounded-full bg-sky-400" style={{ left: `calc(${50 + 50 * Math.max(-1, Math.min(1, sim.error))}% - 4px)` }} />
                  </div>
                  {controller === 'pid' ? (
                    <>
                      <div className="flex justify-between"><span className="text-sky-300">P = Kp·e</span><span>{fmt(sim.pid.p)}</span></div>
                      <div className="flex justify-between"><span className="text-emerald-300">I = Ki·∫e</span><span>{fmt(sim.pid.i)}</span></div>
                      <div className="flex justify-between"><span className="text-orange-300">D = Kd·de/dt</span><span>{fmt(sim.pid.d)}</span></div>
                    </>
                  ) : (
                    <div className="flex justify-between"><span className="text-slate-400">bang-bang</span><span>{sim.pid.u > 0 ? 'turn left' : sim.pid.u < 0 ? 'turn right' : 'straight'}</span></div>
                  )}
                  <div className="flex justify-between border-t border-slate-800 pt-1"><span className="text-slate-400">u</span><span className="text-white">{fmt(sim.pid.u)} m/s</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">vL / vR</span><span>{fmt(sim.wheels.vL, 2)} / {fmt(sim.wheels.vR, 2)}</span></div>
                </div>
              </div>
              <div className="card">
                <Plot title="Error vs time (last 10 s)" data={errorData} xKey="t" xLabel="t (s)" yDomain={[-1, 1]} series={[{ key: 'e', label: 'error', color: '#38bdf8' }]} height={230} decimals={2} />
              </div>
            </div>
          </div>
        </div>
      }
      results={
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="card">
              <h3 className="mb-2 font-semibold text-white">Current run</h3>
              <div className="mono grid grid-cols-2 gap-y-1 text-sm">
                <span className="text-slate-400">controller</span><span className="text-white">{controller === 'pid' ? `PID (${gains.kp}, ${gains.ki}, ${gains.kd})` : 'bang-bang'}</span>
                <span className="text-slate-400">time</span><span className="text-white">{fmt(sim.t, 1)} s</span>
                <span className="text-slate-400">laps</span><span className="text-white">{sim.lap.laps}</span>
                <span className="text-slate-400">lap times</span><span className="text-white">{sim.lap.lapTimes.length ? sim.lap.lapTimes.map((l) => l.toFixed(1)).join(', ') + ' s' : '—'}</span>
                <span className="text-slate-400">mean |e|</span><span className="text-white">{fmt(meanAbs)}</span>
                <span className="text-slate-400">off-track count</span><span className={sim.offTrackCount ? 'text-red-400' : 'text-emerald-400'}>{sim.offTrackCount}</span>
                <span className="text-slate-400">distance to line</span><span className="text-white">{(100 * sim.centreDist).toFixed(1)} cm</span>
              </div>
            </div>
            <div className="card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-white">Tuning comparison: P vs PD vs PID</h3>
                  <p className="text-xs text-slate-500">Runs one lap with the current Kp (P), Kp + Kd (PD) and all three gains (PID) on this track and overlays the paths.</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={runCompare}>▶ Compare</button>
              </div>
              {compare ? (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400">
                        <th className="py-1 font-medium">Controller</th>
                        <th className="py-1 text-right font-medium">Lap time (s)</th>
                        <th className="py-1 text-right font-medium">Mean |e|</th>
                        <th className="py-1 text-right font-medium">Off-track</th>
                        <th className="py-1 text-right font-medium">Max distance (cm)</th>
                      </tr>
                    </thead>
                    <tbody className="mono text-white">
                      {compare.map((r, i) => (
                        <tr key={r.label} className="border-t border-slate-800">
                          <td className="py-1 font-sans"><span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: RUN_COLORS[i] }} />{r.label}</td>
                          <td className="py-1 text-right">{r.lapTime === null ? 'did not finish' : r.lapTime.toFixed(2)}</td>
                          <td className="py-1 text-right">{r.meanAbsError.toFixed(3)}</td>
                          <td className={['py-1 text-right', r.offTrackCount ? 'text-red-400' : ''].join(' ')}>{r.offTrackCount}</td>
                          <td className="py-1 text-right">{(100 * r.maxCentreDist).toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Plot
                    title="Error vs time for the three controllers"
                    data={(() => {
                      const n = Math.max(...compare.map((r) => r.errors.length));
                      return Array.from({ length: n }, (_, i) => ({ t: compare[0].errors[i]?.t ?? compare.find((r) => r.errors[i])?.errors[i]?.t ?? i / 30, P: compare[0].errors[i]?.e ?? null, PD: compare[1].errors[i]?.e ?? null, PID: compare[2].errors[i]?.e ?? null }));
                    })()}
                    xKey="t"
                    xLabel="t (s)"
                    yDomain={[-1, 1]}
                    series={[{ key: 'P', color: RUN_COLORS[0] }, { key: 'PD', color: RUN_COLORS[1] }, { key: 'PID', color: RUN_COLORS[2] }]}
                    height={220}
                    decimals={2}
                  />
                </>
              ) : (
                <p className="text-sm text-slate-500">Press Compare. The sharp-corner track and analog sensors show the differences most clearly.</p>
              )}
            </div>
          </div>
        </div>
      }
      conclusion={
        <div className="space-y-2">
          <p>
            A handful of reflectance sensors is enough to measure where the line is under the robot, and the weighted-average error turns that
            pattern into a single number a controller can act on. Bang-bang control follows the line by zig-zagging; PID follows it smoothly, with
            the proportional term doing most of the work, the derivative term damping oscillations on sharp corners and the integral term removing
            steady offsets.
          </p>
          <p>
            Sensor quantisation matters: with 0/1 readings the error can only take a few values, so the derivative term is noisy and must be
            filtered; analog readings give a continuous error and let PID reach a much smaller mean error. The tuning comparison makes these
            trade-offs measurable on the same track.
          </p>
        </div>
      }
    />
  );
}
