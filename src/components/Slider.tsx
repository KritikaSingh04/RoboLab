import { useId } from 'react';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Unit suffix shown after the value, e.g. "°" or "m". */
  unit?: string;
  /** Decimals used for the displayed value (default 3, per CLAUDE.md rule 5). */
  decimals?: number;
  /** Optional accent colour for the label dot (e.g. link colours). */
  color?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

/**
 * Range slider with a label, live value and an editable number box so the
 * examiner can type an exact value.
 */
export default function Slider({ label, value, min, max, step = 0.01, unit = '', decimals = 3, color, disabled, onChange }: Props) {
  const id = useId();
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="label flex items-center gap-2">
          {color && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden />}
          {label}
        </label>
        <span className="flex items-center gap-1">
          <input
            type="number"
            className="mono w-24 rounded-md border border-line bg-field px-2 py-0.5 text-right text-sm text-ink focus:border-cobalt focus:outline-none"
            value={Number.isFinite(value) ? Number(value.toFixed(decimals)) : ''}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v)) onChange(clamp(v));
            }}
            aria-label={`${label} value`}
          />
          {unit && <span className="w-6 text-sm text-muted">{unit}</span>}
        </span>
      </div>
      <input id={id} type="range" value={value} min={min} max={max} step={step} disabled={disabled} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  );
}
