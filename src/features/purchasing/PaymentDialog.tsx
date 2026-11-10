import { useState } from 'react';
import { Alert, Button, Dialog, Select, TextField } from '@/components';
import { STOCK_DOMAINS, toNumber, useAction } from '@/features/items/api';
import { businessDate, formatDate, formatMoney } from '@/lib/format';
import { rpc } from '@/lib/rpc';

export interface PayableBill {
  id: number;
  supplierName: string;
  poNumber: string | null;
  dueDate: string;
  balance: number;
}

/** Record an accounts payable payment against one bill (record_ap_payment). */
export function PaymentDialog({ bill, onClose }: { bill: PayableBill | null; onClose: () => void }) {
  if (!bill) return null;
  return <PaymentForm bill={bill} onClose={onClose} />;
}

function PaymentForm({ bill, onClose }: { bill: PayableBill; onClose: () => void }) {
  const [amount, setAmount] = useState(String(bill.balance));
  const [paidOn, setPaidOn] = useState(businessDate());
  const [method, setMethod] = useState('ach');
  const [error, setError] = useState<string | null>(null);
  const pay = useAction(
    (v: { bill_id: number; amount: number; paid_on: string; method: string }) => rpc.recordApPayment(v),
    { invalidate: STOCK_DOMAINS, success: (_id, v) => `Payment of ${formatMoney(v.amount)} recorded.`, errorTitle: 'Could not record the payment', onSuccess: onClose },
  );

  function submit() {
    const value = toNumber(amount);
    if (value <= 0) return setError('Enter an amount above $0.00.');
    if (value > bill.balance + 0.004) return setError(`Only ${formatMoney(bill.balance)} is still owed on this bill.`);
    setError(null);
    pay.mutate({ bill_id: bill.id, amount: Math.round(value * 100) / 100, paid_on: paidOn, method });
  }

  return (
    <Dialog
      open onClose={onClose} size="sm" title="Record payment"
      description={`${bill.supplierName}${bill.poNumber ? `, ${bill.poNumber}` : ''}. Balance ${formatMoney(bill.balance)}, due ${formatDate(bill.dueDate)}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pay.isPending}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={pay.isPending}>{pay.isPending ? 'Working' : 'Record payment'}</Button>
        </>
      }
    >
      <div className="gz-stack gz-stack--sm">
        <TextField label="Amount" type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} suffix="USD" />
        <TextField label="Paid on" type="date" max={businessDate()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)} options={[{ value: 'ach', label: 'ACH transfer' }, { value: 'check', label: 'Check' }, { value: 'card', label: 'Card' }, { value: 'cash', label: 'Cash' }]} />
        {error && <Alert tone="danger" title={error} />}
      </div>
    </Dialog>
  );
}
