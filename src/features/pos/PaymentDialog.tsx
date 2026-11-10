import { useEffect, useState, type ReactNode } from 'react';
import { Button, Dialog, TextField, Tabs } from '@/components';
import { formatMoney } from '@/lib/format';
import type { Payment, PaymentMethod } from '@/types/domain';
import { cashSuggestions, round2, toNumber } from './calc';
import './shared.css';

export interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Total due, tax included. */
  total: number;
  busy?: boolean;
  /** An Alert (or text) shown when the database refused the payment. */
  error?: ReactNode;
  confirmLabel: string;
  onConfirm: (payment: Payment) => void;
}

const METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];

/** Cash with change due, card or other. Used by the POS and by order fulfillment. */
export function PaymentDialog({ open, onClose, title, total, busy, error, confirmLabel, onConfirm }: PaymentDialogProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [tendered, setTendered] = useState('');

  useEffect(() => {
    if (open) {
      setMethod('cash');
      setTendered(total.toFixed(2));
    }
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const tenderedNum = toNumber(tendered);
  const change = round2(tenderedNum - total);
  const short = method === 'cash' && tenderedNum < total;

  function confirm() {
    onConfirm(method === 'cash' ? { method, tendered: round2(tenderedNum) } : { method });
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      description="Choose how the customer is paying."
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button variant="primary" size="lg" onClick={confirm} disabled={busy || short || total < 0}>
            {busy ? 'Working' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="sell-pay">
        {error}
        <div className="sell-pay__due">
          <span className="text-body-strong">Total due</span>
          <span className="sell-pay__amount text-kpi">{formatMoney(total)}</span>
        </div>
        <Tabs aria-label="Payment method" items={METHODS} value={method} onChange={(v) => setMethod(v as PaymentMethod)} />
        {method === 'cash' ? (
          <>
            <TextField
              label="Cash tendered"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
            <div className="sell-pay__quick">
              <Button onClick={() => setTendered(total.toFixed(2))}>Exact</Button>
              {cashSuggestions(total).map((v) => (
                <Button key={v} onClick={() => setTendered(v.toFixed(2))}>
                  {formatMoney(v)}
                </Button>
              ))}
            </div>
            <div className={short ? 'sell-pay__change is-short' : 'sell-pay__change'} role="status">
              <span className="text-body-strong">{short ? 'Still owed' : 'Change due'}</span>
              <span className="text-h2 gz-num">{formatMoney(short ? -change : change)}</span>
            </div>
          </>
        ) : (
          <p className="text-body-sm gz-muted" style={{ margin: 0 }}>
            {method === 'card' ? 'Run the card on the reader, then complete the sale.' : 'Record the payment taken outside the register, then complete the sale.'}
          </p>
        )}
      </div>
    </Dialog>
  );
}
