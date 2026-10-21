import { useEffect, useMemo, useState } from 'react';
import ExperimentPage, { SimulationLayout } from '../../components/ExperimentPage';
import Equation from '../../components/Equation';
import MatrixView from '../../components/MatrixView';
import NumberInput from '../../components/NumberInput';
import Slider from '../../components/Slider';
import Toggle from '../../components/Toggle';
import PlaybackControls from '../../components/PlaybackControls';
import SceneBoundary from '../../components/SceneBoundary';
import { useFixedStepLoop } from '../../components/useFixedStepLoop';
import { findExperiment } from '../registry';
import { deg2rad, rotationPart, translationPart, type Vec3 } from '../../lib/math/matrix';
import { AXES, AXIS_VECTOR, composeScrews, matrixDistance, normalize, pitch, screwAxis, screwGeneral, screwPath, transformPoint, type Axis } from '../../lib/math/transforms';
import ScrewScene from './ScrewScene';

const experiment = findExperiment('screw')!;
const DURATION = 3; // s of animation for the full screw
type AxisMode = Axis | 'custom';

interface CompositeItem {
  axis: Axis;
  lambda: number;
  /** degrees */
  phi: number;
}

const fmt = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d).replace(/^-(0\.?0*)$/, '$1') : v === Infinity ? '∞' : '—');
const vecStr = (v: Vec3) => `(${fmt(v[0])}, ${fmt(v[1])}, ${fmt(v[2])})`;

export default function ScrewPage() {
  const [axisMode, setAxisMode] = useState<AxisMode>('z');
  const [customU, setCustomU] = useState<Vec3>([1, 1, 0]);
  const [customP, setCustomP] = useState<Vec3>([0, 0, 0]);
  const [lambda, setLambda] = useState(0.4);
  const [phiDeg, setPhiDeg] = useState(270);
  const [point, setPoint] = useState<Vec3>([0.4, 0, 0]);

  const [items, setItems] = useState<CompositeItem[]>([
    { axis: 'z', lambda: 0.3, phi: 90 },
    { axis: 'x', lambda: 0, phi: 90 },
  ]);
  const [reversed, setReversed] = useState(false);
  const [showComposite, setShowComposite] = useState(false);

  // --- Screw parameters ------------------------------------------------------
  const axisOk = axisMode !== 'custom' || Math.hypot(...customU) > 1e-9;
  const u = useMemo<Vec3>(() => (axisMode === 'custom' ? (axisOk ? normalize(customU) : [0, 0, 1]) : AXIS_VECTOR[axisMode]), [axisMode, customU, axisOk]);
  const p = useMemo<Vec3>(() => (axisMode === 'custom' ? customP : [0, 0, 0]), [axisMode, customP]);
  const phi = deg2rad(phiDeg);
  const params = useMemo(() => ({ u, p, lambda, phi }), [u, p, lambda, phi]);
  const T = useMemo(() => screwGeneral(params), [params]);
  const Tfund = useMemo(() => (axisMode === 'custom' ? null : screwAxis(axisMode, lambda, phi)), [axisMode, lambda, phi]);
  const R = useMemo(() => rotationPart(T), [T]);
  const t = useMemo(() => translationPart(T), [T]);
  const pPrime = useMemo(() => transformPoint(T, point), [T, point]);
  const helix = useMemo(() => screwPath(params, point, 161), [params, point]);
  const h = pitch(lambda, phi);

  // --- Animation --------------------------------------------------------------
  const loop = useFixedStepLoop(() => {}, { duration: DURATION });
  useEffect(() => loop.seek(DURATION), []); // eslint-disable-line react-hooks/exhaustive-deps -- show the completed screw on load
  const s = Math.min(1, loop.time / DURATION);
  const current = useMemo(() => screwGeneral({ ...params, lambda: s * lambda, phi: s * phi }), [params, s, lambda, phi]);
  const pNow = useMemo(() => transformPoint(current, point), [current, point]);

  // --- Composite --------------------------------------------------------------
  const mats = useMemo(() => items.map((it) => screwAxis(it.axis, it.lambda, deg2rad(it.phi))), [items]);
  const forward = useMemo(() => composeScrews(mats), [mats]);
  const backward = useMemo(() => composeScrews([...mats].reverse()), [mats]);
  const composite = reversed ? backward : forward;
  const commDist = matrixDistance(forward, backward);
  const label = (rev: boolean) => (rev ? [...items.keys()].reverse() : [...items.keys()]).map((i) => `T${i + 1}`).join(' · ');
  const updateItem = (i: number, patch: Partial<CompositeItem>) => setItems((list) => list.map((it, k) => (k === i ? { ...it, ...patch } : it)));

  const vecInputs = (label: string, v: Vec3, set: (v: Vec3) => void, step = 0.1, unit = '') => (
    <div>
      <div className="label mb-1">{label}</div>
      <div className="grid grid-cols-3 gap-2">
        {(['x', 'y', 'z'] as const).map((c, i) => (
          <NumberInput key={c} label={c} value={v[i]} step={step} unit={unit} onChange={(val) => set(v.map((x, k) => (k === i ? val : x)) as Vec3)} />
        ))}
      </div>
    </div>
  );

  const controls = (
    <>
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Screw axis</div>
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-800 p-1">
          {([...AXES, 'custom'] as AxisMode[]).map((m) => (
            <button key={m} type="button" onClick={() => setAxisMode(m)} className={['rounded-md px-2 py-1.5 text-sm font-medium transition', axisMode === m ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-700'].join(' ')}>
              {m === 'custom' ? 'custom' : m}
            </button>
          ))}
        </div>
        {axisMode === 'custom' && (
          <div className="space-y-2">
            {vecInputs('Direction u (normalised automatically)', customU, setCustomU)}
            {vecInputs('Point p on the axis', customP, setCustomP, 0.1, 'm')}
            {!axisOk && <p className="text-xs text-red-400">Direction must not be the zero vector.</p>}
            <p className="mono text-xs text-slate-500">û = {vecStr(u)}</p>
          </div>
        )}
        <Slider label="Translation λ along the axis" value={lambda} min={-1} max={1} step={0.01} unit="m" onChange={setLambda} />
        <Slider label="Rotation φ about the axis" value={phiDeg} min={-720} max={720} step={1} unit="°" decimals={0} onChange={setPhiDeg} />
        <p className="mono text-xs text-slate-500">pitch h = λ/φ = {fmt(h, 4)} m/rad{Number.isFinite(h) && Math.abs(phi) > 1e-9 ? ` (${fmt((lambda / phi) * 2 * Math.PI, 3)} m per turn)` : ''}</p>
      </div>

      <div className="space-y-3 border-t border-slate-800 pt-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tracked point / object origin</div>
        {vecInputs('p (reference frame)', point, setPoint, 0.1, 'm')}
      </div>

      <div className="space-y-3 border-t border-slate-800 pt-3">
        <PlaybackControls loop={loop} label="Animate the screw" />
        <Slider label="Fraction s of the screw" value={s} min={0} max={1} step={0.005} decimals={3} onChange={(v) => loop.seek(v * DURATION)} />
      </div>
    </>
  );

  return (
    <ExperimentPage
      experiment={experiment}
      aim={
        <p>
          To represent a general rigid-body displacement as a screw motion — a rotation φ about an axis combined with a translation λ along it —
          build the corresponding 4×4 homogeneous transformation, apply it to points and objects, and study how screws compose.
        </p>
      }
      theory={
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-white">Chasles' theorem</h3>
            <p>
              Every rigid displacement in space is equivalent to a rotation about some line followed by a translation along that same line: a{' '}
              <em>screw motion</em>. The line is the screw axis, φ the rotation, λ the translation and h = λ/φ the pitch (metres per radian). A pure
              rotation has h = 0, a pure translation has infinite pitch.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-white">Fundamental screw about a coordinate axis</h3>
            <p>Translation along an axis commutes with rotation about it, so for k ∈ {'{x, y, z}'}:</p>
            <Equation tex={String.raw`\mathrm{Screw}_k(\lambda,\varphi) = \mathrm{Trans}(\lambda\,\hat{k})\,\mathrm{Rot}(\hat{k},\varphi) = \mathrm{Rot}(\hat{k},\varphi)\,\mathrm{Trans}(\lambda\,\hat{k})`} />
            <Equation tex={String.raw`\mathrm{Screw}_z(\lambda,\varphi) = \begin{bmatrix} \cos\varphi & -\sin\varphi & 0 & 0 \\ \sin\varphi & \cos\varphi & 0 & 0 \\ 0 & 0 & 1 & \lambda \\ 0 & 0 & 0 & 1 \end{bmatrix}`} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-white">Rotation about an arbitrary unit axis (Rodrigues)</h3>
            <Equation tex={String.raw`R(\hat{u},\varphi) = I + \sin\varphi\,[\hat{u}]_\times + (1-\cos\varphi)\,[\hat{u}]_\times^2,\qquad [\hat{u}]_\times = \begin{bmatrix} 0 & -u_z & u_y \\ u_z & 0 & -u_x \\ -u_y & u_x & 0 \end{bmatrix}`} />
            <Equation tex={String.raw`R_{ij} = \cos\varphi\,\delta_{ij} + (1-\cos\varphi)\,u_i u_j - \sin\varphi\,\epsilon_{ijk} u_k`} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-white">General screw about an axis through point p</h3>
            <p>Move the axis to the origin, apply the fundamental screw, move back:</p>
            <Equation tex={String.raw`T = \mathrm{Trans}(\mathbf{p})\begin{bmatrix} R(\hat{u},\varphi) & \lambda\hat{u} \\ 0 & 1 \end{bmatrix}\mathrm{Trans}(-\mathbf{p}) = \begin{bmatrix} R(\hat{u},\varphi) & (I - R)\,\mathbf{p} + \lambda\hat{u} \\ 0 & 1 \end{bmatrix}`} />
            <p>
              A point q maps to q′ = T·q (using homogeneous coordinates [q; 1]). Points on the axis only slide by λ; every other point keeps its distance
              from the axis and traces a helix of pitch h.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-white">Composition</h3>
            <p>
              Successive screws multiply: T = T₁T₂T₃ applies T₃ first when all are expressed in the fixed frame, or equivalently T₁ first if each
              subsequent screw is about the <em>moved</em> axes. Matrix products are associative but not commutative, so T₁T₂ ≠ T₂T₁ in general —
              unless both screws share the same axis.
            </p>
          </div>
        </div>
      }
      simulation={
        <div className="space-y-4">
          <SimulationLayout controls={controls}>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  <span className="mr-3"><span className="mr-1 inline-block h-2 w-3 bg-sky-400" />object (frame {'{1}'})</span>
                  <span className="mr-3"><span className="mr-1 inline-block h-2 w-3 bg-slate-500/40" />start pose</span>
                  <span className="mr-3"><span className="mr-1 inline-block h-2 w-3" style={{ background: '#a78bfa' }} />screw axis</span>
                  <span><span className="mr-1 inline-block h-2 w-3 bg-yellow-400" />helix of p</span>
                </span>
                <span className="mono">s = {s.toFixed(3)} · λ(s) = {fmt(s * lambda)} m · φ(s) = {fmt(s * phiDeg, 1)}°</span>
              </div>
              <div className="h-[440px] overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                <SceneBoundary>
                  <ScrewScene u={u} p={p} current={current} helix={helix} progress={s} point={point} ghost={showComposite ? composite : null} ghostLabel={reversed ? label(true) : label(false)} />
                </SceneBoundary>
              </div>
              <div className="flex flex-wrap items-start gap-6">
                <MatrixView values={T} label="T" homogeneous />
                <div className="mono text-sm text-slate-300">
                  <div>p &nbsp;= {vecStr(point)}</div>
                  <div className="text-yellow-300">p′ = T·p = {vecStr(pPrime)}</div>
                  <div className="text-slate-500">at s = {s.toFixed(2)}: {vecStr(pNow)}</div>
                </div>
              </div>
            </div>
          </SimulationLayout>

          <div className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-white">Composite screws</h3>
                <p className="text-xs text-slate-500">Stack two or three fundamental screws. The product is taken in list order; flip the order to see that the result changes.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Toggle label="Reverse order" checked={reversed} onChange={setReversed} />
                <Toggle label="Show in 3D" checked={showComposite} onChange={setShowComposite} />
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="py-1 font-medium">Screw</th>
                  <th className="py-1 font-medium">Axis</th>
                  <th className="py-1 font-medium">λ (m)</th>
                  <th className="py-1 font-medium">φ (°)</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="mono py-1 text-slate-300">T{i + 1}</td>
                    <td className="py-1">
                      <div className="inline-grid grid-cols-3 gap-1 rounded-md bg-slate-800 p-0.5">
                        {AXES.map((a) => (
                          <button key={a} type="button" onClick={() => updateItem(i, { axis: a })} className={['rounded px-2 py-0.5 text-xs font-medium', it.axis === a ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-700'].join(' ')}>
                            {a}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="py-1">
                      <input type="number" step={0.05} value={it.lambda} onChange={(e) => updateItem(i, { lambda: parseFloat(e.target.value) || 0 })} className="mono w-24 rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-right text-slate-100 focus:border-sky-500 focus:outline-none" aria-label={`λ of T${i + 1}`} />
                    </td>
                    <td className="py-1">
                      <input type="number" step={5} value={it.phi} onChange={(e) => updateItem(i, { phi: parseFloat(e.target.value) || 0 })} className="mono w-24 rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-right text-slate-100 focus:border-sky-500 focus:outline-none" aria-label={`φ of T${i + 1}`} />
                    </td>
                    <td className="py-1 text-right">
                      <button type="button" className="btn px-2 py-0.5 text-xs" disabled={items.length <= 2} onClick={() => setItems((l) => l.filter((_, k) => k !== i))}>
                        remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length < 3 && (
              <button type="button" className="btn" onClick={() => setItems((l) => [...l, { axis: 'y', lambda: 0.2, phi: 45 }])}>
                + Add screw
              </button>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className={['rounded-lg border p-3', !reversed ? 'border-sky-500/40 bg-sky-500/5' : 'border-slate-800'].join(' ')}>
                <div className="mb-1 text-sm text-slate-300">{label(false)}{!reversed && <span className="ml-2 rounded bg-sky-500/20 px-1.5 text-xs text-sky-300">shown</span>}</div>
                <MatrixView values={forward} homogeneous />
                <div className="mono mt-1 text-xs text-slate-400">p′ = {vecStr(transformPoint(forward, point))}</div>
              </div>
              <div className={['rounded-lg border p-3', reversed ? 'border-sky-500/40 bg-sky-500/5' : 'border-slate-800'].join(' ')}>
                <div className="mb-1 text-sm text-slate-300">{label(true)}{reversed && <span className="ml-2 rounded bg-sky-500/20 px-1.5 text-xs text-sky-300">shown</span>}</div>
                <MatrixView values={backward} homogeneous />
                <div className="mono mt-1 text-xs text-slate-400">p′ = {vecStr(transformPoint(backward, point))}</div>
              </div>
            </div>
            <p className={['text-sm', commDist > 1e-9 ? 'text-amber-300' : 'text-emerald-400'].join(' ')}>
              ‖{label(false)} − {label(true)}‖_F = {commDist.toExponential(2)} → {commDist > 1e-9 ? 'the order matters: screw composition is not commutative.' : 'identical: these screws commute (same axis).'}
            </p>
          </div>
        </div>
      }
      results={
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card space-y-3">
              <h3 className="font-semibold text-white">Screw transform</h3>
              <MatrixView values={T} label="T" homogeneous />
              <div className="flex flex-wrap gap-6">
                <MatrixView values={R} label="R" />
                <MatrixView values={t.map((v) => [v])} label="t" />
              </div>
              <div className="mono text-xs text-slate-400">
                t = (I − R)·p + λ·û with û = {vecStr(u)}, p = {vecStr(p)}, λ = {fmt(lambda)} m, φ = {fmt(phiDeg, 1)}° · det R = {fmt(R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]), 6)}
              </div>
              {Tfund && (
                <div className="space-y-1">
                  <div className="text-sm text-slate-300">Fundamental form Screw_{axisMode}(λ, φ) = Trans · Rot:</div>
                  <MatrixView values={Tfund} homogeneous />
                  <div className="text-xs text-emerald-400">max |T − Screw_{axisMode}| = {Math.max(...T.flat().map((v, i) => Math.abs(v - Tfund.flat()[i]))).toExponential(1)}</div>
                </div>
              )}
            </div>
            <div className="card space-y-3">
              <h3 className="font-semibold text-white">Point transformation p′ = T·p</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="py-1 font-medium" />
                    <th className="py-1 text-right font-medium">x (m)</th>
                    <th className="py-1 text-right font-medium">y (m)</th>
                    <th className="py-1 text-right font-medium">z (m)</th>
                  </tr>
                </thead>
                <tbody className="mono">
                  {(
                    [
                      ['p (before)', point, 'text-slate-200'],
                      [`at s = ${s.toFixed(2)}`, pNow, 'text-slate-400'],
                      ['p′ (after full screw)', pPrime, 'text-yellow-300'],
                    ] as const
                  ).map(([name, v, cls]) => (
                    <tr key={name} className={['border-t border-slate-800', cls].join(' ')}>
                      <td className="py-1 font-sans">{name}</td>
                      {v.map((x, i) => (
                        <td key={i} className="py-1 text-right">{fmt(x)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mono grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div className="flex justify-between border-b border-slate-800 py-1"><span className="text-slate-400">pitch h</span><span className="text-white">{fmt(h, 4)} m/rad</span></div>
                <div className="flex justify-between border-b border-slate-800 py-1"><span className="text-slate-400">|p′ − p|</span><span className="text-white">{fmt(Math.hypot(pPrime[0] - point[0], pPrime[1] - point[1], pPrime[2] - point[2]))} m</span></div>
                <div className="flex justify-between border-b border-slate-800 py-1"><span className="text-slate-400">distance of p to axis</span><span className="text-white">{fmt(distToAxis(point, u, p))} m</span></div>
                <div className="flex justify-between border-b border-slate-800 py-1"><span className="text-slate-400">distance of p′ to axis</span><span className="text-white">{fmt(distToAxis(pPrime, u, p))} m</span></div>
              </div>
              <p className="text-xs text-slate-500">The distance to the axis is preserved: the point moves on a cylinder around the screw axis, along a helix of pitch h.</p>
            </div>
          </div>
        </div>
      }
      conclusion={
        <div className="space-y-2">
          <p>
            A screw packs a rotation and a collinear translation into one 4×4 matrix whose rotation block is orthonormal with determinant +1 and whose
            translation block is (I − R)p + λû. Setting φ = 0 or λ = 0 recovers a pure translation or a pure rotation, and a general screw about a
            coordinate axis through the origin reduces exactly to the fundamental form.
          </p>
          <p>
            Tracked points move on helices around the axis, keeping their distance from it. Composing screws is a matrix product, which is
            associative but not commutative: reversing the list order produces a different final pose unless the screws share an axis.
          </p>
        </div>
      }
    />
  );
}

function distToAxis(q: Vec3, u: Vec3, p: Vec3): number {
  const d: Vec3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const along = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  return Math.hypot(d[0] - along * u[0], d[1] - along * u[1], d[2] - along * u[2]);
}
