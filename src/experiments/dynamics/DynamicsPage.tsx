import { useEffect, useMemo, useRef, useState } from 'react';
import ExperimentPage from '../../components/ExperimentPage';
import Equation from '../../components/Equation';
import Plot from '../../components/Plot';
import AreaPlot from '../../components/AreaPlot';
import Slider from '../../components/Slider';
import NumberInput from '../../components/NumberInput';
import PlaybackControls from '../../components/PlaybackControls';
import { useFixedStepLoop } from '../../components/useFixedStepLoop';
import { findExperiment } from '../registry';
import { deg2rad, rad2deg } from '../../lib/math/matrix';
import { cubic } from '../../lib/math/trajectory';
import { DEFAULT_LINK, DEFAULT_TWO_LINK, energyDrift, inverseDynamics, simulateSingleLink, simulateTwoLink, inertia, gravityCoeff, parseCsv, rmsError, interpolate, type SingleLinkParams, type TwoLinkParams, type TorqueInput, type CsvTable } from '../../lib/math/dynamics';
import LinkCanvas from './LinkCanvas';

const experiment = findExperiment('dynamics')!;
type Mode = 'inverse' | 'forward' | 'twolink';
const fmt = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—');

export default function DynamicsPage() {
  const [mode, setMode] = useState<Mode>('inverse');
  const [p, setP] = useState<SingleLinkParams>(DEFAULT_LINK);
  // Mode A
  const [th0, setTh0] = useState(0);
  const [thf, setThf] = useState(90);
  const [tf, setTf] = useState(2);
  // Mode B
  const [thB, setThB] = useState(0);
  const [wB, setWB] = useState(0);
  const [inputKind, setInputKind] = useState<TorqueInput['kind']>('constant');
  const [tau, setTau] = useState(2);
  const [stepAt, setStepAt] = useState(1);
  const [tfB, setTfB] = useState(5);
  // Mode C
  const [p2, setP2] = useState<TwoLinkParams>(DEFAULT_TWO_LINK);
  const [q0, setQ0] = useState<[number, number]>([0, 20]);
  const [tfC, setTfC] = useState(10);
  // ADAMS
  const [csv, setCsv] = useState<CsvTable | null>(null);
  const [csvName, setCsvName] = useState('');
  const [cols, setCols] = useState({ t: 0, angle: 1, torque: 2 });
  const [angleUnit, setAngleUnit] = useState<'deg' | 'rad'>('deg');
  const fileRef = useRef<HTMLInputElement>(null);

  const profile = useMemo(() => cubic(deg2rad(th0), deg2rad(thf), 0, 0, tf), [th0, thf, tf]);
  const inv = useMemo(() => inverseDynamics(p, profile, 241), [p, profile]);
  const input = useMemo<TorqueInput>(() => (inputKind === 'free' ? { kind: 'free' } : inputKind === 'constant' ? { kind: 'constant', tau } : { kind: 'step', tau, at: stepAt }), [inputKind, tau, stepAt]);
  const fwd = useMemo(() => simulateSingleLink(p, deg2rad(thB), wB, input, tfB), [p, thB, wB, input, tfB]);
  const two = useMemo(() => simulateTwoLink(p2, [deg2rad(q0[0]), deg2rad(q0[1])], [0, 0], tfC), [p2, q0, tfC]);
  const twoPert = useMemo(() => simulateTwoLink(p2, [deg2rad(q0[0]) + 1e-3, deg2rad(q0[1])], [0, 0], tfC), [p2, q0, tfC]);

  const duration = mode === 'inverse' ? tf : mode === 'forward' ? tfB : tfC;
  const loop = useFixedStepLoop(() => {}, { duration });
  useEffect(() => loop.seek(0), [mode, duration, inv, fwd, two]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = Math.min(loop.time, duration);
  const at = <T extends { t: number }>(s: T[]): T => s[Math.min(s.length - 1, Math.round((t / duration) * (s.length - 1)))];

  // --- ADAMS comparison ---------------------------------------------------------
  const loadCsv = (text: string, name: string) => {
    const table = parseCsv(text);
    setCsv(table);
    setCsvName(name);
    const find = (re: RegExp, fallback: number) => Math.max(0, table.headers.findIndex((h) => re.test(h))) || fallback;
    const tCol = table.headers.findIndex((h) => /time/i.test(h));
    const aCol = table.headers.findIndex((h) => /angle|theta|rot/i.test(h));
    const qCol = table.headers.findIndex((h) => /torque/i.test(h));
    setCols({ t: tCol >= 0 ? tCol : 0, angle: aCol >= 0 ? aCol : find(/angle/i, 1), torque: qCol >= 0 ? qCol : 2 });
    setAngleUnit(table.headers[aCol >= 0 ? aCol : 1]?.toLowerCase().includes('rad') ? 'rad' : 'deg');
  };
  const loadSample = () => fetch('./adams_sample.csv').then((r) => r.text()).then((txt) => loadCsv(txt, 'adams_sample.csv'));
  const ref = useMemo(() => {
    if (!csv || csv.rows.length === 0) return null;
    const rows = [...csv.rows].sort((a, b) => a[cols.t] - b[cols.t]);
    const ts = rows.map((r) => r[cols.t]);
    const ang = rows.map((r) => (angleUnit === 'deg' ? deg2rad(r[cols.angle]) : r[cols.angle]));
    const tq = rows.map((r) => r[cols.torque]);
    return { ts, ang, tq };
  }, [csv, cols, angleUnit]);
  const computed = mode === 'forward' ? fwd : mode === 'inverse' ? inv : null;
  const rms = useMemo(() => {
    if (!ref || !computed) return null;
    return { angle: rmsError(computed.map((s) => ({ t: s.t, v: s.theta })), ref.ts, ref.ang), torque: rmsError(computed.map((s) => ({ t: s.t, v: s.tau })), ref.ts, ref.tq) };
  }, [ref, computed]);
  // ADAMS data resampled onto the computed time grid (overlap only) so both curves share one x axis
  const overlay = useMemo(() => {
    if (!ref || !computed) return { angle: [] as Record<string, number | null>[], torque: [] as Record<string, number | null>[] };
    const t0 = ref.ts[0];
    const t1 = ref.ts[ref.ts.length - 1];
    const inRange = computed.filter((s) => s.t >= t0 && s.t <= t1);
    return {
      angle: inRange.map((s) => ({ t: s.t, computed: rad2deg(s.theta), ADAMS: rad2deg(interpolate(ref.ts, ref.ang, s.t)) })),
      torque: inRange.map((s) => ({ t: s.t, computed: s.tau, ADAMS: interpolate(ref.ts, ref.tq, s.t) })),
    };
  }, [ref, computed]);

  const paramsPanel = (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">Link parameters</div>
      <div className="grid grid-cols-2 gap-2">
        <NumberInput label="Rod mass m" value={p.m} min={0.05} max={10} step={0.1} unit="kg" onChange={(v) => setP((x) => ({ ...x, m: v }))} />
        <NumberInput label="Length L" value={p.L} min={0.1} max={2} step={0.05} unit="m" onChange={(v) => setP((x) => ({ ...x, L: v }))} />
        <NumberInput label="Payload M" value={p.M} min={0} max={5} step={0.1} unit="kg" onChange={(v) => setP((x) => ({ ...x, M: v }))} />
        <NumberInput label="Friction b" value={p.b} min={0} max={2} step={0.01} unit="N·m·s" onChange={(v) => setP((x) => ({ ...x, b: v }))} />
      </div>
      <p className="mono text-xs text-muted">I = mL²/3 + ML² = {fmt(inertia(p), 4)} kg·m² · (mL/2 + ML)g = {fmt(gravityCoeff(p))} N·m</p>
    </div>
  );

  const modeTabs = (
    <div className="grid grid-cols-3 gap-1 rounded-lg bg-sidebar p-1">
      {(
        [
          ['inverse', 'A · Inverse dynamics'],
          ['forward', 'B · Forward dynamics'],
          ['twolink', 'C · Two-link arm'],
        ] as const
      ).map(([m, label]) => (
        <button key={m} type="button" onClick={() => setMode(m)} className={['rounded-md px-2 py-2 text-sm font-medium transition', mode === m ? 'bg-cobalt text-white' : 'text-ink/80 hover:bg-line'].join(' ')}>
          {label}
        </button>
      ))}
    </div>
  );

  // --- current frame for the animation -------------------------------------------
  const frameA = at(inv);
  const frameB = at(fwd);
  const frameC = at(two);
  const frameCp = at(twoPert);
  const drift = energyDrift(fwd);
  const driftTwo = energyDrift(two);

  return (
    <ExperimentPage
      experiment={experiment}
      aim={
        <p>
          To derive the equation of motion of a single-link robot arm with the Euler–Lagrange method, compute the joint torque needed to follow a
          trajectory (inverse dynamics), simulate the motion that results from a given torque (forward dynamics, RK4), extend the model to a
          two-link arm, and validate the computed response against data exported from MSC ADAMS.
        </p>
      }
      theory={
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Lagrangian of the single link</h3>
            <p>A uniform rod (mass m, length L) with a point payload M at the tip rotates about a fixed horizontal axis; θ is measured from the horizontal. Its inertia about the joint and its energies are</p>
            <Equation tex={String.raw`I = \tfrac{1}{3}mL^2 + ML^2,\qquad T = \tfrac{1}{2}I\dot{\theta}^2,\qquad V = \left(\tfrac{mL}{2} + ML\right)g\sin\theta`} />
            <Equation tex={String.raw`\frac{d}{dt}\frac{\partial \mathcal{L}}{\partial \dot{\theta}} - \frac{\partial \mathcal{L}}{\partial \theta} = \tau - b\dot{\theta}\quad\Rightarrow\quad \tau = \left(\tfrac{mL^2}{3} + ML^2\right)\ddot{\theta} + b\dot{\theta} + \left(\tfrac{mL}{2} + ML\right)g\cos\theta`} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Inverse and forward dynamics</h3>
            <p>
              Inverse dynamics evaluates this equation along a known trajectory θ(t) to get the torque the motor must supply, split into inertial,
              friction and gravity parts. Forward dynamics solves it for θ̈ and integrates in time with the 4th-order Runge–Kutta method:
            </p>
            <Equation tex={String.raw`\ddot{\theta} = \frac{\tau - b\dot{\theta} - (\tfrac{mL}{2} + ML)g\cos\theta}{I},\qquad y_{n+1} = y_n + \tfrac{h}{6}(k_1 + 2k_2 + 2k_3 + k_4)`} />
            <p>With b = 0 and τ = 0 the total energy T + V must stay constant; the drift of the simulated energy is therefore a direct check of the integrator.</p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Two-link arm</h3>
            <p>For two uniform links (centres of mass at the midpoints, I = ml²/12) the Lagrangian equations take the standard manipulator form</p>
            <Equation tex={String.raw`M(q)\ddot{q} + C(q,\dot{q})\dot{q} + G(q) = \tau`} />
            <Equation tex={String.raw`M = \begin{bmatrix} m_1 l_{c1}^2 + m_2(l_1^2 + l_{c2}^2 + 2 l_1 l_{c2}c_2) + I_1 + I_2 & m_2(l_{c2}^2 + l_1 l_{c2} c_2) + I_2 \\ m_2(l_{c2}^2 + l_1 l_{c2} c_2) + I_2 & m_2 l_{c2}^2 + I_2 \end{bmatrix},\quad C = \begin{bmatrix} h\dot{q}_2 & h(\dot{q}_1 + \dot{q}_2) \\ -h\dot{q}_1 & 0 \end{bmatrix},\ h = -m_2 l_1 l_{c2} s_2`} />
            <Equation tex={String.raw`G = \begin{bmatrix} (m_1 l_{c1} + m_2 l_1) g c_1 + m_2 l_{c2} g c_{12} \\ m_2 l_{c2} g c_{12} \end{bmatrix}`} />
            <p>Released without torque the arm is a double pendulum: deterministic, energy-conserving and chaotic — two runs that differ by 0.001 rad separate completely after a few seconds.</p>
          </div>
        </div>
      }
      simulation={
        <div className="space-y-4">
          {modeTabs}
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="card space-y-4 self-start">
              {mode !== 'twolink' && paramsPanel}
              {mode === 'inverse' && (
                <div className="space-y-2 border-t border-line pt-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted">Cubic trajectory (Exp 5)</div>
                  <Slider label="θ₀" value={th0} min={-90} max={180} step={1} unit="°" decimals={0} onChange={setTh0} />
                  <Slider label="θ_f" value={thf} min={-90} max={180} step={1} unit="°" decimals={0} onChange={setThf} />
                  <Slider label="Duration t_f" value={tf} min={0.3} max={6} step={0.1} unit="s" decimals={1} onChange={setTf} />
                </div>
              )}
              {mode === 'forward' && (
                <div className="space-y-2 border-t border-line pt-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted">Initial state and torque input</div>
                  <Slider label="θ(0)" value={thB} min={-180} max={180} step={1} unit="°" decimals={0} onChange={setThB} />
                  <Slider label="θ̇(0)" value={wB} min={-10} max={10} step={0.1} unit="rad/s" decimals={1} onChange={setWB} />
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-sidebar p-1">
                    {(
                      [
                        ['free', 'Free swing'],
                        ['constant', 'Constant τ'],
                        ['step', 'Step τ'],
                      ] as const
                    ).map(([k, label]) => (
                      <button key={k} type="button" onClick={() => setInputKind(k)} className={['rounded-md px-1 py-1 text-xs font-medium transition', inputKind === k ? 'bg-ink text-white' : 'text-ink/80 hover:bg-line'].join(' ')}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {inputKind !== 'free' && <Slider label="Torque τ" value={tau} min={-10} max={10} step={0.1} unit="N·m" decimals={1} onChange={setTau} />}
                  {inputKind === 'step' && <Slider label="Step at" value={stepAt} min={0} max={tfB} step={0.1} unit="s" decimals={1} onChange={setStepAt} />}
                  <Slider label="Simulated time" value={tfB} min={1} max={20} step={0.5} unit="s" decimals={1} onChange={setTfB} />
                  <p className="text-xs text-muted">RK4 at 240 Hz. Energy drift over the run: <span className={['mono', drift < 0.001 ? 'text-leaf' : 'text-mustardInk'].join(' ')}>{(100 * drift).toExponential(2)} %</span>{p.b > 0 || inputKind !== 'free' ? ' (energy is not conserved with friction or an applied torque)' : ''}</p>
                </div>
              )}
              {mode === 'twolink' && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted">Two-link arm (free swing)</div>
                  <div className="grid grid-cols-2 gap-2">
                    <NumberInput label="m₁" value={p2.m1} min={0.1} max={5} step={0.1} unit="kg" onChange={(v) => setP2((x) => ({ ...x, m1: v }))} />
                    <NumberInput label="m₂" value={p2.m2} min={0.1} max={5} step={0.1} unit="kg" onChange={(v) => setP2((x) => ({ ...x, m2: v }))} />
                    <NumberInput label="l₁" value={p2.l1} min={0.1} max={1.5} step={0.05} unit="m" onChange={(v) => setP2((x) => ({ ...x, l1: v }))} />
                    <NumberInput label="l₂" value={p2.l2} min={0.1} max={1.5} step={0.05} unit="m" onChange={(v) => setP2((x) => ({ ...x, l2: v }))} />
                  </div>
                  <Slider label="θ₁(0)" value={q0[0]} min={-180} max={180} step={1} unit="°" decimals={0} onChange={(v) => setQ0([v, q0[1]])} />
                  <Slider label="θ₂(0)" value={q0[1]} min={-180} max={180} step={1} unit="°" decimals={0} onChange={(v) => setQ0([q0[0], v])} />
                  <Slider label="Joint friction b" value={p2.b} min={0} max={0.5} step={0.01} decimals={2} onChange={(v) => setP2((x) => ({ ...x, b: v }))} />
                  <Slider label="Simulated time" value={tfC} min={2} max={20} step={0.5} unit="s" decimals={1} onChange={setTfC} />
                  <p className="text-xs text-muted">Energy drift: <span className={['mono', driftTwo < 0.001 ? 'text-leaf' : 'text-mustardInk'].join(' ')}>{(100 * driftTwo).toExponential(2)} %</span>. The ghost arm starts 0.001 rad away.</p>
                </div>
              )}
              <div className="border-t border-line pt-3">
                <PlaybackControls loop={loop} label="Animation" />
                <Slider label="Scrub t" value={t} min={0} max={duration} step={0.01} unit="s" decimals={2} onChange={loop.seek} />
              </div>
            </div>

            <div className="space-y-3">
              {mode === 'inverse' && <LinkCanvas links={[{ angle: frameA.theta, length: p.L, color: '#2F5FD0', payload: p.M > 0 }]} torque={frameA.tau} gravity={(p.m + p.M) * p.g} label={`t = ${t.toFixed(2)} s · θ = ${rad2deg(frameA.theta).toFixed(1)}° · τ = ${frameA.tau.toFixed(3)} N·m`} />}
              {mode === 'forward' && <LinkCanvas links={[{ angle: frameB.theta, length: p.L, color: '#2F5FD0', payload: p.M > 0 }]} torque={frameB.tau} gravity={(p.m + p.M) * p.g} label={`t = ${t.toFixed(2)} s · θ = ${rad2deg(frameB.theta).toFixed(1)}° · θ̇ = ${frameB.omega.toFixed(2)} rad/s · E = ${frameB.total.toFixed(3)} J`} />}
              {mode === 'twolink' && (
                <div className="relative">
                  <LinkCanvas links={[{ angle: frameC.q[0], length: p2.l1, color: '#2F5FD0' }, { angle: frameC.q[0] + frameC.q[1], length: p2.l2, color: '#E5533D' }]} ghostLinks={[{ angle: frameCp.q[0], length: p2.l1, color: '#2F5FD0' }, { angle: frameCp.q[0] + frameCp.q[1], length: p2.l2, color: '#E5533D' }]} torque={0} gravity={(p2.m1 + p2.m2) * p2.g} trace={two.slice(0, two.indexOf(frameC) + 1).map((s) => s.tip)} label={`t = ${t.toFixed(2)} s · θ₁ = ${rad2deg(frameC.q[0]).toFixed(1)}° · θ₂ = ${rad2deg(frameC.q[1]).toFixed(1)}° · ghost tip ${Math.hypot(frameC.tip[0] - frameCp.tip[0], frameC.tip[1] - frameCp.tip[1]).toFixed(3)} m away`} />
                </div>
              )}
              <div className="mono grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-field px-3 py-2 text-sm sm:grid-cols-4">
                {mode !== 'twolink' ? (
                  (() => {
                    const f = mode === 'inverse' ? frameA : frameB;
                    return (
                      <>
                        <div className="flex justify-between"><span className="text-muted">θ</span><span className="text-ink">{rad2deg(f.theta).toFixed(2)}°</span></div>
                        <div className="flex justify-between"><span className="text-muted">θ̇</span><span className="text-ink">{f.omega.toFixed(3)} rad/s</span></div>
                        <div className="flex justify-between"><span className="text-muted">θ̈</span><span className="text-ink">{f.alpha.toFixed(3)} rad/s²</span></div>
                        <div className="flex justify-between"><span className="text-muted">τ</span><span className="text-tomato">{f.tau.toFixed(3)} N·m</span></div>
                        <div className="flex justify-between"><span className="text-muted">I θ̈</span><span>{f.inertial.toFixed(3)}</span></div>
                        <div className="flex justify-between"><span className="text-muted">b θ̇</span><span>{f.friction.toFixed(3)}</span></div>
                        <div className="flex justify-between"><span className="text-muted">G cos θ</span><span>{f.gravity.toFixed(3)}</span></div>
                        <div className="flex justify-between"><span className="text-muted">T + V</span><span>{f.total.toFixed(3)} J</span></div>
                      </>
                    );
                  })()
                ) : (
                  <>
                    <div className="flex justify-between"><span className="text-muted">θ₁, θ₂</span><span className="text-ink">{rad2deg(frameC.q[0]).toFixed(1)}°, {rad2deg(frameC.q[1]).toFixed(1)}°</span></div>
                    <div className="flex justify-between"><span className="text-muted">θ̇₁, θ̇₂</span><span className="text-ink">{frameC.qd[0].toFixed(2)}, {frameC.qd[1].toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-muted">T</span><span>{frameC.kinetic.toFixed(3)} J</span></div>
                    <div className="flex justify-between"><span className="text-muted">T + V</span><span>{frameC.total.toFixed(3)} J</span></div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      }
      results={
        <div className="space-y-4">
          {mode === 'inverse' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card">
                <Plot title="Joint trajectory" data={inv.map((s) => ({ t: s.t, 'θ (°)': rad2deg(s.theta), 'θ̇ (rad/s)': s.omega, 'θ̈ (rad/s²)': s.alpha }))} xKey="t" xLabel="t (s)" series={[{ key: 'θ (°)', color: '#2F5FD0' }, { key: 'θ̇ (rad/s)', color: '#3F9B57' }, { key: 'θ̈ (rad/s²)', color: '#1F8A8A' }]} xMarker={t} height={260} />
              </div>
              <div className="card">
                <AreaPlot title="Required torque and its components (stacked)" data={inv.map((s) => ({ t: s.t, inertial: s.inertial, friction: s.friction, gravity: s.gravity, total: s.tau }))} xKey="t" xLabel="t (s)" yLabel="N·m" areas={[{ key: 'inertial', label: 'I θ̈', color: '#1F8A8A' }, { key: 'friction', label: 'b θ̇', color: '#3F9B57' }, { key: 'gravity', label: 'G cos θ', color: '#2F5FD0' }]} lines={[{ key: 'total', label: 'τ total', color: '#E5533D' }]} xMarker={t} height={260} />
                <p className="mt-1 text-xs text-muted">Peak torque {fmt(Math.max(...inv.map((s) => Math.abs(s.tau))))} N·m · gravity dominates at low speed, inertia at the ends of a fast move.</p>
              </div>
            </div>
          )}
          {mode === 'forward' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card">
                <Plot title="θ, θ̇, θ̈" data={fwd.map((s) => ({ t: s.t, 'θ (°)': rad2deg(s.theta), 'θ̇ (rad/s)': s.omega, 'θ̈ (rad/s²)': s.alpha }))} xKey="t" xLabel="t (s)" series={[{ key: 'θ (°)', color: '#2F5FD0' }, { key: 'θ̇ (rad/s)', color: '#3F9B57' }, { key: 'θ̈ (rad/s²)', color: '#1F8A8A' }]} xMarker={t} height={260} />
              </div>
              <div className="card">
                <Plot title={`Energy (drift ${(100 * drift).toExponential(1)} %)`} data={fwd.map((s) => ({ t: s.t, kinetic: s.kinetic, potential: s.potential, total: s.total }))} xKey="t" xLabel="t (s)" yLabel="J" series={[{ key: 'kinetic', color: '#3F9B57' }, { key: 'potential', color: '#2F5FD0' }, { key: 'total', color: '#1C1B19' }]} xMarker={t} height={260} />
              </div>
            </div>
          )}
          {mode === 'twolink' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card">
                <Plot title="Joint angles — solid: nominal, dashed: perturbed by 0.001 rad" data={two.map((s, i) => ({ t: s.t, 'θ₁': rad2deg(s.q[0]), 'θ₂': rad2deg(s.q[1]), 'θ₁ (perturbed)': rad2deg(twoPert[i]?.q[0] ?? NaN), 'θ₂ (perturbed)': rad2deg(twoPert[i]?.q[1] ?? NaN) }))} xKey="t" xLabel="t (s)" yLabel="°" series={[{ key: 'θ₁', color: '#2F5FD0' }, { key: 'θ₂', color: '#E5533D' }, { key: 'θ₁ (perturbed)', color: '#2F5FD0', dashed: true }, { key: 'θ₂ (perturbed)', color: '#E5533D', dashed: true }]} xMarker={t} height={280} />
              </div>
              <div className="card">
                <Plot title={`Energy (drift ${(100 * driftTwo).toExponential(1)} %)`} data={two.map((s) => ({ t: s.t, kinetic: s.kinetic, potential: s.potential, total: s.total }))} xKey="t" xLabel="t (s)" yLabel="J" series={[{ key: 'kinetic', color: '#3F9B57' }, { key: 'potential', color: '#2F5FD0' }, { key: 'total', color: '#1C1B19' }]} xMarker={t} height={280} />
              </div>
            </div>
          )}

          <div className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-ink">ADAMS validation</h3>
                <p className="text-xs text-muted">Upload a CSV exported from MSC ADAMS (time, joint angle, joint torque), pick the columns, and compare it with the curves of mode A or B.</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="btn" onClick={loadSample}>Load sample CSV</button>
                <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Upload CSV</button>
                <a className="btn" href="./adams_sample.csv" download>Download sample</a>
                <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then((txt) => loadCsv(txt, f.name)); e.target.value = ''; }} />
              </div>
            </div>
            {csv && ref ? (
              <>
                <div className="grid gap-2 sm:grid-cols-4">
                  {(['t', 'angle', 'torque'] as const).map((k) => (
                    <label key={k} className="text-xs text-muted">
                      {k === 't' ? 'time column' : `${k} column`}
                      <select value={cols[k]} onChange={(e) => setCols((c) => ({ ...c, [k]: Number(e.target.value) }))} className="mt-1 w-full rounded-md border border-line bg-field px-2 py-1 text-sm text-ink">
                        {csv.headers.map((h, i) => (
                          <option key={i} value={i}>{h}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <label className="text-xs text-muted">
                    angle unit
                    <select value={angleUnit} onChange={(e) => setAngleUnit(e.target.value as 'deg' | 'rad')} className="mt-1 w-full rounded-md border border-line bg-field px-2 py-1 text-sm text-ink">
                      <option value="deg">degrees</option>
                      <option value="rad">radians</option>
                    </select>
                  </label>
                </div>
                <p className="mono text-xs text-muted">{csvName}: {csv.rows.length} rows, {ref.ts[0].toFixed(2)}–{ref.ts[ref.ts.length - 1].toFixed(2)} s</p>
                {computed && rms ? (
                  <>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <Plot title={`Joint angle: computed (mode ${mode === 'inverse' ? 'A' : 'B'}) vs ADAMS`} data={overlay.angle} xKey="t" xLabel="t (s)" yLabel="°" series={[{ key: 'computed', color: '#2F5FD0' }, { key: 'ADAMS', color: '#F2B33D', dashed: true }]} height={240} decimals={2} />
                      </div>
                      <div>
                        <Plot title="Joint torque: computed vs ADAMS" data={overlay.torque} xKey="t" xLabel="t (s)" yLabel="N·m" series={[{ key: 'computed', color: '#E5533D' }, { key: 'ADAMS', color: '#F2B33D', dashed: true }]} height={240} decimals={3} />
                      </div>
                    </div>
                    <div className="mono grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                      <div className="flex justify-between border-b border-line py-1"><span className="text-muted">RMS angle error</span><span className={rms.angle.rms < deg2rad(1) ? 'text-leaf' : 'text-mustardInk'}>{fmt(rad2deg(rms.angle.rms), 3)}°</span></div>
                      <div className="flex justify-between border-b border-line py-1"><span className="text-muted">RMS torque error</span><span className={rms.torque.rms < 0.05 ? 'text-leaf' : 'text-mustardInk'}>{fmt(rms.torque.rms, 4)} N·m</span></div>
                      <div className="flex justify-between border-b border-line py-1"><span className="text-muted">compared samples</span><span className="text-ink">{rms.angle.n}</span></div>
                      <div className="flex justify-between border-b border-line py-1"><span className="text-muted">overlap</span><span className="text-ink">{Math.min(duration, ref.ts[ref.ts.length - 1]).toFixed(2)} s</span></div>
                    </div>
                    <p className="text-xs text-muted">The sample file was produced for the default link with a constant 2 N·m joint torque from rest at the horizontal (mode B defaults). Change a parameter and watch the RMS error grow.</p>
                  </>
                ) : (
                  <p className="text-sm text-mustardInk">Switch to mode A or B to compare the uploaded data with the single-link model.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">No data loaded. Expected columns: time (s), joint angle (deg or rad), joint torque (N·m); a header row is recognised automatically.</p>
            )}
          </div>
        </div>
      }
      conclusion={
        <div className="space-y-2">
          <p>
            The Euler–Lagrange formulation gives the single-link equation of motion in one line, and the two uses of that equation are
            complementary: inverse dynamics tells the motor what torque a trajectory needs (gravity dominates slow moves, inertia dominates fast
            ones), forward dynamics predicts the motion a torque produces. RK4 integration keeps the total energy constant to better than 0.1 %
            over 10 s when there is no friction, which validates the simulator.
          </p>
          <p>
            Adding a second link turns the model into the standard M(q)q̈ + C(q,q̇)q̇ + G(q) = τ form of manipulator dynamics; released freely it
            is a chaotic double pendulum whose runs diverge from a 0.001 rad difference while still conserving energy. Overlaying data exported from
            ADAMS on the computed curves and reporting the RMS error turns the simulation into a verified model rather than a drawing.
          </p>
        </div>
      }
    />
  );
}
