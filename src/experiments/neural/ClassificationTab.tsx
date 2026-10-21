import { useCallback, useMemo, useState } from 'react';
import Canvas2D, { type Transform } from '../../components/Canvas2D';
import Plot from '../../components/Plot';
import Slider from '../../components/Slider';
import { CLASS_DATASETS } from '../../lib/ai/datasets';
import { accuracy, classMetrics, confusionMatrix, createMLP, meanLoss, oneHot, predict } from '../../lib/ai/mlp';
import { trainTestSplit } from '../../lib/ai/regression';
import NetControls, { DEFAULT_SETTINGS, hiddenOf, type NetSettings } from './NetControls';
import NetworkDiagram from './NetworkDiagram';
import { useTraining } from './useTraining';

const COLORS = ['#2F5FD0', '#E5533D', '#3F9B57', '#F2B33D'];
const RGB = COLORS.map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);

export default function ClassificationTab() {
  const [datasetId, setDatasetId] = useState('circles');
  const [seed, setSeed] = useState(1);
  const [settings, setSettings] = useState<NetSettings>(DEFAULT_SETTINGS);
  const [trainRatio, setTrainRatio] = useState(0.8);

  const data = useMemo(() => (CLASS_DATASETS.find((d) => d.id === datasetId) ?? CLASS_DATASETS[0]).make(seed), [datasetId, seed]);
  const split = useMemo(() => trainTestSplit(data.X.length, trainRatio, seed), [data, trainRatio, seed]);
  const Xtr = useMemo(() => split.train.map((i) => data.X[i]), [split, data]);
  const ltr = useMemo(() => split.train.map((i) => data.labels[i]), [split, data]);
  const Ytr = useMemo(() => ltr.map((l) => oneHot(l, data.k)), [ltr, data.k]);
  const Xte = useMemo(() => split.test.map((i) => data.X[i]), [split, data]);
  const lte = useMemo(() => split.test.map((i) => data.labels[i]), [split, data]);
  const Yte = useMemo(() => lte.map((l) => oneHot(l, data.k)), [lte, data.k]);

  const build = useCallback((s: number) => createMLP({ layers: [2, ...hiddenOf(settings), data.k], activation: settings.activation, loss: 'softmax-ce', seed: s }), [settings.hiddenLayers, settings.neurons, settings.activation, data.k]); // eslint-disable-line react-hooks/exhaustive-deps
  const trainer = useTraining(build, Xtr, Ytr, {
    lr: settings.lr,
    batchSize: settings.batchSize,
    momentum: settings.momentum,
    epochsPerFrame: settings.epochsPerFrame,
    seed,
    extra: (net) => ({ acc: accuracy(net, Xtr, ltr), testAcc: accuracy(net, Xte, lte), testLoss: Xte.length ? meanLoss(net, Xte, Yte) : NaN }),
  });
  const { net, version } = trainer;

  const cm = useMemo(() => confusionMatrix(net, Xte, lte, data.k), [net, Xte, lte, data.k, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const metrics = useMemo(() => classMetrics(cm), [cm]);
  const last = trainer.history[trainer.history.length - 1];

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform) => {
      const [lo, hi] = data.range;
      const cells = 64;
      const [px0, py0] = t.toPixel(lo, hi);
      const [px1, py1] = t.toPixel(hi, lo);
      const cw = (px1 - px0) / cells;
      const ch = (py1 - py0) / cells;
      for (let i = 0; i < cells; i++) {
        for (let j = 0; j < cells; j++) {
          const x = lo + ((hi - lo) * (i + 0.5)) / cells;
          const y = hi - ((hi - lo) * (j + 0.5)) / cells;
          const p = predict(net, [x, y]);
          let r = 0;
          let g = 0;
          let b = 0;
          p.forEach((pc, c) => {
            r += pc * RGB[c % RGB.length][0];
            g += pc * RGB[c % RGB.length][1];
            b += pc * RGB[c % RGB.length][2];
          });
          ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},0.35)`;
          ctx.fillRect(px0 + i * cw, py0 + j * ch, cw + 0.5, ch + 0.5);
        }
      }
      // decision boundary contour: cells whose neighbours disagree
      const points = (idx: number[], hollow: boolean) => {
        for (const i of idx) {
          const [px, py] = t.toPixel(data.X[i][0], data.X[i][1]);
          ctx.beginPath();
          ctx.arc(px, py, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = hollow ? '#FBFAF7' : COLORS[data.labels[i] % COLORS.length];
          ctx.fill();
          ctx.lineWidth = hollow ? 2 : 1;
          ctx.strokeStyle = hollow ? COLORS[data.labels[i] % COLORS.length] : '#FBFAF7';
          ctx.stroke();
        }
      };
      points(split.train, false);
      points(split.test, true);
      ctx.fillStyle = '#6B665C';
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.fillText(`${data.name} · filled = train, hollow = test · ${data.xLabel} / ${data.yLabel}`, 10, t.height - 10);
    },
    [net, data, split, version], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const controls = (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Dataset</div>
        <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)} className="w-full rounded-md border border-line bg-field px-2 py-1.5 text-sm text-ink">
          {CLASS_DATASETS.map((d) => (
            <option key={d.id} value={d.id}>{d.make(1).name}</option>
          ))}
        </select>
        <Slider label="Training fraction" value={trainRatio} min={0.5} max={0.9} step={0.05} decimals={2} onChange={setTrainRatio} />
      </div>
      <NetControls settings={settings} onChange={setSettings} trainer={trainer} seed={seed} onSeed={setSeed} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="card self-start">{controls}</div>
        <div className="space-y-3">
          <Canvas2D draw={draw} view={{ cx: 0, cy: 0, scale: 180 }} aspect={16 / 10} interactive={false} showGrid={false} />
          <div className="card"><NetworkDiagram net={net} inputLabels={['x₁', 'x₂']} outputLabels={Array.from({ length: data.k }, (_, c) => `class ${c}`)} height={200} /></div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card">
          <Plot title="Loss (cross-entropy)" data={trainer.history.map((h) => ({ epoch: h.epoch, train: h.loss, test: Number.isFinite(h.testLoss) ? h.testLoss : null }))} xKey="epoch" xLabel="epoch" series={[{ key: 'train', color: '#2F5FD0' }, { key: 'test', color: '#F2B33D', dashed: true }]} height={220} decimals={4} />
        </div>
        <div className="card">
          <Plot title="Accuracy" data={trainer.history.map((h) => ({ epoch: h.epoch, train: h.acc, test: h.testAcc }))} xKey="epoch" xLabel="epoch" yDomain={[0, 1]} series={[{ key: 'train', color: '#2F5FD0' }, { key: 'test', color: '#F2B33D', dashed: true }]} height={220} decimals={3} />
        </div>
        <div className="card space-y-3">
          <div>
            <div className="mb-1 text-sm font-medium text-ink/80">Confusion matrix (test, {Xte.length} pts)</div>
            <table className="mono text-sm">
              <thead>
                <tr className="text-muted"><th className="pr-2 font-normal">true \ pred</th>{cm.map((_, c) => <th key={c} className="px-2 font-normal">{c}</th>)}</tr>
              </thead>
              <tbody>
                {cm.map((row, tI) => (
                  <tr key={tI}><td className="pr-2 text-muted">{tI}</td>{row.map((v, pI) => <td key={pI} className={['px-2 py-0.5 text-center', tI === pI ? 'bg-leaf/15 text-leaf' : v > 0 ? 'bg-tomato/15 text-tomato' : 'text-muted'].join(' ')}>{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted"><th className="py-0.5 font-medium">class</th><th className="py-0.5 text-right font-medium">precision</th><th className="py-0.5 text-right font-medium">recall</th><th className="py-0.5 text-right font-medium">F1</th></tr></thead>
            <tbody className="mono text-ink">
              {metrics.map((m, c) => (
                <tr key={c} className="border-t border-line"><td className="py-0.5"><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: COLORS[c % COLORS.length] }} />{c}</td><td className="py-0.5 text-right">{m.precision.toFixed(3)}</td><td className="py-0.5 text-right">{m.recall.toFixed(3)}</td><td className="py-0.5 text-right">{m.f1.toFixed(3)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="mono text-xs text-muted">train acc {last ? (100 * last.acc).toFixed(1) : '—'} % · test acc {last ? (100 * last.testAcc).toFixed(1) : '—'} %</div>
        </div>
      </div>
    </div>
  );
}
