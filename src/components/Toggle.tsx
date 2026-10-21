import { useId } from 'react';

interface Props {
  label: string;
  checked: boolean;
  disabled?: boolean;
  hint?: string;
  onChange: (checked: boolean) => void;
}

export default function Toggle({ label, checked, disabled, hint, onChange }: Props) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <label htmlFor={id} className="label cursor-pointer">
        {label}
        {hint && <span className="block text-xs font-normal text-muted">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative h-6 w-11 shrink-0 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cobalt/30 disabled:opacity-50',
          checked ? 'bg-cobalt' : 'bg-line',
        ].join(' ')}
      >
        <span className={['absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5'].join(' ')} />
      </button>
    </div>
  );
}
