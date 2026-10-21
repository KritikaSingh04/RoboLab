import { useCallback, useMemo, useState } from 'react';
import ExperimentPage, { SimulationLayout } from '../../components/ExperimentPage';
import Equation from '../../components/Equation';
import Slider from '../../components/Slider';
import Toggle from '../../components/Toggle';
import Plot from '../../components/Plot';
import { findExperiment } from '../registry';
import { initialise, stepAssign, stepUpdate, stepIteration, elbow, silhouette, summarise, fuzzyCMeans, METRICS, type Init, type KMeansState, type Metric, type Point } from '../../lib/ai/kmeans';
import { blobs, moons, uniform, lidarScan, type LidarScan } from '../../lib/ai/datasets';
import KMeansCanvas, { CLUSTER_COLORS } from './KMeansCanvas';

const experiment = findExperiment('kmeans')!;
const MAX_ITER = 100;
const METRIC_LABEL: Record<Metric, string> = { euclidean: 'Euclidean', manhattan: 'Manhattan', chebyshev: 'Chebyshev' };
const fmt = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—');

export default function KMeansPage() {
  const [points, setPoints] = useState<Point[]>(() => blobs(4, 0.5, 60, 1).points);
  const [scene, setScene] = useState<LidarScan | null>(null);
  const [k, setK] = useState(4);
  const [metric, setMetric] = useState<Metric>('euclidean');
  const [init, setInit] = useState<Init>('kmeans++');
  const [seed, setSeed] = useState(1);
  const [state, setState] = useState<KMeansState | null>(null);
  const [history, setHistory] = useState<{ iteration: number; wcss: number }[]>([]);
  const [showVoronoi, setShowVoronoi] = useState(true);
  const [elbowData, setElbowData] = useState<{ k: number; wcss: number }[] | null>(null);
  // dataset generator parameters
  const [nBlobs, setNBlobs] = useState(4);
  const [spread, setSpread] = useState(0.5);
  const [nObstacles, setNObstacles] = useState(4);
  // fuzzy c-means
  const [showFcm, setShowFcm] = useState(false);
  const [m, setM] = useState(2);

  const resetRun = useCallback(() => {
    setState(null);
    setHistory([]);
    setElbowData(null);
  }, []);
  const loadData = (pts: Point[], sc: LidarScan | null = null) => {
    setPoints(pts);
    setScene(sc);
    resetRun();
  };
  const addPoint = useCallback(
    (p: Point) => {
      setPoints((ps) => [...ps, p]);
      resetRun();
    },
    [resetRun],
  );

  // --- k-means actions -----------------------------------------------------
  const opts = { metric, init, seed };
  const doInit = () => {
    if (points.length === 0) return;
    const s = initialise(points, k, opts);
    setState(s);
    setHistory([{ iteration: 0, wcss: s.wcss }]);
  };
  const doAssign = () => {
    const s = state ?? initialise(points, k, opts);
    setState(stepAssign(points, s));
    if (!state) setHistory([{ iteration: 0, wcss: s.wcss }]);
  };
  const doUpdate = () => {
    const base = state ?? initialise(points, k, opts);
    const assigned = base.phase === 'assigned' ? base : stepAssign(points, base);
    const s = stepUpdate(points, assigned);
    setState(s);
    setHistory((h) => [...(state ? h : [{ iteration: 0, wcss: base.wcss }]), { iteration: s.iteration, wcss: s.wcss }]);
  };
  const doStep = () => {
    const base = state ?? initialise(points, k, opts);
    const s = stepIteration(points, base);
    setState(s);
    setHistory((h) => [...(state ? h : [{ iteration: 0, wcss: base.wcss }]), { iteration: s.iteration, wcss: s.wcss }]);
  };
  const doRun = () => {
    let s = state ?? initialise(points, k, opts);
    const h = state ? [...history] : [{ iteration: 0, wcss: s.wcss }];
    while (!s.converged && s.iteration < MAX_ITER) {
      s = stepIteration(points, s);
      h.push({ iteration: s.iteration, wcss: s.wcss });
    }
    s = stepAssign(points, s);
    h[h.length - 1] = { iteration: s.iteration, wcss: s.wcss };
    setState(s);
    setHistory(h);
  };
  const computeElbow = () => setElbowData(elbow(points, 10, opts, 4));

  // --- derived results ---------------------------------------------------------
  const summary = useMemo(() => (state && state.phase !== 'init' ? summarise(points, state) : []), [points, state]);
  const sil = useMemo(() => (state && state.phase !== 'init' && points.length <= 2000 ? silhouette(points, state.labels, metric) : null), [points, state, metric]);
  const fcm = useMemo(() => (showFcm && points.length ? fuzzyCMeans(points, k, m, { metric, seed }) : null), [showFcm, points, k, m, metric, seed]);

  const controls = (
    <>
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Data</div>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className="btn" onClick={() => loadData(blobs(nBlobs, spread, 60, seed).points)}>Blobs</button>
          <button type="button" className="btn" onClick={() => loadData(moons(240, 0.12, seed).points)}>Moons</button>
          <button type="button" className="btn" onClick={() => loadData(uniform(200, seed).points)}>Uniform</button>
          <button type="button" className="btn" onClick={() => { const sc = lidarScan(nObstacles, seed); loadData(sc.points, sc); }}>LiDAR scan</button>
        </div>
        <Slider label="Blobs" value={nBlobs} min={2} max={8} step={1} decimals={0} onChange={setNBlobs} />
        <Slider label="Blob spread σ" value={spread} min={0.1} max={1.5} step={0.05} unit="m" decimals={2} onChange={setSpread} />
        <Slider label="LiDAR obstacles" value={nObstacles} min={3} max={5} step={1} decimals={0} onChange={setNObstacles} />
        <div className="flex gap-1.5">
          <button type="button" className="btn" onClick={() => loadData([])}>Clear</button>
          <button type="button" className="btn" onClick={() => setSeed((s) => s + 1)}>Seed {seed} → {seed + 1}</button>
        </div>
      </div>

      <div className="space-y-2 border-t border-line pt-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Algorithm</div>
        <Slider label="k (clusters)" value={k} min={1} max={10} step={1} decimals={0} onChange={(v) => { setK(v); resetRun(); }} />
        <div>
          <div className="label mb-1">Distance</div>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-sidebar p-1">
            {METRICS.map((mt) => (
              <button key={mt} type="button" onClick={() => { setMetric(mt); resetRun(); }} className={['rounded-md px-1 py-1 text-xs font-medium transition', metric === mt ? 'bg-cobalt text-white' : 'text-ink/80 hover:bg-line'].join(' ')}>
                {METRIC_LABEL[mt]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="label mb-1">Initialisation</div>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-sidebar p-1">
            {(['random', 'kmeans++'] as Init[]).map((it) => (
              <button key={it} type="button" onClick={() => { setInit(it); resetRun(); }} className={['rounded-md px-2 py-1 text-xs font-medium transition', init === it ? 'bg-cobalt text-white' : 'text-ink/80 hover:bg-line'].join(' ')}>
                {it === 'kmeans++' ? 'k-means++' : 'random'}
              </button>
            ))}
          </div>
        </div>
        <Toggle label="Voronoi shading" checked={showVoronoi} onChange={setShowVoronoi} />
      </div>

      <div className="space-y-2 border-t border-line pt-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Step by step</div>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className="btn" onClick={doInit} disabled={points.length === 0}>1. Initialise</button>
          <button type="button" className="btn" onClick={doAssign} disabled={points.length === 0 || state?.converged}>2. Assign</button>
          <button type="button" className="btn" onClick={doUpdate} disabled={points.length === 0 || state?.converged}>3. Update centroids</button>
          <button type="button" className="btn" onClick={doStep} disabled={points.length === 0 || state?.converged}>Step (2 + 3)</button>
        </div>
        <button type="button" className="btn btn-primary w-full" onClick={doRun} disabled={points.length === 0 || state?.converged}>
          ▶ Run to convergence
        </button>
        <div className="mono rounded-md bg-field px-3 py-2 text-sm">
          <div className="flex justify-between"><span className="text-muted">iteration</span><span className="text-ink">{state?.iteration ?? 0}</span></div>
          <div className="flex justify-between"><span className="text-muted">phase</span><span className="text-ink">{state ? state.phase : 'not started'}</span></div>
          <div className="flex justify-between"><span className="text-muted">WCSS</span><span className="text-ink">{state ? fmt(state.wcss) : '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted">max centroid move</span><span className="text-ink">{state && state.iteration > 0 ? Math.max(...state.moved).toExponential(2) : '—'}</span></div>
          <div className="flex justify-between"><span className="text-muted">converged</span><span className={state?.converged ? 'text-leaf' : 'text-ink'}>{state?.converged ? 'yes' : 'no'}</span></div>
        </div>
      </div>
    </>
  );

  return (
    <ExperimentPage
      experiment={experiment}
      aim={
        <p>
          To implement the k-means clustering algorithm from scratch, observe its assignment and update steps on 2D data including a robot's LiDAR
          scan, choose k with the elbow method, assess cluster quality with the silhouette score, and compare with fuzzy c-means.
        </p>
      }
      theory={
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Objective</h3>
            <p>k-means partitions n points into k clusters C₁…C_k with centroids μ_j so as to minimise the within-cluster sum of squares (WCSS):</p>
            <Equation tex={String.raw`J = \sum_{j=1}^{k}\sum_{x_i \in C_j} d(x_i, \mu_j)^2`} />
            <p>
              The distance d is Euclidean by default; Manhattan |Δx| + |Δy| and Chebyshev max(|Δx|, |Δy|) are offered for comparison. With the
              Euclidean metric the mean is the point that minimises the squared distances, which is what guarantees convergence.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Lloyd's algorithm</h3>
            <Equation tex={String.raw`\text{Assign:}\quad c_i \leftarrow \arg\min_j d(x_i, \mu_j)\qquad\qquad \text{Update:}\quad \mu_j \leftarrow \frac{1}{|C_j|}\sum_{x_i \in C_j} x_i`} />
            <p>
              Each step can only decrease J: reassigning a point to a nearer centroid lowers its term, and moving a centroid to the mean lowers the
              cluster's sum of squared distances. Since J is bounded below and there are finitely many partitions, the algorithm converges — to a
              local minimum that depends on the initialisation. Convergence is detected when no centroid moves.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Initialisation: random vs k-means++</h3>
            <p>
              Random initialisation picks k data points. k-means++ picks the first at random and each next centre with probability proportional to
              D(x)², the squared distance to the nearest centre already chosen, spreading the centres out and avoiding poor local minima.
            </p>
            <Equation tex={String.raw`P(x) = \frac{D(x)^2}{\sum_{x'} D(x')^2}`} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Choosing k and judging quality</h3>
            <p>
              The <em>elbow method</em> plots the converged WCSS against k; the "elbow" where the curve flattens suggests the natural number of
              clusters. The <em>silhouette</em> of a point compares its mean distance a to its own cluster with the mean distance b to the nearest
              other cluster; values near 1 mean well-separated clusters, near 0 overlapping ones.
            </p>
            <Equation tex={String.raw`s_i = \frac{b_i - a_i}{\max(a_i, b_i)},\qquad S = \frac{1}{n}\sum_i s_i`} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Fuzzy c-means</h3>
            <p>Instead of a hard label each point gets memberships u_ij ∈ [0, 1] summing to 1; the fuzziness m &gt; 1 controls how soft they are:</p>
            <Equation tex={String.raw`J_m = \sum_i\sum_j u_{ij}^m\, d(x_i,\mu_j)^2,\qquad u_{ij} = \frac{1}{\sum_l \left(d_{ij}/d_{il}\right)^{2/(m-1)}},\qquad \mu_j = \frac{\sum_i u_{ij}^m x_i}{\sum_i u_{ij}^m}`} />
          </div>
        </div>
      }
      simulation={
        <SimulationLayout controls={controls}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>
                {state && state.phase !== 'init' ? (
                  <>
                    {state.centroids.map((_, j) => (
                      <span key={j} className="mr-2"><span className="mr-1 inline-block h-2 w-3" style={{ background: CLUSTER_COLORS[j % CLUSTER_COLORS.length] }} />C{j + 1}</span>
                    ))}
                  </>
                ) : (
                  'Points are grey until assigned. Drag with shift to pan, scroll to zoom.'
                )}
              </span>
              <span className="mono">{METRIC_LABEL[metric]} · {init === 'kmeans++' ? 'k-means++' : 'random'} init · seed {seed}</span>
            </div>
            <KMeansCanvas points={points} state={state} metric={metric} showVoronoi={showVoronoi} scene={scene} onAddPoint={addPoint} />
            {state && state.phase === 'updated' && (
              <p className="text-xs text-muted">Dashed lines show how far each centroid moved in iteration {state.iteration} (from the hollow dot to the X).</p>
            )}
          </div>
        </SimulationLayout>
      }
      results={
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card">
              {history.length > 1 ? (
                <Plot title="WCSS per iteration" data={history} xKey="iteration" xLabel="iteration" yLabel="WCSS" series={[{ key: 'wcss', label: 'WCSS', color: '#2F5FD0' }]} height={240} decimals={3} xTicks={history.map((h) => h.iteration)} />
              ) : (
                <div className="flex h-60 flex-col items-center justify-center text-sm text-muted">
                  <div className="font-medium text-ink/80">WCSS per iteration</div>
                  Run at least one iteration to see the objective decrease.
                </div>
              )}
            </div>
            <div className="card">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium text-ink/80">Elbow plot: converged WCSS vs k (k = 1…10, best of 4 restarts)</div>
                <button type="button" className="btn" onClick={computeElbow} disabled={points.length === 0}>Compute</button>
              </div>
              {elbowData ? (
                <Plot data={elbowData} xKey="k" xLabel="k" yLabel="WCSS" series={[{ key: 'wcss', label: 'WCSS', color: '#E5533D' }]} xMarker={k} height={210} decimals={2} xTicks={elbowData.map((e) => e.k)} />
              ) : (
                <div className="flex h-52 items-center justify-center text-sm text-muted">Press Compute to run k-means for every k.</div>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="card">
              <h3 className="mb-2 font-semibold text-ink">Cluster sizes</h3>
              {summary.length ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted">
                      <th className="py-1 font-medium">Cluster</th>
                      <th className="py-1 text-right font-medium">Size</th>
                      <th className="py-1 text-right font-medium">Centroid x</th>
                      <th className="py-1 text-right font-medium">Centroid y</th>
                      <th className="py-1 text-right font-medium">Mean distance</th>
                      <th className="py-1 text-right font-medium">WCSS share</th>
                    </tr>
                  </thead>
                  <tbody className="mono">
                    {summary.map((c) => (
                      <tr key={c.cluster} className="border-t border-line text-ink">
                        <td className="py-1 font-sans"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CLUSTER_COLORS[c.cluster % CLUSTER_COLORS.length] }} />C{c.cluster + 1}</td>
                        <td className="py-1 text-right">{c.size}</td>
                        <td className="py-1 text-right">{fmt(c.centroid[0])}</td>
                        <td className="py-1 text-right">{fmt(c.centroid[1])}</td>
                        <td className="py-1 text-right">{fmt(c.meanDist)}</td>
                        <td className="py-1 text-right">{state && state.wcss > 0 ? `${((100 * c.wcss) / state.wcss).toFixed(1)} %` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted">Assign points to see the cluster sizes.</p>
              )}
            </div>
            <div className="card">
              <h3 className="mb-2 font-semibold text-ink">Silhouette score</h3>
              {sil !== null ? (
                <>
                  <div className="mono text-3xl font-semibold text-ink">{sil.toFixed(3)}</div>
                  <div className="mt-2 h-2 w-full rounded-full bg-sidebar">
                    <div className="h-2 rounded-full bg-leaf" style={{ width: `${Math.max(0, Math.min(1, (sil + 1) / 2)) * 100}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {sil > 0.7 ? 'Strong structure: clusters are compact and well separated.' : sil > 0.5 ? 'Reasonable structure.' : sil > 0.25 ? 'Weak structure: clusters overlap.' : 'No substantial structure found for this k.'}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">Assign points (with k ≥ 2) to compute the silhouette.</p>
              )}
            </div>
          </div>

          <div className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-ink">Bonus: fuzzy c-means (syllabus 4.3)</h3>
                <p className="text-xs text-muted">Same data and c = k. Each point is shaded by mixing the cluster colours with its memberships.</p>
              </div>
              <Toggle label="Run fuzzy c-means" checked={showFcm} onChange={setShowFcm} />
            </div>
            {showFcm && fcm && (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                <KMeansCanvas points={points} state={null} metric={metric} showVoronoi={false} membership={fcm.membership} fcmCentroids={fcm.centroids} scene={scene} />
                <div className="space-y-3">
                  <Slider label="Fuzziness m" value={m} min={1.1} max={4} step={0.1} decimals={1} onChange={setM} />
                  <div className="mono rounded-md bg-field px-3 py-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted">iterations</span><span className="text-ink">{fcm.iterations}</span></div>
                    <div className="flex justify-between"><span className="text-muted">objective J_m</span><span className="text-ink">{fmt(fcm.objective)}</span></div>
                    <div className="flex justify-between"><span className="text-muted">mean max membership</span><span className="text-ink">{fmt(fcm.membership.reduce((a, r) => a + Math.max(...r), 0) / fcm.membership.length)}</span></div>
                  </div>
                  <p className="text-xs text-muted">m → 1 gives crisp (k-means-like) memberships; larger m blends the colours of points between clusters.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      }
      conclusion={
        <div className="space-y-2">
          <p>
            k-means alternates two simple steps, each of which can only lower the within-cluster sum of squares, so the objective decreases
            monotonically and the centroids stop moving after a few iterations. The result is a local optimum: random initialisation can split one
            blob and merge two others, while k-means++ spreads the initial centres and reaches the natural clustering far more reliably.
          </p>
          <p>
            The elbow plot and silhouette score give objective guidance on k, which the algorithm itself cannot choose. On the LiDAR scan the clusters
            correspond directly to physical obstacles, a basic form of perception for a mobile robot; on the moons dataset the spherical-cluster
            assumption fails, which fuzzy c-means (soft memberships) can reveal but not fix.
          </p>
        </div>
      }
    />
  );
}
