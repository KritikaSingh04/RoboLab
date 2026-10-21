import { useEffect, useId, useState } from 'react';

interface Props {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  decimals?: number;
  disabled?: boolean;
  /** Extra hint rendered under the input. */
  hint?: string;
  onChange: (value: number) => void;
}

/**
 * Numeric text input that commits on blur / Enter and validates the range,
 * so partially typed values (e.g. "-" or "1.") do not fire onChange.
 */
export default function NumberInput({ label, value, min = -Infinity, max = Infinity, step = 'any' as unknown as number, unit, decimals = 3, disabled, hint, onChange }: Props) {
  const id = useId();
  const format = (v: number) => (Number.isFinite(v) ? String(Number(v.toFixed(decimals))) : '');
  const [text, setText] = useState(format(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(format(value));
    setInvalid(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals]);

  const commit = () => {
    const v = parseFloat(text);
    if (!Number.isFinite(v) || v < min || v > max) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChange(v);
  };

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="label block">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className={[
            'mono w-full rounded-md border bg-field px-2.5 py-1.5 text-sm text-ink focus:outline-none',
            invalid ? 'border-tomato focus:border-tomato' : 'border-line focus:border-cobalt',
          ].join(' ')}
          value={text}
          min={Number.isFinite(min) ? min : undefined}
          max={Number.isFinite(max) ? max : undefined}
          step={step}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
          aria-invalid={invalid}
        />
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      {invalid ? (
        <p className="text-xs text-tomato">
          Enter a number{Number.isFinite(min) || Number.isFinite(max) ? ` between ${Number.isFinite(min) ? min : '−∞'} and ${Number.isFinite(max) ? max : '∞'}` : ''}.
        </p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}
