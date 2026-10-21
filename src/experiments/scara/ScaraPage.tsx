import { useCallback, useEffect, useMemo, useState } from 'react';
import ExperimentPage, { SimulationLayout } from '../../components/ExperimentPage';
import Equation from '../../components/Equation';
import MatrixView from '../../components/MatrixView';
import Slider from '../../components/Slider';
import Toggle from '../../components/Toggle';
import PlaybackControls from '../../components/PlaybackControls';
import SceneBoundary from '../../components/SceneBoundary';
import { useFixedStepLoop } from '../../components/useFixedStepLoop';
import { findExperiment } from '../registry';
import type { DHRow } from '../../lib/math/dh';
import {
  SCARA_DEFAULT_TABLE,
  SCARA_TEXTBOOK_TABLE,
  SCARA_JOINT_LIMITS,
  SCARA_JOINT_CELLS,
  SCARA_HOME,
  closedFormPlanar,
  clampJoints,
  forwardKinematics,
  poseFromTransform,
  scaraDhTable,
  scaraWorkspace,
  wrapAngle,
} from '../../lib/math/kinematics';
import { deg2rad, rad2deg, type Vec3 } from '../../lib/math/matrix';
import { LINK_COLORS as PALETTE_LINKS } from '../../theme';
import DhTableEditor from './DhTableEditor';
import ScaraScene from './ScaraScene';
import ScaraTopView from './ScaraTopView';

const experiment = findExperiment('scara')!;

const LINK_COLORS = [...PALETTE_LINKS];
const INITIAL_Q = [deg2rad(30), deg2rad(50), 0.06, deg2rad(20)];
const TRAIL_MAX = 2500;

/** Demo motion used by Play: smooth sweeps that stay inside the joint limits. */
function demoJoints(t: number): number[] {
  return clampJoints([deg2rad(110) * Math.sin(0.45 * t), deg2rad(120) * Math.sin(0.7 * t + 1), 0.0975 * (1 - Math.cos(0.9 * t)), deg2rad(150) * Math.sin(0.6 * t)]);
}

const sgn = (s: number) => (s >= 0 ? '+' : '-');

export default function ScaraPage() {
  const [base, setBase] = useState<DHRow[]>(SCARA_DEFAULT_TABLE);
  const [q, setQ] = useState<number[]>(INITIAL_Q);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [trace, setTrace] = useState(false);
  const [trail, setTrail] = useState<Vec3[]>([]);

  const table = useMemo(() => scaraDhTable(base, q), [base, q]);
  const frames = useMemo(() => forwardKinematics(table), [table]);
  const T04 = frames[3];
  const pose = useMemo(() => poseFromTransform(T04), [T04]);
  const closed = useMemo(() => closedFormPlanar(table), [table]);
  const workspace = useMemo(() => (showWorkspace ? scaraWorkspace(base, SCARA_JOINT_LIMITS, 73, SCARA_HOME) : []), [base, showWorkspace]);
  const reach = base[0].a + base[1].a + base[2].a + base[3].a;

  const loop = useFixedStepLoop((dt, t) => setQ(demoJoints(t + dt)), {
    onReset: () => {
      setQ(INITIAL_Q);
      setTrail([]);
    },
  });

  // Trail: record the end-effector position whenever it moves while tracing.
  useEffect(() => {
    if (!trace) return;
    setTrail((tr) => {
      const p: Vec3 = [pose.x, pose.y, pose.z];
      const last = tr[tr.length - 1];
      if (last && Math.hypot(last[0] - p[0], last[1] - p[1], last[2] - p[2]) < 1e-4) return tr;
      const next = [...tr, p];
      return next.length > TRAIL_MAX ? next.slice(next.length - TRAIL_MAX) : next;
    });
  }, [trace, pose]);

  const setJoint = useCallback((i: number, v: number) => setQ((prev) => prev.map((x, k) => (k === i ? v : x))), []);

  // Symbolic closed form built from the sign pattern of the current table.
  const sym = useMemo(() => {
    const s = closed.signs;
    const phi1 = `\\theta_1`;
    const phi2 = `\\theta_1 ${sgn(s[1])} \\theta_2`;
    const roll = `${phi2} ${sgn(s[3])} \\theta_4`;
    return {
      x: `x = a_1\\cos${phi1} + a_2\\cos(${phi2})`,
      y: `y = a_1\\sin${phi1} + a_2\\sin(${phi2})`,
      z: `z = d_1 ${sgn(s[2])} d_3 ${sgn(s[3])} d_4`,
      roll: `\\varphi = ${roll}`,
    };
  }, [closed.signs]);

  const diff = {
    x: pose.x - closed.x,
    y: pose.y - closed.y,
    z: pose.z - closed.z,
    roll: wrapAngle(pose.roll - closed.roll),
  };

  const isDefault = JSON.stringify(base) === JSON.stringify(SCARA_DEFAULT_TABLE);
  const isTextbook = JSON.stringify(base) === JSON.stringify(SCARA_TEXTBOOK_TABLE);

  const controls = (
    <>
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Joint variables</div>
        {SCARA_JOINT_CELLS.map((cell, i) => {
          const [lo, hi] = SCARA_JOINT_LIMITS[i];
          const rev = cell.kind === 'revolute';
          return (
            <Slider
              key={cell.label}
              label={`${cell.label} (${rev ? 'revolute' : 'prismatic'})`}
              color={LINK_COLORS[i]}
              value={rev ? rad2deg(q[i]) : q[i]}
              min={rev ? Math.round(rad2deg(lo)) : lo}
              max={rev ? Math.round(rad2deg(hi)) : hi}
              step={rev ? 0.5 : 0.001}
              unit={rev ? '°' : 'm'}
              decimals={rev ? 1 : 3}
              onChange={(v) => setJoint(i, rev ? deg2rad(v) : v)}
            />
          );
        })}
      </div>

      <PlaybackControls loop={loop} label="Demo motion" />

      <div className="space-y-3 border-t border-line pt-3">
        <Toggle label="Show workspace" hint="Sample θ1, θ2 over their limits (top view)" checked={showWorkspace} onChange={setShowWorkspace} />
        <Toggle
          label="Trace end-effector"
          hint={trail.length ? `${trail.length} points recorded` : 'Leave a trail of the tool path'}
          checked={trace}
          onChange={(v) => {
            setTrace(v);
            if (!v) setTrail([]);
          }}
        />
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn" onClick={() => setQ(SCARA_HOME)}>
            Home pose
          </button>
          <button type="button" className="btn" onClick={() => setTrail([])} disabled={trail.length === 0}>
            Clear trail
          </button>
        </div>
      </div>
    </>
  );

  return (
    <ExperimentPage
      experiment={experiment}
      aim={
        <p>
          To derive the forward (direct) kinematics of a four-axis SCARA manipulator using Denavit–Hartenberg parameters, compute the end-effector
          pose <span className="mono">T₀₄</span> for given joint values, and verify the matrix result against the closed-form position equations.
        </p>
      }
      theory={
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">What is a SCARA?</h3>
            <p>
              A <em>Selective Compliance Assembly Robot Arm</em> has two revolute joints with parallel vertical axes (shoulder θ₁ and elbow θ₂), a
              vertical prismatic joint (quill, d₃) and a final revolute roll joint (θ₄). All joint axes are parallel to the world z-axis, so the arm
              is stiff vertically but compliant horizontally — ideal for pick-and-place and insertion tasks. The position in the plane depends only on
              θ₁ and θ₂, the height only on d₃, and the tool orientation is a single angle φ about z.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Denavit–Hartenberg parameters</h3>
            <p>
              Each link i is described by four numbers: joint angle θᵢ (rotation about zᵢ₋₁), link offset dᵢ (translation along zᵢ₋₁), link length aᵢ
              (translation along xᵢ) and link twist αᵢ (rotation about xᵢ). For a revolute joint θᵢ is the variable; for a prismatic joint dᵢ is. The
              transform from frame i−1 to frame i is
            </p>
            <Equation tex={String.raw`{}^{i-1}T_i = \mathrm{Rot}_z(\theta_i)\,\mathrm{Trans}_z(d_i)\,\mathrm{Trans}_x(a_i)\,\mathrm{Rot}_x(\alpha_i) = \begin{bmatrix} c\theta_i & -s\theta_i c\alpha_i & s\theta_i s\alpha_i & a_i c\theta_i \\ s\theta_i & c\theta_i c\alpha_i & -c\theta_i s\alpha_i & a_i s\theta_i \\ 0 & s\alpha_i & c\alpha_i & d_i \\ 0 & 0 & 0 & 1 \end{bmatrix}`} />
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-ink">The four link transforms (lab table)</h3>
            <p>
              With the table d₁ = 0.877 m, a₁ = 0.425 m, α₁ = π; a₂ = 0.375 m; d₃ variable; d₄ = 0.2 m (all other entries zero), the four transforms are:
            </p>
            <Equation tex={String.raw`{}^{0}T_1 = \begin{bmatrix} c_1 & s_1 & 0 & a_1 c_1 \\ s_1 & -c_1 & 0 & a_1 s_1 \\ 0 & 0 & -1 & d_1 \\ 0&0&0&1 \end{bmatrix},\qquad {}^{1}T_2 = \begin{bmatrix} c_2 & -s_2 & 0 & a_2 c_2 \\ s_2 & c_2 & 0 & a_2 s_2 \\ 0 & 0 & 1 & 0 \\ 0&0&0&1 \end{bmatrix}`} />
            <Equation tex={String.raw`{}^{2}T_3 = \begin{bmatrix} 1 & 0 & 0 & 0 \\ 0 & 1 & 0 & 0 \\ 0 & 0 & 1 & d_3 \\ 0&0&0&1 \end{bmatrix},\qquad {}^{3}T_4 = \begin{bmatrix} c_4 & -s_4 & 0 & 0 \\ s_4 & c_4 & 0 & 0 \\ 0 & 0 & 1 & d_4 \\ 0&0&0&1 \end{bmatrix}`} />
            <p>and the end-effector pose is the chain product</p>
            <Equation tex={String.raw`{}^{0}T_4 = {}^{0}T_1\,{}^{1}T_2\,{}^{2}T_3\,{}^{3}T_4 = \begin{bmatrix} R(\varphi) & \mathbf{p} \\ 0 & 1 \end{bmatrix}`} />
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Closed-form result</h3>
            <p>
              Because every twist is 0 or π, all z-axes stay vertical and the product can be multiplied out by hand. The twist α₁ = π makes z₁ point
              <em> downwards</em>, so d₃ and d₄ are subtracted from d₁ and the rotations θ₂ and θ₄ about the flipped axes enter with a negative sign:
            </p>
            <Equation tex={String.raw`x = a_1\cos\theta_1 + a_2\cos(\theta_1 - \theta_2),\qquad y = a_1\sin\theta_1 + a_2\sin(\theta_1 - \theta_2)`} />
            <Equation tex={String.raw`z = d_1 - d_3 - d_4,\qquad \varphi = \theta_1 - \theta_2 - \theta_4`} />
            <p>
              The familiar textbook form <span className="mono">x = a₁c₁ + a₂c₁₂</span> is the same robot with the flip assigned to link 2 instead (α₁ = 0,
              α₂ = π) — only the sign convention of θ₂ changes. The Results section derives the equation for whichever table is currently loaded and
              compares it with the full matrix product, so you can switch between the two assignments with the preset buttons and see that both agree.
            </p>
          </div>
        </div>
      }
      simulation={
        <div className="space-y-4">
          <SimulationLayout controls={controls}>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>3D view · drag to orbit, scroll to zoom, right-drag to pan</span>
                <span className="flex gap-3">
                  <span><span className="mr-1 inline-block h-2 w-3 bg-link1" />link 1</span>
                  <span><span className="mr-1 inline-block h-2 w-3 bg-link2" />link 2</span>
                  <span><span className="mr-1 inline-block h-2 w-3 bg-link3" />quill</span>
                  <span><span className="mr-1 inline-block h-2 w-3 bg-ee" />tool</span>
                </span>
              </div>
              <div className="h-[440px] overflow-hidden rounded-lg border border-line bg-field">
                <SceneBoundary
                  fallback={
                    <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center text-muted" ref={() => setSceneFailed(true)}>
                      <div className="font-medium text-mustardInk">3D view unavailable (WebGL could not be started)</div>
                      <div className="text-sm">The top view below and all numeric results still work.</div>
                    </div>
                  }
                >
                  <ScaraScene table={table} frames={frames} trail={trail} />
                </SceneBoundary>
              </div>
              {(showWorkspace || trace || sceneFailed) && (
                <div>
                  <div className="mb-1 text-xs text-muted">
                    Top view (xy plane) · {showWorkspace && `${workspace.length} workspace samples shown in blue`}
                    {showWorkspace && trace && ' · '}
                    {trace && 'trail in yellow'}
                  </div>
                  <ScaraTopView frames={frames} workspace={workspace} trail={trail} reach={reach} />
                </div>
              )}
            </div>
          </SimulationLayout>

          <div className="card">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-ink">D-H table</h3>
                <p className="text-xs text-muted">Highlighted cells are the joint variables (driven by the sliders). Edit any other cell to change the robot.</p>
              </div>
              <div className="flex gap-1.5">
                <button type="button" className={['btn', isDefault ? 'btn-primary' : ''].join(' ')} onClick={() => setBase(SCARA_DEFAULT_TABLE)}>
                  Lab table (α₁ = π)
                </button>
                <button type="button" className={['btn', isTextbook ? 'btn-primary' : ''].join(' ')} onClick={() => setBase(SCARA_TEXTBOOK_TABLE)}>
                  Textbook (α₂ = π)
                </button>
              </div>
            </div>
            <DhTableEditor base={base} current={table} onChange={setBase} />
          </div>
        </div>
      }
      results={
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
            <div className="card">
              <h3 className="mb-2 font-semibold text-ink">End-effector transform</h3>
              <MatrixView values={T04} label="T₀₄" homogeneous />
              <p className="mt-2 text-xs text-muted">
                <span className="text-cobalt">rotation</span> · <span className="text-leaf">position (m)</span>
              </p>
            </div>

            <div className="card">
              <h3 className="mb-2 font-semibold text-ink">Matrix result vs closed form</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-1 font-medium">Quantity</th>
                    <th className="py-1 text-right font-medium">From T₀₄</th>
                    <th className="py-1 text-right font-medium">Closed form</th>
                    <th className="py-1 text-right font-medium">Difference</th>
                  </tr>
                </thead>
                <tbody className="mono">
                  {(
                    [
                      ['x (m)', pose.x, closed.x, diff.x],
                      ['y (m)', pose.y, closed.y, diff.y],
                      ['z (m)', pose.z, closed.z, diff.z],
                      ['roll φ (°)', rad2deg(pose.roll), rad2deg(closed.roll), rad2deg(diff.roll)],
                    ] as const
                  ).map(([name, a, b, d]) => (
                    <tr key={name} className="border-t border-line">
                      <td className="py-1 font-sans text-ink/80">{name}</td>
                      <td className="py-1 text-right text-ink">{a.toFixed(3)}</td>
                      <td className="py-1 text-right text-ink">{closed.valid ? b.toFixed(3) : '—'}</td>
                      <td className={['py-1 text-right', Math.abs(d) < 1e-6 ? 'text-leaf' : 'text-tomato'].join(' ')}>
                        {closed.valid ? d.toExponential(1) : 'n/a'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 space-y-1 text-sm">
                {closed.valid ? (
                  <>
                    <Equation tex={sym.x} />
                    <Equation tex={sym.y} />
                    <Equation tex={sym.z} />
                    <Equation tex={sym.roll} />
                  </>
                ) : (
                  <p className="text-mustardInk">The closed form above assumes every twist α is 0° or 180°; the current table has a tilted joint axis, so only the matrix result applies.</p>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="mb-2 font-semibold text-ink">Joint values</h3>
            <div className="mono grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              {SCARA_JOINT_CELLS.map((c, i) => (
                <div key={c.label} className="flex justify-between border-b border-line py-1">
                  <span style={{ color: LINK_COLORS[i] }}>{c.label}</span>
                  <span className="text-ink">{c.kind === 'revolute' ? `${rad2deg(q[i]).toFixed(3)} °` : `${q[i].toFixed(3)} m`}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="mb-3 font-semibold text-ink">Intermediate frames</h3>
            <div className="flex flex-wrap gap-6">
              {frames.slice(0, 3).map((f, i) => (
                <MatrixView key={i} values={f} label={`T₀${['₁', '₂', '₃'][i]}`} homogeneous />
              ))}
            </div>
          </div>
        </div>
      }
      conclusion={
        <div className="space-y-2">
          <p>
            The D-H convention reduces the SCARA's forward kinematics to the product of four simple link transforms. Multiplying them out reproduces
            the closed-form equations exactly — the difference column stays at machine precision for every joint value — so the matrix method and
            the geometric derivation are equivalent.
          </p>
          <p>
            The structure of <span className="mono">T₀₄</span> reflects the mechanism: the position in the xy-plane depends only on θ₁ and θ₂, the
            height only on the prismatic joint, and the rotation block is a pure rotation about z. The workspace view shows the resulting annular
            reachable region bounded by a₁ + a₂ and by the elbow limit.
          </p>
        </div>
      }
    />
  );
}
