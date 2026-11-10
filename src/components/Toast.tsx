import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { cx } from '@/lib/cx';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
  tone?: ToastTone;
  title: string;
  description?: ReactNode;
  /** Milliseconds before it closes. Defaults to 5000 (8000 for danger). 0 keeps it until dismissed. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

export interface ToastApi {
  show: (options: ToastOptions) => void;
  info: (title: string, description?: ReactNode) => void;
  success: (title: string, description?: ReactNode) => void;
  warning: (title: string, description?: ReactNode) => void;
  /** Say what went wrong and how to fix it. */
  error: (title: string, description?: ReactNode) => void;
}

const ICONS: Record<ToastTone, IconName> = { info: 'info', success: 'checkCircle', warning: 'alert', danger: 'alert' };
const MAX = 4;

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((cur) => cur.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      setItems((cur) => [...cur.slice(-(MAX - 1)), { ...options, id }]);
      const tone = options.tone ?? 'info';
      const duration = options.duration ?? (tone === 'danger' ? 8000 : 5000);
      if (duration > 0) window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      info: (title, description) => show({ tone: 'info', title, description }),
      success: (title, description) => show({ tone: 'success', title, description }),
      warning: (title, description) => show({ tone: 'warning', title, description }),
      error: (title, description) => show({ tone: 'danger', title, description }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="gz-toast-region" aria-live="polite" aria-relevant="additions">
          {items.map((t) => {
            const tone = t.tone ?? 'info';
            return (
              <div key={t.id} className={cx('gz-toast', 'gz-alert', `gz-alert--${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>
                <Icon name={ICONS[tone]} size={18} />
                <div className="gz-alert__body">
                  <div className="gz-alert__title">{t.title}</div>
                  {t.description && <div>{t.description}</div>}
                </div>
                <Button variant="ghost" size="sm" icon="x" aria-label="Dismiss notification" onClick={() => dismiss(t.id)} />
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

/** `const toast = useToast(); toast.success('Sale completed', 'Receipt RCPT-00412')` */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>.');
  return ctx;
}
