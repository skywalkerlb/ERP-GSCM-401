import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
}

/** One primary (candy pink) button per view. Icon-only buttons (no children) need an `aria-label`. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, className, children, type = 'button', ...rest },
  ref,
) {
  const iconSize = size === 'sm' ? 16 : 18;
  const hasLabel = children !== undefined && children !== null && children !== false;
  return (
    <button
      ref={ref}
      type={type}
      {...rest}
      className={cx('gz-btn', `gz-btn--${variant}`, `gz-btn--${size}`, !hasLabel && 'gz-btn--icon', className)}
    >
      {icon && <Icon name={icon} size={iconSize} />}
      {hasLabel && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} size={iconSize} />}
    </button>
  );
});
