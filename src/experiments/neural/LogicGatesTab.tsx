import { useCallback, useMemo, useRef, useState } from 'react';
import Canvas2D, { type Transform } from '../../components/Canvas2D';
import Plot from '../../components/Plot';
import Slider from '../../components/Slider';
import { useFixedStepLoop } from '../../components/useFixedStepLoop';
import { createMLP, GATES, GATE_INPUTS, perceptronEpoch, perceptronOutput, predict, type Perceptron } from '../../lib/ai/mlp';
import { mulberry32 } from '../../lib/ai/random';
import NetworkDiagram from './NetworkDiagram';
import { useTraining } from './useTraining';

type Gate = keyof typeof GATES;
const GATE_NAMES = Object.keys(GATES) as Gate[];

function newPerceptron(seed: number): Perceptron {
  const rng = mulberry32(seed);
  return { w: [0.4 * (rng() - 0.5), 0.4 * (rng() - 0.5)], b: 0.4 * (rng() - 0.5) };
}

export default function LogicGatesTab() {
  const [gate, setGate] = useState<Gate>('AND');
  const [lr, setLr] = useState(0.1);
  const [seed, setSeed] = useState(1);
  const pRef = useRef<Perceptron>(newPerceptron(1));
  const errRef = useRef<{ epoch: number; errors: number }[]>([]);
  const [version, setVersion] = useState(0);
  const y = GATES[gate];

  const loop = useFixedStepLoop(
    () => {
      const errors = perceptronEpoch(pRef.current, GATE_INPUTS, y, lr);
      errRef.current.push({ epoch: errRef.current.length + 1, errors });
      setVersion((v) => v + 1);
      if (errors === 0 || errRef.current.length >= 200) loop.pause();
    },
    { dt: 1 / 10 },
  );
  const reset = useCallback(
    (s = seed) => {
      pRef.current = newPerceptron(s);
      errRef.current = [];
      loop.reset();
      setVersion((v) => v + 1);
    },
    [loop, seed],
  );
  const selectGate = (g: Gate) => {
    setGate(g);
    reset();
  };
  const p = pRef.current;
  const errs = errRef.current;
  const outputs = GATE_INPUTS.map((x) => perceptronOutput(p, x));
  const correct = outputs.filter((o, i) => o === y[i]).length;

  const drawPerceptron = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform) => {
      // shade the two half-planes
      const [lo, hi] = [-0.5, 1.5];
      const cells = 40;
      const [px0, py0] = t.toPixel(lo, hi);
      const [px1, py1] = t.toPixel(hi, lo);
      const cw = (px1 - px0) / cells;
      const ch = (py1 - py0) / cells;
      for (let i = 0; i < cells; i++) {
        for (let j = 0; j < cells; j++) {
          const x = lo + ((hi - lo) * (i + 0.5)) / cells;
          const yy = hi - ((hi - lo) * (j + 0.5)) / cells;
          ctx.fillStyle = perceptronOutput(p, [x, yy]) ? 'rgba(249,115,22,0.18)' : 'rgba(59,130,246,0.18)';
          ctx.fillRect(px0 + i * cw, py0 + j * ch, cw + 0.5, ch + 0.5);
        }
      }
      // separating line w1 x + w2 y + b = 0
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (Math.abs(p.w[1]) > 1e-9) {
        const f = (x: number) => -(p.w[0] * x + p.b) / p.w[1];
        const [ax, ay] = t.toPixel(-0.5, f(-0.5));
        const [bx, by] = t.toPixel(1.5, f(1.5));
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      } else if (Math.abs(p.w[0]) > 1e-9) {
        const x = -p.b / p.w[0];
        const [ax, ay] = t.toPixel(x, -0.5);
        const [bx, by] = t.toPixel(x, 1.5);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
      GATE_INPUTS.forEach((x, i) => {
        const [px, py] = t.toPixel(x[0], x[1]);
        ctx.fillStyle = y[i] ? '#f97316' : '#3b82f6';
        ctx.beginPath();
        ctx.arc(px, py, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = outputs[i] === y[i] ? '#22c55e' : '#ef4444';
        ctx.stroke();
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 12px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(String(y[i]), px, py + 4);
        ctx.textAlign = 'left';
      });
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.fillText(`${gate}: target 1 = orange, 0 = blue · ring green = correct, red = wrong · line: w₁x₁ + w₂x₂ + b = 0`, 10, t.height - 10);
    },
    [p, y, outputs, gate, version], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // --- 2-2-1 MLP for XOR ---------------------------------------------------------
  const Xxor = GATE_INPUTS;
  const Yxor = useMemo(() => GATES.XOR.map((v) => [v]), []);
  const [mlpSeed, setMlpSeed] = useState(1);
  const build = useCallback((s: number) => createMLP({ layers: [2, 2, 1], activation: 'tanh', outputActivation: 'sigmoid', loss: 'mse', seed: s }), []);
  const trainer = useTraining(build, Xxor, Yxor, { lr: 0.5, batchSize: 4, momentum: 0.9, epochsPerFrame: 20, seed: mlpSeed, maxEpochs: 6000 });
  const mlpOut = GATE_INPUTS.map((x) => predict(trainer.net, x)[0]);
  const mlpCorrect = mlpOut.filter((o, i) => (o > 0.5 ? 1 : 0) === GATES.XOR[i]).length;
  const drawMlp = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform) => {
      const [lo, hi] = [-0.5, 1.5];
      const cells = 48;
      const [px0, py0] = t.toPixel(lo, hi);
      const [px1, py1] = t.toPixel(hi, lo);
      const cw = (px1 - px0) / cells;
      const ch = (py1 - py0) / cells;
      for (let i = 0; i < cells; i++) {
        for (let j = 0; j < cells; j++) {
          const x = lo + ((hi - lo) * (i + 0.5)) / cells;
          const yy = hi - ((hi - lo) * (j + 0.5)) / cells;
          const o = predict(trainer.net, [x, yy])[0];
          ctx.fillStyle = `rgba(${(249 * o + 59 * (1 - o)) | 0},${(115 * o + 130 * (1 - o)) | 0},${(22 * o + 246 * (1 - o)) | 0},0.35)`;
          ctx.fillRect(px0 + i * cw, py0 + j * ch, cw + 0.5, ch + 0.5);
        }
      }
      GATE_INPUTS.forEach((x, i) => {
        const [px, py] = t.toPixel(x[0], x[1]);
        ctx.fillStyle = GATES.XOR[i] ? '#f97316' : '#3b82f6';
        ctx.beginPath();
        ctx.arc(px, py, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = (mlpOut[i] > 0.5 ? 1 : 0) === GATES.XOR[i] ? '#22c55e' : '#ef4444';
        ctx.stroke();
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 12px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(String(GATES.XOR[i]), px, py + 4);
        ctx.textAlign = 'left';
      });
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.fillText('2-2-1 MLP output over the input plane (orange = 1)', 10, t.height - 10);
    },
    [trainer.net, trainer.version, mlpOut], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-white">A. Single perceptron (step activation, perceptron learning rule)</h3>
          <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-800 p-1">
            {GATE_NAMES.map((g) => (
              <button key={g} type="button" onClick={() => selectGate(g)} className={['rounded-md px-3 py-1 text-sm font-medium transition', gate === g ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-700'].join(' ')}>{g}</button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <Slider label="Learning rate η" value={lr} min={0.01} max={1} step={0.01} decimals={2} onChange={setLr} />
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={['btn', loop.running ? '' : 'btn-primary'].join(' ')} onClick={loop.toggle}>{loop.running ? '❚❚ Pause' : '▶ Train'}</button>
              <button type="button" className="btn" onClick={loop.step}>⏭ Epoch</button>
              <button type="button" className="btn" onClick={() => reset()}>↺ Reset</button>
              <button type="button" className="btn" onClick={() => { setSeed(seed + 1); reset(seed + 1); }}>New seed</button>
            </div>
            <div className="mono rounded-md bg-slate-900 px-3 py-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">w₁</span><span className="text-white">{p.w[0].toFixed(3)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">w₂</span><span className="text-white">{p.w[1].toFixed(3)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">b</span><span className="text-white">{p.b.toFixed(3)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">epochs</span><span className="text-white">{errs.length}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">correct</span><span className={correct === 4 ? 'text-emerald-400' : 'text-amber-300'}>{correct} / 4</span></div>
            </div>
            <table className="mono w-full text-xs">
              <thead><tr className="text-slate-400"><th className="font-normal">x₁</th><th className="font-normal">x₂</th><th className="font-normal">target</th><th className="font-normal">output</th></tr></thead>
              <tbody className="text-center text-slate-200">
                {GATE_INPUTS.map((x, i) => (
                  <tr key={i} className={outputs[i] === y[i] ? '' : 'text-red-300'}><td>{x[0]}</td><td>{x[1]}</td><td>{y[i]}</td><td>{outputs[i]}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-slate-500">{gate === 'XOR' ? 'XOR is not linearly separable: no single line can put both 1s on one side, so the perceptron never converges (training stops after 200 epochs).' : `${gate} is linearly separable: the rule converges once every point is on the correct side of the line.`}</p>
          </div>
          <Canvas2D draw={drawPerceptron} view={{ cx: 0.5, cy: 0.5, scale: 150 }} aspect={1} interactive={false} />
          <div>
            <Plot title="Misclassified samples per epoch" data={errs.length ? errs.map((e) => ({ ...e })) : [{ epoch: 0, errors: 4 }]} xKey="epoch" xLabel="epoch" yDomain={[0, 4]} series={[{ key: 'errors', color: '#ef4444' }]} height={240} decimals={0} />
          </div>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-white">B. A 2-2-1 multilayer perceptron solves XOR</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className={['btn', trainer.running ? '' : 'btn-primary'].join(' ')} onClick={trainer.loop.toggle}>{trainer.running ? '❚❚ Pause' : '▶ Train'}</button>
            <button type="button" className="btn" onClick={() => trainer.reset()}>↺ Reset</button>
            <button type="button" className="btn" onClick={() => { setMlpSeed(mlpSeed + 1); trainer.reset(mlpSeed + 1); }}>New seed</button>
            <span className="mono ml-2 text-xs text-slate-400">epoch {trainer.epoch} · loss {trainer.history.length ? trainer.history[trainer.history.length - 1].loss.toFixed(4) : '—'} · <span className={mlpCorrect === 4 ? 'text-emerald-400' : 'text-amber-300'}>{mlpCorrect} / 4 correct</span></span>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_280px]">
          <Canvas2D draw={drawMlp} view={{ cx: 0.5, cy: 0.5, scale: 150 }} aspect={1} interactive={false} />
          <div className="space-y-2">
            <NetworkDiagram net={trainer.net} inputLabels={['x₁', 'x₂']} outputLabels={['XOR']} height={200} />
            <Plot data={trainer.history.map((h) => ({ epoch: h.epoch, loss: h.loss }))} xKey="epoch" xLabel="epoch" series={[{ key: 'loss', color: '#38bdf8' }]} height={150} decimals={4} />
          </div>
          <div className="space-y-2">
            <table className="mono w-full text-xs">
              <thead><tr className="text-slate-400"><th className="font-normal">x₁</th><th className="font-normal">x₂</th><th className="font-normal">XOR</th><th className="font-normal">net</th></tr></thead>
              <tbody className="text-center text-slate-200">
                {GATE_INPUTS.map((x, i) => (
                  <tr key={i}><td>{x[0]}</td><td>{x[1]}</td><td>{GATES.XOR[i]}</td><td className={(mlpOut[i] > 0.5 ? 1 : 0) === GATES.XOR[i] ? 'text-emerald-300' : 'text-red-300'}>{mlpOut[i].toFixed(3)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="mono text-xs text-slate-400">
              <div className="text-slate-300">weights (hidden ← input)</div>
              {trainer.net.W[0].map((row, j) => (
                <div key={j}>h{j + 1}: [{row.map((w) => w.toFixed(2)).join(', ')}] b = {trainer.net.b[0][j].toFixed(2)}</div>
              ))}
              <div className="mt-1 text-slate-300">output ← hidden</div>
              <div>y: [{trainer.net.W[1][0].map((w) => w.toFixed(2)).join(', ')}] b = {trainer.net.b[1][0].toFixed(2)}</div>
            </div>
            <p className="text-xs text-slate-500">Two hidden tanh units each draw one line; the output unit combines the two half-planes, which a single line cannot do. If training stalls in a local minimum (2 of 4 correct), press New seed.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
