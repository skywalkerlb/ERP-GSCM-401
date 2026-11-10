import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Select } from '@/components/Select';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useSelectedLocation } from '@/hooks/useLocations';
import { businessDate, formatMoney } from '@/lib/format';
import { rpcErrorMessage } from '@/lib/rpc';
import type { ApOpenBill } from '@/types/domain';
import { useGlAccounts, usePayBill, useRecordExpense } from './api';

export function RecordExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const accounts = useGlAccounts();
  const { locations } = useSelectedLocation();
  const mutation = useRecordExpense();
  const expenseAccounts = useMemo(() => (accounts.data ?? []).filter((a) => a.code.startsWith('6')), [accounts.data]);
  const [account, setAccount] = useState('');
  const [date, setDate] = useState(businessDate());
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDate(businessDate());
      setAmount('');
      setMemo('');
      setError(null);
    }
  }, [open]);
  useEffect(() => {
    if (!account && expenseAccounts[0]) setAccount(expenseAccounts[0].code);
  }, [account, expenseAccounts]);

  function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than $0.00.');
      return;
    }
    setError(null);
    mutation.mutate(
      { date, account, amount: value, memo: memo.trim() || null, location_id: location ? Number(location) : null },
      {
        onSuccess: () => {
          toast.success('Expense recorded', `${formatMoney(value)} to account ${account}.`);
          onClose();
        },
        onError: (e) => setError(rpcErrorMessage(e)),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Record expense"
      description="Posts to the journal and shows in operating expenses on the P&L."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={mutation.isPending}>Record expense</Button>
        </>
      }
    >
      <div className="gz-form-grid">
        <Select label="Account" value={account} options={expenseAccounts.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))} onChange={(e) => setAccount(e.target.value)} />
        <TextField label="Date" type="date" value={date} max={businessDate()} onChange={(e) => setDate(e.target.value)} />
        <TextField label="Amount" type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} error={error ?? undefined} />
        <Select label="Location" value={location} options={[{ value: '', label: 'Not tied to a location' }, ...locations.map((l) => ({ value: String(l.id), label: l.name }))]} onChange={(e) => setLocation(e.target.value)} />
        <TextField label="Memo" value={memo} onChange={(e) => setMemo(e.target.value)} className="ins-span-all" />
      </div>
    </Dialog>
  );
}

export function PayBillDialog({ bill, onClose }: { bill: ApOpenBill | null; onClose: () => void }) {
  const toast = useToast();
  const mutation = usePayBill();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('ach');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (bill) {
      setAmount(String(bill.balance));
      setMethod('ach');
      setError(null);
    }
  }, [bill]);

  function submit() {
    if (!bill) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than $0.00.');
      return;
    }
    if (value > bill.balance + 0.005) {
      setError(`The balance is ${formatMoney(bill.balance)}. Enter that or less.`);
      return;
    }
    setError(null);
    mutation.mutate(
      { bill_id: bill.bill_id, amount: value, method },
      {
        onSuccess: () => {
          toast.success('Payment recorded', `${formatMoney(value)} paid to ${bill.supplier_name}.`);
          onClose();
        },
        onError: (e) => setError(rpcErrorMessage(e)),
      },
    );
  }

  return (
    <Dialog
      open={bill !== null}
      onClose={onClose}
      size="sm"
      title="Record payment"
      description={bill ? `${bill.supplier_name}, ${bill.po_number ?? 'bill'} with ${formatMoney(bill.balance)} due.` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={mutation.isPending}>Record payment</Button>
        </>
      }
    >
      <div className="gz-stack gz-stack--sm">
        <TextField label="Amount" type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} error={error ?? undefined} />
        <Select label="Method" value={method} options={[{ value: 'ach', label: 'ACH' }, { value: 'check', label: 'Check' }, { value: 'card', label: 'Card' }]} onChange={(e) => setMethod(e.target.value)} />
      </div>
    </Dialog>
  );
}
