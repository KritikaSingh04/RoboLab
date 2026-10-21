import { useCallback, useMemo, useRef, useState } from 'react';
import ExperimentPage from '../../components/ExperimentPage';
import Equation from '../../components/Equation';
import Canvas2D, { type Transform } from '../../components/Canvas2D';
import Slider from '../../components/Slider';
import Toggle from '../../components/Toggle';
import PlaybackControls from '../../components/PlaybackControls';
import { useFixedStepLoop } from '../../components/useFixedStepLoop';
import { findExperiment } from '../registry';
import { rad2deg } from '../../lib/math/matrix';
import { initialise, stepIteration, stepAssign, silhouette, kmeans, type KMeansState, type Point } from '../../lib/ai/kmeans';
import { blobs } from '../../lib/ai/datasets';
import { twoLinkIK, twoLinkFK, makeProfile, type Profile, type TwoLink } from '../../lib/math/trajectory';
import type { Branch } from '../../lib/math/planar';

const experiment = findExperiment('pipeline')!;
const LINKS: TwoLink = { l1: 1.0, l2: 0.8 };
const TABLE = { x0: 0.4, x1: 1.55, y0: -0.8, y1: 0.8 };
const BIN: [number, number] = [0.3, 1.35];
const HOME: [number, number] = [-0.5, 1.2];
const CLUSTER_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#a855f7', '#eab308', '#06b6d4', '#ec4899', '#84cc16'];

type Stage = 'scatter' | 'cluster' | 'ik' | 'move-object' | 'grasp' | 'move-bin' | 'release' | 'home' | 'done';
const STAGES: { id: Stage[]; label: string; exp: string }[] = [
  { id: ['scatter'], label: 'Scatter objects', exp: 'table' },
  { id: ['cluster'], label: 'K-means clustering', exp: 'Exp 10' },
  { id: ['ik'], label: 'Inverse kinematics', exp: 'Exp 4' },
  { id: ['move-object', 'grasp'], label: 'Move to object', exp: 'Exp 5' },
  { id: ['move-bin', 'release', 'home'], label: 'Move to bin', exp: 'Exp 5' },
];

interface ObjectInfo {
  centroid: Point;
  size: number;
  q: [number, number] | null;
  collected: boolean;
  tf: number;
}

interface Traj {
  profiles: [Profile, Profile];
  tf: number;
  target: string;
}

interface PipelineState {
  stage: Stage;
  /** time inside the current stage */
  st: number;
  points: Point[];
  labels: number[] | null;
  km: KMeansState | null;
  k: number;
  objects: ObjectInfo[];
  current: number;
  carrying: boolean;
  q: [number, number];
  traj: Traj | null;
  log: string[];
  cycle: number;
  cycleTime: number;
  totalCollected: number;
}

interface Settings {
  nObjects: number;
  perObject: number;
  spread: number;
  seed: number;
  branch: Branch;
  moveTime: number;
  autoK: boolean;
  loop: boolean;
  speed: number;
}

/** Scatter: reuse the blob generator of Exp 10 and map it onto the table. */
function scatter(s: Settings): Point[] {
  const b = blobs(s.nObjects, s.spread, s.perObject, s.seed);
  return b.points.map(([x, y]) => [TABLE.x0 + ((x + 3.4) / 6.8) * (TABLE.x1 - TABLE.x0), (y / 2.8) * (TABLE.y1 - TABLE.y0) * 0.5] as Point);
}

/** Choose k by the silhouette score (Exp 10) when auto-k is on. */
function chooseK(points: Point[], s: Settings): number {
  if (!s.autoK) return s.nObjects;
  let best = 2;
  let bestScore = -Infinity;
  for (let k = 2; k <= 8; k++) {
    const r = kmeans(points, k, { seed: s.seed, init: 'kmeans++' });
    const sc = silhouette(points, r.state.labels);
    if (sc > bestScore) {
      bestScore = sc;
      best = k;
    }
  }
  return best;
}

function makeTraj(from: [number, number], to: [number, number], tf: number, target: string): Traj {
  // quintic (Exp 5): rest-to-rest, zero acceleration at both ends
  return { profiles: [makeProfile('quintic', from[0], to[0], tf), makeProfile('quintic', from[1], to[1], tf)], tf, target };
}

function initial(s: Settings): PipelineState {
  const homeQ = twoLinkIK(LINKS, HOME[0], HOME[1], s.branch) ?? [Math.PI / 2, 0];
  return { stage: 'scatter', st: 0, points: scatter(s), labels: null, km: null, k: s.nObjects, objects: [], current: -1, carrying: false, q: homeQ, traj: null, log: [`cycle 1: ${s.nObjects * s.perObject} points scattered on the table (seed ${s.seed})`], cycle: 1, cycleTime: 0, totalCollected: 0 };
}

const fmtQ = (q: [number, number]) => `θ₁ = ${rad2deg(q[0]).toFixed(1)}°, θ₂ = ${rad2deg(q[1]).toFixed(1)}°`;

/** One fixed-step advance of the pipeline state machine. */
function advance(p: PipelineState, dt: number, s: Settings): PipelineState {
  const n = { ...p, st: p.st + dt, cycleTime: p.cycleTime + dt, log: p.log };
  const say = (m: string) => (n.log = [...n.log.slice(-14), m]);
  const binQ = () => twoLinkIK(LINKS, BIN[0], BIN[1], s.branch)!;
  const homeQ = () => twoLinkIK(LINKS, HOME[0], HOME[1], s.branch)!;
  const startMove = (to: [number, number], target: string, stage: Stage) => {
    n.traj = makeTraj(n.q, to, s.moveTime, target);
    n.stage = stage;
    n.st = 0;
  };
  const nextObject = () => {
    const idx = n.objects.findIndex((o, i) => i > n.current && !o.collected && o.q);
    if (idx >= 0) {
      n.current = idx;
      startMove(n.objects[idx].q!, `object ${idx + 1}`, 'move-object');
      say(`object ${idx + 1}: quintic move to (${n.objects[idx].centroid[0].toFixed(2)}, ${n.objects[idx].centroid[1].toFixed(2)}) in ${s.moveTime} s`);
    } else {
      n.current = -1;
      startMove(homeQ(), 'home', 'home');
      say('all reachable objects collected — returning home');
    }
  };
  switch (p.stage) {
    case 'scatter':
      if (n.st >= 0.8) {
        n.k = chooseK(n.points, s);
        n.km = initialise(n.points, n.k, { init: 'kmeans++', seed: s.seed });
        n.labels = null;
        n.stage = 'cluster';
        n.st = 0;
        say(`k-means++ initialised with k = ${n.k}${s.autoK ? ' (chosen by silhouette)' : ''}`);
      }
      break;
    case 'cluster':
      if (n.st >= 0.45 && n.km) {
        n.st = 0;
        if (!n.km.converged) {
          n.km = stepIteration(n.points, n.km);
          say(`k-means iteration ${n.km.iteration}: WCSS = ${n.km.wcss.toFixed(4)}, max centroid move ${Math.max(...n.km.moved).toExponential(1)}`);
        } else {
          n.km = stepAssign(n.points, n.km);
          n.labels = n.km.labels;
          n.objects = n.km.centroids.map((c, j) => ({ centroid: c, size: n.km!.labels.filter((l) => l === j).length, q: null, collected: false, tf: s.moveTime }));
          n.stage = 'ik';
          say(`converged after ${n.km.iteration} iterations → ${n.objects.length} object centres`);
        }
      }
      break;
    case 'ik':
      if (n.st >= 0.9) {
        n.objects = n.objects.map((o) => ({ ...o, q: twoLinkIK(LINKS, o.centroid[0], o.centroid[1], s.branch) }));
        n.objects.forEach((o, i) => say(`IK object ${i + 1}: ${o.q ? fmtQ(o.q) : 'unreachable — skipped'}`));
        n.current = -1;
        nextObject();
      }
      break;
    case 'move-object':
    case 'move-bin':
    case 'home': {
      const tr = n.traj!;
      const t = Math.min(n.st, tr.tf);
      n.q = [tr.profiles[0].q(t), tr.profiles[1].q(t)];
      if (n.st >= tr.tf) {
        if (p.stage === 'move-object') {
          n.stage = 'grasp';
          n.st = 0;
        } else if (p.stage === 'move-bin') {
          n.stage = 'release';
          n.st = 0;
        } else {
          n.stage = 'done';
          n.st = 0;
          say(`cycle ${n.cycle} finished in ${n.cycleTime.toFixed(1)} s`);
        }
      }
      break;
    }
    case 'grasp':
      if (n.st >= 0.4) {
        n.carrying = true;
        startMove(binQ(), 'bin', 'move-bin');
        say(`object ${n.current + 1} grasped → moving to the bin`);
      }
      break;
    case 'release':
      if (n.st >= 0.4) {
        n.carrying = false;
        n.objects = n.objects.map((o, i) => (i === n.current ? { ...o, collected: true } : o));
        n.totalCollected += 1;
        say(`object ${n.current + 1} dropped in the bin`);
        nextObject();
      }
      break;
    case 'done':
      if (s.loop && n.st >= 1.2) {
        const next: Settings = { ...s, seed: s.seed + 1 };
        const fresh = initial(next);
        return { ...fresh, cycle: n.cycle + 1, totalCollected: n.totalCollected, q: n.q, log: [...n.log.slice(-14), `cycle ${n.cycle + 1}: new objects scattered (seed ${next.seed})`] };
      }
      break;
  }
  return n;
}

export default function PipelinePage() {
  const [settings, setSettings] = useState<Settings>({ nObjects: 4, perObject: 25, spread: 0.45, seed: 1, branch: 'up', moveTime: 1.6, autoK: false, loop: true, speed: 1 });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const stateRef = useRef<PipelineState>(initial(settings));
  const seedRef = useRef(settings.seed);
  const [, setTick] = useState(0);

  const reset = useCallback(() => {
    seedRef.current = settingsRef.current.seed;
    stateRef.current = initial(settingsRef.current);
    setTick((v) => v + 1);
  }, []);
  const loop = useFixedStepLoop(
    (dt) => {
      const s = { ...settingsRef.current, seed: seedRef.current };
      const next = advance(stateRef.current, dt * settingsRef.current.speed, s);
      if (next.cycle !== stateRef.current.cycle) seedRef.current += 1;
      stateRef.current = next;
    },
    { dt: 1 / 60, onReset: reset },
  );
  const st = stateRef.current;
  const update = (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    if ('nObjects' in patch || 'perObject' in patch || 'spread' in patch || 'seed' in patch || 'branch' in patch) {
      settingsRef.current = { ...settingsRef.current, ...patch };
      loop.reset();
    }
  };

  const arm = useMemo(() => twoLinkFK(LINKS, st.q), [st.q]);
  const stageIndex = STAGES.findIndex((g) => g.id.includes(st.stage));

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform) => {
      // table
      const [tx0, ty0] = t.toPixel(TABLE.x0, TABLE.y1);
      const [tx1, ty1] = t.toPixel(TABLE.x1, TABLE.y0);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.strokeRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
      ctx.fillStyle = '#64748b';
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.fillText('table', tx0 + 6, ty0 + 14);
      // bin
      const [bx, by] = t.toPixel(BIN[0], BIN[1]);
      ctx.fillStyle = '#3f2d1a';
      ctx.strokeStyle = '#eab308';
      ctx.fillRect(bx - 22, by - 22, 44, 44);
      ctx.strokeRect(bx - 22, by - 22, 44, 44);
      ctx.fillStyle = '#eab308';
      ctx.fillText(`bin · ${st.objects.filter((o) => o.collected).length}`, bx - 20, by - 28);
      // reach annulus
      const [ox, oy] = t.toPixel(0, 0);
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(56,189,248,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ox, oy, (LINKS.l1 + LINKS.l2) * t.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // points: grey before clustering, coloured by cluster afterwards, hidden once collected
      st.points.forEach((p, i) => {
        const label = st.labels ? st.labels[i] : st.km && st.km.phase !== 'init' ? st.km.labels[i] : -1;
        if (label >= 0 && st.objects[label]?.collected) return;
        const [px, py] = t.toPixel(p[0], p[1]);
        ctx.fillStyle = label >= 0 ? CLUSTER_COLORS[label % CLUSTER_COLORS.length] : '#94a3b8';
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      // centroids
      const cents = st.objects.length ? st.objects.map((o) => o.centroid) : (st.km?.centroids ?? []);
      cents.forEach((c, j) => {
        if (st.objects[j]?.collected) return;
        const [cx, cy] = t.toPixel(c[0], c[1]);
        ctx.strokeStyle = CLUSTER_COLORS[j % CLUSTER_COLORS.length];
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - 8, cy - 8);
        ctx.lineTo(cx + 8, cy + 8);
        ctx.moveTo(cx + 8, cy - 8);
        ctx.lineTo(cx - 8, cy + 8);
        ctx.stroke();
        if (st.objects[j]) {
          ctx.fillStyle = '#e2e8f0';
          ctx.font = 'bold 11px ui-sans-serif, system-ui';
          ctx.fillText(`${j + 1}${st.objects[j].q ? '' : ' ✗'}`, cx + 11, cy - 8);
        }
      });
      // trajectory preview of the current move
      if (st.traj) {
        ctx.save();
        ctx.strokeStyle = 'rgba(234,179,8,0.5)';
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const tt = (st.traj.tf * i) / 40;
          const tip = twoLinkFK(LINKS, [st.traj.profiles[0].q(tt), st.traj.profiles[1].q(tt)]).tip;
          const [px, py] = t.toPixel(tip[0], tip[1]);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
      }
      // arm
      const pts = [[0, 0], arm.elbow, arm.tip] as [number, number][];
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const [ax, ay] = t.toPixel(pts[i][0], pts[i][1]);
        const [cx2, cy2] = t.toPixel(pts[i + 1][0], pts[i + 1][1]);
        ctx.strokeStyle = i === 0 ? '#3b82f6' : '#f97316';
        ctx.lineWidth = 12 - 3 * i;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(cx2, cy2);
        ctx.stroke();
      }
      for (const p of pts.slice(0, 2)) {
        const [px, py] = t.toPixel(p[0], p[1]);
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      const [ex, ey] = t.toPixel(arm.tip[0], arm.tip[1]);
      ctx.fillStyle = st.carrying ? CLUSTER_COLORS[st.current % CLUSTER_COLORS.length] : '#ef4444';
      ctx.beginPath();
      ctx.arc(ex, ey, st.carrying ? 9 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.fillText(`${STAGES[stageIndex]?.label ?? 'done'}${st.traj && ['move-object', 'move-bin', 'home'].includes(st.stage) ? ` → ${st.traj.target} (${Math.min(st.st, st.traj.tf).toFixed(2)} / ${st.traj.tf} s)` : ''}`, 10, t.height - 10);
    },
    [st, arm, stageIndex],
  );

  return (
    <ExperimentPage
      experiment={experiment}
      aim={
        <p>
          To chain three earlier experiments into one autonomous pick-and-place task: k-means (experiment 10) finds the objects scattered on a
          table, inverse kinematics (experiment 4) converts each object centre into joint angles, and quintic trajectories (experiment 5) move a
          two-link arm to the object and then to a drop bin, repeating until the table is clear.
        </p>
      }
      theory={
        <div className="space-y-3">
          <p>The pipeline is a sequence of pure functions already implemented and tested in the library; this page only orders them and animates the result:</p>
          <Equation tex={String.raw`\text{points} \xrightarrow{\;k\text{-means}\;} \{\mu_j\} \xrightarrow{\;\mathrm{IK}\;} \{(\theta_1,\theta_2)_j\} \xrightarrow{\;\text{quintic}\;} q(t) \xrightarrow{\;\mathrm{FK}\;} \text{tip}(t)`} />
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Perception</strong>: each object is a cloud of sensed points. k-means++ with k = number of objects (or k chosen by the silhouette score) returns one centroid per object; the Voronoi assignment tells which points belong together.</li>
            <li><strong>Planning</strong>: the two-link IK (L₁ = 1 m, L₂ = 0.8 m) gives the elbow-up or elbow-down angles for each centroid and for the bin; centroids outside the annulus are skipped.</li>
            <li><strong>Execution</strong>: every move is a rest-to-rest quintic in joint space, so velocity and acceleration are zero at pick and place; forward kinematics draws the resulting tip path (curved, as in experiment 5).</li>
          </ul>
          <p className="text-slate-400">Everything reused: <span className="mono">kmeans.ts</span> (initialise, stepIteration, silhouette), <span className="mono">datasets.ts</span> (blobs), <span className="mono">planar.ts</span> via <span className="mono">trajectory.ts</span> (twoLinkIK, twoLinkFK, makeProfile). No math is duplicated here.</p>
        </div>
      }
      simulation={
        <div className="space-y-4">
          <ol className="grid gap-1 sm:grid-cols-5">
            {STAGES.map((g, i) => {
              const active = i === stageIndex;
              const done = st.stage === 'done' || i < stageIndex;
              return (
                <li key={g.label} className={['flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition', active ? 'bg-sky-600 text-white' : done ? 'bg-slate-800 text-emerald-300' : 'bg-slate-800/60 text-slate-500'].join(' ')}>
                  <span className={['grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold', active ? 'bg-white text-sky-700' : done ? 'bg-emerald-500/20' : 'bg-slate-700'].join(' ')}>{done && !active ? '✓' : i + 1}</span>
                  <span className="leading-tight">
                    {g.label}
                    <span className="block text-[10px] opacity-70">{g.exp}{active && st.stage === 'cluster' && st.km ? ` · iteration ${st.km.iteration}` : ''}{active && st.current >= 0 && (st.stage === 'move-object' || st.stage === 'grasp' || st.stage === 'move-bin' || st.stage === 'release') ? ` · object ${st.current + 1} / ${st.objects.length}` : ''}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
            <div className="card space-y-3 self-start">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Scene</div>
              <Slider label="Objects" value={settings.nObjects} min={2} max={6} step={1} decimals={0} onChange={(v) => update({ nObjects: v })} />
              <Slider label="Points per object" value={settings.perObject} min={8} max={60} step={1} decimals={0} onChange={(v) => update({ perObject: v })} />
              <Slider label="Object size (spread)" value={settings.spread} min={0.2} max={0.9} step={0.05} decimals={2} onChange={(v) => update({ spread: v })} />
              <div className="flex gap-1.5">
                <button type="button" className="btn" onClick={() => update({ seed: settings.seed + 1 })}>New scatter (seed {settings.seed + 1})</button>
              </div>
              <Toggle label="Choose k automatically" hint="silhouette score over k = 2…8 (Exp 10)" checked={settings.autoK} onChange={(v) => update({ autoK: v })} />
              <div className="border-t border-slate-800 pt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Arm and motion</div>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-800 p-1">
                {(['up', 'down'] as Branch[]).map((b) => (
                  <button key={b} type="button" onClick={() => update({ branch: b })} className={['rounded-md px-2 py-1 text-xs font-medium transition', settings.branch === b ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-700'].join(' ')}>
                    IK elbow-{b}
                  </button>
                ))}
              </div>
              <Slider label="Move duration (quintic t_f)" value={settings.moveTime} min={0.5} max={4} step={0.1} unit="s" decimals={1} onChange={(v) => update({ moveTime: v })} />
              <Slider label="Playback speed" value={settings.speed} min={0.25} max={4} step={0.25} unit="×" decimals={2} onChange={(v) => update({ speed: v })} />
              <Toggle label="Repeat with new objects" checked={settings.loop} onChange={(v) => update({ loop: v })} />
              <div className="border-t border-slate-800 pt-3">
                <PlaybackControls loop={loop} label="Pipeline" />
              </div>
            </div>
            <div className="space-y-3">
              <Canvas2D draw={draw} view={{ cx: 0.55, cy: 0.33, scale: 185 }} aspect={16 / 10} interactive={false} />
              <div className="card">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Event log</div>
                <pre className="mono max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{st.log.join('\n')}</pre>
              </div>
            </div>
          </div>
        </div>
      }
      results={
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="card">
            <h3 className="mb-2 font-semibold text-white">Objects of cycle {st.cycle}</h3>
            {st.objects.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="py-1 font-medium">Object</th>
                    <th className="py-1 text-right font-medium">Points</th>
                    <th className="py-1 text-right font-medium">Centre x (m)</th>
                    <th className="py-1 text-right font-medium">Centre y (m)</th>
                    <th className="py-1 text-right font-medium">θ₁</th>
                    <th className="py-1 text-right font-medium">θ₂</th>
                    <th className="py-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="mono text-white">
                  {st.objects.map((o, i) => (
                    <tr key={i} className={['border-t border-slate-800', i === st.current ? 'bg-sky-500/10' : ''].join(' ')}>
                      <td className="py-1 font-sans"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CLUSTER_COLORS[i % CLUSTER_COLORS.length] }} />{i + 1}</td>
                      <td className="py-1 text-right">{o.size}</td>
                      <td className="py-1 text-right">{o.centroid[0].toFixed(3)}</td>
                      <td className="py-1 text-right">{o.centroid[1].toFixed(3)}</td>
                      <td className="py-1 text-right">{o.q ? `${rad2deg(o.q[0]).toFixed(1)}°` : '—'}</td>
                      <td className="py-1 text-right">{o.q ? `${rad2deg(o.q[1]).toFixed(1)}°` : '—'}</td>
                      <td className={['py-1 font-sans', o.collected ? 'text-emerald-400' : !o.q ? 'text-red-400' : i === st.current ? 'text-sky-300' : 'text-slate-400'].join(' ')}>{o.collected ? 'in bin' : !o.q ? 'unreachable' : i === st.current ? (st.carrying ? 'carrying' : 'approaching') : 'waiting'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-500">Objects appear here once k-means has converged.</p>
            )}
          </div>
          <div className="card">
            <h3 className="mb-2 font-semibold text-white">Totals</h3>
            <div className="mono grid grid-cols-2 gap-y-1 text-sm">
              <span className="text-slate-400">cycle</span><span className="text-white">{st.cycle}</span>
              <span className="text-slate-400">cycle time</span><span className="text-white">{st.cycleTime.toFixed(1)} s</span>
              <span className="text-slate-400">k-means iterations</span><span className="text-white">{st.km?.iteration ?? 0}</span>
              <span className="text-slate-400">WCSS</span><span className="text-white">{st.km ? st.km.wcss.toFixed(4) : '—'}</span>
              <span className="text-slate-400">objects collected</span><span className="text-emerald-400">{st.totalCollected}</span>
              <span className="text-slate-400">arm now</span><span className="text-white">{fmtQ(st.q)}</span>
              <span className="text-slate-400">tip</span><span className="text-white">({arm.tip[0].toFixed(3)}, {arm.tip[1].toFixed(3)})</span>
            </div>
          </div>
        </div>
      }
      conclusion={
        <p>
          A complete robotic task decomposes into the same blocks the earlier experiments built in isolation: perception clusters sensor points
          into objects, inverse kinematics turns each object position into a joint configuration, and trajectory planning moves between
          configurations smoothly. Because every block is a tested pure function, chaining them needs no new math, only sequencing, and the
          effect of each design choice (k, the elbow branch, the move duration) can be watched in the running system.
        </p>
      }
    />
  );
}
