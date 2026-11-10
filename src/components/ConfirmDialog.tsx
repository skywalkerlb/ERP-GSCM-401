import { useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** Runs when the person confirms. The dialog stays open (with a busy button) until the promise settles, then closes. */
  onConfirm: () => void | Promise<void>;
  title: ReactNode;
  children?: ReactNode;
  /** A verb phrase such as "Cancel order". Avoid "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Use "danger" for destructive actions. */
  tone?: 'primary' | 'danger';
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel, cancelLabel = 'Keep it', tone = 'primary' }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={confirm} disabled={busy}>
            {busy ? 'Working' : confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
