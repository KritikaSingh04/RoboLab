import { CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';

export interface ScatterSeries {
  name: string;
  points: { x: number; y: number }[];
  color: string;
}

export interface LineSeries {
  name: string;
  points: { x: number; y: number }[];
  color: string;
  dashed?: boolean;
}

interface Props {
  scatter: ScatterSeries[];
  lines?: LineSeries[];
  xLabel?: string;
  yLabel?: string;
  title?: string;
  height?: number;
  yZeroLine?: boolean;
  decimals?: number;
}

/** Scatter points with optional straight/curved lines on numeric axes (dark theme). */
export default function ScatterPlot({ scatter, lines = [], xLabel, yLabel, title, height = 260, yZeroLine, decimals = 3 }: Props) {
  const fmt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(decimals) : '—');
  return (
    <div className="w-full">
      {title && <div className="mb-1 text-sm font-medium text-ink/80">{title}</div>}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 8, right: 16, bottom: xLabel ? 24 : 8, left: yLabel ? 8 : 0 }}>
            <CartesianGrid stroke="#E8E4DA" strokeDasharray="3 3" />
            <XAxis dataKey="x" type="number" domain={['auto', 'auto']} stroke="#8A857A" tick={{ fill: '#6B665C', fontSize: 12 }} tickFormatter={(v: number) => Number(v.toFixed(2)).toString()} label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -14, fill: '#6B665C', fontSize: 13 } : undefined} />
            <YAxis dataKey="y" type="number" domain={['auto', 'auto']} stroke="#8A857A" tick={{ fill: '#6B665C', fontSize: 12 }} tickFormatter={(v: number) => Number(v.toFixed(2)).toString()} width={56} label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: '#6B665C', fontSize: 13 } : undefined} />
            <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E6E1D6', borderRadius: 10, fontSize: 13, boxShadow: '0 4px 14px rgba(28,27,25,0.08)' }} labelStyle={{ color: '#1C1B19', fontFamily: 'IBM Plex Mono, monospace' }} formatter={(v: unknown) => fmt(v)} cursor={{ strokeDasharray: '3 3' }} />
            <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 13, color: '#1C1B19' }} />
            {yZeroLine && <ReferenceLine y={0} stroke="#F2B33D" strokeDasharray="4 2" />}
            {scatter.map((s) => (
              <Scatter key={s.name} name={s.name} data={s.points} fill={s.color} isAnimationActive={false} />
            ))}
            {lines.map((l) => (
              <Line key={l.name} name={l.name} data={l.points} dataKey="y" type="linear" stroke={l.color} strokeWidth={2.5} strokeDasharray={l.dashed ? '6 3' : undefined} dot={false} isAnimationActive={false} legendType="line" />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
