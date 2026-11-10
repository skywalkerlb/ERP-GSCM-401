import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Field, describedBy } from './Field';
import { Icon, type IconName } from './Icon';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: IconName;
  suffix?: ReactNode;
}

/** Always give a visible `label`. Add `data-scan-target` to let a barcode scanner type into this field. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, icon, suffix, className, id: idProp, required, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <div className={cx('gz-input', icon && 'has-icon', rest.disabled && 'is-disabled')}>
        {icon && <Icon name={icon} size={16} />}
        <input
          ref={ref}
          {...rest}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(rest['aria-describedby'], id, Boolean(error || hint))}
        />
        {suffix && <span className="gz-input__suffix">{suffix}</span>}
      </div>
    </Field>
  );
});
