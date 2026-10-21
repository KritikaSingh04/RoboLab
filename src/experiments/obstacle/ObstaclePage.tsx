import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ExperimentPage from '../../components/ExperimentPage';
import Equation from '../../components/Equation';
import Plot from '../../components/Plot';
import Slider from '../../components/Slider';
import Toggle from '../../components/Toggle';
import PlaybackControls from '../../components/PlaybackControls';
import { useFixedStepLoop } from '../../components/useFixedStepLoop';
import { findExperiment } from '../registry';
import { MAPS, findMap, type MapDef } from '../../lib/sim/maps';
import { CONTROLLERS, createController, type Controller, type ControllerId } from '../../lib/sim/controllers';
import { initialSim, stepSim, simulate, type RunResult, type SimState } from '../../lib/sim/run';
import { DEFAULT_ROBOT } from '../../lib/sim/diffDrive';
import { SENSOR_ANGLES_DEG, SENSOR_NOISE } from '../../lib/sim/sensors';
import { mulberry32 } from '../../lib/ai/random';
import { deg2rad, rad2deg } from '../../lib/math/matrix';
import ArenaCanvas, { type EditMode } from './ArenaCanvas';

const experiment = findExperiment('obstacle')!;
const DT = 1 / 60;
const PLOT_WINDOW = 12; // seconds of history shown
const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');

interface Sample {
  t: number;
  s0: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  vL: number;
  vR: number;
}

export default function ObstaclePage() {
  const [mapId, setMapId] = useState('simple');
  const [map, setMap] = useState<MapDef>(() => structuredClone(findMap('simple')));
  const [controllerId, setControllerId] = useState<ControllerId>('reactive');
  const [noise, setNoise] = useState(true);
  const [showField, setShowField] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>('select');
  const [vMax, setVMax] = useState(DEFAULT_ROBOT.vMax);
  const [compare, setCompare] = useState<RunResult[] | null>(null);
  const [showOverlays, setShowOverlays] = useState(true);

  const robot = useMemo(() => ({ ...DEFAULT_ROBOT, vMax }), [vMax]);
  const rngRef = useRef(mulberry32(1));
  const ctrlRef = useRef<Controller>(createController(controllerId));
  const simRef = useRef<SimState>(initialSim(map, robot, rngRef.current));
  const samplesRef = useRef<Sample[]>([]);
  const [, setTick] = useState(0);

  const resetSim = useCallback(() => {
    rngRef.current = mulberry32(1);
    ctrlRef.current = createController(controllerId);
    simRef.current = initialSim(map, robot, rngRef.current);
    samplesRef.current = [];
    setTick((v) => v + 1);
  }, [controllerId, map, robot]);

  const loop = useFixedStepLoop(
    () => {
      const s = simRef.current;
      if (s.reached) {
        loop.pause();
        return;
      }
      const next = stepSim(s, map, ctrlRef.current, DT, robot, rngRef.current, noise ? SENSOR_NOISE : 0);
      simRef.current = next;
      const r = next.sensors.map((x) => x.range);
      samplesRef.current.push({ t: next.t, s0: r[0], s1: r[1], s2: r[2], s3: r[3], s4: r[4], vL: next.wheels.vL, vR: next.wheels.vR });
      if (samplesRef.current.length > PLOT_WINDOW * 60) samplesRef.current.splice(0, samplesRef.current.length - PLOT_WINDOW * 60);
      if (next.reached) loop.pause();
    },
    { dt: DT, onReset: resetSim },
  );

  // Any change of map, controller or robot restarts the run.
  useEffect(() => {
    loop.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, controllerId, robot]);

  const loadMap = (id: string) => {
    setMapId(id);
    setMap(structuredClone(findMap(id)));
    setCompare(null);
  };
  const onMapChange = useCallback((m: MapDef) => {
    setMap(m);
    setCompare(null);
  }, []);

  const runCompare = () => {
    const results = CONTROLLERS.map((c) => simulate(map, c.id, { dt: DT, maxTime: 90, seed: 1, robot, noise: noise ? SENSOR_NOISE : 0 }));
    setCompare(results);
    setShowOverlays(true);
  };

  const sim = simRef.current;
  const plotData = samplesRef.current.filter((_, i) => i % 3 === 0);
  const status = sim.reached ? 'goal reached' : sim.stuck ? 'stuck (no progress for 8 s)' : sim.colliding ? 'in collision' : loop.running ? 'running' : 'paused';

  const controls = (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Map</div>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-800 p-1">
          {MAPS.map((m) => (
            <button key={m.id} type="button" onClick={() => loadMap(m.id)} className={['rounded-md px-2 py-1.5 text-sm font-medium transition', mapId === m.id ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-700'].join(' ')}>
              {m.name}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{findMap(mapId).description}</p>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Edit</div>
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-800 p-1">
          {(
            [
              ['select', 'Drag'],
              ['rect', 'Rect'],
              ['circle', 'Circle'],
              ['erase', 'Erase'],
            ] as const
          ).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setEditMode(m)} className={['rounded-md px-1 py-1 text-xs font-medium transition', editMode === m ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-700'].join(' ')}>
              {label}
            </button>
          ))}
        </div>
        <Slider label="Start heading" value={rad2deg(map.start.theta)} min={-180} max={180} step={5} unit="°" decimals={0} onChange={(d) => onMapChange({ ...map, start: { ...map.start, theta: deg2rad(d) } })} />
        <div className="flex gap-1.5">
          <button type="button" className="btn" onClick={() => onMapChange({ ...map, obstacles: [] })}>Clear obstacles</button>
          <button type="button" className="btn" onClick={() => loadMap(mapId)}>Reset map</button>
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-800 pt-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Controller</div>
        <div className="space-y-1">
          {CONTROLLERS.map((c) => (
            <button key={c.id} type="button" onClick={() => setControllerId(c.id)} className={['flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition', controllerId === c.id ? 'bg-slate-700 text-white ring-1 ring-sky-500/50' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'].join(' ')}>
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
        </div>
        <Slider label="Max speed v_max" value={vMax} min={0.2} max={1.5} step={0.05} unit="m/s" decimals={2} onChange={setVMax} />
        <Toggle label="Sensor noise (±2 cm)" checked={noise} onChange={setNoise} />
        <Toggle label="Show potential field" hint="arrows of F_att + F_rep" checked={showField} onChange={setShowField} />
      </div>

      <div className="space-y-2 border-t border-slate-800 pt-3">
        <PlaybackControls loop={loop} label="Simulation" />
        <div className="mono rounded-md bg-slate-900 px-3 py-2 text-xs text-slate-300">
          <div className="flex justify-between"><span className="text-slate-500">status</span><span className={sim.reached ? 'text-emerald-400' : sim.stuck ? 'text-amber-300' : sim.colliding ? 'text-red-400' : 'text-white'}>{status}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">pose</span><span>({fmt(sim.pose.x)}, {fmt(sim.pose.y)}) {fmt(rad2deg(sim.pose.theta), 0)}°</span></div>
          <div className="flex justify-between"><span className="text-slate-500">wheels vL / vR</span><span>{fmt(sim.wheels.vL)} / {fmt(sim.wheels.vR)} m/s</span></div>
          <div className="mt-1 text-slate-400">{ctrlRef.current.status()}</div>
        </div>
      </div>
    </div>
  );

  return (
    <ExperimentPage
      experiment={experiment}
      aim={
        <p>
          To simulate a differential-drive mobile robot with five ultrasonic range sensors in a 2D arena, and to compare three obstacle-avoidance
          controllers — rule-based reactive, fuzzy logic and artificial potential field — on their path, time to goal, collisions and clearance.
        </p>
      }
      theory={
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-white">Differential-drive kinematics</h3>
            <p>Two independently driven wheels, separated by L, give the body velocity v and turn rate ω; the pose integrates them with a fixed timestep:</p>
            <Equation tex={String.raw`v = \frac{v_R + v_L}{2},\qquad \omega = \frac{v_R - v_L}{L},\qquad \dot{x} = v\cos\theta,\quad \dot{y} = v\sin\theta,\quad \dot{\theta} = \omega`} />
            <p>The simulator integrates the arc exactly over each step (radius v/ω), which is stable even at high turn rates.</p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-white">Range sensing</h3>
            <p>
              Each ultrasonic sensor is modelled as a ray from the body rim. Its reading is the distance to the first intersection with a wall
              segment or an obstacle (ray–segment and ray–circle tests), clipped at 2 m, plus ±2 cm uniform noise:
            </p>
            <Equation tex={String.raw`\mathbf{p}(t) = \mathbf{o} + t\,\mathbf{d},\qquad t_{\text{circle}} = \frac{-b - \sqrt{b^2 - 4c}}{2},\qquad t_{\text{segment}} = \frac{(\mathbf{a}-\mathbf{o})\times\mathbf{e}}{\mathbf{d}\times\mathbf{e}}`} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-white">Controllers</h3>
            <ol className="list-decimal space-y-1 pl-5">
              <li><strong>Reactive rules</strong>: drive to the goal with proportional heading control; when the front is blocked, turn to the more open side and follow the obstacle at a set distance until the direction to the goal is clear.</li>
              <li><strong>Fuzzy</strong>: the Mamdani rule base of experiment 7 maps (nearest range, bearing) to a steering angle and speed; the avoidance command is blended with goal seeking in proportion to how close the obstacle is.</li>
              <li><strong>Artificial potential field</strong>: the robot descends a potential made of an attractive goal term and repulsive obstacle terms; the resulting force sets the heading and speed.</li>
            </ol>
            <Equation tex={String.raw`F_{\text{att}} = k_a\,\frac{\mathbf{g}-\mathbf{p}}{\lVert \mathbf{g}-\mathbf{p}\rVert}\min(\lVert \mathbf{g}-\mathbf{p}\rVert, 1),\qquad F_{\text{rep}} = \sum_i k_r\left(\frac{1}{d_i} - \frac{1}{d_0}\right)\frac{1}{d_i^{2}}\,\hat{\mathbf{n}}_i\quad (d_i < d_0)`} />
            <p>
              Potential fields are smooth and cheap but purely local: wherever the attractive and repulsive forces cancel the robot stops in a{' '}
              <em>local minimum</em>. The U-trap map is built to show this.
            </p>
          </div>
        </div>
      }
      simulation={
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="card self-start">{controls}</div>
          <div className="space-y-3">
            <ArenaCanvas map={map} sim={sim} controllerId={controllerId} showField={showField} overlays={showOverlays ? compare : null} editMode={editMode} onMapChange={onMapChange} />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="card">
                <Plot title="Sensor readings (m)" data={plotData.map((s) => ({ t: s.t, '−60°': s.s0, '−30°': s.s1, '0°': s.s2, '+30°': s.s3, '+60°': s.s4 }))} xKey="t" xLabel="t (s)" yDomain={[0, 2]} series={SENSOR_ANGLES_DEG.map((a, i) => ({ key: `${a > 0 ? '+' : a < 0 ? '−' : ''}${Math.abs(a)}°`, color: ['#a78bfa', '#38bdf8', '#eab308', '#f97316', '#ef4444'][i] }))} height={200} decimals={2} />
              </div>
              <div className="card">
                <Plot title="Wheel speeds (m/s)" data={plotData.map((s) => ({ t: s.t, vL: s.vL, vR: s.vR }))} xKey="t" xLabel="t (s)" series={[{ key: 'vL', color: '#38bdf8' }, { key: 'vR', color: '#f97316' }]} height={200} decimals={2} />
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
                <span className="text-slate-400">controller</span><span className="text-white">{CONTROLLERS.find((c) => c.id === controllerId)?.name}</span>
                <span className="text-slate-400">status</span><span className="text-white">{status}</span>
                <span className="text-slate-400">time</span><span className="text-white">{fmt(sim.t, 1)} s</span>
                <span className="text-slate-400">path length</span><span className="text-white">{fmt(sim.pathLength)} m</span>
                <span className="text-slate-400">collisions</span><span className={sim.collisions ? 'text-red-400' : 'text-emerald-400'}>{sim.collisions}</span>
                <span className="text-slate-400">min clearance</span><span className={sim.minClearance < 0.1 ? 'text-amber-300' : 'text-white'}>{fmt(sim.minClearance)} m</span>
                <span className="text-slate-400">straight-line distance</span><span className="text-white">{fmt(Math.hypot(map.goal[0] - map.start.x, map.goal[1] - map.start.y))} m</span>
              </div>
            </div>
            <div className="card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-white">Compare all controllers</h3>
                  <p className="text-xs text-slate-500">Runs each controller headlessly on the current map (same start, goal, noise seed; 90 s limit) and overlays the paths.</p>
                </div>
                <div className="flex items-center gap-3">
                  {compare && <Toggle label="Overlay paths" checked={showOverlays} onChange={setShowOverlays} />}
                  <button type="button" className="btn btn-primary" onClick={runCompare}>▶ Compare all</button>
                </div>
              </div>
              {compare ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="py-1 font-medium">Controller</th>
                      <th className="py-1 font-medium">Result</th>
                      <th className="py-1 text-right font-medium">Time (s)</th>
                      <th className="py-1 text-right font-medium">Path (m)</th>
                      <th className="py-1 text-right font-medium">Collisions</th>
                      <th className="py-1 text-right font-medium">Min clearance (m)</th>
                    </tr>
                  </thead>
                  <tbody className="mono">
                    {compare.map((r) => {
                      const c = CONTROLLERS.find((k) => k.id === r.controller)!;
                      return (
                        <tr key={r.controller} className="border-t border-slate-800 text-white">
                          <td className="py-1 font-sans"><span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: c.color }} />{c.name}</td>
                          <td className={['py-1 font-sans', r.reached ? 'text-emerald-400' : 'text-amber-300'].join(' ')}>{r.reached ? 'goal reached' : r.stuck ? 'stuck (local minimum)' : 'timed out'}</td>
                          <td className="py-1 text-right">{r.reached ? fmt(r.time, 1) : '—'}</td>
                          <td className="py-1 text-right">{fmt(r.pathLength)}</td>
                          <td className={['py-1 text-right', r.collisions ? 'text-red-400' : ''].join(' ')}>{r.collisions}</td>
                          <td className="py-1 text-right">{fmt(r.minClearance)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-slate-500">Press Compare all to fill the table. Try it on the U-trap map.</p>
              )}
            </div>
          </div>
        </div>
      }
      conclusion={
        <div className="space-y-2">
          <p>
            All three controllers steer a differential-drive robot around isolated obstacles using only five range readings, but they fail in
            different ways. The reactive rules are robust because they commit to following an obstacle until the goal direction is clear; the fuzzy
            controller gives smoother commands but can hesitate; the potential field is the smoothest and simplest, yet it stops wherever the
            attractive and repulsive forces balance.
          </p>
          <p>
            The U-trap makes the local-minimum problem concrete: the field pulls the robot into the cup and holds it there, while the wall-following
            rule escapes. Sensor noise, maximum speed and the obstacle layout can all be changed to test how sensitive each strategy is.
          </p>
        </div>
      }
    />
  );
}
