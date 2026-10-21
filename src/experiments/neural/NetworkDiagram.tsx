import type { MLP } from '../../lib/ai/mlp';

interface Props {
  net: MLP;
  inputLabels?: string[];
  outputLabels?: string[];
  height?: number;
}

/** SVG drawing of the network: neurons per layer, connections with thickness ∝ |w| and colour by sign. */
export default function NetworkDiagram({ net, inputLabels, outputLabels, height = 220 }: Props) {
  const layers = net.config.layers;
  const W = 520;
  const H = height;
  const padX = 60;
  const maxN = Math.max(...layers);
  const r = Math.max(5, Math.min(11, (H - 30) / (2.6 * maxN)));
  const xs = layers.map((_, l) => padX + ((W - 2 * padX) * l) / (layers.length - 1));
  const ys = (l: number) => {
    const n = layers[l];
    return Array.from({ length: n }, (_, j) => H / 2 + (j - (n - 1) / 2) * Math.min(2.6 * r, (H - 30) / Math.max(1, n - 1)));
  };
  const maxW = Math.max(1e-6, ...net.W.flat(2).map(Math.abs));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Network diagram">
      {net.W.map((M, l) => {
        const y0 = ys(l);
        const y1 = ys(l + 1);
        return M.map((row, j) =>
          row.map((w, i) => (
            <line key={`${l}-${j}-${i}`} x1={xs[l]} y1={y0[i]} x2={xs[l + 1]} y2={y1[j]} stroke={w >= 0 ? '#2F5FD0' : '#E5533D'} strokeWidth={0.4 + (3.2 * Math.abs(w)) / maxW} opacity={0.25 + (0.7 * Math.abs(w)) / maxW} />
          )),
        );
      })}
      {layers.map((_, l) =>
        ys(l).map((y, j) => (
          <g key={`${l}-${j}`}>
            <circle cx={xs[l]} cy={y} r={r} fill={l === 0 ? '#E8E4DA' : l === layers.length - 1 ? '#FBE3DE' : '#FFFFFF'} stroke={l === 0 ? '#6B665C' : l === layers.length - 1 ? '#E5533D' : '#2F5FD0'} strokeWidth={1.5} />
            {l > 0 && r >= 7 && <text x={xs[l]} y={y + 3} fontSize="8" fill="#1C1B19" textAnchor="middle" fontFamily="ui-monospace, monospace">{net.b[l - 1][j].toFixed(1)}</text>}
            {l === 0 && inputLabels?.[j] && <text x={xs[l] - r - 4} y={y + 4} fontSize="11" fill="#1C1B19" textAnchor="end">{inputLabels[j]}</text>}
            {l === layers.length - 1 && outputLabels?.[j] && <text x={xs[l] + r + 4} y={y + 4} fontSize="11" fill="#1C1B19">{outputLabels[j]}</text>}
          </g>
        )),
      )}
      {layers.map((n, l) => (
        <text key={l} x={xs[l]} y={H - 4} fontSize="10" fill="#8A857A" textAnchor="middle">{l === 0 ? `input (${n})` : l === layers.length - 1 ? `output (${n})` : `hidden (${n})`}</text>
      ))}
      <text x={W - 4} y={12} fontSize="9" fill="#8A857A" textAnchor="end">blue = positive weight · orange = negative · width ∝ |w| · number = bias</text>
    </svg>
  );
}
