import { useMemo } from 'react';
import { membership, sampleMF, type Curve, type Variable } from '../../lib/ai/fuzzy';

export const TERM_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#ef4444', '#a855f7', '#eab308', '#06b6d4'];

interface Props {
  variable: Variable;
  /** Current crisp input (input variables) */
  x?: number;
  /** Output: strength per term (clipped shading) and aggregated set + crisp value */
  termStrengths?: Record<string, number>;
  aggregated?: Curve;
  crisp?: number;
  height?: number;
  highlightTerm?: string | null;
}

const W = 420;
const PAD = { l: 34, r: 12, t: 26, b: 26 };

/** SVG plot of every membership function of a variable, with the current input / output marked. */
export default function MFChart({ variable, x, termStrengths, aggregated, crisp, height = 170, highlightTerm }: Props) {
  const [lo, hi] = variable.range;
  const H = height;
  const sx = (v: number) => PAD.l + ((v - lo) / (hi - lo)) * (W - PAD.l - PAD.r);
  const sy = (mu: number) => PAD.t + (1 - mu) * (H - PAD.t - PAD.b);
  const curves = useMemo(() => variable.terms.map((t) => sampleMF(t.mf, variable.range, 161)), [variable]);
  const path = (c: Curve) => c.xs.map((v, i) => `${i ? 'L' : 'M'}${sx(v).toFixed(1)},${sy(c.ys[i]).toFixed(1)}`).join(' ');
  const area = (c: Curve, clip: number) => `${c.xs.map((v, i) => `${i ? 'L' : 'M'}${sx(v).toFixed(1)},${sy(Math.min(clip, c.ys[i])).toFixed(1)}`).join(' ')} L${sx(c.xs[c.xs.length - 1]).toFixed(1)},${sy(0)} L${sx(c.xs[0]).toFixed(1)},${sy(0)} Z`;
  const ticks = 5;
  const fmtTick = (v: number) => (Math.abs(hi - lo) >= 50 ? v.toFixed(0) : Math.abs(hi - lo) >= 5 ? v.toFixed(1) : v.toFixed(2));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Membership functions of ${variable.label}`}>
      {/* axes */}
      {[0, 0.5, 1].map((mu) => (
        <g key={mu}>
          <line x1={PAD.l} x2={W - PAD.r} y1={sy(mu)} y2={sy(mu)} stroke="#1e293b" strokeDasharray={mu === 0 ? undefined : '3 3'} />
          <text x={PAD.l - 4} y={sy(mu) + 4} fontSize="10" fill="#64748b" textAnchor="end">{mu}</text>
        </g>
      ))}
      {Array.from({ length: ticks }, (_, i) => lo + ((hi - lo) * i) / (ticks - 1)).map((v) => (
        <text key={v} x={sx(v)} y={H - 8} fontSize="10" fill="#64748b" textAnchor="middle">{fmtTick(v)}</text>
      ))}
      <text x={W - PAD.r} y={H - 8} fontSize="10" fill="#94a3b8" textAnchor="end" dx="-2" dy="-10">{variable.unit}</text>
      {/* clipped consequents (outputs) */}
      {termStrengths &&
        variable.terms.map((t, i) => {
          const s = termStrengths[t.name] ?? 0;
          return s > 0 ? <path key={t.name} d={area(curves[i], s)} fill={TERM_COLORS[i % TERM_COLORS.length]} opacity={0.35} /> : null;
        })}
      {/* aggregated envelope */}
      {aggregated && <path d={path(aggregated)} fill="none" stroke="#f8fafc" strokeWidth={2.2} />}
      {/* membership functions */}
      {variable.terms.map((t, i) => (
        <path key={t.name} d={path(curves[i])} fill="none" stroke={TERM_COLORS[i % TERM_COLORS.length]} strokeWidth={highlightTerm === t.name ? 3 : 1.6} opacity={termStrengths ? 0.8 : 1} />
      ))}
      {/* current input */}
      {x !== undefined && (
        <g>
          <line x1={sx(x)} x2={sx(x)} y1={sy(1)} y2={sy(0)} stroke="#eab308" strokeWidth={1.5} strokeDasharray="4 3" />
          {variable.terms.map((t, i) => {
            const mu = membership(t.mf, x);
            return mu > 0.005 ? (
              <g key={t.name}>
                <line x1={PAD.l} x2={sx(x)} y1={sy(mu)} y2={sy(mu)} stroke={TERM_COLORS[i % TERM_COLORS.length]} strokeWidth={1} strokeDasharray="2 3" opacity={0.8} />
                <circle cx={sx(x)} cy={sy(mu)} r={4} fill={TERM_COLORS[i % TERM_COLORS.length]} stroke="#0f172a" strokeWidth={1.5} />
                <text x={sx(x) + 6} y={sy(mu) - 4} fontSize="10" fill={TERM_COLORS[i % TERM_COLORS.length]} fontFamily="ui-monospace, monospace">{mu.toFixed(2)}</text>
              </g>
            ) : null;
          })}
          <text x={sx(x)} y={PAD.t - 3} fontSize="10" fill="#eab308" textAnchor="middle" fontFamily="ui-monospace, monospace">{x.toFixed(2)}</text>
        </g>
      )}
      {/* crisp output */}
      {crisp !== undefined && (
        <g>
          <line x1={sx(crisp)} x2={sx(crisp)} y1={sy(1)} y2={sy(0)} stroke="#ef4444" strokeWidth={2.2} />
          <text x={sx(crisp)} y={PAD.t - 3} fontSize="11" fill="#ef4444" textAnchor="middle" fontWeight="bold" fontFamily="ui-monospace, monospace">{crisp.toFixed(2)}</text>
        </g>
      )}
      {/* legend */}
      {variable.terms.map((t, i) => (
        <g key={t.name} transform={`translate(${PAD.l + 4 + i * 74}, 4)`}>
          <rect width="8" height="8" fill={TERM_COLORS[i % TERM_COLORS.length]} rx="1" />
          <text x="11" y="8" fontSize="10" fill="#cbd5e1">{t.name}</text>
        </g>
      ))}
    </svg>
  );
}
