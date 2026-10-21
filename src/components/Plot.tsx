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

const PALETTE = ['#2F5FD0', '#E5533D', '#3F9B57', '#F2B33D', '#1F8A8A', '#8B5E3C'];

/** Dark-themed recharts line plot with sensible defaults for lab data. */
export default function Plot({ data, xKey = 'x', series, xLabel, yLabel, title, height = 260, xMarker, yDomain = ['auto', 'auto'], decimals = 3, xTicks }: Props) {
  const fmt = (v: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(decimals) : '—');
  return (
    <div className="w-full">
      {title && <div className="mb-1 text-sm font-medium text-ink/80">{title}</div>}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: xLabel ? 24 : 8, left: yLabel ? 8 : 0 }}>
            <CartesianGrid stroke="#E8E4DA" strokeDasharray="3 3" />
            <XAxis
              dataKey={xKey}
              type="number"
              domain={['dataMin', 'dataMax']}
              ticks={xTicks}
              stroke="#8A857A"
              tick={{ fill: '#6B665C', fontSize: 12 }}
              tickFormatter={(v: number) => Number(v.toFixed(2)).toString()}
              label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -14, fill: '#6B665C', fontSize: 13 } : undefined}
            />
            <YAxis
              domain={yDomain}
              stroke="#8A857A"
              tick={{ fill: '#6B665C', fontSize: 12 }}
              tickFormatter={(v: number) => Number(v.toFixed(2)).toString()}
              width={52}
              label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: '#6B665C', fontSize: 13 } : undefined}
            />
            <Tooltip
              contentStyle={{ background: '#FFFFFF', border: '1px solid #E6E1D6', borderRadius: 10, fontSize: 13, boxShadow: '0 4px 14px rgba(28,27,25,0.08)' }}
              labelStyle={{ color: '#1C1B19', fontFamily: 'IBM Plex Mono, monospace' }}
              formatter={(v: number) => fmt(v)}
              labelFormatter={(v) => `${xLabel ?? xKey} = ${fmt(Number(v))}`}
            />
            {series.length > 1 && <Legend verticalAlign="top" height={series.length > 3 ? 48 : 28} wrapperStyle={{ fontSize: 13, color: '#1C1B19' }} />}
            {xMarker !== undefined && <ReferenceLine x={xMarker} stroke="#F2B33D" strokeDasharray="4 2" />}
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
