interface Props {
  /** Any n×m matrix (row-major). */
  values: number[][];
  /** Optional caption, e.g. "T₀⁴" or "R". */
  label?: string;
  decimals?: number;
  /** Highlight the last column (translation) and 3×3 block (rotation) of a 4×4 transform. */
  homogeneous?: boolean;
  className?: string;
}

/** Fixed-width, right-aligned matrix display with big brackets. */
export default function MatrixView({ values, label, decimals = 3, homogeneous, className = '' }: Props) {
  const rows = values.length;
  const cols = values[0]?.length ?? 0;
  const fmt = (v: number) => {
    if (!Number.isFinite(v)) return '—';
    const r = Number(v.toFixed(decimals));
    return (Object.is(r, -0) ? 0 : r).toFixed(decimals);
  };
  const cellClass = (i: number, j: number) => {
    if (!homogeneous || rows !== 4 || cols !== 4) return 'text-slate-100';
    if (i === 3) return 'text-slate-500';
    if (j === 3) return 'text-emerald-300';
    return 'text-sky-200';
  };
  return (
    <figure className={['inline-flex items-center gap-2', className].join(' ')}>
      {label && <figcaption className="mono text-base text-slate-300">{label} =</figcaption>}
      <div className="flex items-stretch">
        <span className="w-2 rounded-l-md border-y-2 border-l-2 border-slate-500" aria-hidden />
        <table className="mono text-[15px]">
          <tbody>
            {values.map((row, i) => (
              <tr key={i}>
                {row.map((v, j) => (
                  <td key={j} className={['px-2 py-0.5 text-right', cellClass(i, j)].join(' ')}>
                    {fmt(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <span className="w-2 rounded-r-md border-y-2 border-r-2 border-slate-500" aria-hidden />
      </div>
    </figure>
  );
}
