import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { Field, describedBy } from './Field';
import { Icon } from './Icon';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: Array<string | { value: string; label: string }>;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, className, id: idProp, required, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <div className={cx('gz-input', 'gz-select', rest.disabled && 'is-disabled')}>
        <select
          ref={ref}
          {...rest}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(rest['aria-describedby'], id, Boolean(error || hint))}
        >
          {options.map((o) => {
            const opt = typeof o === 'string' ? { value: o, label: o } : o;
            return (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            );
          })}
        </select>
        <Icon name="chevronDown" size={16} />
      </div>
    </Field>
  );
});
