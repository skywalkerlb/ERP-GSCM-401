import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cx } from '@/lib/cx';
import './shared.css';

export interface QtyStepperProps {
  value: number;
  onChange: (next: number) => void;
  /** What the quantity is for, read by screen readers, for example "Quantity of Original glazed". */
  label: string;
  min?: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
}

/** Minus, number and plus. Typing a number works too; anything below `min` is ignored. */
export function QtyStepper({ value, onChange, label, min = 1, max, size = 'md' }: QtyStepperProps) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const clamp = (n: number) => Math.max(min, max !== undefined ? Math.min(n, max) : n);
  const btn = cx('gz-btn', 'gz-btn--secondary', 'gz-btn--icon', size !== 'md' && `gz-btn--${size}`);

  return (
    <div className={cx('sell-step', `sell-step--${size}`)} role="group" aria-label={label}>
      <button type="button" className={btn} aria-label="Decrease quantity" disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>
        <Minus size={size === 'sm' ? 16 : 18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <div className="gz-input sell-step__field">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step="any"
          aria-label={label}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(n) && n >= min) onChange(clamp(n));
          }}
          onBlur={() => setText(String(value))}
        />
      </div>
      <button type="button" className={btn} aria-label="Increase quantity" disabled={max !== undefined && value >= max} onClick={() => onChange(clamp(value + 1))}>
        <Plus size={size === 'sm' ? 16 : 18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
