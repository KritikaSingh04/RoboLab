import { useEffect, useMemo, useState } from 'react';
import ExperimentPage, { SimulationLayout } from '../../components/ExperimentPage';
import Equation from '../../components/Equation';
import NumberInput from '../../components/NumberInput';
import Slider from '../../components/Slider';
import Plot from '../../components/Plot';
import PlaybackControls from '../../components/PlaybackControls';
import { useFixedStepLoop } from '../../components/useFixedStepLoop';
import { findExperiment } from '../registry';
import { deg2rad, rad2deg } from '../../lib/math/matrix';
import { BRANCHES, type Branch } from '../../lib/math/planar';
import {
  METHODS,
  METHOD_LABEL,
  makeProfile,
  profileStats,
  sampleJointSpace,
  sampleCartesianLine,
  twoLinkFK,
  twoLinkIK,
  jointsAt,
  type Method,
  type Profile,
  type TwoLink,
} from '../../lib/math/trajectory';
import ArmCanvas from './ArmCanvas';

const experiment = findExperiment('trajectory')!;
const N = 241;
type Pick = 'none' | 'start' | 'end';
const BRANCH_LABEL: Record<Branch, string> = { up: 'Elbow-up', down: 'Elbow-down' };
const fmt = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d).replace(/^-(0\.?0*)$/, '$1') : '—');

export default function TrajectoryPage() {
  const [links, setLinks] = useState<TwoLink>({ l1: 1.0, l2: 0.8 });
  const [qStart, setQStart] = useState<[number, number]>([deg2rad(120), deg2rad(-100)]);
  const [qEnd, setQEnd] = useState<[number, number]>([deg2rad(20), deg2rad(-60)]);
  const [method, setMethod] = useState<Method>('cubic');
  const [tf, setTf] = useState(2);
  const [v0, setV0] = useState(0);
  const [vf, setVf] = useState(0);
  const [acc0, setAcc0] = useState(0);
  const [accf, setAccf] = useState(0);
  const [vmax, setVmax] = useState(90);
  const [branch, setBranch] = useState<Branch>('up');
  const [pick, setPick] = useState<Pick>('none');

  // --- Profiles -------------------------------------------------------------
  const params = useMemo(() => ({ v0: deg2rad(v0), vf: deg2rad(vf), acc0: deg2rad(acc0), accf: deg2rad(accf), vmax: deg2rad(vmax) }), [v0, vf, acc0, accf, vmax]);
  const profiles = useMemo<[Profile, Profile]>(() => [makeProfile(method, qStart[0], qEnd[0], tf, params), makeProfile(method, qStart[1], qEnd[1], tf, params)], [method, qStart, qEnd, tf, params]);
  const jointSamples = useMemo(() => sampleJointSpace(links, profiles, N), [links, profiles]);

  const pStart = useMemo(() => twoLinkFK(links, qStart).tip, [links, qStart]);
  const pEnd = useMemo(() => twoLinkFK(links, qEnd).tip, [links, qEnd]);
  // Cartesian time-scaling s(t) ∈ [0, 1] with the same method. For LSPB keep the
  // same cruise-velocity ratio k = V / (|Δ|/tf) as the larger joint move.
  const scaling = useMemo(() => {
    if (method !== 'lspb') return makeProfile(method, 0, 1, tf, { v0: 0, vf: 0, acc0: 0, accf: 0 });
    const j = Math.abs(qEnd[0] - qStart[0]) >= Math.abs(qEnd[1] - qStart[1]) ? 0 : 1;
    const d = Math.abs(qEnd[j] - qStart[j]);
    const V = Math.abs(profiles[j].coeffs.find((c) => c.name === 'V')?.value ?? 0);
    const k = d > 1e-9 ? V / (d / tf) : 1.5;
    return makeProfile('lspb', 0, 1, tf, { vmax: Math.min(2, Math.max(1.05, k)) / tf });
  }, [method, tf, qStart, qEnd, profiles]);
  const cartSamples = useMemo(() => sampleCartesianLine(links, pStart, pEnd, scaling, branch, N), [links, pStart, pEnd, scaling, branch]);
  const cartUnreachable = cartSamples.filter((s) => !s.reachable).length;

  // --- Playback -------------------------------------------------------------
  const loop = useFixedStepLoop(() => {}, { duration: tf });
  useEffect(() => loop.seek(0), [tf, method, qStart, qEnd, links]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = Math.min(loop.time, tf);
  const qJoint = useMemo<[number, number]>(() => [profiles[0].q(t), profiles[1].q(t)], [profiles, t]);
  const qCart = useMemo(() => jointsAt(cartSamples, t), [cartSamples, t]);

  // --- Picking start / end in the workspace --------------------------------
  const onPick = pick === 'none'
    ? undefined
    : (x: number, y: number) => {
        const q = twoLinkIK(links, x, y, branch);
        if (!q) return;
        if (pick === 'start') setQStart(q);
        else setQEnd(q);
        setPick('none');
      };

  // --- Plot data --------------------------------------------------------------
  const plotData = useMemo(() => {
    const toDeg = (v: number) => (Number.isFinite(v) ? rad2deg(v) : null);
    return jointSamples.map((s, i) => {
      const c = cartSamples[i];
      return {
        t: s.t,
        pos: { t: s.t, 'θ1 joint': toDeg(s.q[0]), 'θ2 joint': toDeg(s.q[1]), 'θ1 Cartesian': toDeg(c.q[0]), 'θ2 Cartesian': toDeg(c.q[1]) },
        vel: { t: s.t, 'θ1 joint': toDeg(s.qd[0]), 'θ2 joint': toDeg(s.qd[1]), 'θ1 Cartesian': toDeg(c.qd[0]), 'θ2 Cartesian': toDeg(c.qd[1]) },
        acc: { t: s.t, 'θ1 joint': toDeg(s.qdd[0]), 'θ2 joint': toDeg(s.qdd[1]), 'θ1 Cartesian': toDeg(c.qdd[0]), 'θ2 Cartesian': toDeg(c.qdd[1]) },
      };
    });
  }, [jointSamples, cartSamples]);
  const series = [
    { key: 'θ1 joint', color: '#2F5FD0' },
    { key: 'θ2 joint', color: '#E5533D' },
    { key: 'θ1 Cartesian', color: '#2F5FD0', dashed: true },
    { key: 'θ2 Cartesian', color: '#E5533D', dashed: true },
  ];

  // --- Comparison across methods ---------------------------------------------
  const comparison = useMemo(
    () =>
      METHODS.map((m) => {
        const stats = [0, 1].map((j) => profileStats(makeProfile(m, qStart[j], qEnd[j], tf, params)));
        return {
          method: m,
          vMax: Math.max(stats[0].vMax, stats[1].vMax),
          aMax: Math.max(stats[0].aMax, stats[1].aMax),
          aRms: Math.max(stats[0].aRms, stats[1].aRms),
          continuity: stats[0].continuity,
        };
      }),
    [qStart, qEnd, tf, params],
  );

  const controls = (
    <>
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Start and end (joint space)</div>
        <Slider label="θ1 start" color="#2F5FD0" value={rad2deg(qStart[0])} min={-180} max={180} step={1} unit="°" decimals={1} onChange={(d) => setQStart([deg2rad(d), qStart[1]])} />
        <Slider label="θ2 start" color="#E5533D" value={rad2deg(qStart[1])} min={-180} max={180} step={1} unit="°" decimals={1} onChange={(d) => setQStart([qStart[0], deg2rad(d)])} />
        <Slider label="θ1 end" color="#2F5FD0" value={rad2deg(qEnd[0])} min={-180} max={180} step={1} unit="°" decimals={1} onChange={(d) => setQEnd([deg2rad(d), qEnd[1]])} />
        <Slider label="θ2 end" color="#E5533D" value={rad2deg(qEnd[1])} min={-180} max={180} step={1} unit="°" decimals={1} onChange={(d) => setQEnd([qEnd[0], deg2rad(d)])} />
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={['btn', pick === 'start' ? 'btn-primary' : ''].join(' ')} onClick={() => setPick(pick === 'start' ? 'none' : 'start')}>
            Click start point
          </button>
          <button type="button" className={['btn', pick === 'end' ? 'btn-primary' : ''].join(' ')} onClick={() => setPick(pick === 'end' ? 'none' : 'end')}>
            Click end point
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-sidebar p-1">
          {BRANCHES.map((b) => (
            <button key={b} type="button" onClick={() => setBranch(b)} className={['rounded-md px-2 py-1 text-xs font-medium transition', branch === b ? 'bg-cobalt text-white' : 'text-ink/80 hover:bg-line'].join(' ')}>
              IK: {BRANCH_LABEL[b]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 border-t border-line pt-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Time scaling</div>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-sidebar p-1">
          {METHODS.map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)} className={['rounded-md px-2 py-1.5 text-sm font-medium capitalize transition', method === m ? 'bg-ink text-white' : 'text-ink/80 hover:bg-line'].join(' ')}>
              {m === 'lspb' ? 'LSPB' : m}
            </button>
          ))}
        </div>
        <Slider label="Duration tf" value={tf} min={0.5} max={10} step={0.1} unit="s" decimals={1} onChange={setTf} />
        {method !== 'lspb' && (
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="v₀" value={v0} unit="°/s" step={5} onChange={setV0} />
            <NumberInput label="v_f" value={vf} unit="°/s" step={5} onChange={setVf} />
          </div>
        )}
        {method === 'quintic' && (
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="α₀" value={acc0} unit="°/s²" step={10} onChange={setAcc0} />
            <NumberInput label="α_f" value={accf} unit="°/s²" step={10} onChange={setAccf} />
          </div>
        )}
        {method === 'lspb' && <Slider label="Cruise velocity V" value={vmax} min={5} max={360} step={1} unit="°/s" decimals={0} onChange={setVmax} />}
        {profiles.some((p) => p.lspb?.clamped) && (
          <ul className="space-y-1 text-xs text-mustardInk">
            {profiles.map(
              (p, j) =>
                p.lspb?.clamped && (
                  <li key={j}>
                    θ{j + 1}: feasible V is {fmt(rad2deg(p.lspb.vMin), 1)} to {fmt(rad2deg(p.lspb.vMax), 1)} °/s, so V was {p.lspb.clamped} to{' '}
                    {fmt(rad2deg(Math.abs(p.coeffs[0].value)), 1)} °/s{p.lspb.clamped === 'lowered' ? ' (triangular profile)' : ''}.
                  </li>
                ),
            )}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-line pt-3">
        <PlaybackControls loop={loop} label="Animation" />
        <Slider label="Scrub t" value={t} min={0} max={tf} step={0.01} unit="s" decimals={2} onChange={loop.seek} />
      </div>

      <div className="space-y-2 border-t border-line pt-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Link lengths</div>
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label="L1" value={links.l1} min={0.05} max={3} step={0.05} unit="m" onChange={(v) => setLinks((l) => ({ ...l, l1: v }))} />
          <NumberInput label="L2" value={links.l2} min={0.05} max={3} step={0.05} unit="m" onChange={(v) => setLinks((l) => ({ ...l, l2: v }))} />
        </div>
      </div>
    </>
  );

  return (
    <ExperimentPage
      experiment={experiment}
      aim={
        <p>
          To plan smooth joint-space trajectories between two configurations of a two-link planar arm using cubic, quintic and
          linear-segment-with-parabolic-blend (LSPB) time scaling, and to compare the resulting motion with a Cartesian straight-line path
          followed through inverse kinematics.
        </p>
      }
      theory={
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Why time scaling?</h3>
            <p>
              A trajectory is a path with a time law. Jumping directly from q₀ to q_f would need infinite velocity, so each joint follows a
              smooth function q(t) on [0, t_f] whose boundary values match the required position, velocity (and possibly acceleration).
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Cubic polynomial (4 constraints)</h3>
            <Equation tex={String.raw`q(t) = a_0 + a_1 t + a_2 t^2 + a_3 t^3,\qquad \Delta = q_f - q_0`} />
            <Equation tex={String.raw`a_0 = q_0,\quad a_1 = v_0,\quad a_2 = \frac{3\Delta - (2v_0 + v_f)t_f}{t_f^2},\quad a_3 = \frac{-2\Delta + (v_0 + v_f)t_f}{t_f^3}`} />
            <p>
              For a rest-to-rest move the peak velocity is 1.5Δ/t_f at the midpoint and the acceleration jumps to ±6Δ/t_f² at the ends: the
              cubic is only C¹.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Quintic polynomial (6 constraints)</h3>
            <Equation tex={String.raw`q(t) = \sum_{k=0}^{5} a_k t^k,\qquad a_0 = q_0,\quad a_1 = v_0,\quad a_2 = \tfrac{1}{2}\alpha_0`} />
            <Equation tex={String.raw`a_3 = \frac{20\Delta - (8v_f + 12v_0)t_f - (3\alpha_0 - \alpha_f)t_f^2}{2t_f^3},\quad a_4 = \frac{-30\Delta + (14v_f + 16v_0)t_f + (3\alpha_0 - 2\alpha_f)t_f^2}{2t_f^4},\quad a_5 = \frac{12\Delta - 6(v_f + v_0)t_f - (\alpha_0 - \alpha_f)t_f^2}{2t_f^5}`} />
            <p>Adding the acceleration constraints makes q(t) C²; the rest-to-rest profile is 10τ³ − 15τ⁴ + 6τ⁵ with τ = t/t_f.</p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">LSPB / trapezoidal velocity</h3>
            <p>
              Accelerate at constant α for a blend time t_b, cruise at V, decelerate symmetrically. Choosing V fixes the blend time; the
              profile is feasible only for Δ/t_f &lt; V ≤ 2Δ/t_f (the upper limit is the triangular profile).
            </p>
            <Equation tex={String.raw`t_b = \frac{V t_f - \Delta}{V},\qquad \alpha = \frac{V}{t_b}`} />
            <Equation tex={String.raw`q(t) = \begin{cases} q_0 + \tfrac{1}{2}\alpha t^2 & 0 \le t \le t_b \\[4pt] q_0 + \tfrac{1}{2}\alpha t_b^2 + V(t - t_b) & t_b < t \le t_f - t_b \\[4pt] q_f - \tfrac{1}{2}\alpha (t_f - t)^2 & t_f - t_b < t \le t_f \end{cases}`} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Joint space versus Cartesian space</h3>
            <p>
              Interpolating the joint angles gives smooth joint motion but a curved tip path. Interpolating the tip along a straight line with the
              same time law s(t) ∈ [0, 1] and solving the inverse kinematics at every instant gives a straight path, but the joint velocities and
              accelerations are no longer polynomial and can grow large near the workspace boundary or singularities.
            </p>
            <Equation tex={String.raw`\mathbf{p}(t) = \mathbf{p}_0 + s(t)\,(\mathbf{p}_f - \mathbf{p}_0),\qquad \mathbf{q}(t) = \mathrm{IK}\big(\mathbf{p}(t)\big)`} />
          </div>
        </div>
      }
      simulation={
        <SimulationLayout controls={controls}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>
                <span className="mr-3"><span className="mr-1 inline-block h-2 w-3 bg-link1" />link 1</span>
                <span className="mr-3"><span className="mr-1 inline-block h-2 w-3 bg-link2" />link 2</span>
                <span className="mr-3"><span className="mr-1 inline-block h-2 w-3 bg-ee" />tip</span>
                <span className="mr-3"><span className="mr-1 inline-block h-2 w-3" style={{ background: '#1F8A8A' }} />joint-space path</span>
                <span><span className="mr-1 inline-block h-2 w-3" style={{ background: '#F2B33D' }} />Cartesian path</span>
              </span>
              <span className="mono">t = {t.toFixed(3)} s / {tf.toFixed(1)} s · {METHOD_LABEL[method]}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <ArmCanvas title="(a) Joint-space interpolation" links={links} samples={jointSamples} q={qJoint} t={t} pathColor="#1F8A8A" start={pStart} end={pEnd} onPick={onPick} pickLabel={pick !== 'none' ? `click to set the ${pick} point (${BRANCH_LABEL[branch]})` : undefined} />
              <ArmCanvas title="(b) Cartesian straight line + IK" links={links} samples={cartSamples} q={qCart} t={t} pathColor="#F2B33D" start={pStart} end={pEnd} onPick={onPick} pickLabel={pick !== 'none' ? `click to set the ${pick} point (${BRANCH_LABEL[branch]})` : undefined} />
            </div>
            {cartUnreachable > 0 && (
              <p className="text-sm text-tomato">
                The straight line leaves the workspace for {cartUnreachable} of {N} samples (shown in red): the Cartesian trajectory cannot be executed
                in full. The joint-space trajectory is always feasible.
              </p>
            )}
          </div>
        </SimulationLayout>
      }
      results={
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            {(
              [
                ['Position', 'angle (°)', 'pos'],
                ['Velocity', 'angular velocity (°/s)', 'vel'],
                ['Acceleration', 'angular acceleration (°/s²)', 'acc'],
              ] as const
            ).map(([title, yLabel, key]) => (
              <div key={key} className="card">
                <Plot title={`${title} vs time`} data={plotData.map((d) => d[key])} xKey="t" xLabel="t (s)" yLabel={yLabel} series={series} xMarker={t} height={260} decimals={2} />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">Solid: joint-space profiles (analytic). Dashed: joint angles needed for the Cartesian straight line (IK, derivatives by finite differences). The vertical marker follows the animation.</p>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card">
              <h3 className="mb-2 font-semibold text-ink">{METHOD_LABEL[method]}: coefficients</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-1 font-medium">Coefficient</th>
                    <th className="py-1 text-right font-medium">Joint 1 (rad, s)</th>
                    <th className="py-1 text-right font-medium">Joint 2 (rad, s)</th>
                    <th className="py-1 text-right font-medium">Cartesian s(t)</th>
                  </tr>
                </thead>
                <tbody className="mono">
                  {profiles[0].coeffs.map((c, i) => (
                    <tr key={c.name} className="border-t border-line">
                      <td className="py-1 font-sans text-ink/80">{c.name}</td>
                      <td className="py-1 text-right text-ink">{fmt(c.value, 4)}</td>
                      <td className="py-1 text-right text-ink">{fmt(profiles[1].coeffs[i]?.value ?? NaN, 4)}</td>
                      <td className="py-1 text-right text-muted">{fmt(scaling.coeffs[i]?.value ?? NaN, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted">
                Δ₁ = {fmt(rad2deg(qEnd[0] - qStart[0]), 2)}°, Δ₂ = {fmt(rad2deg(qEnd[1] - qStart[1]), 2)}°, t_f = {tf.toFixed(2)} s. Tip moves from ({fmt(pStart[0])}, {fmt(pStart[1])}) to ({fmt(pEnd[0])}, {fmt(pEnd[1])}) m.
              </p>
            </div>

            <div className="card">
              <h3 className="mb-2 font-semibold text-ink">Method comparison (same move, worst joint)</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-1 font-medium">Method</th>
                    <th className="py-1 text-right font-medium">max |q̇| (°/s)</th>
                    <th className="py-1 text-right font-medium">max |q̈| (°/s²)</th>
                    <th className="py-1 text-right font-medium">RMS q̈ (°/s²)</th>
                    <th className="py-1 font-medium">Smoothness</th>
                  </tr>
                </thead>
                <tbody className="mono">
                  {comparison.map((c) => (
                    <tr key={c.method} className={['border-t border-line', c.method === method ? 'text-ink' : 'text-muted'].join(' ')}>
                      <td className="py-1 font-sans capitalize">{c.method === 'lspb' ? 'LSPB' : c.method}</td>
                      <td className="py-1 text-right">{fmt(rad2deg(c.vMax), 2)}</td>
                      <td className="py-1 text-right">{fmt(rad2deg(c.aMax), 2)}</td>
                      <td className="py-1 text-right">{fmt(rad2deg(c.aRms), 2)}</td>
                      <td className="py-1 font-sans text-xs">{c.continuity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted">LSPB uses the cruise velocity set above (clamped into its feasible range). The quintic trades a higher peak velocity for continuous acceleration.</p>
            </div>
          </div>
        </div>
      }
      conclusion={
        <div className="space-y-2">
          <p>
            All three time-scaling laws reach the goal in the same t_f, but they differ in smoothness: the cubic has an acceleration jump at the
            ends, the quintic is C² throughout, and LSPB keeps the acceleration bounded by ±α at the cost of jumps at the blend points. The
            comparison table makes the trade-off between peak velocity and peak acceleration explicit.
          </p>
          <p>
            Joint-space interpolation always stays inside the workspace and gives polynomial joint motion, but the tip follows a curve. A
            Cartesian straight line produces the path the task may require, but the joint angles must be obtained from IK at every instant and
            may demand much larger joint rates, or become infeasible when the line leaves the reachable annulus.
          </p>
        </div>
      }
    />
  );
}
