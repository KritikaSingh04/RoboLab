import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface PlotSeries {
  /** Key in each data row. */
  key: string;
  label?: string;
  color?: string;
  dashed?: boolean;
}

interface Props {
  /** Array of rows; each row has the x key plus one key per series. */
  data: Record<string, number | null>[];
  xKey?: string;
  series: PlotSeries[];
  xLabel?: string;
  yLabel?: string;
  title?: string;
  height?: number;
  /** Vertical marker (e.g. current simulation time). */
  xMarker?: number;
  yDomain?: [number | 'auto', number | 'auto'];
  decimals?: number;
  /** Explicit x tick positions (e.g. integers for iteration counts). */
  xTicks?: number[];
}

const PALETTE = ['#38bdf8', '#f97316', '#22c55e', '#ef4444', '#eab308', '#a78bfa'];

/** Dark-themed recharts line plot with sensible defaults for lab data. */
export default function Plot({ data, xKey = 'x', series, xLabel, yLabel, title, height = 260, xMarker, yDomain = ['auto', 'auto'], decimals = 3, xTicks }: Props) {
  const fmt = (v: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(decimals) : '—');
  return (
    <div className="w-full">
      {title && <div className="mb-1 text-sm font-medium text-slate-300">{title}</div>}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: xLabel ? 24 : 8, left: yLabel ? 8 : 0 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis
              dataKey={xKey}
              type="number"
              domain={['dataMin', 'dataMax']}
              ticks={xTicks}
              stroke="#64748b"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickFormatter={(v: number) => Number(v.toFixed(2)).toString()}
              label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -14, fill: '#94a3b8', fontSize: 13 } : undefined}
            />
            <YAxis
              domain={yDomain}
              stroke="#64748b"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickFormatter={(v: number) => Number(v.toFixed(2)).toString()}
              width={52}
              label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 13 } : undefined}
            />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 13 }}
              labelStyle={{ color: '#cbd5e1' }}
              formatter={(v: number) => fmt(v)}
              labelFormatter={(v) => `${xLabel ?? xKey} = ${fmt(Number(v))}`}
            />
            {series.length > 1 && <Legend verticalAlign="top" height={series.length > 3 ? 48 : 28} wrapperStyle={{ fontSize: 13, color: '#cbd5e1' }} />}
            {xMarker !== undefined && <ReferenceLine x={xMarker} stroke="#eab308" strokeDasharray="4 2" />}
            {series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label ?? s.key}
                stroke={s.color ?? PALETTE[i % PALETTE.length]}
                strokeWidth={2}
                strokeDasharray={s.dashed ? '6 3' : undefined}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
