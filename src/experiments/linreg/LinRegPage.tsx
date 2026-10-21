import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import ExperimentPage from '../../components/ExperimentPage';
import Equation from '../../components/Equation';
import NumberInput from '../../components/NumberInput';
import Slider from '../../components/Slider';
import Toggle from '../../components/Toggle';
import Plot from '../../components/Plot';
import ScatterPlot from '../../components/ScatterPlot';
import PlaybackControls from '../../components/PlaybackControls';
import { useFixedStepLoop } from '../../components/useFixedStepLoop';
import { findExperiment } from '../registry';
import { REGRESSION_DATASETS, type XYData } from '../../lib/ai/datasets';
import { linearRegression, trainTestSplit, type RegressionPayload, type RegressionResult } from '../../lib/ai/regression';
import { loadPyodideRuntime, runPython, subscribePyodide, type PyodideStatus, PYODIDE_VERSION } from '../../lib/py/pyodide';
import PROGRAM from './program.py?raw';

const experiment = findExperiment('linreg')!;
const ANIM_SECONDS = 4;
const fmt = (v: number | undefined | null, d = 4) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '—');

interface Row {
  x: number;
  y: number;
}

type Engine = 'python' | 'js';

export default function LinRegPage() {
  // --- data ------------------------------------------------------------------
  const [datasetId, setDatasetId] = useState('ir');
  const [seed, setSeed] = useState(1);
  const [meta, setMeta] = useState<XYData>(() => REGRESSION_DATASETS[0].make(1));
  const [rows, setRows] = useState<Row[]>(() => meta.x.map((x, i) => ({ x, y: meta.y[i] })));
  const [trainRatio, setTrainRatio] = useState(0.75);
  const [epochs, setEpochs] = useState(400);
  const [lr, setLr] = useState(0.1);
  const [printEvery, setPrintEvery] = useState(50);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDataset = (id: string, s = seed) => {
    const d = REGRESSION_DATASETS.find((x) => x.id === id) ?? REGRESSION_DATASETS[0];
    const data = d.make(s);
    setDatasetId(id);
    setMeta(data);
    setRows(data.x.map((x, i) => ({ x, y: data.y[i] })));
    setResult(null);
  };

  const onCsv = (file: File) => {
    file.text().then((text) => {
      const parsed: Row[] = [];
      let header: string[] | null = null;
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const cells = line.split(/[,;\t]/).map((c) => c.trim());
        const a = parseFloat(cells[0]);
        const b = parseFloat(cells[1]);
        if (Number.isFinite(a) && Number.isFinite(b)) parsed.push({ x: a, y: b });
        else if (!header && cells.length >= 2) header = cells;
      }
      if (parsed.length < 3) {
        setConsoleLines([`CSV error: need at least 3 rows of two numbers (got ${parsed.length}).`]);
        return;
      }
      setRows(parsed);
      setMeta({ x: parsed.map((r) => r.x), y: parsed.map((r) => r.y), xLabel: header?.[0] ?? 'x', yLabel: header?.[1] ?? 'y', name: `Uploaded: ${file.name}`, note: `${parsed.length} rows read from the file.` });
      setDatasetId('csv');
      setResult(null);
    });
  };

  const split = useMemo(() => trainTestSplit(rows.length, trainRatio, seed), [rows.length, trainRatio, seed]);
  const payload = useMemo<RegressionPayload>(
    () => ({
      x_train: split.train.map((i) => rows[i].x),
      y_train: split.train.map((i) => rows[i].y),
      x_test: split.test.map((i) => rows[i].x),
      y_test: split.test.map((i) => rows[i].y),
      x_label: meta.xLabel,
      y_label: meta.yLabel,
      epochs,
      lr,
      print_every: printEvery,
    }),
    [rows, split, meta, epochs, lr, printEvery],
  );

  // --- python runtime ----------------------------------------------------------
  const [pyStatus, setPyStatus] = useState<PyodideStatus>({ state: 'idle' });
  useEffect(() => subscribePyodide(setPyStatus), []);
  useEffect(() => {
    loadPyodideRuntime().catch(() => {});
  }, []);
  const [forceJs, setForceJs] = useState(false);
  const [code, setCode] = useState(PROGRAM);
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [result, setResult] = useState<RegressionResult | null>(null);
  const [engineUsed, setEngineUsed] = useState<Engine | null>(null);
  const [running, setRunning] = useState(false);
  const [runMs, setRunMs] = useState<number | null>(null);

  const runJs = useCallback(() => {
    const lines: string[] = [];
    const t0 = performance.now();
    const res = linearRegression(payload, (l) => lines.push(l));
    setConsoleLines(lines);
    setResult(res);
    setEngineUsed('js');
    setRunMs(performance.now() - t0);
  }, [payload]);

  const run = useCallback(async () => {
    setRunning(true);
    setResult(null);
    setConsoleLines([]);
    try {
      if (forceJs || pyStatus.state === 'error') {
        runJs();
        return;
      }
      if (pyStatus.state !== 'ready') setConsoleLines(['Waiting for the Python runtime to finish loading…']);
      const out = await runPython(code, { DATA_JSON: JSON.stringify(payload) });
      const lines = [...out.stdout];
      if (typeof out.value !== 'string') throw new Error('The program must end with json.dumps(results) so the page can read the results.');
      const parsed = JSON.parse(out.value) as RegressionResult;
      setConsoleLines(lines);
      setResult(parsed);
      setEngineUsed('python');
      setRunMs(out.ms);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (pyStatus.state === 'error' || /Could not download|loadPyodide/.test(msg)) {
        runJs();
      } else {
        setConsoleLines((l) => [...l.filter((x) => !x.startsWith('Waiting')), 'Python error:', ...msg.split('\n')]);
      }
    } finally {
      setRunning(false);
    }
  }, [code, payload, forceJs, pyStatus.state, runJs]);

  // --- animation of gradient descent ---------------------------------------------
  const frames = useMemo(() => {
    if (!result) return [] as { epoch: number; m: number; c: number }[];
    const snaps = result.gd.snapshots;
    const stride = Math.max(1, Math.ceil(snaps.length / 240));
    const out = snaps.map(([m, c], i) => ({ epoch: i + 1, m, c })).filter((_, i) => i % stride === 0 || i === snaps.length - 1);
    return out;
  }, [result]);
  const loop = useFixedStepLoop(() => {}, { duration: ANIM_SECONDS });
  useEffect(() => loop.seek(ANIM_SECONDS), [result]); // eslint-disable-line react-hooks/exhaustive-deps
  const frame = frames.length ? frames[Math.min(frames.length - 1, Math.floor((loop.time / ANIM_SECONDS) * (frames.length - 1)))] : null;

  // --- plot data ---------------------------------------------------------------------
  const xs = rows.map((r) => r.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const linePts = (m: number, c: number) => [
    { x: xMin, y: m * xMin + c },
    { x: xMax, y: m * xMax + c },
  ];
  const trainPts = split.train.map((i) => rows[i]);
  const testPts = split.test.map((i) => rows[i]);
  const residuals = result ? rows.map((r, i) => ({ x: r.x, y: r.y - (result.normal.m * r.x + result.normal.c), test: split.test.includes(i) })) : [];
  const lossData = result ? result.gd.loss.map((l, i) => ({ epoch: i + 1, loss: l })) : [];

  const statusBadge = (() => {
    switch (pyStatus.state) {
      case 'idle':
        return <span className="text-muted">Python runtime: not started</span>;
      case 'loading':
        return (
          <span className="flex items-center gap-2 text-cobalt">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-cobalt/30 border-t-cobalt" />
            Python runtime: {pyStatus.stage}…
          </span>
        );
      case 'ready':
        return <span className="text-leaf">Python {PYODIDE_VERSION} + numpy ready ({(pyStatus.loadMs / 1000).toFixed(1)} s)</span>;
      case 'error':
        return <span className="text-mustardInk">Python runtime unavailable: {pyStatus.message}</span>;
    }
  })();

  const metricsTable = (label: string, key: 'normal' | 'gd') =>
    result && (
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 font-medium">{label}</th>
            <th className="py-1 text-right font-medium">MSE</th>
            <th className="py-1 text-right font-medium">RMSE</th>
            <th className="py-1 text-right font-medium">MAE</th>
            <th className="py-1 text-right font-medium">R²</th>
          </tr>
        </thead>
        <tbody className="mono text-ink">
          {(['train', 'test'] as const).map((s) => {
            const mt = result.metrics[key][s];
            return (
              <tr key={s} className="border-t border-line">
                <td className="py-1 font-sans text-ink/80">{s} ({s === 'train' ? split.train.length : split.test.length} pts)</td>
                <td className="py-1 text-right">{fmt(mt?.mse)}</td>
                <td className="py-1 text-right">{fmt(mt?.rmse)}</td>
                <td className="py-1 text-right">{fmt(mt?.mae)}</td>
                <td className={['py-1 text-right', mt && mt.r2 > 0.9 ? 'text-leaf' : ''].join(' ')}>{fmt(mt?.r2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );

  return (
    <ExperimentPage
      experiment={experiment}
      aim={
        <p>
          To fit a straight line to sensor and actuator calibration data by least squares, implemented in Python running in the browser: solve the
          normal equations in closed form, reach the same line by gradient descent, and evaluate the fit with MSE, RMSE, MAE and R² on held-out data.
        </p>
      }
      theory={
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Hypothesis and cost</h3>
            <p>For n observations (xᵢ, yᵢ) the model predicts ŷ = m·x + c. The parameters are chosen to minimise the mean squared error:</p>
            <Equation tex={String.raw`h(x) = m\,x + c,\qquad J(m,c) = \frac{1}{2n}\sum_{i=1}^{n}\big(m x_i + c - y_i\big)^2`} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Normal equations (closed form)</h3>
            <p>Setting ∂J/∂m = ∂J/∂c = 0 gives two linear equations whose solution is</p>
            <Equation tex={String.raw`m = \frac{\sum (x_i - \bar{x})(y_i - \bar{y})}{\sum (x_i - \bar{x})^2},\qquad c = \bar{y} - m\,\bar{x}`} />
            <p>or, with the design matrix X = [1 x] and θ = [c m]ᵀ, the general form used for any number of features:</p>
            <Equation tex={String.raw`\theta = (X^{T}X)^{-1}X^{T}y`} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Gradient descent</h3>
            <p>Starting from any (m, c), repeatedly step against the gradient with learning rate α until the cost stops decreasing:</p>
            <Equation tex={String.raw`\frac{\partial J}{\partial m} = \frac{1}{n}\sum (m x_i + c - y_i)\,x_i,\qquad \frac{\partial J}{\partial c} = \frac{1}{n}\sum (m x_i + c - y_i)`} />
            <Equation tex={String.raw`m \leftarrow m - \alpha\,\frac{\partial J}{\partial m},\qquad c \leftarrow c - \alpha\,\frac{\partial J}{\partial c}`} />
            <p>
              The program standardises x and y first so that one α works for volts, RPM or centimetres alike, then converts the parameters back to
              real units. Too large an α diverges, too small one converges slowly — try it.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Evaluating the fit</h3>
            <Equation tex={String.raw`\mathrm{MSE} = \frac{1}{n}\sum r_i^2,\quad \mathrm{RMSE} = \sqrt{\mathrm{MSE}},\quad \mathrm{MAE} = \frac{1}{n}\sum |r_i|,\quad R^2 = 1 - \frac{\sum r_i^2}{\sum (y_i - \bar{y})^2},\qquad r_i = y_i - \hat{y}_i`} />
            <p>Metrics on the training set measure how well the line fits; on the test set, how well it generalises to new measurements.</p>
          </div>
        </div>
      }
      simulation={
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="card space-y-4 self-start">
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">Dataset</div>
                <select value={datasetId} onChange={(e) => loadDataset(e.target.value)} className="w-full rounded-md border border-line bg-field px-2 py-1.5 text-sm text-ink focus:border-cobalt focus:outline-none">
                  {REGRESSION_DATASETS.map((d) => (
                    <option key={d.id} value={d.id}>{d.make(1).name}</option>
                  ))}
                  {datasetId === 'csv' && <option value="csv">{meta.name}</option>}
                </select>
                <p className="text-xs text-muted">{meta.note}</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className="btn" onClick={() => { setSeed((s) => s + 1); if (datasetId !== 'csv') loadDataset(datasetId, seed + 1); }}>Regenerate (seed {seed + 1})</button>
                  <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Upload CSV</button>
                  <input ref={fileRef} type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onCsv(f); e.target.value = ''; }} />
                </div>
              </div>
              <div className="space-y-2 border-t border-line pt-3">
                <Slider label="Training fraction" value={trainRatio} min={0.5} max={0.9} step={0.05} decimals={2} onChange={setTrainRatio} />
                <p className="mono text-xs text-muted">{split.train.length} train / {split.test.length} test (seeded shuffle)</p>
              </div>
              <div className="space-y-2 border-t border-line pt-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">Gradient descent</div>
                <NumberInput label="Epochs" value={epochs} min={1} max={5000} step={50} decimals={0} onChange={(v) => setEpochs(Math.round(v))} />
                <NumberInput label="Learning rate α" value={lr} min={0.0001} max={2} step={0.01} decimals={4} onChange={setLr} hint="α ≥ 2 diverges on standardised data" />
                <NumberInput label="Print every N epochs" value={printEvery} min={1} max={5000} step={10} decimals={0} onChange={(v) => setPrintEvery(Math.round(v))} />
              </div>
              <div className="space-y-2 border-t border-line pt-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">Data table ({rows.length} rows)</div>
                <div className="max-h-56 overflow-y-auto rounded-md border border-line">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-field text-muted">
                      <tr>
                        <th className="px-2 py-1 text-left font-medium">#</th>
                        <th className="px-2 py-1 text-left font-medium">{meta.xLabel}</th>
                        <th className="px-2 py-1 text-left font-medium">{meta.yLabel}</th>
                        <th className="px-1 py-1" />
                      </tr>
                    </thead>
                    <tbody className="mono">
                      {rows.map((r, i) => (
                        <tr key={i} className={['border-t border-line', split.test.includes(i) ? 'text-mustardInk' : 'text-ink'].join(' ')}>
                          <td className="px-2 py-0.5 text-muted">{i + 1}</td>
                          <td className="px-1 py-0.5"><input type="number" step="any" value={r.x} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setRows((rs) => rs.map((q, k) => (k === i ? { ...q, x: v } : q))); }} className="w-full rounded bg-field px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-sky-500" /></td>
                          <td className="px-1 py-0.5"><input type="number" step="any" value={r.y} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setRows((rs) => rs.map((q, k) => (k === i ? { ...q, y: v } : q))); }} className="w-full rounded bg-field px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-sky-500" /></td>
                          <td className="px-1 py-0.5"><button type="button" className="text-muted hover:text-tomato" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} aria-label={`delete row ${i + 1}`}>×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between">
                  <button type="button" className="btn" onClick={() => setRows((rs) => [...rs, { x: rs.length ? rs[rs.length - 1].x : 0, y: rs.length ? rs[rs.length - 1].y : 0 }])}>+ Add row</button>
                  <span className="text-xs text-mustardInk/80">amber rows = test set</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="card space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  {statusBadge}
                  <div className="flex items-center gap-3">
                    <Toggle label="Use JS implementation" checked={forceJs} onChange={setForceJs} />
                    <button type="button" className="btn" onClick={() => setCode(PROGRAM)} disabled={code === PROGRAM}>Reset code</button>
                    <button type="button" className="btn btn-primary" onClick={run} disabled={running || rows.length < 3}>
                      {running ? 'Running…' : '▶ Run'}
                    </button>
                  </div>
                </div>
                {engineUsed === 'js' && (
                  <div className="rounded-md border border-mustard/60 bg-mustard/15 px-3 py-1.5 text-sm text-mustardInk">
                    {forceJs ? 'Running JS implementation (Python bypassed)' : 'Running JS fallback (offline)'} — same algorithm in TypeScript.
                  </div>
                )}
                <div className="overflow-hidden rounded-lg border border-line">
                  <CodeMirror value={code} height="420px" theme="light" extensions={[python()]} onChange={setCode} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }} style={{ fontSize: 13 }} />
                </div>
              </div>
              <div className="card">
                <div className="mb-1 flex items-center justify-between text-xs text-muted">
                  <span>Console output</span>
                  <span className="mono">{runMs !== null && engineUsed ? `${engineUsed === 'python' ? 'Python' : 'JS'} · ${runMs.toFixed(0)} ms` : ''}</span>
                </div>
                <pre className="mono max-h-64 min-h-[96px] overflow-auto rounded-md bg-field p-3 text-xs leading-relaxed text-ink">{consoleLines.length ? consoleLines.join('\n') : running ? 'Running…' : 'Press Run to execute the program.'}</pre>
              </div>
            </div>
          </div>
        </div>
      }
      results={
        result ? (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card">
                <ScatterPlot
                  title="Data and fitted lines"
                  xLabel={meta.xLabel}
                  yLabel={meta.yLabel}
                  scatter={[
                    { name: 'train', points: trainPts, color: '#2F5FD0' },
                    { name: 'test', points: testPts, color: '#F2B33D' },
                  ]}
                  lines={[
                    { name: `normal eq.  y = ${result.normal.m.toFixed(4)}x + ${result.normal.c.toFixed(3)}`, points: linePts(result.normal.m, result.normal.c), color: '#3F9B57' },
                    { name: `gradient descent  y = ${result.gd.m.toFixed(4)}x + ${result.gd.c.toFixed(3)}`, points: linePts(result.gd.m, result.gd.c), color: '#E5533D', dashed: true },
                  ]}
                  height={280}
                />
              </div>
              <div className="card">
                <ScatterPlot
                  title="Residuals  r = y − ŷ  (normal-equation line)"
                  xLabel={meta.xLabel}
                  yLabel={`residual (${meta.yLabel.replace(/.*\(|\)/g, '')})`}
                  scatter={[
                    { name: 'train', points: residuals.filter((r) => !r.test), color: '#2F5FD0' },
                    { name: 'test', points: residuals.filter((r) => r.test), color: '#F2B33D' },
                  ]}
                  yZeroLine
                  height={280}
                />
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card">
                <Plot title="Gradient-descent loss (training MSE)" data={lossData} xKey="epoch" xLabel="epoch" yLabel="MSE" series={[{ key: 'loss', label: 'MSE', color: '#E5533D' }]} xMarker={frame?.epoch} height={260} decimals={4} />
              </div>
              <div className="card space-y-2">
                <ScatterPlot
                  title={frame ? `Line converging — epoch ${frame.epoch}: m = ${frame.m.toFixed(4)}, c = ${frame.c.toFixed(3)}` : 'Line converging'}
                  xLabel={meta.xLabel}
                  yLabel={meta.yLabel}
                  scatter={[{ name: 'train', points: trainPts, color: '#2F5FD0' }]}
                  lines={[
                    { name: 'target (normal eq.)', points: linePts(result.normal.m, result.normal.c), color: '#3F9B57', dashed: true },
                    ...(frame ? [{ name: 'gradient descent', points: linePts(frame.m, frame.c), color: '#E5533D' }] : []),
                  ]}
                  height={220}
                />
                <PlaybackControls loop={loop} />
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card">{metricsTable('Normal equations', 'normal')}</div>
              <div className="card">{metricsTable('Gradient descent', 'gd')}</div>
            </div>
            <p className="text-xs text-muted">
              Computed by {engineUsed === 'python' ? 'the Python program above (Pyodide + numpy)' : 'the TypeScript implementation'} on {split.train.length} training and {split.test.length} test points.
              |m_GD − m_NE| = {Math.abs(result.gd.m - result.normal.m).toExponential(2)} — increase the epochs or the learning rate if gradient descent has not fully converged.
            </p>
          </div>
        ) : (
          <p className="text-muted">Press Run in the Simulation section to compute the fit; the plots and metrics appear here.</p>
        )
      }
      conclusion={
        <div className="space-y-2">
          <p>
            Least squares has a closed-form answer: the normal equations give the slope and intercept directly from the data means and
            covariances. Gradient descent reaches the same line iteratively, and the loss curve shows how the learning rate trades speed against
            stability; on standardised data a few hundred epochs reproduce the closed form to many decimals.
          </p>
          <p>
            The metrics tell different stories: R² near 1 and small RMSE mean the linear model explains the data, while a structured residual
            pattern — as for the inverse-law IR sensor — reveals that a straight line is the wrong model even when R² looks acceptable. Comparing
            train and test metrics shows whether the calibration will hold for new measurements.
          </p>
        </div>
      }
    />
  );
}
