import { useCallback, useMemo, useRef, useState } from 'react';
import ExperimentPage, { SimulationLayout } from '../../components/ExperimentPage';
import Equation from '../../components/Equation';
import NumberInput from '../../components/NumberInput';
import Slider from '../../components/Slider';
import Toggle from '../../components/Toggle';
import Plot from '../../components/Plot';
import PlaybackControls from '../../components/PlaybackControls';
import { useFixedStepLoop } from '../../components/useFixedStepLoop';
import { findExperiment } from '../registry';
import { deg2rad, rad2deg } from '../../lib/math/matrix';
import { wrapAngle } from '../../lib/math/kinematics';
import { planarIK, resamplePath, samplePath, maxReach, BRANCHES, type Branch, type PlanarLinks, type PlanarPose, type PathPoint } from '../../lib/math/planar';
import IkCanvas, { type CanvasMode } from './IkCanvas';
import WorkingPanel from './WorkingPanel';

const experiment = findExperiment('ik3dof')!;
const DEFAULT_LINKS: PlanarLinks = { l1: 1.0, l2: 0.8, l3: 0.4 };
const DEFAULT_POSE: PlanarPose = { x: 1.2, y: 0.8, phi: deg2rad(30) };
const BRANCH_LABEL: Record<Branch, string> = { up: 'Elbow-up', down: 'Elbow-down' };

interface Sample {
  t: number;
  θ1: number;
  θ2: number;
  θ3: number;
}

export default function Ik3DofPage() {
  const [links, setLinks] = useState<PlanarLinks>(DEFAULT_LINKS);
  const [pose, setPose] = useState<PlanarPose>(DEFAULT_POSE);
  const [active, setActive] = useState<Branch>('up');
  const [showGhost, setShowGhost] = useState(true);
  const [mode, setMode] = useState<CanvasMode>('target');
  const [drawing, setDrawing] = useState<{ x: number; y: number }[]>([]);
  const [path, setPath] = useState<PathPoint[]>([]);
  const [speed, setSpeed] = useState(0.5);
  const [phiFromTangent, setPhiFromTangent] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const samplesRef = useRef<Sample[]>([]);

  const ik = useMemo(() => planarIK(links, pose), [links, pose]);
  const reach = maxReach(links);
  const activeSol = ik.solutions[active];

  const setTarget = useCallback((x: number, y: number) => setPose((p) => ({ ...p, x, y })), []);

  // --- Path drawing -------------------------------------------------------
  const onDrawStart = useCallback((x: number, y: number) => {
    setPath([]);
    setProgress(null);
    samplesRef.current = [];
    setDrawing([{ x, y }]);
  }, []);
  const onDrawMove = useCallback((x: number, y: number) => {
    setDrawing((d) => {
      const last = d[d.length - 1];
      if (last && Math.hypot(last.x - x, last.y - y) < 0.005) return d;
      return [...d, { x, y }];
    });
  }, []);
  const onDrawEnd = useCallback(() => {
    setDrawing((d) => {
      if (d.length > 1) setPath(resamplePath(d, 0.01));
      return d;
    });
  }, []);

  // --- Path following (fixed 120 Hz step) ----------------------------------
  const loop = useFixedStepLoop(
    (dt, t) => {
      const s = speed * (t + dt);
      const pt = samplePath(path, s);
      if (!pt) {
        loop.pause();
        return;
      }
      const phi = phiFromTangent ? pt.tangent : pose.phi;
      const target = { x: pt.x, y: pt.y, phi };
      setPose(target);
      setProgress(s);
      const sol = planarIK(links, target).solutions[active];
      samplesRef.current.push({ t: t + dt, θ1: sol ? rad2deg(sol.q[0]) : NaN, θ2: sol ? rad2deg(sol.q[1]) : NaN, θ3: sol ? rad2deg(sol.q[2]) : NaN });
    },
    {
      onReset: () => {
        setProgress(null);
        samplesRef.current = [];
        if (path.length) setPose((p) => ({ ...p, x: path[0].x, y: path[0].y }));
      },
    },
  );

  // Decimate the recorded joint angles for the plot (≤ 600 points).
  const plotData = useMemo(() => {
    const s = samplesRef.current;
    const stride = Math.max(1, Math.ceil(s.length / 600));
    return s.filter((_, i) => i % stride === 0 || i === s.length - 1).map((r) => ({ t: r.t, θ1: r.θ1, θ2: r.θ2, θ3: r.θ3 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop.time, progress]);

  const clearPath = () => {
    loop.reset();
    setDrawing([]);
    setPath([]);
    setProgress(null);
    samplesRef.current = [];
  };

  const controls = (
    <>
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Target pose</div>
        <Slider label="x" value={pose.x} min={-reach} max={reach} step={0.005} unit="m" onChange={(x) => setPose((p) => ({ ...p, x }))} />
        <Slider label="y" value={pose.y} min={-reach} max={reach} step={0.005} unit="m" onChange={(y) => setPose((p) => ({ ...p, y }))} />
        <Slider label="φ (orientation)" value={rad2deg(pose.phi)} min={-180} max={180} step={0.5} unit="°" decimals={1} onChange={(d) => setPose((p) => ({ ...p, phi: deg2rad(d) }))} />
      </div>

      <div className="space-y-2 border-t border-line pt-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Active solution</div>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-sidebar p-1">
          {BRANCHES.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setActive(b)}
              className={['rounded-md px-2 py-1.5 text-sm font-medium transition', active === b ? 'bg-cobalt text-white' : 'text-ink/80 hover:bg-line'].join(' ')}
            >
              {BRANCH_LABEL[b]}
            </button>
          ))}
        </div>
        <Toggle label="Show other solution (ghost)" checked={showGhost} onChange={setShowGhost} />
      </div>

      <div className="space-y-2 border-t border-line pt-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Link lengths</div>
        <div className="grid grid-cols-3 gap-2">
          {(['l1', 'l2', 'l3'] as const).map((k, i) => (
            <NumberInput key={k} label={`L${i + 1}`} value={links[k]} min={0.05} max={3} step={0.05} unit="m" onChange={(v) => setLinks((l) => ({ ...l, [k]: v }))} />
          ))}
        </div>
      </div>

      <div className="space-y-2 border-t border-line pt-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Mouse mode</div>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-sidebar p-1">
          {(
            [
              ['target', 'Move target'],
              ['draw', 'Draw a path'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={['rounded-md px-2 py-1.5 text-sm font-medium transition', mode === m ? 'bg-ink text-white' : 'text-ink/80 hover:bg-line'].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === 'draw' && (
          <div className="space-y-3 pt-1">
            <p className="text-xs text-muted">
              {path.length > 1 ? `Path: ${path[path.length - 1].s.toFixed(3)} m, ${path.length} samples. Press Play to follow it.` : 'Drag on the canvas to draw a curve.'}
            </p>
            <Slider label="Tool speed" value={speed} min={0.1} max={2} step={0.05} unit="m/s" decimals={2} onChange={setSpeed} />
            <Toggle label="φ follows the path tangent" checked={phiFromTangent} onChange={setPhiFromTangent} />
            <PlaybackControls loop={loop} />
            <button type="button" className="btn" onClick={clearPath} disabled={drawing.length === 0}>
              Clear path
            </button>
          </div>
        )}
      </div>
    </>
  );

  const fmtDeg = (v: number) => `${rad2deg(v).toFixed(3)}°`;

  return (
    <ExperimentPage
      experiment={experiment}
      aim={
        <p>
          To solve the inverse kinematics of a three-link planar (RRR) manipulator analytically: given a desired end-effector position and
          orientation (x, y, φ), find the joint angles θ₁, θ₂, θ₃ for both elbow configurations and verify the solution by forward kinematics.
        </p>
      }
      theory={
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Forward kinematics</h3>
            <p>With link lengths L₁, L₂, L₃ and joint angles θ₁, θ₂, θ₃ measured counter-clockwise, the tip position and orientation are</p>
            <Equation tex={String.raw`x = L_1 c_1 + L_2 c_{12} + L_3 c_{123},\qquad y = L_1 s_1 + L_2 s_{12} + L_3 s_{123},\qquad \varphi = \theta_1 + \theta_2 + \theta_3`} />
            <p>
              where c₁₂ = cos(θ₁ + θ₂) and so on. Three joints and three task variables mean the problem is square: a finite number of solutions
              exist (two here), rather than a continuum.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Decoupling the wrist</h3>
            <p>Because φ is given, the wrist (joint 3) position follows directly by stepping back one link from the tip:</p>
            <Equation tex={String.raw`x_w = x - L_3\cos\varphi,\qquad y_w = y - L_3\sin\varphi`} />
            <p>What remains is the classic two-link problem of placing the wrist with links L₁ and L₂.</p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Elbow angle from the law of cosines</h3>
            <Equation tex={String.raw`x_w^2 + y_w^2 = L_1^2 + L_2^2 + 2L_1L_2\cos\theta_2 \;\Rightarrow\; c_2 = \frac{x_w^2 + y_w^2 - L_1^2 - L_2^2}{2L_1L_2}`} />
            <p>
              A real solution needs |c₂| ≤ 1, i.e. the wrist must lie in the annulus |L₁ − L₂| ≤ r ≤ L₁ + L₂. Otherwise the target is outside the
              workspace. The sine is determined only up to sign, giving the two branches:
            </p>
            <Equation tex={String.raw`\theta_2 = \operatorname{atan2}\!\left(\mp\sqrt{1 - c_2^2},\; c_2\right)\qquad(-:\ \text{elbow-up},\ +:\ \text{elbow-down})`} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Shoulder and wrist angles</h3>
            <p>
              The direction to the wrist is β = atan2(y_w, x_w); the angle between link 1 and the base–wrist line is γ. Subtracting gives θ₁, and the
              orientation constraint gives θ₃:
            </p>
            <Equation tex={String.raw`\theta_1 = \operatorname{atan2}(y_w, x_w) - \operatorname{atan2}(L_2 s_2,\; L_1 + L_2 c_2),\qquad \theta_3 = \varphi - \theta_1 - \theta_2`} />
            <p>
              Running the forward kinematics on (θ₁, θ₂, θ₃) must give back (x, y, φ) exactly; the residual is reported as the FK check error.
            </p>
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
                <span className="mr-3"><span className="mr-1 inline-block h-2 w-3 bg-link3" />link 3</span>
                <span className="mr-3"><span className="mr-1 inline-block h-2 w-3 bg-ee" />tip</span>
                <span className="mr-3"><span className="mr-1 inline-block h-2 w-3 bg-target" />target</span>
                <span><span className="mr-1 inline-block h-2 w-3 bg-cobalt/20 ring-1 ring-cobalt/50" />reachable (current φ)</span>
              </span>
              <span className={ik.reachable ? 'text-muted' : 'font-semibold text-tomato'}>{ik.reachable ? `${BRANCH_LABEL[active]} shown solid` : 'Target outside workspace'}</span>
            </div>
            <IkCanvas
              links={links}
              pose={pose}
              ik={ik}
              active={active}
              showGhost={showGhost}
              mode={mode}
              drawing={drawing}
              path={path}
              progress={progress}
              onTarget={setTarget}
              onDrawStart={onDrawStart}
              onDrawMove={onDrawMove}
              onDrawEnd={onDrawEnd}
            />
            {plotData.length > 1 && (
              <div className="card">
                <Plot
                  title={`Joint angles along the drawn path (${BRANCH_LABEL[active]})`}
                  data={plotData}
                  xKey="t"
                  xLabel="t (s)"
                  yLabel="angle (°)"
                  series={[
                    { key: 'θ1', color: '#2F5FD0' },
                    { key: 'θ2', color: '#E5533D' },
                    { key: 'θ3', color: '#3F9B57' },
                  ]}
                  xMarker={loop.time}
                  height={240}
                />
              </div>
            )}
          </div>
        </SimulationLayout>
      }
      results={
        <div className="space-y-4">
          <div className="card">
            <h3 className="mb-2 font-semibold text-ink">Joint solutions</h3>
            {ik.reachable ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-1 font-medium">Solution</th>
                    <th className="py-1 text-right font-medium">θ₁</th>
                    <th className="py-1 text-right font-medium">θ₂</th>
                    <th className="py-1 text-right font-medium">θ₃</th>
                    <th className="py-1 text-right font-medium">FK position error</th>
                    <th className="py-1 text-right font-medium">FK φ error</th>
                  </tr>
                </thead>
                <tbody className="mono">
                  {BRANCHES.map((b) => {
                    const s = ik.solutions[b]!;
                    return (
                      <tr key={b} className={['border-t border-line', b === active ? 'text-ink' : 'text-muted'].join(' ')}>
                        <td className="py-1 font-sans">
                          {BRANCH_LABEL[b]} {b === active && <span className="ml-1 rounded bg-cobalt/10 px-1.5 text-xs text-cobalt">active</span>}
                        </td>
                        <td className="py-1 text-right">{fmtDeg(s.q[0])}</td>
                        <td className="py-1 text-right">{fmtDeg(s.q[1])}</td>
                        <td className="py-1 text-right">{fmtDeg(s.q[2])}</td>
                        <td className="py-1 text-right text-leaf">{s.posError.toExponential(2)} m</td>
                        <td className="py-1 text-right text-leaf">{rad2deg(s.phiError).toExponential(2)}°</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-tomato">
                Target outside workspace: |c₂| = {Math.abs(ik.working.c2).toFixed(3)} &gt; 1. Move the target inside the shaded annulus (for the current φ) or change φ.
              </p>
            )}
            <div className="mono mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              {(
                [
                  ['x', `${pose.x.toFixed(3)} m`],
                  ['y', `${pose.y.toFixed(3)} m`],
                  ['φ', `${rad2deg(pose.phi).toFixed(3)}°`],
                  ['wrist (x_w, y_w)', `(${ik.working.xw.toFixed(3)}, ${ik.working.yw.toFixed(3)})`],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-line py-1">
                  <span className="text-muted">{k}</span>
                  <span className="text-ink">{v}</span>
                </div>
              ))}
            </div>
            {activeSol && (
              <p className="mt-2 text-xs text-muted">
                Sum check: θ₁ + θ₂ + θ₃ = {rad2deg(wrapAngle(activeSol.q[0] + activeSol.q[1] + activeSol.q[2])).toFixed(3)}° = φ.
              </p>
            )}
          </div>

          <div className="card">
            <h3 className="mb-1 font-semibold text-ink">Solution working ({BRANCH_LABEL[active]})</h3>
            <p className="mb-3 text-xs text-muted">Every step of the derivation with the current numbers substituted. Switch the active solution to see the other branch.</p>
            <WorkingPanel links={links} pose={pose} ik={ik} branch={active} />
          </div>
        </div>
      }
      conclusion={
        <div className="space-y-2">
          <p>
            Fixing the tool orientation decouples the three-link problem into a two-link positioning problem for the wrist plus one algebraic
            equation for θ₃. The law of cosines yields θ₂ up to a sign, so every reachable pose has exactly two solutions (elbow-up and elbow-down)
            which merge on the workspace boundary where |c₂| = 1.
          </p>
          <p>
            Running forward kinematics on either solution reproduces the target to machine precision, confirming the derivation. Following a drawn
            path shows that the joint angles vary smoothly while the branch is kept fixed, but would jump if the solver switched branches mid-path.
          </p>
        </div>
      }
    />
  );
}
