import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon } from './Icon';

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, className, ...rest }, ref) {
  return (
    <label className={cx('gz-check', rest.disabled && 'is-disabled', className)}>
      <input ref={ref} type="checkbox" {...rest} />
      <span className="gz-check__box" aria-hidden="true">
        <Icon name="check" size={14} />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
});
