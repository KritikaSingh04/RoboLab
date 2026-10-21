import { useCallback, useMemo, useState } from 'react';
import Canvas2D, { type CanvasPointer, type Transform } from '../../components/Canvas2D';
import Plot from '../../components/Plot';
import ScatterPlot from '../../components/ScatterPlot';
import Slider from '../../components/Slider';
import { ikData, sinData } from '../../lib/ai/datasets';
import { createMLP, predict } from '../../lib/ai/mlp';
import { twoLinkFK, twoLinkIK } from '../../lib/math/trajectory';
import { rad2deg } from '../../lib/math/matrix';
import NetControls, { DEFAULT_SETTINGS, hiddenOf, type NetSettings } from './NetControls';
import NetworkDiagram from './NetworkDiagram';
import { useTraining } from './useTraining';

type Mode = 'sin' | 'ik';

export default function RegressionTab() {
  const [mode, setMode] = useState<Mode>('sin');
  const [seed, setSeed] = useState(1);
  const [noise, setNoise] = useState(0.1);
  const [settings, setSettings] = useState<NetSettings>({ ...DEFAULT_SETTINGS, neurons: 12, lr: 0.03 });
  const [target, setTarget] = useState<[number, number]>([1.0, 0.9]);

  const sin = useMemo(() => sinData(120, noise, seed), [noise, seed]);
  const ik = useMemo(() => ikData(600, seed), [seed]);
  const X = mode === 'sin' ? sin.X : ik.X;
  const Y = mode === 'sin' ? sin.Y : ik.Y;

  const build = useCallback(
    (s: number) => (mode === 'sin' ? createMLP({ layers: [1, ...hiddenOf(settings), 1], activation: settings.activation, loss: 'mse', seed: s }) : createMLP({ layers: [2, ...hiddenOf(settings), 3], activation: settings.activation, outputActivation: 'tanh', loss: 'mse', seed: s })),
    [mode, settings.hiddenLayers, settings.neurons, settings.activation], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const trainer = useTraining(build, X, Y, { lr: settings.lr, batchSize: settings.batchSize, momentum: settings.momentum, epochsPerFrame: settings.epochsPerFrame, seed });
  const { net, version } = trainer;

  // --- sin fit -----------------------------------------------------------------
  const sinCurves = useMemo(() => {
    const xs = Array.from({ length: 101 }, (_, i) => -Math.PI + (2 * Math.PI * i) / 100);
    return { truth: xs.map((x) => ({ x, y: Math.sin(x) })), pred: xs.map((x) => ({ x, y: predict(net, [x / Math.PI])[0] })) };
  }, [net, version]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- IK ------------------------------------------------------------------------
  const ikEval = useMemo(() => {
    const out = predict(net, ik.toInput(target[0], target[1]));
    const qNN = ik.toJoints(out);
    const fkNN = twoLinkFK({ l1: ik.l1, l2: ik.l2 }, qNN);
    const qIK = twoLinkIK({ l1: ik.l1, l2: ik.l2 }, target[0], target[1], 'down');
    // mean tip error over a sample of the training set
    let sum = 0;
    const n = Math.min(200, ik.X.length);
    for (let i = 0; i < n; i++) {
      const q = ik.toJoints(predict(net, ik.X[i]));
      const tip = twoLinkFK({ l1: ik.l1, l2: ik.l2 }, q).tip;
      sum += Math.hypot(tip[0] - ik.X[i][0] * ik.scale, tip[1] - ik.X[i][1] * ik.scale);
    }
    return { qNN, fkNN, qIK, tipErr: Math.hypot(fkNN.tip[0] - target[0], fkNN.tip[1] - target[1]), meanTipErr: sum / n };
  }, [net, version, ik, target]); // eslint-disable-line react-hooks/exhaustive-deps

  const drawIK = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform) => {
      const [ox, oy] = t.toPixel(0, 0);
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(47,95,208,0.45)';
      ctx.beginPath();
      ctx.arc(ox, oy, (ik.l1 + ik.l2) * t.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ox, oy, Math.abs(ik.l1 - ik.l2) * t.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      const arm = (q: [number, number], alpha: number, label: string, color: string, labelDy = -8) => {
        const { elbow, tip } = twoLinkFK({ l1: ik.l1, l2: ik.l2 }, q);
        const pts = [[0, 0], elbow, tip] as [number, number][];
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineCap = 'round';
        for (let i = 0; i < 2; i++) {
          const [ax, ay] = t.toPixel(pts[i][0], pts[i][1]);
          const [bx, by] = t.toPixel(pts[i + 1][0], pts[i + 1][1]);
          ctx.strokeStyle = i === 0 ? '#2F5FD0' : '#E5533D';
          ctx.lineWidth = 10 - 2 * i;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
        const [ex, ey] = t.toPixel(tip[0], tip[1]);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(ex, ey, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = 'bold 12px ui-sans-serif, system-ui';
        ctx.fillText(label, ex + 10, ey + labelDy);
        ctx.restore();
      };
      if (ikEval.qIK) arm(ikEval.qIK, 0.3, 'analytic IK', '#6B665C', 16);
      arm(ikEval.qNN, 1, 'NN', '#E5533D');
      const [tx, ty] = t.toPixel(target[0], target[1]);
      ctx.strokeStyle = '#F2B33D';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tx, ty, 10, 0, Math.PI * 2);
      ctx.moveTo(tx - 14, ty);
      ctx.lineTo(tx + 14, ty);
      ctx.moveTo(tx, ty - 14);
      ctx.lineTo(tx, ty + 14);
      ctx.stroke();
      ctx.fillStyle = '#6B665C';
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.fillText('click to set the target · solid = NN prediction, ghost = analytic IK (elbow-down)', 10, t.height - 10);
    },
    [ik, ikEval, target],
  );
  const onPick = useCallback((p: CanvasPointer) => {
    setTarget([p.x, p.y]);
    return true;
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="card space-y-4 self-start">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">Task</div>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-sidebar p-1">
              {(
                [
                  ['sin', 'Noisy sin(x)'],
                  ['ik', '2-link inverse kinematics'],
                ] as const
              ).map(([m, label]) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={['rounded-md px-2 py-1.5 text-xs font-medium transition', mode === m ? 'bg-ink text-white' : 'text-ink/80 hover:bg-line'].join(' ')}>
                  {label}
                </button>
              ))}
            </div>
            {mode === 'sin' && <Slider label="Noise σ" value={noise} min={0} max={0.5} step={0.01} decimals={2} onChange={setNoise} />}
            {mode === 'ik' && <p className="text-xs text-muted">600 samples generated by forward kinematics (L₁ = 1 m, L₂ = 0.8 m, elbow-down branch). Inputs (x, y); outputs (cos θ₁, sin θ₁, θ₂) so θ₁ has no ±180° wrap.</p>}
          </div>
          <NetControls settings={settings} onChange={setSettings} trainer={trainer} seed={seed} onSeed={setSeed} />
        </div>
        <div className="space-y-3">
          {mode === 'sin' ? (
            <div className="card">
              <ScatterPlot title="Prediction vs truth" xLabel="x" yLabel="y" scatter={[{ name: 'noisy samples', points: sin.xs.map((x, i) => ({ x, y: sin.Y[i][0] })), color: '#8A857A' }]} lines={[{ name: 'sin(x)', points: sinCurves.truth, color: '#3F9B57', dashed: true }, { name: 'network', points: sinCurves.pred, color: '#E5533D' }]} height={300} />
            </div>
          ) : (
            <div className="space-y-2">
              <Canvas2D draw={drawIK} view={{ cx: 0.2, cy: 0.2, scale: 130 }} aspect={16 / 10} onPointerDown={onPick} />
              <div className="mono grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-field px-3 py-2 text-sm sm:grid-cols-4">
                <div className="flex justify-between"><span className="text-muted">target</span><span className="text-ink">({target[0].toFixed(2)}, {target[1].toFixed(2)})</span></div>
                <div className="flex justify-between"><span className="text-muted">NN θ₁, θ₂</span><span className="text-ink">{rad2deg(ikEval.qNN[0]).toFixed(1)}°, {rad2deg(ikEval.qNN[1]).toFixed(1)}°</span></div>
                <div className="flex justify-between"><span className="text-muted">IK θ₁, θ₂</span><span className="text-ink">{ikEval.qIK ? `${rad2deg(ikEval.qIK[0]).toFixed(1)}°, ${rad2deg(ikEval.qIK[1]).toFixed(1)}°` : 'unreachable'}</span></div>
                <div className="flex justify-between"><span className="text-muted">tip error</span><span className={ikEval.tipErr < 0.05 ? 'text-leaf' : 'text-mustardInk'}>{(100 * ikEval.tipErr).toFixed(1)} cm</span></div>
              </div>
            </div>
          )}
          <div className="card"><NetworkDiagram net={net} inputLabels={mode === 'sin' ? ['x'] : ['x', 'y']} outputLabels={mode === 'sin' ? ['y'] : ['cos θ₁', 'sin θ₁', 'θ₂']} height={200} /></div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <Plot title="Training loss (½ MSE)" data={trainer.history.map((h) => ({ epoch: h.epoch, loss: h.loss }))} xKey="epoch" xLabel="epoch" series={[{ key: 'loss', color: '#2F5FD0' }]} height={220} decimals={5} />
        </div>
        <div className="card text-sm text-ink/80">
          {mode === 'sin' ? (
            <p>The network approximates sin(x) from {sin.X.length} noisy samples. With too few neurons it underfits; with many neurons and long training it starts to follow the noise. Compare the red curve with the dashed truth.</p>
          ) : (
            <>
              <p>Mean tip error over 200 training targets: <span className={['mono', ikEval.meanTipErr < 0.05 ? 'text-leaf' : 'text-mustardInk'].join(' ')}>{(100 * ikEval.meanTipErr).toFixed(1)} cm</span> (forward kinematics applied to the predicted angles).</p>
              <p className="mt-2 text-muted">The analytic IK of experiment 4 is exact; the network only approximates it, but it learned the mapping purely from examples without any geometry. Unreachable targets have no analytic solution, yet the network still outputs angles.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
