import { Area, AreaChart, CartesianGrid, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface Series {
  key: string;
  label?: string;
  color: string;
}

interface Props {
  data: Record<string, number | null>[];
  xKey: string;
  /** Stacked areas. */
  areas: Series[];
  /** Lines drawn on top (e.g. the total). */
  lines?: Series[];
  xLabel?: string;
  yLabel?: string;
  title?: string;
  height?: number;
  xMarker?: number;
  decimals?: number;
}

/** Stacked-area plot (dark theme) for decomposing a quantity into its parts. */
export default function AreaPlot({ data, xKey, areas, lines = [], xLabel, yLabel, title, height = 260, xMarker, decimals = 3 }: Props) {
  const fmt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(decimals) : '—');
  return (
    <div className="w-full">
      {title && <div className="mb-1 text-sm font-medium text-ink/80">{title}</div>}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 16, bottom: xLabel ? 24 : 8, left: yLabel ? 8 : 0 }}>
            <CartesianGrid stroke="#E8E4DA" strokeDasharray="3 3" />
            <XAxis dataKey={xKey} type="number" domain={['dataMin', 'dataMax']} stroke="#8A857A" tick={{ fill: '#6B665C', fontSize: 12 }} tickFormatter={(v: number) => Number(v.toFixed(2)).toString()} label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -14, fill: '#6B665C', fontSize: 13 } : undefined} />
            <YAxis stroke="#8A857A" tick={{ fill: '#6B665C', fontSize: 12 }} tickFormatter={(v: number) => Number(v.toFixed(2)).toString()} width={52} label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: '#6B665C', fontSize: 13 } : undefined} />
            <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E6E1D6', borderRadius: 10, fontSize: 13, boxShadow: '0 4px 14px rgba(28,27,25,0.08)' }} labelStyle={{ color: '#1C1B19', fontFamily: 'IBM Plex Mono, monospace' }} formatter={(v: unknown) => fmt(v)} />
            <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 13, color: '#1C1B19' }} />
            <ReferenceLine y={0} stroke="#8A857A" />
            {xMarker !== undefined && <ReferenceLine x={xMarker} stroke="#F2B33D" strokeDasharray="4 2" />}
            {areas.map((a) => (
              <Area key={a.key} type="monotone" dataKey={a.key} name={a.label ?? a.key} stackId="1" stroke={a.color} fill={a.color} fillOpacity={0.35} isAnimationActive={false} />
            ))}
            {lines.map((l) => (
              <Line key={l.key} type="monotone" dataKey={l.key} name={l.label ?? l.key} stroke={l.color} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
