import { useEffect, useMemo, useState } from 'react';
import ExperimentPage from '../../components/ExperimentPage';
import Equation from '../../components/Equation';
import Slider from '../../components/Slider';
import Toggle from '../../components/Toggle';
import { findExperiment } from '../registry';
import { EXAMPLE_SYSTEMS, DEFUZZ_METHODS, DEFUZZ_LABEL, controlSurface, infer, mfParams, withMfParam, type Defuzz, type FuzzySystem, type Rule } from '../../lib/ai/fuzzy';
import MFChart, { TERM_COLORS } from './MFChart';
import SurfacePlot from './SurfacePlot';

const experiment = findExperiment('fuzzy')!;

function ruleText(r: Rule, sys: FuzzySystem): { ifPart: string; thenPart: string } {
  const label = (v: string) => sys.inputs.concat(sys.outputs).find((x) => x.name === v)?.label ?? v;
  return {
    ifPart: r.antecedents.map((a) => `${label(a.variable)} is ${a.term}`).join(r.op === 'and' ? ' AND ' : ' OR '),
    thenPart: r.consequents.map((c) => `${label(c.variable)} is ${c.term}`).join(', '),
  };
}

export default function FuzzyPage() {
  const [systemId, setSystemId] = useState('robot');
  const [system, setSystem] = useState<FuzzySystem>(() => EXAMPLE_SYSTEMS[0].make());
  const [inputs, setInputs] = useState<Record<string, number>>({ distance: 0.6, angle: 35 });
  const [method, setMethod] = useState<Defuzz>('centroid');
  const [surfaceOutput, setSurfaceOutput] = useState('steering');
  const [surfaceMode, setSurfaceMode] = useState<'3d' | 'heatmap'>('3d');
  const [editVar, setEditVar] = useState<string>('distance');
  const [editTerm, setEditTerm] = useState<string>('Near');

  const loadSystem = (id: string) => {
    const def = EXAMPLE_SYSTEMS.find((s) => s.id === id) ?? EXAMPLE_SYSTEMS[0];
    const sys = def.make();
    setSystemId(id);
    setSystem(sys);
    const init: Record<string, number> = {};
    for (const v of sys.inputs) init[v.name] = (v.range[0] + v.range[1]) / 2;
    if (id === 'robot') Object.assign(init, { distance: 0.6, angle: 35 });
    if (id === 'fan') Object.assign(init, { temperature: 28, humidity: 60 });
    setInputs(init);
    setSurfaceOutput(sys.outputs[0].name);
    setEditVar(sys.inputs[0].name);
    setEditTerm(sys.inputs[0].terms[0].name);
  };
  const resetSystem = () => {
    const sys = (EXAMPLE_SYSTEMS.find((s) => s.id === systemId) ?? EXAMPLE_SYSTEMS[0]).make();
    setSystem(sys);
  };

  const result = useMemo(() => infer(system, inputs, method), [system, inputs, method]);
  const [a, b] = system.inputs;
  const surface = useMemo(() => controlSurface(system, a.name, b.name, surfaceOutput, 31, method), [system, a.name, b.name, surfaceOutput, method]);
  const allVars = [...system.inputs, ...system.outputs];
  const editVariable = allVars.find((v) => v.name === editVar) ?? allVars[0];
  const editT = editVariable.terms.find((t) => t.name === editTerm) ?? editVariable.terms[0];
  useEffect(() => {
    if (!editVariable.terms.some((t) => t.name === editTerm)) setEditTerm(editVariable.terms[0].name);
  }, [editVariable, editTerm]);

  const updateMf = (key: string, value: number) => {
    setSystem((sys) => {
      const patch = (vars: typeof sys.inputs) => vars.map((v) => (v.name !== editVariable.name ? v : { ...v, terms: v.terms.map((t) => (t.name !== editT.name ? t : { ...t, mf: withMfParam(t.mf, key, value) })) }));
      return { ...sys, inputs: patch(sys.inputs), outputs: patch(sys.outputs) };
    });
  };
  const toggleRule = (i: number, enabled: boolean) => setSystem((sys) => ({ ...sys, rules: sys.rules.map((r, k) => (k === i ? { ...r, enabled } : r)) }));

  const firing = result.ruleStrengths.filter((s) => s > 0).length;

  return (
    <ExperimentPage
      experiment={experiment}
      aim={
        <p>
          To build a Mamdani fuzzy inference system from scratch — fuzzification with triangular, trapezoidal and Gaussian membership functions, a
          rule base with AND/OR, min-implication, max-aggregation and three defuzzification methods — and to apply it as an obstacle-avoidance
          controller for a mobile robot.
        </p>
      }
      theory={
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Fuzzy sets and membership functions</h3>
            <p>A fuzzy set A on a universe X is defined by a membership function μ_A : X → [0, 1]. Three common shapes:</p>
            <Equation tex={String.raw`\mu_{\text{tri}}(x) = \max\!\left(0,\ \min\!\left(\tfrac{x-a}{b-a},\ \tfrac{c-x}{c-b}\right)\right),\qquad \mu_{\text{trap}}(x) = \max\!\left(0,\ \min\!\left(\tfrac{x-a}{b-a},\ 1,\ \tfrac{d-x}{d-c}\right)\right),\qquad \mu_{\text{gauss}}(x) = e^{-\frac{(x-m)^2}{2\sigma^2}}`} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Mamdani inference</h3>
            <ol className="list-decimal space-y-1 pl-5">
              <li><strong>Fuzzification</strong>: each crisp input x₀ is mapped to its membership degree in every term, μ_A(x₀).</li>
              <li><strong>Rule evaluation</strong>: the firing strength of rule k combines its antecedents with a t-norm (AND = min) or s-norm (OR = max).</li>
              <li><strong>Implication</strong>: the consequent set is clipped at the firing strength (min).</li>
              <li><strong>Aggregation</strong>: the clipped consequents of all rules are combined with max into one output set.</li>
              <li><strong>Defuzzification</strong>: the aggregated set is reduced to a crisp number.</li>
            </ol>
            <Equation tex={String.raw`w_k = \min_i \mu_{A_{k,i}}(x_i)\ \ (\text{AND}),\qquad \mu_{B'_k}(y) = \min\big(w_k,\ \mu_{B_k}(y)\big),\qquad \mu_{\text{agg}}(y) = \max_k \mu_{B'_k}(y)`} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Defuzzification</h3>
            <Equation tex={String.raw`y_{\text{centroid}} = \frac{\int y\,\mu_{\text{agg}}(y)\,dy}{\int \mu_{\text{agg}}(y)\,dy},\qquad \int_{y_{\min}}^{y_{\text{bis}}}\mu_{\text{agg}}\,dy = \int_{y_{\text{bis}}}^{y_{\max}}\mu_{\text{agg}}\,dy,\qquad y_{\text{MOM}} = \operatorname{mean}\{\,y : \mu_{\text{agg}}(y) = \max \mu_{\text{agg}}\,\}`} />
            <p>
              The integrals are evaluated numerically on a grid of 201 samples. Centroid is the most common choice because it varies smoothly with
              the inputs; mean-of-maximum ignores all but the strongest rule and therefore jumps.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Why fuzzy control for a robot?</h3>
            <p>
              Obstacle avoidance is easy to describe in words — "if the obstacle is near and on the right, steer hard left and slow down" — but
              awkward to write as an exact equation. A fuzzy controller encodes such linguistic rules directly and interpolates smoothly between
              them; the control surface in the Results section shows the resulting nonlinear mapping from sensor readings to commands.
            </p>
          </div>
        </div>
      }
      simulation={
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="card space-y-4 self-start">
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">System</div>
                <select value={systemId} onChange={(e) => loadSystem(e.target.value)} className="w-full rounded-md border border-line bg-field px-2 py-1.5 text-sm text-ink focus:border-cobalt focus:outline-none">
                  {EXAMPLE_SYSTEMS.map((s) => (
                    <option key={s.id} value={s.id}>{s.make().name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted">{system.description}</p>
                <button type="button" className="btn" onClick={resetSystem}>Reset rules and MFs</button>
              </div>
              <div className="space-y-3 border-t border-line pt-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">Inputs</div>
                {system.inputs.map((v) => (
                  <Slider key={v.name} label={v.label} value={inputs[v.name] ?? v.range[0]} min={v.range[0]} max={v.range[1]} step={(v.range[1] - v.range[0]) / 200} unit={v.unit} decimals={2} onChange={(val) => setInputs((i) => ({ ...i, [v.name]: val }))} />
                ))}
              </div>
              <div className="space-y-2 border-t border-line pt-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">Defuzzification</div>
                <div className="space-y-1">
                  {DEFUZZ_METHODS.map((m) => (
                    <button key={m} type="button" onClick={() => setMethod(m)} className={['block w-full rounded-md px-2 py-1.5 text-left text-sm transition', method === m ? 'bg-cobalt text-white' : 'bg-sidebar text-ink/80 hover:bg-line'].join(' ')}>
                      {DEFUZZ_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2 border-t border-line pt-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">Edit a membership function</div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={editVariable.name} onChange={(e) => { setEditVar(e.target.value); const v = allVars.find((x) => x.name === e.target.value); if (v) setEditTerm(v.terms[0].name); }} className="rounded-md border border-line bg-field px-2 py-1 text-sm text-ink">
                    {allVars.map((v) => (
                      <option key={v.name} value={v.name}>{v.label}</option>
                    ))}
                  </select>
                  <select value={editT.name} onChange={(e) => setEditTerm(e.target.value)} className="rounded-md border border-line bg-field px-2 py-1 text-sm text-ink">
                    {editVariable.terms.map((t) => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <p className="mono text-xs text-muted">{editT.mf.type === 'tri' ? 'triangular' : editT.mf.type === 'trap' ? 'trapezoidal' : 'Gaussian'} · {mfParams(editT.mf).map((p) => `${p.key}=${p.value.toFixed(2)}`).join(', ')}</p>
                {mfParams(editT.mf).map((p) => (
                  <Slider key={p.key} label={p.key} value={p.value} min={p.key === 'sigma' ? 0.01 : editVariable.range[0]} max={p.key === 'sigma' ? (editVariable.range[1] - editVariable.range[0]) / 2 : editVariable.range[1]} step={(editVariable.range[1] - editVariable.range[0]) / 200} unit={editVariable.unit} decimals={2} onChange={(val) => updateMf(p.key, val)} />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                {system.inputs.map((v) => (
                  <div key={v.name} className="card">
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-ink">{v.label}</span>
                      <span className="mono text-xs text-muted">
                        {Object.entries(result.fuzzified[v.name]).filter(([, mu]) => mu > 0).map(([t, mu]) => `${t} ${mu.toFixed(2)}`).join(' · ') || 'no membership'}
                      </span>
                    </div>
                    <MFChart variable={v} x={inputs[v.name]} highlightTerm={editVariable.name === v.name ? editT.name : null} />
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold text-ink">Rule base</h3>
                  <span className="text-xs text-muted">{firing} of {system.rules.length} rules fire · AND = min, OR = max</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white text-left text-muted">
                      <tr>
                        <th className="px-2 py-1 font-medium">#</th>
                        <th className="px-2 py-1 font-medium">IF</th>
                        <th className="px-2 py-1 font-medium">THEN</th>
                        <th className="px-2 py-1 text-right font-medium">Strength</th>
                        <th className="px-2 py-1 font-medium">On</th>
                      </tr>
                    </thead>
                    <tbody>
                      {system.rules.map((r, i) => {
                        const s = result.ruleStrengths[i];
                        const { ifPart, thenPart } = ruleText(r, system);
                        const off = r.enabled === false;
                        return (
                          <tr key={i} className={['border-t border-line', off ? 'text-muted/70' : s > 0 ? 'bg-cobalt/10 text-ink' : 'text-muted'].join(' ')}>
                            <td className="mono px-2 py-1">{i + 1}</td>
                            <td className="px-2 py-1">{ifPart}</td>
                            <td className="px-2 py-1">{thenPart}</td>
                            <td className="px-2 py-1 text-right">
                              <span className="inline-flex items-center justify-end gap-2">
                                <span className="h-2 w-16 overflow-hidden rounded-full bg-sidebar"><span className="block h-2 rounded-full bg-cobalt" style={{ width: `${s * 100}%` }} /></span>
                                <span className="mono w-10 text-right">{s.toFixed(2)}</span>
                              </span>
                            </td>
                            <td className="px-2 py-1">
                              <input type="checkbox" checked={!off} onChange={(e) => toggleRule(i, e.target.checked)} aria-label={`enable rule ${i + 1}`} className="h-4 w-4 accent-sky-500" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {system.outputs.map((v) => {
                  const o = result.outputs[v.name];
                  return (
                    <div key={v.name} className="card">
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium text-ink">{v.label} — aggregated output set</span>
                        <span className="mono text-lg font-semibold text-tomato">{o.crisp.toFixed(2)} {v.unit}</span>
                      </div>
                      <MFChart variable={v} termStrengths={o.termStrengths} aggregated={o.aggregated} crisp={o.crisp} highlightTerm={editVariable.name === v.name ? editT.name : null} />
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                        {v.terms.map((t, i) => (
                          <span key={t.name}><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: TERM_COLORS[i % TERM_COLORS.length] }} />{t.name} clipped at {o.termStrengths[t.name].toFixed(2)}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      }
      results={
        <div className="space-y-4">
          <div className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-ink">Control surface</h3>
                <p className="text-xs text-muted">{a.label} × {b.label} → output, {surface.a.length}×{surface.b.length} grid with {DEFUZZ_LABEL[method].toLowerCase()}. The red marker is the current operating point.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <select value={surfaceOutput} onChange={(e) => setSurfaceOutput(e.target.value)} className="rounded-md border border-line bg-field px-2 py-1 text-sm text-ink">
                  {system.outputs.map((v) => (
                    <option key={v.name} value={v.name}>{v.label}</option>
                  ))}
                </select>
                <Toggle label="3D view" checked={surfaceMode === '3d'} onChange={(v) => setSurfaceMode(v ? '3d' : 'heatmap')} />
              </div>
            </div>
            <SurfacePlot
              surface={surface}
              aLabel={`${a.label} (${a.unit})`}
              bLabel={`${b.label} (${b.unit})`}
              zLabel={`${system.outputs.find((o) => o.name === surfaceOutput)?.label} (${system.outputs.find((o) => o.name === surfaceOutput)?.unit})`}
              point={{ a: inputs[a.name], b: inputs[b.name], z: result.outputs[surfaceOutput].crisp }}
              mode={surfaceMode}
            />
          </div>
          <div className="card">
            <h3 className="mb-2 font-semibold text-ink">Crisp results for the current inputs</h3>
            <div className="mono grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              {system.inputs.map((v) => (
                <div key={v.name} className="flex justify-between border-b border-line py-1"><span className="text-muted">{v.label}</span><span className="text-ink">{inputs[v.name].toFixed(2)} {v.unit}</span></div>
              ))}
              {system.outputs.map((v) => (
                <div key={v.name} className="flex justify-between border-b border-line py-1"><span className="text-muted">{v.label}</span><span className="text-tomato">{result.outputs[v.name].crisp.toFixed(3)} {v.unit}</span></div>
              ))}
            </div>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 font-medium">Output</th>
                  {DEFUZZ_METHODS.map((m) => (
                    <th key={m} className="py-1 text-right font-medium">{m === 'mom' ? 'Mean of max' : m[0].toUpperCase() + m.slice(1)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="mono text-ink">
                {system.outputs.map((v) => (
                  <tr key={v.name} className="border-t border-line">
                    <td className="py-1 font-sans text-ink/80">{v.label}</td>
                    {DEFUZZ_METHODS.map((m) => (
                      <td key={m} className={['py-1 text-right', m === method ? 'text-tomato' : ''].join(' ')}>{infer(system, inputs, m).outputs[v.name].crisp.toFixed(3)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">All three defuzzification methods applied to the same aggregated set; the selected one is highlighted.</p>
          </div>
        </div>
      }
      conclusion={
        <div className="space-y-2">
          <p>
            A Mamdani system turns linguistic rules into a smooth nonlinear controller: fuzzification measures how much each rule applies,
            min/max combine the evidence, and defuzzification produces a usable command. Every intermediate quantity — membership degrees, firing
            strengths, clipped consequents and the aggregated set — is visible on this page, so the crisp output can be checked by hand.
          </p>
          <p>
            The control surface shows how the rule base interpolates between the few cases it names, and how editing a membership function or
            disabling a rule reshapes it. Centroid defuzzification gives the smoothest surface, which is why it is preferred for robot control;
            mean-of-maximum produces plateaus and jumps. The same engine drives the obstacle-avoidance robot in experiment 11.
          </p>
        </div>
      }
    />
  );
}
