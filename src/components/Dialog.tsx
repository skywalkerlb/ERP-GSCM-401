import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@/lib/cx';
import { Button } from './Button';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Dialog title, shown as an h2. Sentence case. */
  title: ReactNode;
  /** One line under the title. */
  description?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
  /** Right-aligned actions. Use at most one primary Button. */
  footer?: ReactNode;
  /** Close when the scrim is clicked. Defaults to true. */
  closeOnScrim?: boolean;
  /** Element to focus on open. Defaults to the first field or button in the dialog. */
  initialFocusRef?: RefObject<HTMLElement>;
  className?: string;
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

let openCount = 0;

/**
 * Modal dialog: traps focus, closes on Esc, returns focus to the element that opened it,
 * and announces itself with role="dialog" aria-modal.
 */
export function Dialog({ open, onClose, title, description, size = 'md', children, footer, closeOnScrim = true, initialFocusRef, className }: DialogProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const downOnScrim = useRef(false);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    openCount += 1;
    document.body.classList.add('gz-scroll-lock');

    const target =
      initialFocusRef?.current ?? focusables(bodyRef.current)[0] ?? focusables(footRef.current)[0] ?? panelRef.current;
    target?.focus();

    return () => {
      openCount -= 1;
      if (openCount <= 0) {
        openCount = 0;
        document.body.classList.remove('gz-scroll-lock');
      }
      if (opener && document.contains(opener)) opener.focus();
    };
    // Only re-run when the dialog opens or closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusables(panelRef.current);
    if (items.length === 0) {
      e.preventDefault();
      panelRef.current?.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      className="gz-dialog-scrim"
      onKeyDown={onKeyDown}
      onMouseDown={(e) => {
        downOnScrim.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (closeOnScrim && downOnScrim.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={cx('gz-dialog', `gz-dialog--${size}`, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <header className="gz-dialog__head">
          <div>
            <h2 id={titleId} className="gz-dialog__title text-h2">
              {title}
            </h2>
            {description && (
              <p id={descId} className="gz-dialog__desc text-body-sm">
                {description}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" icon="x" aria-label="Close" onClick={onClose} />
        </header>
        <div ref={bodyRef} className="gz-dialog__body">
          {children}
        </div>
        {footer && (
          <footer ref={footRef} className="gz-dialog__foot">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
