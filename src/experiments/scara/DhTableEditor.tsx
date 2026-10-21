import type { DHRow, DHParam } from '../../lib/math/dh';
import { SCARA_JOINT_CELLS } from '../../lib/math/kinematics';
import { deg2rad, rad2deg } from '../../lib/math/matrix';

interface Props {
  /** Constant part of the table (variable cells ignored). */
  base: DHRow[];
  /** Full table with the current joint values merged in. */
  current: DHRow[];
  onChange: (base: DHRow[]) => void;
}

const COLS: { param: DHParam; label: string; unit: string; angle: boolean }[] = [
  { param: 'theta', label: 'θᵢ', unit: '°', angle: true },
  { param: 'd', label: 'dᵢ', unit: 'm', angle: false },
  { param: 'a', label: 'aᵢ', unit: 'm', angle: false },
  { param: 'alpha', label: 'αᵢ', unit: '°', angle: true },
];

/**
 * D-H table: joint-variable cells (highlighted) are driven by the sliders;
 * every other cell is editable. Angles are edited in degrees.
 */
export default function DhTableEditor({ base, current, onChange }: Props) {
  const isVariable = (row: number, param: DHParam) => SCARA_JOINT_CELLS.find((c) => c.row === row && c.param === param);

  const update = (row: number, param: DHParam, display: number, angle: boolean) => {
    const next = base.map((r) => ({ ...r }));
    next[row][param] = angle ? deg2rad(display) : display;
    onChange(next);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400">
            <th className="px-2 py-1.5 font-medium">Link i</th>
            {COLS.map((c) => (
              <th key={c.param} className="px-2 py-1.5 font-medium">
                {c.label} <span className="font-normal text-slate-500">({c.unit})</span>
              </th>
            ))}
            <th className="px-2 py-1.5 font-medium">Joint</th>
          </tr>
        </thead>
        <tbody>
          {current.map((row, i) => {
            const joint = SCARA_JOINT_CELLS.find((c) => c.row === i);
            return (
              <tr key={i} className="border-t border-slate-800">
                <td className="mono px-2 py-1 text-slate-300">{i + 1}</td>
                {COLS.map((c) => {
                  const variable = isVariable(i, c.param);
                  const display = c.angle ? rad2deg(row[c.param]) : row[c.param];
                  return (
                    <td key={c.param} className="px-2 py-1">
                      {variable ? (
                        <span className="mono inline-block w-24 rounded-md bg-sky-500/15 px-2 py-0.5 text-right text-sky-200 ring-1 ring-sky-500/30" title={`${variable.label} is a joint variable`}>
                          {display.toFixed(3)}
                        </span>
                      ) : (
                        <input
                          type="number"
                          step={c.angle ? 1 : 0.001}
                          value={Number(display.toFixed(c.angle ? 3 : 4))}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v)) update(i, c.param, v, c.angle);
                          }}
                          className="mono w-24 rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-right text-slate-100 focus:border-sky-500 focus:outline-none"
                          aria-label={`${c.label} of link ${i + 1}`}
                        />
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-slate-400">
                  {joint ? (
                    <>
                      <span className="text-sky-300">{joint.label}</span> · {joint.kind}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
