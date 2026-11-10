import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon } from './Icon';

interface FieldProps {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/** Label, control and hint/error message shared by TextField and Select. */
export function Field({ id, label, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cx('gz-field', error && 'is-error', className)}>
      {label && (
        <label className="gz-field__label" htmlFor={id}>
          {label}
          {required && (
            <span className="gz-field__req" aria-hidden="true">
              {' *'}
            </span>
          )}
        </label>
      )}
      {children}
      {(error || hint) && (
        <div id={`${id}-msg`} className={error ? 'gz-field__error' : 'gz-field__hint'}>
          {error && <Icon name="alert" size={14} />}
          {error || hint}
        </div>
      )}
    </div>
  );
}

/** Joins an existing aria-describedby with the field message id. */
export function describedBy(existing: string | undefined, id: string, hasMessage: boolean): string | undefined {
  const parts = [existing, hasMessage ? `${id}-msg` : undefined].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}
